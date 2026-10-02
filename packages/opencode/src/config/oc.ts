import fs from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { randomBytes } from "crypto"
import { Global } from "@opencode-ai/core/global"
import { DebugConfig } from "@opencode-ai/core/debug-config"

export const RESIDENT_ENV = "OC_RESIDENT"

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
  // Exe or .ps1 paths behind the TUI /revive-no-install and /revive commands
  revive?: { path?: string; installPath?: string }
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

type ResidentState = { pid?: number; hostname?: string; port?: number; restarting?: string }

export type ResidentObservation = {
  healthy: boolean
  hasState: boolean
  matches: boolean
  alive: boolean
  restartingFresh: boolean
}

export type ResidentLaunchAction = "reuse" | "wait" | "wait-unowned" | "spawn" | "clear-spawn" | "refuse-foreign"

const residentReadyAttempts = 100
const unownedReadyAttempts = 10
const residentRestartWindowMs = 30_000

export function residentRestartFresh(restarting: string | undefined, now = Date.now()) {
  if (!restarting) return false
  const marked = Date.parse(restarting)
  return Number.isFinite(marked) && now - marked >= 0 && now - marked < residentRestartWindowMs
}

export function residentLaunchAction(observation: ResidentObservation): ResidentLaunchAction {
  if (observation.healthy && observation.matches && observation.alive) return "reuse"
  if (observation.restartingFresh) return "wait"
  if (observation.healthy && observation.hasState && (!observation.matches || !observation.alive)) return "refuse-foreign"
  if (observation.healthy) return "wait-unowned"
  if (!observation.hasState) return "spawn"
  return "clear-spawn"
}

function residentRefusal(hostname: string, port: number, state: ResidentState | undefined, alive: boolean, matches: boolean) {
  if (!state) {
    return new Error(
      `Resident port ${hostname}:${port} is occupied (health true) but no launcher state exists at ${serverStatePath()}. Not claiming ownership.`,
    )
  }
  return new Error(
    `Resident port ${hostname}:${port} is occupied by a server not owned by this launcher (pid ${state.pid ?? "unknown"} ${alive ? "alive" : "dead"}, state ${matches ? "matches" : "mismatched"}). Health is true but PID is not a live owner. Remove ${serverStatePath()} or free the port.`,
  )
}

