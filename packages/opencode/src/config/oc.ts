import fs from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { randomBytes } from "crypto"
import { Global } from "@opencode-ai/core/global"
import { DebugConfig } from "@opencode-ai/core/debug-config"

export const keys = [
  "ocDir",
  "homeDir",
  "homeDirSort",
  "initModel",
  "initAgent",
  "initReasoningEffort",
  "sessionModel",
  "sessionAgent",
  "defaultSubagent",
  "defaultSubagentModel",
  "reasoningEffort",
  "serverStartOnWindowsUserStart",
] as const

export type Key = (typeof keys)[number]
export type Value = string | boolean
export type Settings = Partial<Record<Key, Value>> & {
  executable?: string
  server?: { hostname?: string; port?: number; startOnWindowsUserStart?: boolean }
}

export function defaultServerPort() {
  return Global.Path.debug ? 4097 : 4096
}

function filePath() {
  return path.join(Global.Path.config, "oc.json")
}

async function seedDebugFromProduction() {
  await DebugConfig.syncFromProduction({ overwrite: false, serverPort: defaultServerPort() })
}

async function readFile(file: string) {
  try {
    const raw = await fs.readFile(file, "utf8")
    return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as Settings
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

export async function read() {
  await seedDebugFromProduction()
  const file = filePath()
  try {
    return await readFile(file)
  } catch (error) {
    throw new Error(`Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function update(key: Key, value: string) {
  const parsed: Value = value === "true" ? true : value === "false" ? false : value
  const settings = await read()
  const next =
    key === "serverStartOnWindowsUserStart"
      ? { ...settings, server: { ...settings.server, startOnWindowsUserStart: parsed } }
      : { ...settings, [key]: parsed }
  const file = filePath()
  const temporary = `${file}.tmp-${process.pid}`
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    await fs.rename(temporary, file)
  } finally {
    await fs.rm(temporary, { force: true })
  }
  return next
}

export const PALETTE_NEW_SESSION_OC = "New session (oc)"

export function resolvePaletteLaunch(title: string) {
  if (title.trim() === PALETTE_NEW_SESSION_OC) return "pick-home-dir" as const
  throw new Error(`Palette entry not found: ${title.trim()}`)
}

export function pathName() {
  return filePath()
}

export function executablePath(execPath = process.execPath) {
  return Global.resolveExecutablePath(execPath)
}

export function isPidAlive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === "ESRCH") return false
    if (code === "EPERM") return true
    return false
  }
}

function serverStateDirectory() {
  return Global.Path.state
}

export function serverStatePath(directory = serverStateDirectory()) {
  return path.join(directory, "oc-server.json")
}

export async function clearServerState(directory = serverStateDirectory()) {
  try {
    await fs.rm(serverStatePath(directory), { force: true })
  } catch {}
}

function serverSecretPath() {
  return path.join(serverStateDirectory(), "oc-server.secret")
}

async function serverSecret() {
  const file = serverSecretPath()
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    const secret = (await fs.readFile(file, "utf8")).trim()
    if (secret.length >= 32) return secret
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const secret = randomBytes(32).toString("base64")
  await fs.writeFile(file, secret, "ascii")
  if (process.platform === "win32") {
    const user = Bun.spawnSync(["whoami.exe", "/user"], { stdout: "pipe", stderr: "pipe" }).stdout.toString()
    const sid = user.match(/S-\d-\d+(?:-\d+)+/)?.[0]
    if (!sid) throw new Error("Failed to determine the current Windows user SID")
    const result = Bun.spawnSync(["icacls.exe", file, "/inheritance:r", "/grant:r", `*${sid}:F`], {
      stdout: "pipe",
      stderr: "pipe",
    })
    if (result.exitCode !== 0) throw new Error(`Failed to protect resident server secret: ${result.stderr.toString()}`)
  }
  return secret
}

async function serverHealthy(url: string, secret: string) {
  try {
    const token = Buffer.from(`opencode:${secret}`).toString("base64")
    const response = await fetch(`${url}/global/health`, {
      headers: { authorization: `Basic ${token}` },
      signal: AbortSignal.timeout(1000),
    })
    return response.ok && (await response.json()).healthy === true
  } catch {
    return false
  }
}

async function startServerUnlocked() {
  const settings = await read()
  const hostname = settings.server?.hostname || "127.0.0.1"
  const port = settings.server?.port || defaultServerPort()
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Resident OpenCode server must use a loopback hostname: ${hostname}`)
  }
  const secret = await serverSecret()
  const url = `http://${hostname}:${port}`
  let state: { pid?: number; hostname?: string; port?: number } | undefined
  try {
    state = JSON.parse(await fs.readFile(serverStatePath(), "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  const healthy = await serverHealthy(url, secret)
  const matches = state?.hostname === hostname && state?.port === port
  const alive = state?.pid ? isPidAlive(state.pid) : false
  if (healthy && matches && alive) {
    return { url, secret }
  }
  if (healthy && state && (!matches || !alive)) {
    // Healthy endpoint but not our live PID -> foreign occupant or stale recycled PID.
    // Do not claim ownership; clear stale state that claims this host/port and fail bounded.
    if (matches) await clearServerState()
    throw new Error(
      `Resident port ${hostname}:${port} is occupied by a server not owned by this launcher (pid ${state.pid ?? "unknown"} ${alive ? "alive" : "dead"}, state ${matches ? "matches" : "mismatched"}). Health is true but PID is not a live owner. Remove ${serverStatePath()} or free the port.`,
    )
  }
  if (healthy && !state) {
    throw new Error(
      `Resident port ${hostname}:${port} is occupied (health true) but no launcher state exists at ${serverStatePath()}. Not claiming ownership.`,
    )
  }
  if (state && (!matches || !alive || !healthy)) {
    // Stale or mismatched metadata: invalidate coherently without signaling the old PID.
    // Do not kill a potentially recycled PID; just clear stale state.
    await clearServerState()
  }
  const executable = executablePath()
  const command =
    executable.toLowerCase().includes("bun") && process.argv[1]
      ? [process.argv[1], "serve", "--hostname", hostname, "--port", String(port)]
      : ["serve", "--hostname", hostname, "--port", String(port)]
  const child = spawn(executable, command, {
    cwd: os.homedir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      OPENCODE_SERVER_PASSWORD: secret,
      OPENCODE_SERVER_USERNAME: "opencode",
      ...(Global.Path.debug ? { OPENCODE_LOG_LEVEL: process.env.OPENCODE_LOG_LEVEL || "DEBUG" } : {}),
    },
  })
  child.unref()
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await serverHealthy(url, secret)) {
      await fs.writeFile(
        serverStatePath(),
        JSON.stringify({ pid: child.pid, hostname, port, executable, started: new Date().toISOString() }, null, 2),
        "utf8",
      )
      return { url, secret }
    }
    await Bun.sleep(100)
  }
  throw new Error(`Resident OpenCode server did not become ready: ${url}`)
}

async function killTuiProcesses() {
  if (process.platform !== "win32") return
  try {
    const result = Bun.spawnSync(
      ["pwsh", "-NoProfile", "-Command", "Get-Process -Name opencode,oc,occ,ocdebug -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id"],
      { stdout: "pipe", stderr: "pipe" },
    )
    const out = result.stdout.toString().trim()
    if (!out) return
    const pids = out
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
    for (const pid of pids) {
      if (!isPidAlive(pid)) continue
      try {
        process.kill(pid, "SIGTERM")
      } catch {}
      for (let attempt = 0; attempt < 100; attempt++) {
        if (!isPidAlive(pid)) break
        await Bun.sleep(50)
      }
      if (isPidAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL")
        } catch {}
        for (let attempt = 0; attempt < 100; attempt++) {
          if (!isPidAlive(pid)) break
          await Bun.sleep(50)
        }
      }
      if (isPidAlive(pid)) {
        Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], { stdout: "pipe", stderr: "pipe" })
      }
    }
  } catch {}
}

