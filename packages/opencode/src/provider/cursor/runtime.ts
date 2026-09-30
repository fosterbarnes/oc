import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"

const MODULE_PATH = fileURLToPath(import.meta.url)
const STARTUP_TIMEOUT_MS = 15_000

// Each oc process owns one proxy on OS-assigned ports, so separate installs never share one.
let starting: Promise<string> | undefined
let child: { proc: ReturnType<typeof spawn>; origin: string } | undefined

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

// The proxy prints {"health":port,"h2":port} once both servers listen.
function readPorts(proc: ReturnType<typeof spawn>) {
  return new Promise<{ h2: number }>((resolve, reject) => {
    let stderr = ""
    proc.stderr?.on("data", (chunk) => (stderr = (stderr + chunk).slice(-2000)))
    const timer = setTimeout(() => reject(new Error("Cursor proxy startup timed out")), STARTUP_TIMEOUT_MS)
    readline.createInterface({ input: proc.stdout! }).once("line", (line) => {
      clearTimeout(timer)
      const h2 = /^\{"health":\d+,"h2":(\d+)\}$/.exec(line.trim())?.[1]
      if (!h2) return reject(new Error(`Cursor proxy sent invalid ports: ${line}`))
      resolve({ h2: Number(h2) })
    })
    proc.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`Cursor proxy exited during startup (code ${code}): ${stderr.trim()}`))
    })
    proc.once("error", reject)
  })
}

async function start() {
  const entry = runtimeEntry()
  await fs.access(entry)
  const proc = spawn(nodeRuntime(), [entry], {
    env: { ...process.env, CURSOR_H2_CONTROL_TOKEN: crypto.randomUUID(), CURSOR_H2_HEALTH_PORT: "0", CURSOR_H2_PROXY_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  const ports = await readPorts(proc).catch((error) => {
    proc.kill()
    throw error
  })
  const origin = `http://127.0.0.1:${ports.h2}`
  child = { proc, origin }
  proc.on("exit", () => {
    if (child?.proc === proc) child = undefined
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
  current.proc.kill()
  if (process.env.CURSOR_H2_PROXY === current.origin) delete process.env.CURSOR_H2_PROXY
}

process.on("exit", () => {
  child?.proc.kill()
})
