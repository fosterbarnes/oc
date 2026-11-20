// /mirror: make another tailnet machine's oc source folder (oc.json `revive.build.source`) equal to
// this machine's: its commits plus uncommitted and untracked (not ignored) files. The sender (TUI
// `component/dialog-mirror.tsx`) reaches each peer over ssh and runs the hidden `oc oc mirror`
// commands there (opencode `cli/cmd/oc.ts`), which call `info`, `receive`, and `requestRevive`
// below. Git moves the data as a bundle on ssh stdin, so `node_modules` and builds never cross OSes.
import { readFileSync } from "node:fs"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Global } from "../global"
import { InstallationDisplayVersion } from "../installation/version"
import { OcJson } from "./ocJson"
import { OcSync } from "./ocSync"

export const DIRTY = ["ask", "refuse", "overwrite", "backup"] as const
export const REVIVE = ["ask", "always", "never"] as const
export type Dirty = (typeof DIRTY)[number]
export type ReviveMode = (typeof REVIVE)[number]
// `ssh` per tailnet host: `auto` (Tailscale SSH when the peer runs it, else `ssh <host>`),
// `tailscale`, or an ssh destination (`goon`, `user@host`).
// `accept`: this machine takes mirrors (and their revives) from the user's own devices. Off until
// turned on here; `mirror` never syncs (core util/ocItems.ts), so each machine opts in itself.
export type Settings = {
  dirty: Dirty
  revive: ReviveMode
  accept: boolean
  hosts: Record<string, { ssh?: string }>
}
// One uncommitted change: blob at HEAD (`before`) and in the work tree (`after`); null = absent.
// `untracked`: new and not in the index, so a mirror that lacks it leaves it in place.
export type Change = { path: string; before: string | null; after: string | null; untracked?: true }
// `tree`: the work tree (tracked + untracked, not ignored) as a git tree id. Tree ids are
// deterministic, so equal `head` + `tree` means identical sources.
export type Info = { version: string; source: string; branch: string; head: string; tree: string; changes: Change[] }
// `error`: the target cannot be reached as configured (an invalid ssh destination); `command` is empty.
export type Target = { host: string; command: string[]; error?: string }
// A target that refuses: mirrors are off there, or the caller is not one of the user's devices.
export type Refusal = "mirror-disabled" | "caller-not-allowed"
// `missing`: sender commits the target lacks. `extra`: target commits the sender lacks; -1 when the
// sender does not have the target's HEAD at all (so it has commits of its own). `lost`: target
// changes a mirror would overwrite or delete. `inSync`: the target already equals this machine.
export type Probe = Target & {
  info?: Info
  error?: string
  missing?: number
  extra?: number
  lost?: string[]
  inSync?: boolean
}
export type Received = { head: string; stashed: boolean; untracked: number }

const _PROBE_TIMEOUT = 20_000
const _REVIVE_WAIT = 10_000
const _REVIVE_FRESH = 30_000
const _REF = { head: "refs/oc-mirror/head", snapshot: "refs/oc-mirror/snapshot" }
// Every argument is passed through the remote shell (zsh, bash, cmd, or pwsh): allow no quoting.
const _SAFE_ARG = /^[A-Za-z0-9._/-]+$/
// Full git object ids (SHA-1 or SHA-256). Ids from the other machine must match before reaching git.
const _HASH = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/
// An ssh destination: optional `user@`, then a host name. No leading `-`, so it is never an option.
const _DESTINATION = /^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9][A-Za-z0-9.-]*$/
// `requestRevive` ids (`<ms>-<pid>`); they name claim and status files, so every side checks them.
export const REVIVE_ID = /^\d+-\d+$/
// Temporary commit identity: the snapshot commit never lands on a branch.
const _GIT_IDENTITY = {
  GIT_AUTHOR_NAME: "oc mirror",
  GIT_AUTHOR_EMAIL: "oc-mirror@localhost",
  GIT_COMMITTER_NAME: "oc mirror",
  GIT_COMMITTER_EMAIL: "oc-mirror@localhost",
}