export async function stopServer(directory = serverStateDirectory(), opts: { killTuis?: boolean } = {}) {
  const killTuis = opts.killTuis ?? true
  const file = serverStatePath(directory)
  let state: { pid?: number } | undefined
  try {
    state = JSON.parse(await fs.readFile(file, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return { stopped: false }
  }
  if (!state?.pid || !isPidAlive(state.pid)) {
    await clearServerState(directory)
    try {
      await fs.rm(`${serverStatePath(directory)}.lock`, { force: true })
    } catch {}
    if (killTuis) await killTuiProcesses()
    return { stopped: false, pid: state?.pid }
  }
  const pid = state.pid
  try {
    process.kill(pid, "SIGTERM")
  } catch {}
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!isPidAlive(pid)) break
    await Bun.sleep(50)
  }
  if (isPidAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL")
    } catch {}
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!isPidAlive(pid)) break
      await Bun.sleep(50)
    }
  }
  await clearServerState(directory)
  try {
    await fs.rm(`${serverStatePath(directory)}.lock`, { force: true })
  } catch {}
  if (killTuis) await killTuiProcesses()
  return { stopped: true, pid }
}

export async function restartServer() {
  await stopServer(undefined, { killTuis: false })
  return startServer()
}

export async function startServer() {
  const lock = `${serverStatePath()}.lock`
  await fs.mkdir(path.dirname(lock), { recursive: true })
  let handle: fs.FileHandle | undefined
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      handle = await fs.open(lock, "wx")
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      try {
        const stat = await fs.stat(lock)
        const ageMs = Date.now() - stat.mtimeMs
        if (ageMs > 10000) await fs.rm(lock, { force: true })
      } catch {}
      await Bun.sleep(100)
    }
  }
  if (!handle) throw new Error("Timed out waiting for resident OpenCode server startup")
  try {
    return await startServerUnlocked()
  } finally {
    await handle.close()
    await fs.rm(lock, { force: true })
  }
}

export * as OcConfig from "./oc"