async function readResidentState(): Promise<ResidentState | undefined> {
  try {
    return JSON.parse(await fs.readFile(serverStatePath(), "utf8")) as ResidentState
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
}

async function observeResident(url: string, secret: string, hostname: string, port: number) {
  const state = await readResidentState()
  const healthy = await serverHealthy(url, secret)
  const matches = state?.hostname === hostname && state?.port === port
  const alive = state?.pid ? isPidAlive(state.pid) : false
  const action = residentLaunchAction({
    healthy,
    hasState: state !== undefined,
    matches,
    alive,
    restartingFresh: residentRestartFresh(state?.restarting),
  })
  return { state, healthy, matches, alive, action }
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
  let ready = false
  let unownedAttempts = 0
  for (let attempt = 0; attempt < residentReadyAttempts; attempt++) {
    const observed = await observeResident(url, secret, hostname, port)
    if (observed.action === "reuse") return { url, secret }
    if (observed.action === "refuse-foreign") {
      throw residentRefusal(hostname, port, observed.state, observed.alive, observed.matches)
    }
    if (observed.action === "spawn") {
      ready = true
      break
    }
    if (observed.action === "clear-spawn") {
      await clearServerState()
      ready = true
      break
    }
    if (observed.action === "wait-unowned") {
      unownedAttempts++
      if (unownedAttempts >= unownedReadyAttempts) {
        throw residentRefusal(hostname, port, observed.state, observed.alive, observed.matches)
      }
    }
    await Bun.sleep(100)
  }
  if (!ready) {
    const observed = await observeResident(url, secret, hostname, port)
    if (observed.action === "reuse") return { url, secret }
    if (observed.healthy) throw residentRefusal(hostname, port, observed.state, observed.alive, observed.matches)
    if (observed.state) await clearServerState()
  }
  const executable = executablePath()
  const command =
    executable.toLowerCase().includes("bun") && process.argv[1]
      ? [process.argv[1], "serve", "--hostname", hostname, "--port", String(port)]
      : ["serve", "--hostname", hostname, "--port", String(port)]
  await spawnResident(executable, command, {
    cwd: os.homedir(),
    env: {
      ...process.env,
      [RESIDENT_ENV]: "1",
      OPENCODE_SERVER_PASSWORD: secret,
      OPENCODE_SERVER_USERNAME: "opencode",
      ...(Global.Path.debug ? { OPENCODE_LOG_LEVEL: process.env.OPENCODE_LOG_LEVEL || "DEBUG" } : {}),
    },
  })
  for (let attempt = 0; attempt < residentReadyAttempts; attempt++) {
    const observed = await observeResident(url, secret, hostname, port)
    if (observed.action === "reuse") return { url, secret }
    await Bun.sleep(100)
  }
  throw new Error(`Resident OpenCode server did not become ready: ${url}`)
}

// Starts the resident server so it outlives its launcher. On Windows, libuv `detached` means
// DETACHED_PROCESS (no console), so every console program the server runs would open a visible
// window; non-detached children join a kill-on-close job and die with the launcher. A hidden
// pwsh hop runs Start-Process, which gives the server its own hidden console outside that job.
// Resolves once the server process exists, so the caller may exit right after.
export function spawnResident(
  executable: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
) {
  if (process.platform !== "win32") {
    spawn(executable, args, { ...options, detached: true, stdio: "ignore" }).unref()
    return Promise.resolve()
  }
  const script = [
    "$exe = $env:OC_SPAWN_EXE; $argList = $env:OC_SPAWN_ARGS",
    "Remove-Item Env:OC_SPAWN_EXE, Env:OC_SPAWN_ARGS",
    "Start-Process -FilePath $exe -ArgumentList $argList -WindowStyle Hidden -ErrorAction Stop",
  ].join("; ")
  const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
    cwd: options.cwd,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...(options.env ?? process.env),
      OC_SPAWN_EXE: executable,
      OC_SPAWN_ARGS: args.map((arg) => `"${arg}"`).join(" "),
    },
  })
  return new Promise<void>((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Resident server launch failed: pwsh exited ${code}`)),
    )
  })
}

const OC_PROCESS_NAMES = new Set([
  "oc.exe",
  "occ.exe",
  "ocdebug.exe",
  "ocbug.exe",
  "oc-debug.exe",
  "opencode.exe",
  "opencode-debug.exe",
])

/** Lists oc process ids other than this one. */
function ocProcessIds() {
  if (process.platform !== "win32") return []
  const list = Bun.spawnSync(["tasklist", "/FO", "CSV", "/NH"], { stdout: "pipe", stderr: "pipe" })
  if (list.exitCode !== 0) throw new Error(`Failed to list processes: ${list.stderr.toString()}`)
  return list.stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.split('","'))
    .filter((parts) => parts.length > 1 && OC_PROCESS_NAMES.has(parts[0].replace(/^"/, "").toLowerCase()))
    .map((parts) => Number(parts[1]))
    .filter((pid) => pid !== process.pid)
}

// No /T: a revive helper descends from the TUI it is replacing, so tree kills would take it down too.
function forceKill(pids: number[]) {
  for (const pid of pids) Bun.spawnSync(["taskkill", "/F", "/PID", String(pid)], { stdout: "pipe", stderr: "pipe" })
}

async function waitForExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (isPidAlive(pid) && Date.now() < deadline) await Bun.sleep(50)
  return !isPidAlive(pid)
}

/** Asks the resident server to cancel its work and exit. The server bounds its own cleanup to 30 seconds. */
async function requestShutdown(directory: string, state: ResidentState) {
  if (!state.hostname || !state.port) return
  const secret = (await fs.readFile(path.join(directory, "oc-server.secret"), "utf8").catch(() => "")).trim()
  if (!secret) return
  const host = state.hostname === "::1" ? "[::1]" : state.hostname
  await fetch(`http://${host}:${state.port}/global/shutdown`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`opencode:${secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(35_000),
  }).catch(() => undefined)
}

export async function stopServer(directory = serverStateDirectory(), opts: { killTuis?: boolean } = {}) {
  const killTuis = opts.killTuis ?? true
  const file = serverStatePath(directory)
  let state: ResidentState | undefined
  try {
    state = JSON.parse(await fs.readFile(file, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return { stopped: false }
  }
  const pid = state?.pid
  const alive = pid !== undefined && isPidAlive(pid)
  if (alive) {
    await requestShutdown(directory, state!)
    // Graceful exit is scheduled right after the response; force-kill only if it never happens.
    if (!(await waitForExit(pid, 5_000))) {
      process.kill(pid, "SIGKILL")
      if (!(await waitForExit(pid, 5_000))) throw new Error(`Resident server ${pid} did not exit`)
    }
  }
  await clearServerState(directory)
  await fs.rm(`${serverStatePath(directory)}.lock`, { force: true }).catch(() => undefined)
  if (killTuis) forceKill(ocProcessIds())
  return { stopped: alive, pid }
}

/** Closes all WezTerm windows and TUIs first, then stops production and debug resident servers gracefully. */
export async function shutdownAll() {
  const directories = ["opencode", "opencode-debug"].map((app) => path.join(path.dirname(serverStateDirectory()), app))
  const serverPids = await Promise.all(
    directories.map((directory) =>
      fs
        .readFile(serverStatePath(directory), "utf8")
        .then((text) => (JSON.parse(text) as ResidentState).pid)
        .catch(() => undefined),
    ),
  )
  // TODO: close only WezTerm windows that hosted oc. Parent-process matching missed them, so kill all for now.
  Bun.spawnSync(["taskkill", "/F", "/IM", "wezterm-gui.exe"], { stdout: "pipe", stderr: "pipe" })
  // TUIs have nothing to save; killing them up front avoids the "Unable to connect" screen while servers stop.
  forceKill(ocProcessIds().filter((pid) => !serverPids.includes(pid)))
  const stopped = await Promise.all(directories.map((directory) => stopServer(directory, { killTuis: false })))
  const leftovers = ocProcessIds()
  forceKill(leftovers)
  return { servers: stopped, leftovers: leftovers.length }
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
