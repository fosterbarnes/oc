import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const MODULE_PATH = fileURLToPath(import.meta.url)
const STARTUP_TIMEOUT_MS = 15_000
const HEALTH_PORT = () => Number(process.env.CURSOR_H2_HEALTH_PORT ?? 9418)
const H2_PORT = () => Number(process.env.CURSOR_H2_PROXY_PORT ?? 9419)
const CONTROL_TOKEN_HEADER = "x-opencursor-control-token"

type Child = {
  proc: ReturnType<typeof spawn>
  origin: string
}

let starting: Promise<string> | undefined
let child: Child | undefined
let controlToken: string | undefined

function getControlToken(): string {
  if (controlToken) return controlToken
  const env = process.env.CURSOR_H2_CONTROL_TOKEN?.trim()
  if (env) {
    controlToken = env
    return controlToken
  }
  controlToken = crypto.randomUUID()
  process.env.CURSOR_H2_CONTROL_TOKEN = controlToken
  return controlToken
}

function controlHeaders(): Record<string, string> {
  return { [CONTROL_TOKEN_HEADER]: getControlToken() }
}

function runtimeEntry() {
  const override = process.env.OPENCODE_CURSOR_RUNTIME_ENTRY?.trim()
  if (override) return override
  const compiled = MODULE_PATH.includes("/$bunfs/") || MODULE_PATH.includes("~BUN")
  return compiled
    ? path.join(path.dirname(process.execPath), "cursor-runtime", "main.mjs")
    : path.join(path.dirname(MODULE_PATH), "../../../../cursor-runtime/main.mjs")
}

function nodeRuntime() {
  const runtime = Bun.which("node")
  if (!runtime) throw new Error("Cursor requires Node.js for its HTTP/2 transport")
  return runtime
}

async function health(expectedStamp?: string) {
  const response = await fetch(`http://127.0.0.1:${HEALTH_PORT()}/health`, {
    headers: controlHeaders(),
    signal: AbortSignal.timeout(1000),
  })
  if (response.status === 401) return false
  if (!response.ok) return false
  if (expectedStamp && response.headers.get("x-opencursor-proxy-stamp") !== expectedStamp) return false
  return response.headers.get("x-opencursor-flow-window") === String(4 * 1024 * 1024)
}

async function stopExisting() {
  await fetch(`http://127.0.0.1:${HEALTH_PORT()}/shutdown`, {
    headers: controlHeaders(),
    signal: AbortSignal.timeout(1000),
  }).catch(() => {})
}

async function waitReady(origin: string, stamp: string) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS
  let lastError = "not_started"
  while (Date.now() < deadline) {
    try {
      if (await health(stamp)) return
      lastError = "invalid_health_response"
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await Bun.sleep(100)
  }
  throw new Error(`Cursor proxy startup timed out: ${lastError}`)
}

async function start() {
  const entry = runtimeEntry()
  await fs.access(entry)
  const stamp = String((await fs.stat(entry)).mtimeMs)
  const origin = `http://127.0.0.1:${H2_PORT()}`
  if (await health(stamp).catch(() => false)) {
    process.env.CURSOR_H2_PROXY = origin
    return origin
  }
  await stopExisting()

  const token = getControlToken()
  const proc = spawn(nodeRuntime(), [entry], {
    env: {
      ...process.env,
      CURSOR_H2_CONTROL_TOKEN: token,
      CURSOR_H2_HEALTH_PORT: String(HEALTH_PORT()),
      CURSOR_H2_PROXY_PORT: String(H2_PORT()),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  child = { proc, origin }
  proc.on("exit", () => {
    if (child?.proc === proc) child = undefined
  })
  await waitReady(origin, stamp).catch((error) => {
    if (child?.proc === proc) child = undefined
    proc.kill()
    throw error
  })
  process.env.CURSOR_H2_PROXY = origin
  return origin
}

export function ensureCursorProxy() {
  if (child?.proc.exitCode === null) return Promise.resolve(child.origin)
  starting ??= start().finally(() => {
    starting = undefined
  })
  return starting
}

export async function stopCursorProxy() {
  const current = child
  child = undefined
  starting = undefined
  if (!current) return
  await fetch(`http://127.0.0.1:${HEALTH_PORT()}/shutdown`, {
    headers: controlHeaders(),
    signal: AbortSignal.timeout(1000),
  }).catch(() => {})
  current.proc.kill()
  if (process.env.CURSOR_H2_PROXY === current.origin) delete process.env.CURSOR_H2_PROXY
}

export function resetCursorProxyForTests() {
  child = undefined
  starting = undefined
  controlToken = undefined
}

export function getControlTokenForTests(): string {
  return getControlToken()
}

export const __testControlTokenHeader = CONTROL_TOKEN_HEADER

process.on("exit", () => {
  child?.proc.kill()
})