// A missing or unparsable oc.json means defaults, as `OcSync.settings` treats it.
export function settings(): Settings {
  const parsed = readOcJson().mirror as
    | { dirty?: unknown; revive?: unknown; accept?: unknown; hosts?: unknown }
    | undefined
  const hosts = parsed?.hosts && typeof parsed.hosts === "object" ? (parsed.hosts as Settings["hosts"]) : {}
  return {
    dirty: DIRTY.find((value) => value === parsed?.dirty) ?? "ask",
    revive: REVIVE.find((value) => value === parsed?.revive) ?? "ask",
    accept: parsed?.accept === true,
    hosts,
  }
}

/**
 * Why this machine refuses a mirror command, or undefined when it accepts. Run first by the hidden
 * `oc oc mirror` commands: mirrors must be turned on here, and an ssh caller (`SSH_CONNECTION`)
 * must come from one of the user's own Tailscale devices. Without `SSH_CONNECTION` the caller is a
 * local process of this user.
 */
export async function refusal(): Promise<Refusal | undefined> {
  if (!settings().accept) return "mirror-disabled"
  const client = process.env.SSH_CONNECTION?.trim()
    .split(/\s+/)[0]
    ?.replace(/^::ffff:/, "")
  if (!client) return
  const tail = await OcSync.tailscaleStatus().catch(() => undefined)
  if (!tail?.peers.some((peer) => OcSync.isOwnPeer(tail, peer) && peer.ips.includes(client)))
    return "caller-not-allowed"
}

/** What the sender shows for a target's refusal. */
export function refusalMessage(refused: Refusal) {
  return refused === "mirror-disabled" ? "mirrors off there" : "not from your devices"
}

