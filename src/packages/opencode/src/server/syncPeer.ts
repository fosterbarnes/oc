// Tailnet config sync, resident server only. Every 20 s while oc.json `sync.enabled` is true: listen
// on this machine's Tailscale IPv4 (read-only manifest and items routes, same Tailscale account
// only), pull newer items from every online same-account peer, and reload open projects once no
// session is busy. Separate from the resident server's port. Logic: core `util/ocSync.ts`.
import os from "node:os"
import { OcItems } from "@opencode-ai/core/util/ocItems"
import { OcSync } from "@opencode-ai/core/util/ocSync"
import { localView, parsePeerView, type PeerSource, type PeerView } from "@/provider/claude-code/warmup/peers"
import { busyClaudeProcesses } from "@/provider/claude-code/sessionManager"
import { AppRuntime } from "@/effect/app-runtime"
import { disposeAllInstancesAndEmitGlobalDisposed } from "./global-lifecycle"
import { SessionWork } from "@opencode-ai/core/session/work"
import { makeRuntime } from "@/effect/run-service"
import { ServerIdle } from "./idle"

// The server's own SessionWork (shared memo map), as the TUI worker reads it.
const sessionWork = makeRuntime(SessionWork.Service, SessionWork.layer)

const _TICK = 20_000
const _TAILSCALE_TTL = 60_000
const _BACKOFF = 5 * 60_000

let server: ReturnType<typeof Bun.serve> | undefined
let tailscale: { at: number; value: Promise<OcSync.TailscaleStatus> } | undefined
let running = false
// Set after this process's first sync cycle in which every online peer answered (offline peers are
// not listed): the Claude account migration waits for it so it merges into what peers already have
// instead of publishing a newer partial map. After _MIGRATION_WAIT it runs anyway (a peer stuck on
// another sync format would otherwise block it forever).
let firstCycleDone = false
let cycleErrors = 0
const runsOc = new Set<string>()
const _MIGRATION_WAIT = 15 * 60_000
const startedAt = Date.now()
let reloadPending = false
const backoff = new Map<string, number>()
// Peers that answered at least once; machines without oc never show up in the status.
const known = new Map<string, OcSync.PeerStatus>()
const logged = new Map<string, string>()
let status: OcSync.Status = { enabled: false, updated: 0, peers: [], conflicts: [] }

export function start() {
  void OcSync.readStatus().then((saved) => {
    status = { ...status, conflicts: saved.conflicts }
    void tick()
    setInterval(() => void tick(), _TICK)
  })
}

async function tick() {
  if (running) return
  running = true
  await cycle()
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      log("cycle", `sync: ${message}`)
      return save({ error: message })
    })
    .then(() => {
      if (cycleErrors === 0) firstCycleDone = true
    })
    .finally(() => (running = false))
}

async function cycle() {
  cycleErrors = 1
  const settings = OcSync.settings()
  if (!settings.enabled) {
    server?.stop(true)
    server = undefined
    if (status.enabled) await save({ enabled: false, peers: [] })
    return
  }
  const tail = await tailscaleStatus()
  listen(tail)
  cycleErrors = 0
  for (const peer of OcSync.peersOf(tail)) {
    if ((backoff.get(peer.ip) ?? 0) > Date.now()) {
      // A peer running oc that has not synced yet still holds the migration barrier.
      if (!firstCycleDone && runsOc.has(peer.ip)) cycleErrors += 1
      continue
    }
    const result = await OcSync.pull(peer, settings).catch((error: unknown) => error as Error)
    if (result instanceof Error) {
      // Only a peer that runs oc holds the barrier. A refused or timed-out connection is a device
      // without oc (Home Assistant, a server); any other error came after oc answered.
      if (!unreachable(result)) runsOc.add(peer.ip)
      if (runsOc.has(peer.ip)) cycleErrors += 1
      backoff.set(peer.ip, Date.now() + _BACKOFF)
      if (known.has(peer.ip)) known.set(peer.ip, { ...known.get(peer.ip)!, error: result.message })
      log(peer.ip, `sync: ${peer.name}: ${result.message}`)
      continue
    }
    known.set(peer.ip, { ...peer, ok: Date.now() })
    runsOc.add(peer.ip)
    logged.delete(peer.ip)
    if (result.applied.length === 0) continue
    console.log(`sync: applied ${result.applied.length} items from ${peer.name}`)
    reloadPending = true
    status = { ...status, conflicts: [...status.conflicts, ...result.conflicts].slice(-50) }
  }
  if (reloadPending && (await idle())) {
    reloadPending = false
    await AppRuntime.runPromise(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
  }
  await save({ enabled: true, error: undefined, peers: [...known.values()] })
}

function unreachable(error: Error) {
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    error instanceof TypeError ||
    /unable to connect|connection refused|econnrefused|econnreset|socket|network/i.test(error.message)
  )
}

function save(next: Partial<OcSync.Status>) {
  status = { ...status, ...next, updated: Date.now() }
  return OcSync.writeStatus(status)
}

