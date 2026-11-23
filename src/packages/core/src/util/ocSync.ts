// Tailnet config sync: every oc on the same Tailscale account with oc.json `sync.enabled` pulls the
// newer side of each item from the others (newest change wins, overwritten local edits are backed
// up). State per item lives in `state/sync/state.json`. The listener and the 20 s loop are opencode
// `server/syncPeer.ts`; the `/sync` dialog reads `status.json`. Plan: docs/dev/syncPlan.md.
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Global } from "../global"
import { InstallationVersion } from "../installation/version"
import { Hash } from "./hash"
import { OcItems } from "./ocItems"
import { OcJson } from "./ocJson"
import { which } from "./which"

export const PORT = 4097
export const FORMAT = 1
// `warmup`: Claude warm-up runtime state for cross-machine run-once (opencode server/syncPeer.ts).
export const ROUTE = { manifest: "/oc-sync/manifest", items: "/oc-sync/items", warmup: "/oc-sync/warmup" } as const

export type Settings = { enabled: boolean; exclude: string[] }
export type ManifestEntry = { id: string; hash: string; at: number; tags: OcItems.Tag[]; deleted?: true }
export type Manifest = { format: number; ocVersion: string; name: string; entries: ManifestEntry[] }
export type Peer = { ip: string; name: string }
export type PeerStatus = Peer & { ok?: number; error?: string }
export type Conflict = { id: string; at: number; peer: string; backup: string }
export type Status = { enabled: boolean; updated: number; error?: string; peers: PeerStatus[]; conflicts: Conflict[] }
// `hash`: the item's shared hash (what peers compare). `local`: the hash of this machine's own wire
// form at that point; it can differ after applying a peer's item (a secret this machine lacks, a
// path form), and only a change of `local` counts as an edit here. `base`: last hash seen equal on a
// peer; `hash !== base` means a local edit no peer has yet.
type StateEntry = { hash: string; local?: string; at: number; tags: OcItems.Tag[]; base?: string; deleted?: true }
type State = Record<string, StateEntry>
// `held`: ids this machine never reads (links, shortcuts, cloud placeholders; `OcItems.isHeld`).
type Scan = {
  state: State
  raw: Map<string, OcItems.Item>
  wire: Map<string, OcItems.Item>
  held: ReadonlyMap<string, string>
}

const _SCAN_REUSE = 2_000
const _KEEP_BACKUPS = 200
const _KEEP_CONFLICTS = 50
const _MAX_RESPONSE = 20 * 1024 * 1024

function dir() {
  return path.join(Global.Path.state, "sync")
}

export function backupRoot() {
  return path.join(dir(), "backups")
}

let lastSettingsWarning: string | undefined

