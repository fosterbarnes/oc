import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import net from "node:net"
import path from "path"
import { fileURLToPath } from "url"
import { Global } from "@opencode-ai/core/global"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"

const AUTH_TIMEOUT_MS = 30 * 60_000
const RESPONSE_TIMEOUT_MS = 15 * 60_000
const STARTUP_TIMEOUT_MS = 60_000
const MODULE_PATH = fileURLToPath(import.meta.url)
const SOURCE_RUNTIME_DIR = path.join(path.dirname(MODULE_PATH), "../../../agentify-runtime")

export const PROVIDER_ID = ProviderV2.ID.make("agentify")
export const MODEL_ID = ModelV2.ID.make("chatgpt-web")
export const CLAUDE_MODEL_ID = ModelV2.ID.make("claude-web")

type Connection = {
  baseUrl: string
  token: string
  port: number
}

type Child = {
  proc: ReturnType<typeof spawn>
  connection: Connection
}

let starting: Promise<Connection> | undefined
let child: Child | undefined
let stopped = false

function runtimeDir() {
  const override = process.env.OPENCODE_AGENTIFY_RUNTIME_DIR?.trim()
  if (override) return override
  const compiled = MODULE_PATH.includes("/$bunfs/") || MODULE_PATH.includes("~BUN")
  return compiled ? path.join(path.dirname(process.execPath), "agentify-runtime") : SOURCE_RUNTIME_DIR
}

export function runtimeEntry() {
  const override = process.env.OPENCODE_AGENTIFY_RUNTIME_ENTRY?.trim()
  if (override) return override
  return path.join(runtimeDir(), "main.mjs")
}

export function stateDir() {
  const override = process.env.AGENTIFY_RUNTIME_STATE_DIR?.trim()
  if (override) return override
  return path.join(Global.Path.data, "agentify-runtime")
}

export function providerInfo() {
  const webModel = (id: ModelV2.ID, name: string, family: string) => ({
    id,
    providerID: PROVIDER_ID,
    name,
    family,
    api: {
      id,
      npm: "@ai-sdk/openai-compatible",
      url: "http://127.0.0.1/v1",
    },
    status: "active",
    headers: {},
    options: {},
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200000, input: 200000, output: 8192 },
    capabilities: {
      temperature: false,
      reasoning: false,
      attachment: false,
      toolcall: false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    release_date: "",
    variants: {},
  })

  return {
    id: PROVIDER_ID,
    source: "custom",
    name: "ChatGPT Web and Claude Web",
    env: [],
    options: {
      timeout: RESPONSE_TIMEOUT_MS,
      headerTimeout: AUTH_TIMEOUT_MS,
      chunkTimeout: RESPONSE_TIMEOUT_MS,
    },
    models: {
      [MODEL_ID]: webModel(MODEL_ID, "ChatGPT Web", "chatgpt-web"),
      [CLAUDE_MODEL_ID]: webModel(CLAUDE_MODEL_ID, "Claude Web", "claude-web"),
    },
  }
}

function whichRuntime() {
  return Bun.which("node") || Bun.which("bun") || "node"
}

async function allocatePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = address && typeof address === "object" ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
    server.on("error", reject)
  })
}