/** Runs `action` in a fresh owner-only folder under this machine's state, removed afterwards. */
export async function withTempDir<T>(action: (dir: string) => Promise<T>) {
  const root = path.join(Global.Path.state, "mirror")
  await fs.mkdir(root, { recursive: true, mode: 0o700 })
  // mkdtemp creates the folder 0700 and with a name no other process can predict.
  const dir = await fs.mkdtemp(path.join(root, "tmp-"))
  try {
    return await action(dir)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

/** This machine's oc source folder (`revive.build.source`), or undefined before the first /revive. */
export function sourceDir() {
  const build = (readOcJson().revive as { build?: { source?: unknown } } | undefined)?.build
  return typeof build?.source === "string" && build.source.trim() ? build.source : undefined
}

export async function info(dir = sourceDir()): Promise<Info> {
  if (!dir) throw new Error("No oc source folder saved on this machine; run /revive once to choose one")
  const [branch, head, tree] = await Promise.all([
    git(dir, ["rev-parse", "--abbrev-ref", "HEAD"]).then((value) => value.trim()),
    git(dir, ["rev-parse", "HEAD"]).then((value) => value.trim()),
    worktreeTree(dir),
  ])
  return {
    version: InstallationDisplayVersion,
    source: dir,
    branch,
    head,
    tree,
    changes: await changes(dir, head, tree),
  }
}

/**
 * Target changes a mirror would destroy: content that differs from what the sender writes
 * (`sender`: path -> blob of its work tree). An untracked file the sender lacks survives.
 */
export function lost(list: readonly Change[], sender: ReadonlyMap<string, string>) {
  return list
    .filter((change) => {
      const incoming = sender.get(change.path) ?? null
      if (incoming === null && change.untracked) return false
      return change.after !== incoming
    })
    .map((change) => change.path)
}

// --- Sender ---

/** This user's own online tailnet machines (`OcSync.isOwnPeer`) and the command that reaches each one. */
export async function targets(current = settings()): Promise<Target[]> {
  const tail = await OcSync.tailscaleStatus()
  return tail.peers
    .filter((peer) => peer.online && OcSync.isOwnPeer(tail, peer) && peer.host)
    .map((peer): Target => {
      try {
        return { host: peer.host, command: connect(peer.host, peer.ssh, current.hosts[peer.host]?.ssh) }
      } catch (error) {
        return { host: peer.host, command: [], error: firstLine(error) }
      }
    })
    .sort((a, b) => a.host.localeCompare(b.host))
}

/** Runs `oc oc mirror info` on the target and compares its HEAD with `local`. Never throws. */
export async function probe(target: Target, local: Info): Promise<Probe> {
  if (target.error) return target
  const result = await run([...target.command, "oc", "oc", "mirror", "info"], { timeout: _PROBE_TIMEOUT })
    .then((output) => ({ info: remoteInfo(answer(lastJson(output))) }))
    .catch((error: unknown) => ({ error: firstLine(error) }))
  if (!("info" in result)) return { ...target, ...result }
  const remote = result.info
  const inSync = remote.head === local.head && remote.tree === local.tree
  // Old targets send no tree: every change they report counts as lost (their own receive agrees).
  const lostPaths = !remote.tree
    ? remote.changes.map((change) => change.path)
    : remote.changes.length
      ? lost(remote.changes, await blobs(local.source, local.tree))
      : []
  const known = await git(local.source, ["cat-file", "-e", `${remote.head}^{commit}`]).then(
    () => true,
    () => false,
  )
  if (!known) return { ...target, info: remote, extra: -1, lost: lostPaths, inSync }
  const [missing, extra] = await Promise.all([
    count(local.source, `${remote.head}..${local.head}`),
    count(local.source, `${local.head}..${remote.head}`),
  ])
  return { ...target, info: remote, missing, extra, lost: lostPaths, inSync }
}

// TODO: drop once no machine runs v0.2.382 (sent `dirty: string[]`, no `tree`/`changes`).
// Ids from the other machine reach git argv here (`cat-file`, `rev-list`, bundle basis): only full hashes.
function remoteInfo(raw: unknown): Info {
  const value = raw as Info & { dirty?: string[] }
  if (typeof value.head !== "string" || !_HASH.test(value.head) || (value.tree && !_HASH.test(value.tree)))
    throw new Error("Invalid reply from the other machine")
  if (Array.isArray(value.changes)) return value
  const dirty = Array.isArray(value.dirty) ? value.dirty : []
  return { ...value, tree: "", changes: dirty.map((file) => ({ path: file, before: null, after: null })) }
}

// A target that refuses answers `{ refused }` instead of its result.
function answer(raw: unknown) {
  const refused = (raw as { refused?: unknown } | null)?.refused
  if (refused === "mirror-disabled" || refused === "caller-not-allowed") throw new Error(refusalMessage(refused))
  return raw
}

/**
 * Sends this machine's source to `target`. `dirty`: what the target does with its own changes
 * (`ask` is resolved by the caller). `allowExtra`: the target may lose commits this machine lacks.
 */
export async function push(
  target: Target,
  remote: Info,
  options: { dirty: Exclude<Dirty, "ask">; allowExtra: boolean },
): Promise<Received> {
  const local = await info()
  if (!_SAFE_ARG.test(local.branch)) throw new Error(`Branch name not supported by /mirror: ${local.branch}`)
  if (local.branch !== remote.branch)
    throw new Error(`${target.host} is on ${remote.branch}, this machine on ${local.branch}`)
  const snapshot = await snapshotCommit(local.source, local.head, local.tree)
  return withTempDir(async (dir) => {
    const bundle = path.join(dir, "mirror.bundle")
    await writeBundle(local.source, bundle, local.head, snapshot, remote.head)
    const args = ["--head", local.head, "--snapshot", snapshot, "--branch", local.branch, "--dirty", options.dirty]
    const from = senderName()
    if (_SAFE_ARG.test(from)) args.push("--from", from)
    if (options.allowExtra) args.push("--allow-extra")
    const output = await run([...target.command, "oc", "oc", "mirror", "receive", ...args], { stdin: bundle })
    return answer(lastJson(output)) as Received
  })
}

// How the target took a revive request. `window`: an open oc window revives. `started`: no window,
// so its resident server started the no-window helper. Both report through `status`. The rest end
// here: `busy` (work running), `windows-open` (a window did not answer), `no-server` (oc is not
// running there), `too-old` (its oc predates no-window revive), `unclaimed` (an old target, no window).
export type ReviveStart = "window" | "started" | "busy" | "windows-open" | "no-server" | "too-old" | "unclaimed"

/** Asks the target to revive: an open oc window, else its resident server when nothing runs there. */
export async function revive(target: Target): Promise<{ id?: string; state: ReviveStart; detail?: string }> {
  const from = senderName()
  const args = _SAFE_ARG.test(from) ? ["--from", from] : []
  // The target waits up to 10 s for a window, then may ask its server: more than a probe.
  const output = await run([...target.command, "oc", "oc", "mirror", "revive", ...args], { timeout: 45_000 })
  const value = answer(lastJson(output)) as { id?: unknown; state?: unknown; detail?: unknown; claimed?: unknown }
  // TODO: drop once no machine runs v0.2.394 (answered `{ claimed }` only).
  if (value.state === undefined) return { state: value.claimed === true ? "window" : "unclaimed" }
  const states: ReviveStart[] = ["window", "started", "busy", "windows-open", "no-server", "too-old"]
  const state = states.find((item) => item === value.state)
  if (!state) throw new Error("Invalid reply from the other machine")
  // The id goes back to the target as an argument: request ids only.
  const id = typeof value.id === "string" && REVIVE_ID.test(value.id) ? value.id : undefined
  return { id, state, ...(typeof value.detail === "string" ? { detail: value.detail.slice(0, 200) } : {}) }
}

/** The target's revive status for request `id`; undefined until it writes one. */
export async function status(target: Target, id: string): Promise<ReviveStatus | undefined> {
  if (!REVIVE_ID.test(id)) throw new Error(`Invalid revive id: ${id}`)
  const output = await run([...target.command, "oc", "oc", "mirror", "status", "--id", id], { timeout: _PROBE_TIMEOUT })
  const value = answer(lastJson(output)) as { status?: unknown }
  return parseStatus(value.status)
}

// Commit of the work tree `tree` (from `worktreeTree`) on top of HEAD; HEAD itself when clean.
async function snapshotCommit(dir: string, head: string, tree: string) {
  if (tree === (await git(dir, ["rev-parse", `${head}^{tree}`])).trim()) return head
  return (await git(dir, ["commit-tree", tree, "-p", head, "-m", "oc mirror snapshot"], _GIT_IDENTITY)).trim()
}

// The work tree (tracked + untracked, not ignored) as a tree id, built in a temporary index so the
// real index and work tree stay untouched. `git stash create` would miss untracked files.
async function worktreeTree(dir: string) {
  // Starting from the real index keeps its stat data, so `add -A` only hashes changed files.
  const real = path.resolve(dir, (await git(dir, ["rev-parse", "--git-path", "index"])).trim())
  return withTempDir(async (temp) => {
    const index = path.join(temp, "index")
    await fs.copyFile(real, index).catch(() => undefined)
    const env = { GIT_INDEX_FILE: index }
    await git(dir, ["add", "-A"], env)
    return (await git(dir, ["write-tree"], env)).trim()
  })
}

// Uncommitted changes as blob pairs (`diff-tree -z`: ":<modes> <old> <new> <status>\0<path>\0").
async function changes(dir: string, head: string, tree: string): Promise<Change[]> {
  const fields = (await git(dir, ["diff-tree", "-r", "-z", "--no-renames", head, tree])).split("\0")
  const indexed = new Set((await git(dir, ["ls-files", "-z"])).split("\0"))
  const blob = (value: string | undefined) => (!value || /^0+$/.test(value) ? null : value)
  const result: Change[] = []
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const meta = fields[i]!.split(" ")
    const change: Change = { path: fields[i + 1]!, before: blob(meta[2]), after: blob(meta[3]) }
    result.push(change.before === null && !indexed.has(change.path) ? { ...change, untracked: true } : change)
  }
  return result
}

// Path -> blob for every file in `tree` (`ls-tree -z`: "<mode> <type> <blob>\t<path>\0").
async function blobs(dir: string, tree: string) {
  const entries = (await git(dir, ["ls-tree", "-r", "-z", tree])).split("\0").filter(Boolean)
  return new Map(
    entries.map((entry) => {
      const tab = entry.indexOf("\t")
      return [entry.slice(tab + 1), entry.slice(0, tab).split(" ")[2]!] as const
    }),
  )
}

// Leaves `file` empty when the target already has every object.
async function writeBundle(dir: string, file: string, head: string, snapshot: string, basis: string) {
  const known = await git(dir, ["cat-file", "-e", `${basis}^{commit}`]).then(
    () => true,
    () => false,
  )
  const exclude = known ? [`^${basis}`] : []
  if ((await count(dir, [head, snapshot, ...exclude])) === 0) return fs.writeFile(file, "")
  await git(dir, ["update-ref", _REF.head, head])
  await git(dir, ["update-ref", _REF.snapshot, snapshot])
  try {
    await git(dir, ["bundle", "create", "--quiet", file, _REF.head, _REF.snapshot, ...exclude])
  } finally {
    await git(dir, ["update-ref", "-d", _REF.head]).catch(() => undefined)
    await git(dir, ["update-ref", "-d", _REF.snapshot]).catch(() => undefined)
  }
}

// --- Target ---

/**
 * Applies a mirror: `bundle` (may be empty) holds the sender's commits, `head` its HEAD, `snapshot`
 * its work tree. Ends with HEAD = `head`, index at HEAD, and the work tree = `snapshot`, so this
 * machine shows the sender's uncommitted changes as its own. Untracked files the sender lacks stay.
 */
export async function receive(
  bundle: string,
  options: {
    head: string
    snapshot: string
    branch: string
    dirty: Exclude<Dirty, "ask">
    from?: string
    allowExtra?: boolean
  },
): Promise<Received> {
  // The sender's ids reach git argv below (`cat-file`, `rev-list`, `reset`, `restore`): full hashes only.
  if (!_HASH.test(options.head) || !_HASH.test(options.snapshot)) throw new Error("Invalid commit id from the sender")
  if (!_SAFE_ARG.test(options.branch)) throw new Error(`Branch name not supported by /mirror: ${options.branch}`)
  const dir = sourceDir()
  if (!dir) throw new Error("No oc source folder saved on this machine; run /revive once to choose one")
  const branch = (await git(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
  if (branch !== options.branch) throw new Error(`oc source is on ${branch}, the sender on ${options.branch}: ${dir}`)
  if ((await fs.stat(bundle)).size > 0)
    // A glob: `bundle create` leaves out a ref the target already has (HEAD unchanged).
    await git(dir, ["fetch", "--quiet", "--no-tags", bundle, "refs/oc-mirror/*:refs/oc-mirror/*"])
  try {
    for (const commit of [options.head, options.snapshot]) await git(dir, ["cat-file", "-e", `${commit}^{commit}`])
    const extra = await count(dir, `${options.head}..HEAD`)
    if (extra > 0 && !options.allowExtra)
      throw new Error(`oc source has ${extra} commit(s) the sender lacks; mirroring would drop them: ${dir}`)
    // Re-checked here: the probe may be stale, and only content the mirror changes counts.
    const head = (await git(dir, ["rev-parse", "HEAD"])).trim()
    const own = lost(await changes(dir, head, await worktreeTree(dir)), await blobs(dir, `${options.snapshot}^{tree}`))
    if (own.length && options.dirty === "refuse")
      throw new Error(`oc source has changes the mirror would overwrite (${own.slice(0, 5).join(", ")}): ${dir}`)
    const stashed = own.length > 0 && options.dirty === "backup"
    if (stashed) {
      const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z")
      await git(dir, [
        "stash",
        "push",
        "--include-untracked",
        "-m",
        `oc mirror backup before ${options.from && _SAFE_ARG.test(options.from) ? options.from : "peer"} ${stamp}`,
      ])
    }
    await git(dir, ["reset", "--hard", "--quiet", options.head])
    // Writes the snapshot's files (also over untracked ones in the way) and removes tracked files it lacks.
    await git(dir, ["restore", "--source", options.snapshot, "--staged", "--worktree", ":/"])
    await git(dir, ["reset", "--quiet"])
    const untracked = (await git(dir, ["ls-files", "--others", "--exclude-standard"])).split(/\r?\n/).filter(Boolean)
    const snapshotFiles = new Set(
      (await git(dir, ["ls-tree", "-r", "--name-only", options.snapshot])).split(/\r?\n/).filter(Boolean),
    )
    return { head: options.head, stashed, untracked: untracked.filter((file) => !snapshotFiles.has(file)).length }
  } finally {
    await git(dir, ["update-ref", "-d", _REF.head]).catch(() => undefined)
    await git(dir, ["update-ref", "-d", _REF.snapshot]).catch(() => undefined)
  }
}

export type ReviveRequest = { id: string; from: string; at: number }

// Progress of one revive request, written by whichever side runs it (a window or the no-window helper)
// as `status-<id>.json` in `reviveDir`, and read by the sender through `oc oc mirror status`.
export const REVIVE_STATES = ["building", "revived", "busy", "unchanged", "failed"] as const
export type ReviveState = (typeof REVIVE_STATES)[number]
export type ReviveStatus = { state: ReviveState; detail?: string; version?: string; log?: string; at: number }

/** Writes request `id`'s status atomically and removes status files older than a day. */
export async function writeStatus(id: string, status: Omit<ReviveStatus, "at">) {
  if (!REVIVE_ID.test(id)) throw new Error(`Invalid revive id: ${id}`)
  const dir = reviveDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const file = path.join(dir, `status-${id}.json`)
  await fs.writeFile(`${file}.tmp`, JSON.stringify({ ...status, at: Date.now() }))
  await fs.rename(`${file}.tmp`, file)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names
      .filter(
        (name) =>
          name !== path.basename(file) &&
          /^status-\d+-\d+\.json$/.test(name) &&
          Date.now() - Number(name.split("-")[1]) > 24 * 3_600_000,
      )
      .map((name) => fs.rm(path.join(dir, name), { force: true })),
  )
}

export async function readStatus(id: string) {
  if (!REVIVE_ID.test(id)) throw new Error(`Invalid revive id: ${id}`)
  const text = await fs.readFile(path.join(reviveDir(), `status-${id}.json`), "utf8").catch(() => undefined)
  const status = text === undefined ? undefined : parseStatus(JSON.parse(text))
  // The writer is the binary the revive replaced; this reader (`oc oc mirror status`) is the newly
  // installed one, so its own version is the version the machine revived to.
  return status?.state === "revived" ? { ...status, version: InstallationDisplayVersion } : status
}

function parseStatus(raw: unknown): ReviveStatus | undefined {
  const value = raw as Partial<ReviveStatus> | null | undefined
  if (!value || !REVIVE_STATES.includes(value.state as ReviveState)) return
  const text = (item: unknown) => (typeof item === "string" ? item.slice(0, 300) : undefined)
  return {
    state: value.state as ReviveState,
    detail: text(value.detail),
    log: text(value.log),
    at: typeof value.at === "number" ? value.at : 0,
  }
}

export function reviveDir() {
  return path.join(Global.Path.state, "mirror")
}

/**
 * Leaves a revive request for an open oc window (`takeRevive`) and waits for one to claim it.
 * Claims are exclusive-create files named by request id, so two windows never both revive.
 * `claimed` false: no window took it, and this call holds the claim (the no-window revive may run).
 */
export async function requestRevive(from: string) {
  const dir = reviveDir()
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const request: ReviveRequest = {
    id: `${Date.now()}-${process.pid}`,
    from: _SAFE_ARG.test(from) ? from : "peer",
    at: Date.now(),
  }
  const file = path.join(dir, "revive.json")
  await fs.writeFile(`${file}.tmp`, JSON.stringify(request))
  await fs.rename(`${file}.tmp`, file)
  const claim = path.join(dir, `claim-${request.id}`)
  const until = Date.now() + _REVIVE_WAIT
  while (Date.now() < until) {
    if (await Bun.file(claim).exists()) break
    await Bun.sleep(250)
  }
  // Claimed by nobody: take the claim ourselves, so a window that wakes up later cannot revive for a
  // request nobody waits on anymore. An existing claim means a window won the race after all.
  const claimed = await fs.writeFile(claim, String(process.pid), { flag: "wx" }).then(
    () => false,
    () => true,
  )
  if (!claimed) await fs.rm(file, { force: true })
  await removeOldClaims(dir)
  return { id: request.id, from: request.from, claimed }
}

/** Claims a fresh pending revive request; the caller revives only when this returns one. */
export async function takeRevive(): Promise<ReviveRequest | undefined> {
  const dir = reviveDir()
  const request = await fs
    .readFile(path.join(dir, "revive.json"), "utf8")
    .then((text) => JSON.parse(text) as ReviveRequest)
    .catch(() => undefined)
  // The id names the claim file: digits and one dash only.
  if (
    !request ||
    typeof request.id !== "string" ||
    !REVIVE_ID.test(request.id) ||
    typeof request.at !== "number" ||
    Date.now() - request.at > _REVIVE_FRESH
  )
    return
  const claimed = await fs.writeFile(path.join(dir, `claim-${request.id}`), String(process.pid), { flag: "wx" }).then(
    () => true,
    () => false,
  )
  if (!claimed) return
  await fs.rm(path.join(dir, "revive.json"), { force: true })
  return request
}

async function removeOldClaims(dir: string) {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names
      .filter((name) => name.startsWith("claim-") && Date.now() - Number(name.split("-")[1]) > 2 * _REVIVE_FRESH)
      .map((name) => fs.rm(path.join(dir, name), { force: true })),
  )
}

// --- Helpers ---

// The destination is checked (`_DESTINATION`: no leading `-`), and OpenSSH also gets `--`, so neither
// a host name nor a configured value can become an ssh option such as `-oProxyCommand=...`.
export function connect(host: string, tailscaleSsh: boolean, configured = "auto") {
  if (configured === "tailscale" || (configured === "auto" && tailscaleSsh)) {
    if (!_DESTINATION.test(host)) throw new Error(`Invalid host name: ${host}`)
    const binary = OcSync.tailscaleBinary()
    if (!binary) throw new Error("Tailscale CLI not found")
    return [binary, "ssh", host]
  }
  const destination = configured === "auto" ? host : configured
  if (!_DESTINATION.test(destination)) throw new Error(`Invalid ssh destination: ${destination}`)
  return ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "--", destination]
}

