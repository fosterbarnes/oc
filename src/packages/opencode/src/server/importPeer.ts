// Import peer listener: lets another oc on the same Tailscale account pull this machine's skills,
// commands, agents, themes, and settings (palette Import). Separate from the resident server: it
// binds only to this machine's Tailscale IPv4, serves two read-only routes, and runs only while
// oc.json `allowImport` is true. Shared logic: core `util/ocImport.ts`.
import { watch } from "node:fs"
import { Global } from "@opencode-ai/core/global"
import { OcImport } from "@opencode-ai/core/util/ocImport"
import { OcConfig } from "@/config/oc"

const _STATUS_TTL = 30_000

let server: ReturnType<typeof Bun.serve> | undefined
let status: { at: number; value: Promise<OcImport.TailscaleStatus> } | undefined
let syncing = Promise.resolve()

// Resident server only. Follows `allowImport` in oc.json for the life of the process.
export function start() {
  sync()
  const watcher = watch(Global.Path.config, (_event, name) => {
    if (name === "oc.json") sync()
  })
  watcher.on("error", (error) => console.error("import peer: oc.json watch failed", error))
}

function sync() {
  syncing = syncing.then(async () => {
    const enabled = await OcConfig.read()
      .then((settings) => settings.allowImport === true)
      .catch(() => false)
    if (enabled === Boolean(server)) return
    if (!enabled) {
      server?.stop(true)
      server = undefined
      return
    }
    const own = await tailscale(true).catch((error) => {
      console.error(`import peer: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    })
    const hostname = own?.selfIps.find((ip) => !ip.includes(":"))
    if (!hostname) return
    try {
      server = Bun.serve({ hostname, port: OcImport.PORT, fetch: respond })
    } catch (error) {
      console.error(`import peer: cannot listen on ${hostname}:${OcImport.PORT}`, error)
    }
  })
}

async function respond(request: Request, self: ReturnType<typeof Bun.serve>) {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 })
  if (!(await allowed(self.requestIP(request)?.address))) return new Response("Forbidden", { status: 403 })
  const url = new URL(request.url)
  if (url.pathname === OcImport.ROUTE.hello) return Response.json(await OcImport.hello())
  if (url.pathname === OcImport.ROUTE.bundle) {
    return OcImport.bundle()
      .then((result) => Response.json(result))
      .catch((error) => new Response(error instanceof Error ? error.message : String(error), { status: 500 }))
  }
  return new Response("Not found", { status: 404 })
}

// The caller must be a machine signed in to the same Tailscale account as this one.
async function allowed(address: string | undefined) {
  if (!address) return false
  const ip = address.replace(/^::ffff:/, "")
  const current = await tailscale(false).catch(() => undefined)
  if (!current) return false
  return current.peers.some((peer) => peer.user === current.selfUser && peer.ips.includes(ip))
}

function tailscale(fresh: boolean) {
  if (fresh || !status || Date.now() - status.at > _STATUS_TTL) {
    const value = OcImport.tailscaleStatus()
    value.catch(() => (status = undefined))
    status = { at: Date.now(), value }
  }
  return status.value
}

export * as ImportPeer from "./importPeer"