// A missing or unparsable oc.json means sync off, as the TUI's `readOcConfig` treats it.
export function settings(): Settings {
  const parsed = (() => {
    try {
      const file = path.join(Global.Path.config, "oc.json")
      return OcJson.read<{ sync?: { enabled?: unknown; exclude?: unknown } }>(readFileSync(file, "utf8"), file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
      // Runs every sync tick: warn once per distinct message.
      const message = error instanceof Error ? error.message : String(error)
      if (message !== lastSettingsWarning) console.warn(`sync off, cannot read oc.json: ${message}`)
      lastSettingsWarning = message
      return {}
    }
  })()
  const exclude = Array.isArray(parsed.sync?.exclude) ? parsed.sync.exclude : []
  return {
    enabled: parsed.sync?.enabled === true,
    exclude: exclude.filter((entry): entry is string => typeof entry === "string"),
  }
}

// --- State and scan ---

// Every read-modify-write of state.json runs through this queue.
let _lock: Promise<unknown> = Promise.resolve()
function locked<T>(run: () => Promise<T>) {
  const result = _lock.then(run)
  _lock = result.catch(() => undefined)
  return result
}

let _last: { at: number; scan: Scan } | undefined

export function scan(): Promise<Scan> {
  return locked(async () => {
    if (_last && Date.now() - _last.at < _SCAN_REUSE) return _last.scan
    return rescan()
  })
}

async function readState(): Promise<State> {
  const text = await fs.readFile(path.join(dir(), "state.json"), "utf8").catch(() => "{}")
  return JSON.parse(text) as State
}

async function writeJson(name: string, value: unknown) {
  await fs.mkdir(dir(), { recursive: true })
  const file = path.join(dir(), name)
  const temporary = `${file}.tmp-${process.pid}`
  await fs.writeFile(temporary, JSON.stringify(value))
  await fs.rename(temporary, file)
}

// Runs under the lock. A new or edited item gets `at` = its file time, but always later than its
// previous entry so a restored old file still beats the tombstone it replaces.
async function rescan(): Promise<Scan> {
  const state = await readState()
  const collected = await OcItems.collect()
  const now = Date.now()
  const raw = new Map(collected.items.map((item) => [item.id, item]))
  const wire = new Map(collected.items.map((item) => [item.id, OcItems.toWire(item)]))
  const next: State = {}
  for (const [id, item] of wire) {
    const local = OcItems.hash(item)
    const previous = state[id]
    if (previous && !previous.deleted && (previous.local === undefined || previous.local === local)) {
      next[id] = { ...previous, local }
      continue
    }
    next[id] = {
      hash: local,
      local,
      at: Math.max(Math.round(collected.mtimes.get(id) || now), (previous?.at ?? 0) + 1),
      tags: OcItems.tags(raw.get(id)!),
      base: previous?.base,
    }
  }
  for (const [id, previous] of Object.entries(state)) {
    if (next[id]) continue
    // A key that became machine-only leaves the state without a tombstone, so no peer deletes its copy.
    if (OcItems.machineOnly(id)) continue
    // Tombstones never expire (about 100 bytes each): a peer that was offline for months, or one
    // that excluded the item meanwhile, must not bring a deleted item back. An unreadable root, an
    // unreadable folder or entry under a category (`partial`, keyed `category:root`), a half-saved
    // settings file, or a held item keeps its items as they were.
    if (
      previous.deleted ||
      collected.unread.has(OcItems.sourceOf(id)) ||
      collected.partial.has(id.split(":", 2).join(":")) ||
      OcItems.isHeld(id, collected.held)
    ) {
      next[id] = previous
      continue
    }
    next[id] = { hash: "", at: Math.max(now, previous.at + 1), tags: previous.tags, base: previous.base, deleted: true }
  }
  if (JSON.stringify(next) !== JSON.stringify(state)) await writeJson("state.json", next)
  const result = { state: next, raw, wire, held: collected.held }
  _last = { at: Date.now(), scan: result }
  return result
}

// --- Serving side ---

// Items this machine excludes stay on this machine: they are neither pulled here nor offered to
// peers. A peer reads a missing entry as "nothing to do", never as a delete. Held items stay off too.
export async function manifest(): Promise<Manifest> {
  const result = await scan()
  const exclude = settings().exclude
  const entries = Object.entries(result.state)
    .filter(([id, entry]) => !OcItems.excluded(id, entry.tags, exclude) && !OcItems.isHeld(id, result.held))
    .map(([id, entry]): ManifestEntry => {
      const base = { id, hash: entry.hash, at: entry.at, tags: entry.tags }
      return entry.deleted ? { ...base, deleted: true } : base
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  return { format: FORMAT, ocVersion: InstallationVersion, name: os.hostname(), entries }
}

export function etag(value: Manifest) {
  return `"${Hash.fast(JSON.stringify(value.entries))}"`
}

export async function items(ids: readonly string[]) {
  const result = await scan()
  const exclude = settings().exclude
  const found = ids.flatMap((id) => {
    const item = result.wire.get(id)
    return item && !OcItems.excluded(id, result.state[id]?.tags ?? [], exclude) ? [item] : []
  })
  if (JSON.stringify(found).length > _MAX_RESPONSE) throw new Error("Requested items exceed 20 MB")
  return found
}

// --- Pulling side ---

export type Verdict = "skip" | "same" | "take" | "conflict"

// Newest `at` wins; equal times tie-break on the hash so every machine picks the same side.
export function decide(local: StateEntry | undefined, remote: ManifestEntry, exclude: readonly string[]): Verdict {
  // An older peer may still offer a key this build keeps machine-only: ignore it instead of failing the apply.
  if (OcItems.machineOnly(remote.id)) return "skip"
  if (OcItems.excluded(remote.id, [...remote.tags, ...(local?.tags ?? [])], exclude)) return "skip"
  if (local?.hash === remote.hash) return "same"
  if (!local) return remote.deleted ? "skip" : "take"
  const newer = remote.at > local.at || (remote.at === local.at && remote.hash > local.hash)
  if (!newer) return "skip"
  return !local.deleted && local.hash !== local.base ? "conflict" : "take"
}

const _etags = new Map<string, { etag: string; exclude: string }>()

// Fetches a peer's manifest (304 when unchanged since the last full apply), then its newer items,
// and applies them. Returns the applied ids and the local edits it overwrote.
export async function pull(peer: Peer, current: Settings) {
  const before = await scan()
  // Held ids are part of the key: when a link becomes a real file, the peer's unchanged manifest
  // must be read again, not hidden behind a 304.
  const exclude = JSON.stringify([current.exclude, [...before.held.keys()].sort()])
  const cached = _etags.get(peer.ip)
  const response = await fetch(`http://${peer.ip}:${PORT}${ROUTE.manifest}`, {
    headers: cached?.exclude === exclude ? { "if-none-match": cached.etag } : {},
    signal: AbortSignal.timeout(3_000),
  })
  if (response.status === 304) return { applied: [] as string[], conflicts: [] as Conflict[] }
  if (!response.ok) throw new Error(`answered ${response.status}`)
  const remote = (await response.json()) as Manifest
  if (remote.format !== FORMAT) {
    throw new Error(`runs oc ${remote.ocVersion} with sync format ${remote.format}; this oc uses ${FORMAT}`)
  }
  const wanted = remote.entries.filter((entry) => {
    if (OcItems.isHeld(entry.id, before.held)) return false
    const verdict = decide(before.state[entry.id], entry, current.exclude)
    return verdict === "take" || verdict === "conflict"
  })
  const fetched = await fetchItems(
    peer,
    wanted.filter((entry) => !entry.deleted).map((entry) => entry.id),
  )
  const result = await locked(() => applyPulled(peer, remote.entries, fetched, current.exclude))
  // A wanted item left unapplied must be asked for again: a 304 would hide it until the peer changes.
  const applied = new Set(result.applied)
  if (wanted.every((entry) => applied.has(entry.id))) {
    _etags.set(peer.ip, { etag: response.headers.get("etag") ?? "", exclude })
  } else _etags.delete(peer.ip)
  return result
}

async function fetchItems(peer: Peer, ids: string[]) {
  if (ids.length === 0) return new Map<string, OcItems.Item>()
  const response = await fetch(`http://${peer.ip}:${PORT}${ROUTE.items}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`items answered ${response.status}: ${(await response.text()).slice(0, 200)}`)
  const list = (await response.json()) as OcItems.Item[]
  const wanted = new Set(ids)
  return new Map(list.filter((item) => wanted.has(item.id)).map((item) => [item.id, item]))
}

// Runs under the lock against a fresh scan, so a local edit made while fetching is decided again.
// Exported for tests only; `pull` is the caller and holds the lock.
export async function applyPulled(
  peer: Peer,
  entries: readonly ManifestEntry[],
  fetched: Map<string, OcItems.Item>,
  exclude: readonly string[],
) {
  const fresh = await rescan()
  const state = { ...fresh.state }
  const write: OcItems.Item[] = []
  const remove: OcItems.Item[] = []
  const applied: string[] = []
  const overwritten: string[] = []
  for (const entry of entries) {
    // A held item is never written or deleted here, whatever the peer has.
    if (OcItems.isHeld(entry.id, fresh.held)) continue
    const verdict = decide(state[entry.id], entry, exclude)
    if (verdict === "same") {
      if (state[entry.id].base !== entry.hash) state[entry.id] = { ...state[entry.id], base: entry.hash }
      continue
    }
    if (verdict === "skip") continue
    const local = fresh.raw.get(entry.id)
    const incoming = fetched.get(entry.id)
    if (!entry.deleted && !incoming) continue
    // The body decides where an item is written: drop one whose id, or the id its own kind, root, and
    // paths give it, is not the manifest entry's, or that this machine excludes by the body's tags.
    if (
      incoming &&
      (incoming.id !== entry.id ||
        OcItems.derivedId(incoming) !== entry.id ||
        OcItems.excluded(entry.id, OcItems.tags(incoming), exclude))
    )
      continue
    const restored = incoming && OcItems.fromWire(incoming, local)
    // A redacted secret this machine has no value for: writing nothing would read as a deletion on
    // the next scan and send a tombstone back to the peer.
    if (restored?.kind === "key" && restored.value === undefined) continue
    if (entry.deleted && local) remove.push(local)
    if (restored) {
      write.push(restored)
      // Files the peer's version no longer has.
      if (local?.kind === "files" && restored.kind === "files") {
        // A case-only rename is one file on Windows and default macOS volumes: removing the old
        // spelling would delete the file just written.
        const fold = (file: string) => (process.platform === "linux" ? file : file.toLowerCase())
        const kept = new Set(restored.files.map((file) => fold(file.path)))
        const stale = local.files.filter((file) => !kept.has(fold(file.path)))
        if (stale.length) remove.push({ ...local, files: stale })
      }
    }
    state[entry.id] = {
      hash: entry.hash,
      at: entry.at,
      tags: entry.tags,
      base: entry.hash,
      ...(entry.deleted ? { deleted: true as const } : {}),
    }
    applied.push(entry.id)
    if (verdict === "conflict") overwritten.push(entry.id)
  }
  const backup =
    write.length || remove.length
      ? (await OcItems.apply(write, { remove, backupRoot: backupRoot(), keep: _KEEP_BACKUPS })).backup
      : ""
  if (JSON.stringify(state) !== JSON.stringify(fresh.state)) await writeJson("state.json", state)
  _last = undefined
  const conflicts = overwritten.map((id) => ({ id, at: Date.now(), peer: peer.name, backup }))
  return { applied, conflicts }
}

// --- Status: written by the loop, read by the `/sync` dialog ---

// A missing or damaged status file reads as empty: it is rewritten on the next tick, and the loop
// in syncPeer must start regardless.
export async function readStatus(): Promise<Status> {
  const text = await fs.readFile(path.join(dir(), "status.json"), "utf8").catch(() => "")
  const empty: Status = { enabled: false, updated: 0, peers: [], conflicts: [] }
  try {
    return text ? { ...empty, ...(JSON.parse(text) as Partial<Status>) } : empty
  } catch {
    return empty
  }
}

export async function writeStatus(status: Status) {
  await writeJson("status.json", { ...status, conflicts: status.conflicts.slice(-_KEEP_CONFLICTS) })
}

// Conflicts whose backup still exists (restoring one deletes its backup folder).
export function openConflicts(status: Status) {
  return status.conflicts.filter((conflict) => existsSync(conflict.backup))
}

// --- Tailscale ---

export function tailscaleBinary() {
  const found = which("tailscale")
  if (found) return found
  const candidates =
    process.platform === "win32"
      ? [path.join(process.env.ProgramFiles ?? "C:/Program Files", "Tailscale", "tailscale.exe")]
      : [
          "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
          "/opt/homebrew/bin/tailscale",
          "/usr/local/bin/tailscale",
        ]
  return candidates.find((candidate) => existsSync(candidate))
}

export type TailscaleStatus = {
  selfUser: number
  /** This machine's tailnet host name (DNS label), or "" when Tailscale reports none. */
  selfHost: string
  selfIps: string[]
  /** Tagged nodes all share one Tailscale user, so a tagged machine has no "own" peers. */
  selfTagged: boolean
  // `ssh`: the peer runs the Tailscale SSH server (core util/ocMirror.ts).
  peers: { host: string; ips: string[]; online: boolean; user: number; ssh: boolean; tagged: boolean }[]
}

/**
 * One of this user's own machines: same Tailscale user, and neither side tagged. Sync and /mirror
 * trust only these (tagged nodes share one user across owners).
 */
export function isOwnPeer(status: TailscaleStatus, peer: TailscaleStatus["peers"][number]) {
  return status.selfUser > 0 && !status.selfTagged && !peer.tagged && peer.user === status.selfUser
}

export async function tailscaleStatus(): Promise<TailscaleStatus> {
  const binary = tailscaleBinary()
  if (!binary) throw new Error("Tailscale CLI not found")
  const output = await run(binary, ["status", "--json"])
  const status = JSON.parse(output) as {
    BackendState?: string
    Self?: { UserID?: number; TailscaleIPs?: string[]; HostName?: string; DNSName?: string; Tags?: string[] }
    Peer?: Record<
      string,
      {
        HostName?: string
        DNSName?: string
        TailscaleIPs?: string[]
        Online?: boolean
        UserID?: number
        Tags?: string[]
        sshHostKeys?: string[]
      }
    >
  }
  if (status.BackendState !== "Running") throw new Error(`Tailscale is ${status.BackendState ?? "not running"}`)
  return {
    selfUser: status.Self?.UserID ?? -1,
    selfHost: status.Self?.DNSName?.split(".")[0] || status.Self?.HostName || "",
    selfIps: status.Self?.TailscaleIPs ?? [],
    selfTagged: (status.Self?.Tags?.length ?? 0) > 0,
    peers: Object.values(status.Peer ?? {}).map((peer) => ({
      host: peer.DNSName?.split(".")[0] || peer.HostName || "",
      ips: peer.TailscaleIPs ?? [],
      online: peer.Online === true,
      user: peer.UserID ?? -2,
      ssh: (peer.sshHostKeys?.length ?? 0) > 0,
      tagged: (peer.Tags?.length ?? 0) > 0,
    })),
  }
}

// This user's own online machines (`isOwnPeer`), by IPv4.
export function peersOf(status: TailscaleStatus): Peer[] {
  return status.peers
    .filter((peer) => peer.online && isOwnPeer(status, peer))
    .flatMap((peer) => {
      const ip = peer.ips.find((item) => !item.includes(":"))
      return ip ? [{ ip, name: peer.host || ip }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], timeout: 5000 })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => (stdout += String(chunk)))
    child.stderr.on("data", (chunk) => (stderr += String(chunk)))
    child.on("error", reject)
    child.on("exit", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(stderr.trim() || `${command} exited with code ${code}`)),
    )
  })
}

export * as OcSync from "./ocSync"
