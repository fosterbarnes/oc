// Tailnet config sync, resident server only. Every 20 s while oc.json `sync.enabled` is true: listen
// on this machine's Tailscale IPv4 (read-only manifest and items routes, same Tailscale account
// only), pull newer items from every online same-account peer, and reload open projects once no
// session is busy. Separate from the resident server's port. Logic: core `util/ocSync.ts`.
import { OcSync } from "@opencode-ai/core/util/ocSync"
import { GlobalBus } from "@/bus/global"
import { AppRuntime } from "@/effect/app-runtime"
import { disposeAllInstancesAndEmitGlobalDisposed } from "./global-lifecycle"

const _TICK = 20_000
const _TAILSCALE_TTL = 60_000
const _BACKOFF = 5 * 60_000
// A session that never reported idle (crash) stops blocking the reload after this long.
const _BUSY_LIMIT = 2 * 60 * 60_000

let server: ReturnType<typeof Bun.serve> | undefined
let tailscale: { at: number; value: Promise<OcSync.TailscaleStatus> } | undefined
let running = false
let reloadPending = false
const busy = new Map<string, number>()
const backoff = new Map<string, number>()
// Peers that answered at least once; machines without oc never show up in the status.
const known = new Map<string, OcSync.PeerStatus>()
const logged = new Map<string, string>()
let status: OcSync.Status = { enabled: false, updated: 0, peers: [], conflicts: [] }

export function start() {
  GlobalBus.on("event", (event) => {
    if (event.payload?.type !== "session.status") return
    const id = String(event.payload.properties?.sessionID)
    if (event.payload.properties?.status?.type === "idle") busy.delete(id)
    else busy.set(id, Date.now())
  })
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
    .finally(() => (running = false))
}

async function cycle() {
  const settings = OcSync.settings()
  if (!settings.enabled) {
    server?.stop(true)
    server = undefined
    if (status.enabled) await save({ enabled: false, peers: [] })
    return
  }
  const tail = await tailscaleStatus()
  listen(tail)
  for (const peer of OcSync.peersOf(tail)) {
    if ((backoff.get(peer.ip) ?? 0) > Date.now()) continue
    const result = await OcSync.pull(peer, settings).catch((error: unknown) => error as Error)
    if (result instanceof Error) {
      backoff.set(peer.ip, Date.now() + _BACKOFF)
      if (known.has(peer.ip)) known.set(peer.ip, { ...known.get(peer.ip)!, error: result.message })
      log(peer.ip, `sync: ${peer.name}: ${result.message}`)
      continue
    }
    known.set(peer.ip, { ...peer, ok: Date.now() })
    logged.delete(peer.ip)
    if (result.applied.length === 0) continue
    console.log(`sync: applied ${result.applied.length} items from ${peer.name}`)
    reloadPending = true
    status = { ...status, conflicts: [...status.conflicts, ...result.conflicts] }
  }
  if (reloadPending && idle()) {
    reloadPending = false
    await AppRuntime.runPromise(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
  }
  await save({ enabled: true, error: undefined, peers: [...known.values()] })
}

function save(next: Partial<OcSync.Status>) {
  status = { ...status, ...next, updated: Date.now() }
  return OcSync.writeStatus(status)
}

function idle() {
  const now = Date.now()
  return [...busy.values()].every((since) => now - since > _BUSY_LIMIT)
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
  if (request.method === "POST" && url.pathname === OcSync.ROUTE.items) {
    const body = (await request.json().catch(() => undefined)) as { ids?: unknown } | undefined
    if (!Array.isArray(body?.ids)) return new Response("Expected { ids: string[] }", { status: 400 })
    return OcSync.items(body.ids.filter((id): id is string => typeof id === "string"))
      .then((items) => Response.json(items))
      .catch((error) => new Response(error instanceof Error ? error.message : String(error), { status: 500 }))
  }
  return new Response("Not found", { status: 404 })
}

// The caller must be a machine signed in to the same Tailscale account as this one.
async function allowed(address: string | undefined) {
  if (!address) return false
  const ip = address.replace(/^::ffff:/, "")
  const current = await tailscaleStatus().catch(() => undefined)
  if (!current) return false
  return current.peers.some((peer) => peer.user === current.selfUser && peer.ips.includes(ip))
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