// Real work, not a status guess: session runs, shell jobs, and terminals (ServerIdle) are counted
// while running and released when they end, and Claude children report their own turns, tasks, and
// guard checks. A long-open terminal delays the reload until it closes.
async function idle() {
  return !ServerIdle.isBusy(await sessionWork.runPromise(() => ServerIdle.report())) && busyClaudeProcesses() === 0
}

// One log line per new message for a key, not one per tick.
function log(key: string, message: string) {
  if (logged.get(key) === message) return
  logged.set(key, message)
  console.error(message)
}

function listen(tail: OcSync.TailscaleStatus) {
  const hostname = tail.selfIps.find((ip) => !ip.includes(":"))
  if (!hostname || server?.hostname === hostname) return
  server?.stop(true)
  server = undefined
  try {
    server = Bun.serve({ hostname, port: OcSync.PORT, fetch: respond })
  } catch (error) {
    log("listen", `sync: cannot listen on ${hostname}:${OcSync.PORT}: ${String(error)}`)
  }
}

async function respond(request: Request, self: ReturnType<typeof Bun.serve>) {
  if (!(await allowed(self.requestIP(request)?.address))) return new Response("Forbidden", { status: 403 })
  const url = new URL(request.url)
  if (request.method === "GET" && url.pathname === OcSync.ROUTE.manifest) {
    const manifest = await OcSync.manifest()
    const tag = OcSync.etag(manifest)
    if (request.headers.get("if-none-match") === tag) return new Response(null, { status: 304, headers: { etag: tag } })
    return Response.json(manifest, { headers: { etag: tag } })
  }
  if (request.method === "GET" && url.pathname === OcSync.ROUTE.warmup) {
    const view = warmupShared(OcSync.settings()) ? localView() : undefined
    if (!view) return new Response("Not found", { status: 404 })
    return view
      .then((value) => Response.json(value))
      .catch((error) => new Response(error instanceof Error ? error.message : String(error), { status: 500 }))
  }
  if (request.method === "POST" && url.pathname === OcSync.ROUTE.items) {
    const body = (await request.json().catch(() => undefined)) as { ids?: unknown } | undefined
    if (!Array.isArray(body?.ids)) return new Response("Expected { ids: string[] }", { status: 400 })
    return OcSync.items(body.ids.filter((id): id is string => typeof id === "string"))
      .then((items) => Response.json(items))
      .catch((error) => new Response(error instanceof Error ? error.message : String(error), { status: 500 }))
  }
  return new Response("Not found", { status: 404 })
}

// The caller must be one of this user's own machines (`OcSync.isOwnPeer`).
async function allowed(address: string | undefined) {
  if (!address) return false
  const ip = address.replace(/^::ffff:/, "")
  const current = await tailscaleStatus().catch(() => undefined)
  if (!current) return false
  return current.peers.some((peer) => OcSync.isOwnPeer(current, peer) && peer.ips.includes(ip))
}

function tailscaleStatus() {
  if (!tailscale || Date.now() - tailscale.at > _TAILSCALE_TTL) {
    const value = OcSync.tailscaleStatus()
    value.catch(() => (tailscale = undefined))
    tailscale = { at: Date.now(), value }
  }
  return tailscale.value
}

export * as SyncPeer from "./syncPeer"

// --- Claude warm-up (provider/claude-code/warmup) ---

// Warm-up state is shared only while sync is on and synced Claude accounts are not excluded:
// the same peers and the same condition that carry `oc:claudeAccounts` itself.
function warmupShared(settings: OcSync.Settings) {
  return settings.enabled && !OcItems.excluded("oc:claudeAccounts", [], settings.exclude)
}

/** True once the Claude account migration may run: sync off, or the first sync cycle finished. */
export function readyForAccountMigration() {
  return !OcSync.settings().enabled || firstCycleDone || Date.now() - startedAt > _MIGRATION_WAIT
}

const _WARMUP_TIMEOUT = 3_000

// Peers for the warm-up scheduler. Works whether or not this process runs the sync loop (a native
// server reads the same Tailscale status); peers backed off by the sync loop are skipped.
export const warmupPeers: PeerSource = {
  async self() {
    const tail = await tailscaleStatus().catch(() => undefined)
    return tail?.selfHost || os.hostname().split(".")[0]!.toLowerCase()
  },
  async views() {
    if (!warmupShared(OcSync.settings())) return []
    const tail = await tailscaleStatus().catch(() => undefined)
    if (!tail) return []
    const peers = OcSync.peersOf(tail).filter((peer) => (backoff.get(peer.ip) ?? 0) <= Date.now())
    const views = await Promise.all(
      peers.map(async (peer): Promise<PeerView | undefined> => {
        const response = await fetch(`http://${peer.ip}:${OcSync.PORT}${OcSync.ROUTE.warmup}`, {
          signal: AbortSignal.timeout(_WARMUP_TIMEOUT),
        }).catch(() => undefined)
        // 404: an older build or warm-up sharing off there; not a candidate.
        if (!response?.ok) return undefined
        return parsePeerView(peer.name, await response.json().catch(() => undefined))
      }),
    )
    return views.filter((view): view is PeerView => !!view)
  },
}