async function waitReady(connection: Connection, abort?: AbortSignal) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let last = "not_started"
  let attempts = 0
  while (Date.now() < deadline) {
    attempts += 1
    if (abort?.aborted) throw new Error("agentify_startup_aborted")
    try {
      const health = await fetch(`http://127.0.0.1:${connection.port}/health`, { signal: AbortSignal.timeout(2000) })
      const models = await fetch(`http://127.0.0.1:${connection.port}/v1/models`, {
        headers: { authorization: `Bearer ${connection.token}` },
        signal: AbortSignal.timeout(2000),
      })
      if (health.ok && models.ok) {
        const body = await models.json()
        const ids = Array.isArray(body?.data) ? body.data.map((item: { id?: string }) => item.id) : []
        if (ids.length > 0) {
          return
        }
      }
      last = `http_${models.status}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(200)
  }
  throw new Error(`agentify_startup_timeout:${last}`)
}

async function start(abort?: AbortSignal) {
  const entry = runtimeEntry()
  await fs.access(entry)
  const token = randomUUID().replaceAll("-", "")
  const port = await allocatePort()
  const dir = stateDir()
  await fs.mkdir(dir, { recursive: true })
  const runtime = whichRuntime()
  const proc = spawn(runtime, [entry, "--state-dir", dir, "--port", String(port)], {
    env: {
      ...process.env,
      AGENTIFY_RUNTIME_STATE_DIR: dir,
      AGENTIFY_RUNTIME_TOKEN: token,
      AGENTIFY_RUNTIME_PORT: String(port),
      AGENTIFY_DESKTOP_BROWSER_BACKEND: "chrome-cdp",
      AGENTIFY_DESKTOP_SHOW_TABS: "true",
      AGENTIFY_DESKTOP_CHROME_BIN:
        process.env.AGENTIFY_DESKTOP_CHROME_BIN ||
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  const connection = { baseUrl: `http://127.0.0.1:${port}/v1`, token, port }
  child = { proc, connection }
  proc.on("exit", (code, signal) => {
    if (child?.proc === proc) child = undefined
  })
  await waitReady(connection, abort)
  return connection
}

export async function ensureStarted(abort?: AbortSignal) {
  if (stopped) {
    throw new Error("agentify_runtime_stopped")
  }
  if (child?.connection) {
    return child.connection
  }
  if (!starting) {
    starting = start(abort).finally(() => {
      starting = undefined
    })
  }
  return starting
}

export async function stop() {
  stopped = true
  const current = child
  child = undefined
  starting = undefined
  if (!current) return
  try {
    await fetch(`http://127.0.0.1:${current.connection.port}/shutdown`, {
      method: "POST",
      headers: { authorization: `Bearer ${current.connection.token}` },
      signal: AbortSignal.timeout(3000),
    })
  } catch {}
  current.proc.kill()
}

export function started() {
  return !!child
}

export async function prepareChat(init?: RequestInit) {
  const connection = await ensureStarted(init?.signal instanceof AbortSignal ? init.signal : undefined)
  const headers = new Headers(init?.headers)
  const affinity = headers.get("x-session-affinity") || headers.get("x-session-id")
  if (!affinity) return connection
  const body =
    typeof init?.body === "string"
      ? init.body
      : init?.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : null
  if (!body) return connection
  let model: string
  try {
    model = String(JSON.parse(body).model || "")
  } catch {
    return connection
  }
  const vendorId = model === String(MODEL_ID) ? "chatgpt" : model === String(CLAUDE_MODEL_ID) ? "claude" : null
  if (!vendorId) return connection
  const key = `opencode:${vendorId}:${affinity}`
  await fetch(`http://127.0.0.1:${connection.port}/show`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${connection.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ key, vendorId }),
    signal: init?.signal,
  }).catch(() => {})
  await fetch(`http://127.0.0.1:${connection.port}/ensure-ready`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${connection.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ key, vendorId, timeoutMs: AUTH_TIMEOUT_MS }),
    signal: init?.signal,
  })
  return connection
}

export function wrapFetch(fetchFn: typeof fetch): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const connection = await ensureStarted(init?.signal instanceof AbortSignal ? init.signal : undefined)
    const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
    if (url.includes("/chat/completions")) await prepareChat(init)
    const next = url.replace(/https?:\/\/[^/]+\/v1/, connection.baseUrl)
    return fetchFn(next, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        authorization: `Bearer ${connection.token}`,
      },
    })
  }) as typeof fetch
}

export function isAgentifyModel(model: { providerID: string; id?: string }) {
  return model.providerID === PROVIDER_ID
}

export function resetForTest() {
  stopped = false
  child = undefined
  starting = undefined
}

process.on("exit", () => {
  if (child) child.proc.kill()
})
