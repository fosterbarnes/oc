import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"

const MODULE_PATH = fileURLToPath(import.meta.url)
const STARTUP_TIMEOUT_MS = 15_000

// Each oc process owns one proxy on OS-assigned ports, so separate installs never share one.
const STOP_WAIT_MS = 3_000

let starting: Promise<string> | undefined
let child:
  | { proc: ReturnType<typeof spawn>; origin: string; health: string; token: string; rl: readline.Interface }
  | undefined

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
  return new Promise<{ health: number; h2: number; rl: readline.Interface }>((resolve, reject) => {
    let stderr = ""
    let settled = false
    proc.stderr?.on("data", (chunk) => (stderr = (stderr + chunk).slice(-2000)))
    const rl = readline.createInterface({ input: proc.stdout! })
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(() => {
      finish(() => {
        rl.close()
        reject(new Error("Cursor proxy startup timed out"))
      })
    }, STARTUP_TIMEOUT_MS)
    rl.once("line", (line) => {
      const match = /^\{"health":(\d+),"h2":(\d+)\}$/.exec(line.trim())
      if (!match) {
        finish(() => {
          rl.close()
          reject(new Error(`Cursor proxy sent invalid ports: ${line}`))
        })
        return
      }
      finish(() => resolve({ health: Number(match[1]), h2: Number(match[2]), rl }))
    })
    proc.once("exit", (code) => {
      finish(() => {
        rl.close()
        reject(new Error(`Cursor proxy exited during startup (code ${code}): ${stderr.trim()}`))
      })
    })
    proc.once("error", (error) => {
      finish(() => {
        rl.close()
        reject(error)
      })
    })
  })
}

async function start() {
  const entry = runtimeEntry()
  await fs.access(entry)
  const token = crypto.randomUUID()
  const proc = spawn(nodeRuntime(), [entry], {
    env: { ...process.env, CURSOR_H2_CONTROL_TOKEN: token, CURSOR_H2_HEALTH_PORT: "0", CURSOR_H2_PROXY_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  })
  const ports = await readPorts(proc).catch((error) => {
    proc.kill()
    throw error
  })
  const origin = `http://127.0.0.1:${ports.h2}`
  const health = `http://127.0.0.1:${ports.health}`
  child = { proc, origin, health, token, rl: ports.rl }
  proc.on("exit", () => {
    ports.rl.close()
    if (child?.proc === proc) child = undefined
  })
  process.env.CURSOR_H2_PROXY = origin
  process.env.CURSOR_H2_CONTROL_TOKEN = token
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
  try {
    await fetch(`${current.health}/shutdown`, {
      headers: { "x-opencursor-control-token": current.token },
      signal: AbortSignal.timeout(1_000),
    })
  } catch {
    current.proc.kill()
  }
  await new Promise<void>((resolve) => {
    if (current.proc.exitCode !== null) {
      current.rl.close()
      resolve()
      return
    }
    const timer = setTimeout(() => {
      current.proc.kill()
      current.rl.close()
      resolve()
    }, STOP_WAIT_MS)
    current.proc.once("exit", () => {
      clearTimeout(timer)
      current.rl.close()
      resolve()
    })
  })
  if (process.env.CURSOR_H2_PROXY === current.origin) delete process.env.CURSOR_H2_PROXY
  if (process.env.CURSOR_H2_CONTROL_TOKEN === current.token) delete process.env.CURSOR_H2_CONTROL_TOKEN
}

process.on("exit", () => {
  child?.proc.kill()
})