function senderName() {
  return os.hostname().split(".")[0]!.toLowerCase()
}

function readOcJson(): Record<string, unknown> {
  try {
    const file = path.join(Global.Path.config, "oc.json")
    return OcJson.read(readFileSync(file, "utf8"), file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`cannot read oc.json: ${String(error)}`)
    return {}
  }
}

// Remote shells may print banners first; the result is the last JSON line.
function lastJson(output: string): unknown {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((item) => item.trim().startsWith("{"))
  if (!line) throw new Error(`No result from the other machine: ${output.trim().slice(-300) || "empty output"}`)
  return JSON.parse(line)
}

function firstLine(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).split(/\r?\n/)[0]!
}

async function count(dir: string, range: string | string[]) {
  return Number((await git(dir, ["rev-list", "--count", ...(Array.isArray(range) ? range : [range])])).trim())
}

function git(dir: string, args: string[], env: Record<string, string> = {}) {
  return run(["git", "-C", dir, ...args], { env })
}

async function run(
  command: string[],
  options: { stdin?: string; timeout?: number; env?: Record<string, string> } = {},
) {
  // No prompts: ssh BatchMode and GIT_TERMINAL_PROMPT keep a hidden caller from waiting forever.
  const child = Bun.spawn(command, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...options.env },
    stdin: options.stdin ? Bun.file(options.stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout,
  })
  const [out, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) {
    const name = command[0] === "git" ? `git ${command[3]}` : path.basename(command[0]!)
    const reason = child.signalCode ? `timed out` : `exit code ${code}`
    // A failed remote `oc` prints its error last on stderr.
    throw new Error(`${name} failed: ${error.trim().split(/\r?\n/).pop() || reason}`)
  }
  return out
}

export * as OcMirror from "./ocMirror"
