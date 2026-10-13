import fs from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import net from "net"
import { randomBytes } from "crypto"
import { Global } from "@opencode-ai/core/global"
import { DebugConfig } from "@opencode-ai/core/debugConfig"
import { TuiLedger } from "./tuiLedger"
import { Revive } from "./revive"
import { Startup } from "./startup"
import { launchDetached } from "@opencode-ai/core/util/launchDetached"

export const RESIDENT_ENV = "OC_RESIDENT"

export const keys = [
  "ocDir",
  "homeDir",
  "homeDirSort",
  "sessionModel",
  "sessionAgent",
  "serverStartOnWindowsUserStart",
] as const

export type Key = (typeof keys)[number]
export type Value = string | boolean
export type Settings = Partial<Record<Key, Value>> & {
  executable?: string
  server?: { hostname?: string; port?: number; startOnWindowsUserStart?: boolean }
  // `path`: exe or .ps1 that replaces built-in /revive-no-install. `launcher`: what the restarted terminal runs.
  // `build`: source build behind /revive (Revive.parseBuild); `false` = never build; unset = ask on first /revive.
  revive?: { path?: string; launcher?: unknown; build?: unknown }
  intro?: { background?: "terminal" | "black" }
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
    throw new Error(`Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

export async function update(key: Key, value: string, startup?: Parameters<typeof Startup.update>[2]) {
  const parsed: Value = value === "true" ? true : value === "false" ? false : value
  if (key === "serverStartOnWindowsUserStart") {
    if (typeof parsed !== "boolean") throw new Error("serverStartOnWindowsUserStart must be true or false")
    return Startup.update(
      parsed,
      async () => {
        const settings = await read()
        return write({ ...settings, server: { ...settings.server, startOnWindowsUserStart: parsed } })
      },
      startup,
    )
  }
  const settings = await read()
  return write({ ...settings, [key]: parsed })
}

async function write<T extends object>(next: T) {
  const file = filePath()
  const temporary = `${file}.tmp-${process.pid}`
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
  return next
}

export const PALETTE_NEW_SESSION_OC = "New session (oc)"

export function resolvePaletteLaunch(title: string) {
  if (title.trim() === PALETTE_NEW_SESSION_OC) return "pick-home-dir" as const
  throw new Error(`Palette entry not found: ${title.trim()}`)
}

export function executablePath(execPath = process.execPath) {
  return Global.resolveExecutablePath(execPath)
}

export function isPidAlive(
  pid: number,
  identity?: { executable?: string; created?: string },
  list = TuiLedger.listProcesses,
) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  if (identity?.created) return list().some((live) => TuiLedger.sameIdentity({ ...identity, pid }, live))
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

export async function writeResidentState(input: {
  pid: number
  hostname: string
  port: number
  executable?: string
  created?: string
  restarting?: string
  directory?: string
}) {
  const file = serverStatePath(input.directory ?? serverStateDirectory())
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  const identity =
    !input.created && input.pid === process.pid && process.platform === "win32"
      ? TuiLedger.listProcesses().find((item) => item.pid === input.pid)
      : undefined
  if (!input.created && input.pid === process.pid && process.platform === "win32" && !identity?.created)
    throw new Error(`Resident process identity unavailable: ${input.pid}`)
  const body = {
    pid: input.pid,
    hostname: input.hostname,
    port: input.port,
    executable: input.executable ?? identity?.executable,
    created: input.created ?? identity?.created,
    restarting: input.restarting,
    started: new Date().toISOString(),
  }
  await fs.writeFile(temporary, `${JSON.stringify(body, null, 2)}\n`, "utf8")
  try {
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
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

type ResidentState = {
  pid?: number
  hostname?: string
  port?: number
  executable?: string
  created?: string
  restarting?: string
}

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
const residentRestartWindowMs = 120_000

export function residentRestartFresh(restarting: string | undefined, now = Date.now()) {
  if (!restarting) return false
  const marked = Date.parse(restarting)
  return Number.isFinite(marked) && now - marked >= 0 && now - marked < residentRestartWindowMs
}

export function residentLaunchAction(observation: ResidentObservation): ResidentLaunchAction {
  if (observation.restartingFresh) return "wait"
  if (observation.healthy && observation.matches && observation.alive) return "reuse"
  if (observation.healthy && observation.hasState && (!observation.matches || !observation.alive))
    return "refuse-foreign"
  if (observation.healthy) return "wait-unowned"
  if (!observation.hasState) return "spawn"
  if (!observation.healthy && observation.hasState && observation.matches && observation.alive) return "wait"
  return "clear-spawn"
}

function residentRefusal(
  hostname: string,
  port: number,
  state: ResidentState | undefined,
  alive: boolean,
  matches: boolean,
  listener?: { pid?: number; executable?: string },
) {
  if (!state) {
    const detail = listener?.pid
      ? ` Listener pid ${listener.pid}${listener.executable ? ` (${listener.executable})` : ""}.`
      : " No unique matching listener was found."
    return new Error(
      `Resident port ${hostname}:${port} is occupied (health true) but no launcher state exists at ${serverStatePath()}.${detail} Not claiming ownership.`,
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
  // Async snapshot: the launcher intro animates while this runs.
  const processes = state?.pid && state.created ? await TuiLedger.listProcessesAsync() : undefined
  const alive = state?.pid ? isPidAlive(state.pid, state, processes && (() => processes)) : false
  const action = residentLaunchAction({
    healthy,
    hasState: state !== undefined,
    matches,
    alive,
    restartingFresh: residentRestartFresh(state?.restarting),
  })
  return { state, healthy, matches, alive, action }
}

// IPv6 hosts need brackets in a URL; `http://::1:4096` does not parse.
export function residentUrl(hostname: string, port: number) {
  return `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`
}

async function startServerUnlocked(replacement = false) {
  const settings = await read()
  const hostname = settings.server?.hostname || "127.0.0.1"
  const port = settings.server?.port || defaultServerPort()
  if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`Resident OpenCode server must use a loopback hostname: ${hostname}`)
  }
  const secret = await serverSecret()
  const url = residentUrl(hostname, port)
  let ready = false
  let unownedAttempts = 0
  for (let attempt = 0; !replacement && attempt < residentReadyAttempts; attempt++) {
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
        const adopted = await adoptResidentServer(hostname, port)
        if (adopted.ok) return { url, secret }
        throw residentRefusal(hostname, port, observed.state, observed.alive, observed.matches, adopted)
      }
    }
    await Bun.sleep(100)
  }
  if (!ready && !replacement) {
    const observed = await observeResident(url, secret, hostname, port)
    if (observed.action === "reuse") return { url, secret }
    if (observed.action === "wait") throw new Error(`Resident OpenCode server is still starting or restarting: ${url}`)
    if (observed.healthy) {
      const adopted = await adoptResidentServer(hostname, port)
      if (adopted.ok) return { url, secret }
      throw residentRefusal(hostname, port, observed.state, observed.alive, observed.matches, adopted)
    }
    if (observed.state && observed.matches && observed.alive)
      throw new Error(`Resident OpenCode server alive but not responding (pid ${observed.state.pid}): ${url}`)
    if (observed.state && !observed.alive) await clearServerState()
  }
  // Health is false here, so a bound port belongs to something that is not our server. Name it
  // instead of spawning a child that cannot bind and timing out on readiness.
  if (!replacement && (await portInUse(hostname, port))) {
    const pid = residentListenerPid(hostname, port)
    throw new Error(
      `Resident port ${hostname}:${port} is in use by another program${pid ? ` (pid ${pid})` : ""} that is not an ` +
        `OpenCode server for this launcher. Free the port or set server.port in ${filePath()}.`,
    )
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
  return awaitLaunch(launchDetached(executable, args, options))
}

function normalizeListenAddress(address: string) {
  const trimmed = address
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed
}

export function uniqueListenerPid(
  hostname: string,
  port: number,
  rows: Array<{ address: string; port: number; pid: number }>,
) {
  const host = normalizeListenAddress(hostname)
  const allowed = new Set(host === "localhost" ? ["127.0.0.1", "::1"] : [host])
  const pids = [
    ...new Set(
      rows.flatMap((row) =>
        row.port === port &&
        Number.isInteger(row.pid) &&
        row.pid > 0 &&
        allowed.has(normalizeListenAddress(row.address))
          ? [row.pid]
          : [],
      ),
    ),
  ]
  return pids.length === 1 ? pids[0] : undefined
}

// Connects instead of binding: a test bind can fail with EACCES on Windows, and a successful one
// would hold the port the server is about to take. `localhost` may listen on either family.
async function portInUse(hostname: string, port: number) {
  const hosts = hostname === "localhost" ? ["127.0.0.1", "::1"] : [hostname]
  const results = await Promise.all(
    hosts.map(
      (host) =>
        new Promise<boolean>((resolve) => {
          const socket = net.connect({ host, port })
          const finish = (inUse: boolean) => {
            socket.destroy()
            resolve(inUse)
          }
          socket.setTimeout(1000)
          socket.once("connect", () => finish(true))
          socket.once("error", () => finish(false))
          socket.once("timeout", () => finish(false))
        }),
    ),
  )
  return results.some(Boolean)
}

function residentListenerPid(hostname: string, port: number) {
  if (process.platform !== "win32") return undefined
  const result = Bun.spawnSync(
    [
      "pwsh",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-NetTCPConnection -State Listen -LocalPort $env:OC_LISTEN_PORT | ForEach-Object { @{ address = $_.LocalAddress; port = [int]$_.LocalPort; pid = [int]$_.OwningProcess } }) -Compress",
    ],
    { stdout: "pipe", stderr: "pipe", windowsHide: true, env: { ...process.env, OC_LISTEN_PORT: String(port) } },
  )
  if (result.exitCode !== 0) return undefined
  try {
    const parsed: unknown = JSON.parse(result.stdout.toString())
    if (!Array.isArray(parsed)) return undefined
    const rows = parsed.flatMap((row: unknown) => {
      if (typeof row !== "object" || row === null || !("address" in row) || !("port" in row) || !("pid" in row))
        return []
      if (typeof row.address !== "string" || typeof row.port !== "number" || typeof row.pid !== "number") return []
      return [{ address: row.address, port: row.port, pid: row.pid }]
    })
    return uniqueListenerPid(hostname, port, rows)
  } catch {
    return undefined
  }
}

export async function adoptResidentServer(
  hostname: string,
  port: number,
  opts: {
    findListenerPid?: (hostname: string, port: number) => number | undefined
    listProcesses?: () => TuiLedger.Process[]
    writeState?: (input: {
      pid: number
      hostname: string
      port: number
      executable?: string
      created?: string
    }) => Promise<void>
    readState?: () => Promise<ResidentState | undefined>
    pidAlive?: (pid: number) => boolean
  } = {},
): Promise<{ ok: true; pid: number } | { ok: false; pid?: number; executable?: string }> {
  const readState = opts.readState ?? readResidentState
  const pidAlive = (pid: number, state: ResidentState) =>
    opts.pidAlive
      ? opts.pidAlive(pid) && (!state.created || isPidAlive(pid, state, opts.listProcesses))
      : isPidAlive(pid, state, opts.listProcesses)
  const existing = await readState()
  if (existing) {
    if (
      !existing.restarting &&
      existing.hostname === hostname &&
      existing.port === port &&
      existing.pid &&
      pidAlive(existing.pid, existing)
    )
      return { ok: true, pid: existing.pid }
    return { ok: false, pid: existing.pid }
  }
  const pid = (opts.findListenerPid ?? residentListenerPid)(hostname, port)
  if (!pid) return { ok: false }
  let processes: TuiLedger.Process[]
  try {
    processes = (opts.listProcesses ?? ocProcesses)()
  } catch {
    return { ok: false, pid }
  }
  const process = processes.find((item) => item.pid === pid)
  if (!process || !TuiLedger.sameExecutable(process.executable, executablePath()))
    return { ok: false, pid, executable: process?.executable }
  const raced = await readState()
  if (raced) {
    if (
      !raced.restarting &&
      raced.hostname === hostname &&
      raced.port === port &&
      raced.pid &&
      pidAlive(raced.pid, raced)
    )
      return { ok: true, pid: raced.pid }
    return { ok: false, pid: raced.pid }
  }
  await (opts.writeState ?? writeResidentState)({
    pid,
    hostname,
    port,
    executable: process.executable,
    created: process.created,
  })
  return { ok: true, pid }
}

function ocProcesses(): TuiLedger.Process[] {
  return TuiLedger.listProcesses()
}

// null = snapshot unavailable: callers skip identity-gated work (kills, ledger cleanup) but still
// send the authenticated graceful shutdown.
function listOcProcesses(list = ocProcesses) {
  try {
    return list()
  } catch (error) {
    console.warn("Skipping oc terminal cleanup: failed to list processes", error)
    return null
  }
}

async function ocProcessIds(processes: TuiLedger.Process[], directory = Global.Path.state) {
  return TuiLedger.select(
    await TuiLedger.read(directory, processes),
    processes,
    Global.Path.app,
    executablePath(),
    process.pid,
  )
}

// No /T: a revive helper descends from the TUI it is replacing, so tree kills would take it down too.
async function forceKill(processes: TuiLedger.Process[]) {
  if (!processes.length) return
  if (process.platform !== "win32") throw new Error("Forced stop requires Windows CIM process identity")
  const { stopDescendants } = await import("../cli/tui/descendants")
  await stopDescendants(
    processes.map((item) => {
      if (!item.created) throw new Error(`Process identity unavailable: ${item.pid}`)
      return { ...item, created: item.created, protected: false }
    }),
  )
}

async function waitForExit(pid: number, timeoutMs: number, identity?: ResidentState) {
  const deadline = Date.now() + timeoutMs
  while (isPidAlive(pid, identity) && Date.now() < deadline) await Bun.sleep(50)
  return !isPidAlive(pid, identity)
}

/** Asks the resident server to cancel its work and exit. The server bounds its own cleanup to 30 seconds. */
async function requestShutdown(directory: string, state: ResidentState) {
  if (!state.hostname || !state.port) throw new Error("Resident server address unavailable")
  const secret = (await fs.readFile(path.join(directory, "oc-server.secret"), "utf8")).trim()
  if (!secret) throw new Error("Resident server secret unavailable")
  const response = await fetch(`${residentUrl(state.hostname, state.port)}/global/shutdown`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`opencode:${secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`Resident shutdown failed: HTTP ${response.status}`)
}

export async function stopServer(
  directory = serverStateDirectory(),
  opts: {
    killTuis?: boolean
    processes?: TuiLedger.Process[] | null
    listProcesses?: () => TuiLedger.Process[]
    keepState?: boolean
  } = {},
) {
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
  const processes = opts.processes === undefined ? listOcProcesses(opts.listProcesses) : opts.processes
  const alive =
    pid !== undefined && (processes === null ? isPidAlive(pid) : isPidAlive(pid, state, () => processes))
  if (alive) {
    const identity = processes?.find((item) => TuiLedger.sameIdentity(state!, item))
    if (
      process.platform === "win32" &&
      processes !== null &&
      (!identity || !TuiLedger.sameExecutable(identity.executable, executablePath()))
    )
      throw new Error(`Resident server ${pid} identity unavailable or changed`)
    await requestShutdown(directory, state!)
    if (!(await waitForExit(pid, 35_000, state))) {
      if (!identity) throw new Error(`Resident server ${pid} identity unavailable for forced stop`)
      await forceKill([identity])
      if (!(await waitForExit(pid, 5_000, state))) throw new Error(`Resident server ${pid} did not exit`)
    }
  }
  if (!opts.keepState) await clearServerState(directory)
  if (killTuis && processes !== null) {
    const pids = await ocProcessIds(processes, directory)
    await forceKill(processes.filter((item) => pids.includes(item.pid)))
  }
  return { stopped: alive, pid }
}

/** Closes this instance's oc terminals, then stops its resident server gracefully. */
// `keepPanes`: WezTerm panes a revive moves to its new window; the restarter closes them after the launch.
export async function shutdownAll(
  opts: { directory?: string; listProcesses?: () => TuiLedger.Process[]; keepPanes?: string[] } = {},
) {
  const directory = opts.directory ?? serverStateDirectory()
  const processes = listOcProcesses(opts.listProcesses)
  const records = processes === null ? [] : await TuiLedger.read(directory, processes)
  const pids =
    processes === null ? [] : TuiLedger.select(records, processes, Global.Path.app, executablePath(), process.pid)
  const owned = records.filter((record) => pids.includes(record.pid))
  for (const record of owned) {
    if (!record.paneID || opts.keepPanes?.includes(record.paneID)) continue
    killPane(record.paneID)
  }
  // TUIs have nothing to save; killing them up front avoids the "Unable to connect" screen while servers stop.
  if (processes !== null) await forceKill(processes.filter((item) => pids.includes(item.pid)))
  const stopped = await stopServer(directory, { killTuis: false, processes })
  const live = processes === null ? null : listOcProcesses(opts.listProcesses)
  // Without a second snapshot nothing is proven dead, so ledger records stay and owned TUIs count as leftovers.
  if (processes === null || live === null)
    return { servers: [stopped], leftovers: processes === null ? 0 : owned.length }
  const leftovers = processes.filter(
    (item) => pids.includes(item.pid) && live.some((current) => TuiLedger.sameIdentity(item, current)),
  )
  await Promise.all(
    owned
      .filter((record) => !live.some((item) => TuiLedger.sameIdentity(record, item)))
      .map((record) => TuiLedger.remove(directory, record.pid)),
  )
  return { servers: [stopped], leftovers: leftovers.length }
}

export async function restartServer() {
  return withResidentLock(async () => {
    const state = await readResidentState()
    if (!state?.pid || !state.hostname || !state.port || residentRestartFresh(state.restarting))
      return startServerUnlocked()
    if (state?.pid && state.hostname && state.port) {
      await writeResidentState({
        ...state,
        pid: state.pid,
        hostname: state.hostname,
        port: state.port,
        restarting: new Date().toISOString(),
      })
      await stopServer(undefined, { killTuis: false, keepState: true })
    }
    return startServerUnlocked(true)
  })
}

/**
 * Revive pipeline (worker 1). Runs as a child of the `oc`/`occ` launcher so its output shows in the
 * window that hosted the TUI, or as a hidden detached helper when no launcher hosts the TUI.
 * Everything that can fail runs before shutdown or before handing off to the terminal restarter.
 */
export async function revive(context: Revive.ReviveContext) {
  const log = reviveLog()
  try {
    await revivePipeline(context)
  } catch (error) {
    await log.write(`Revive failed: ${error instanceof Error ? error.message : String(error)}`)
    // Hosted revives recover in place. A native window has already exited, even on build failure.
    if (context.native && (!context.tuiPid || !isPidAlive(context.tuiPid))) {
      await log.step("Reopening native after failure", () =>
        restartTerminal({
          terminal: reviveTerminal(context.terminal),
          launcher: "occ",
          executable: executablePath(),
          ...(/^bun(?:\.exe)?$/i.test(path.basename(process.execPath)) ? { entrypoint: process.argv[1] } : {}),
          native: true,
          directory: context.directory,
          sessionID: context.sessionID,
        }),
      )
    }
    throw error
  }
}

async function revivePipeline(context: Revive.ReviveContext) {
  const log = reviveLog()
  if (context.native && context.tuiPid) {
    const tuiPid = context.tuiPid
    await log.step("Waiting for native window shutdown", async () => {
      if (!(await waitForExit(tuiPid, 30_000))) throw new Error("Native window did not shut down; build cancelled")
      const stopped = await Bun.file(Revive.shutdownPath(tuiPid))
        .text()
        .catch(() => "")
      await fs.rm(Revive.shutdownPath(tuiPid), { force: true })
      await fs.rm(Revive.handoffPath(tuiPid), { force: true })
      if (stopped !== "stopped\n") throw new Error("Native window cleanup failed; build cancelled")
    })
  }
  // First /revive source choice; parseContext guarantees `sourceDir` for "existing" and "download".
  const sourceDir = context.sourceDir
  if (context.source === "download" && sourceDir)
    await log.step(`Downloading oc source to ${sourceDir}`, () => downloadSource(sourceDir))
  if (context.source === "existing" && sourceDir)
    await log.step(`Using oc source at ${sourceDir}`, () => saveReviveBuild({ source: sourceDir, debug: false }))
  if (context.source === "none") await log.step("Saving revive without a source build", () => saveReviveBuild(false))
  const settings = await read()
  const bun = /^bun(?:\.exe)?$/i.test(path.basename(process.execPath))
  // An ocdebug revive reopens ocdebug, so it must also build it, whatever the saved choice says.
  const build = context.mode === "install" ? Revive.effectiveBuild(settings.revive?.build, Global.Path.debug) : undefined
  // An update installs a downloaded oc release through the same steps as a source build.
  const release = context.mode === "update" ? context.release : undefined
  const installs = !!build || !!release
  if (installs && bun) throw new Error("Install revive needs an installed oc executable, not Bun")
  const executable = Revive.resolveLauncher(executablePath(), Global.Path.debug)
  const installDir = path.dirname(executablePath())
  const restart: Revive.RestartContext = {
    terminal: reviveTerminal(context.terminal),
    launcher: Revive.parseLauncher(settings.revive?.launcher),
    executable,
    ...(bun ? { entrypoint: process.argv[1] } : {}),
    ...(context.paneID ? { paneID: context.paneID } : {}),
    ...(!context.native && context.shellPid
      ? { shellPid: context.shellPid, shellIdentity: context.shellIdentity }
      : {}),
    ...(context.supervisorPid ? { waitPid: context.supervisorPid } : {}),
    ...(installs ? { installDir } : {}),
    ...(context.native ? { native: true, directory: context.directory, sessionID: context.sessionID } : {}),
  }
  const steps = build ? Revive.buildSteps(build) : undefined
  // One install at a time per installation: the build output, file swap and server start are shared.
  const { tabs, failure } = await withInstallLock(installs ? installDir : undefined, async () => {
    for (const command of steps?.commands ?? []) await log.step(command.join(" "), () => runVisible(command, steps?.cwd))
    const output = release
      ? await log.step(`Downloading oc v${release}`, () =>
          Revive.downloadRelease(release, installDir, Global.Path.debug),
        )
      : steps?.output
    const sources = output ? await log.step("Checking build output", () => Revive.installSources(output)) : undefined
    // Ctrl+C from here would leave oc stopped or half installed.
    const ignore = () => {}
    process.on("SIGINT", ignore)
    const tabs =
      context.paneID && restart.terminal === "wezterm" && !context.native
        ? await windowTabsSnapshot(context.paneID, context)
        : undefined
    const keepPanes = tabs?.flatMap((tab) => (tab.kind === "oc" && tab.paneID ? [tab.paneID] : []))
    const failure = await (async () => {
      // A native TUI/worker already shut down before handoff; installs rename running files aside.
      if (!context.native) await log.step("Stopping oc", () => shutdownAll({ keepPanes }))
      const rollback = sources
        ? await log.step(`Installing into ${installDir}`, () => Revive.install(sources, installDir))
        : undefined
      if (context.native) return
      // The install stays undoable until the new server is ready; a failed start restores the old files.
      await log.step("Starting server", () => startServer()).catch(async (error: unknown) => {
        if (!rollback) throw error
        // Restore even if the stop fails: rollback renames, which works on running files.
        await log.step("Stopping the new server", () => shutdownAll({ keepPanes })).catch(() => undefined)
        await log.step("Restoring the previous install", () => rollback(error))
        throw error
      })
    })().then(
      () => undefined,
      (error: unknown) => ({ error }),
    )
    process.off("SIGINT", ignore)
    if (failure && !context.supervisorPid && !context.native)
      await log.step("Starting server again", () => startServer())
    return { tabs, failure }
  })
  // A hosting launcher shows the error and reattaches. A hidden helper has no window left, so it
  // still reopens the terminal on the old version before reporting.
  if (failure && (context.supervisorPid || context.native)) throw failure.error
  await log.step(`Handing off to the terminal restarter (log: ${log.file})`, () =>
    awaitLaunch(
      launchDetached(process.execPath, [
        ...(bun ? [process.argv[1]] : []),
        "oc",
        "--revive-terminal",
        Revive.encode({ ...restart, tabs }),
      ]),
    ),
  )
  if (failure) throw failure.error
}

async function windowTabsSnapshot(paneID: string, self: Pick<Revive.ReviveContext, "directory" | "sessionID">) {
  try {
    const list = Bun.spawnSync(["wezterm", "cli", "list", "--format", "json"], { stdout: "pipe", stderr: "pipe" })
    if (list.exitCode !== 0) throw new Error(`wezterm cli list failed: ${list.stderr.toString().trim()}`)
    const processes = listOcProcesses()
    const records = processes === null ? [] : await TuiLedger.read(serverStateDirectory(), processes)
    const pids =
      processes === null ? [] : TuiLedger.select(records, processes, Global.Path.app, executablePath(), process.pid)
    // A hosted revive's TUI has already exited, so its ledger record is gone; its pane comes from the context.
    const owned = records.filter((record) => pids.includes(record.pid))
    return Revive.windowTabs(
      list.stdout.toString(),
      [{ paneID, directory: self.directory, sessionID: self.sessionID }, ...owned],
      paneID,
    )
  } catch (error) {
    await reviveLog().write(`Window tabs not restored: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function reviveTerminal(terminal: Revive.ReviveContext["terminal"]) {
  // Reuse the plain-console fallback for failed builds too.
  const cli = { wezterm: "wezterm-gui", "windows-terminal": "wt.exe", generic: undefined }[terminal]
  return cli && !Bun.which(cli) ? "generic" : terminal
}

// First /revive only: clone into `directory` (or update an earlier clone there once) and point
// `revive.build` at it. Later revives build the folder as the user left it.
async function downloadSource(directory: string) {
  const cloned = await fs.stat(path.join(directory, ".git")).then(
    () => true,
    () => false,
  )
  await runVisible(
    cloned ? ["git", "-C", directory, "pull", "--ff-only"] : ["git", "clone", Revive.SOURCE_REPO, directory],
  )
  await saveReviveBuild({ source: directory, debug: false })
}

async function saveReviveBuild(build: false | Revive.BuildConfig) {
  const settings = await read()
  await write({ ...settings, revive: { ...settings.revive, build } })
}

// Output streams into the revive window (or the hidden helper's console).
async function runVisible(command: string[], cwd?: string) {
  const code = await Bun.spawn(command, { cwd, stdio: ["inherit", "inherit", "inherit"] }).exited
  if (code !== 0) throw new Error(`${command[0]} exited with code ${code}`)
}

/** Terminal restarter (worker 2). Detached, so it outlives the window it closes. Output goes to revive.log. */
export async function restartTerminal(
  restart: Revive.RestartContext,
  launch: (command: ReturnType<typeof Revive.reopenCommand>) => Promise<void> = (command) =>
    awaitLaunch(
      launchDetached(command.file, command.args, {
        cwd: os.homedir(),
        env: command.env,
        windowStyle: "Normal",
        windowsVerbatimArguments: command.windowsVerbatimArguments,
        settleMs: REPLACEMENT_SETTLE_MS,
      }),
    ),
) {
  const log = reviveLog()
  if (restart.waitPid && !(await waitForExit(restart.waitPid, 10_000)))
    await log.write(`Launcher ${restart.waitPid} still running after 10s; opening replacement anyway`)
  // The new terminal opens first; the old window closes only once its process started and survived
  // the settle window, so a failed launch leaves the old window in place. WezTerm closes only this
  // instance's panes; other terminals close the verified launching shell. A failed close leaves two windows.
  const wezterm = restart.terminal === "wezterm" && !!restart.paneID
  // Pane ids are per mux and a fresh WezTerm process reuses low ids, so the old panes are recorded with
  // their window before the launch and closed only if the same pane is still in that same window.
  // No socket or a failed list: leave the old panes open rather than guess.
  const old =
    !restart.native && wezterm
      ? await log.step("Recording the old panes", () => oldPanes(restart)).catch(() => undefined)
      : undefined
  const command = Revive.reopenCommand(restart)
  await log.step(`Opening ${restart.terminal} with ${restart.launcher}`, () => launch(command))
  if (old)
    await log.step("Closing this instance's old panes", () => closeOwnedPanes(old)).catch(() => undefined)
  if (!restart.native && !wezterm)
    await log.step("Closing the old window", () => closeWindow(restart)).catch(() => undefined)
  if (!restart.installDir) return
  // A newer revive may hold its own `.old-*` files for rollback; leave them to its restarter.
  const installDir = restart.installDir
  const kept = await withInstallLock(installDir, () => Revive.removeLeftovers(installDir)).catch(
    async (error: unknown) => {
      await log.write(`Skipped leftover cleanup: ${error instanceof Error ? error.message : String(error)}`)
      return []
    },
  )
  if (kept.length) await log.write(`Kept in-use leftovers: ${kept.join(", ")}`)
}

// Acknowledgement is "the terminal process started and did not fail within this window", not a usable TUI.
const REPLACEMENT_SETTLE_MS = 1500

// Held from build through server readiness; a second revive fails fast instead of waiting minutes.
function withInstallLock<T>(installDir: string | undefined, action: () => Promise<T>) {
  if (!installDir) return action()
  return withResidentLock(action, {
    lock: path.join(installDir, ".revive.lock"),
    attempts: 20,
    busy: "Another revive is already installing oc; try again when it finishes",
  })
}

// The restarter inherits the old pane's mux socket; pinning it keeps list/kill off the new window's mux.
function oldPanes(restart: Revive.RestartContext) {
  const socket = process.env.WEZTERM_UNIX_SOCKET
  if (!socket) return undefined
  const list = weztermList(socket)
  return { socket, panes: Revive.ownedPanes(list, restart).map((id) => ({ id, window: windowOf(list, id) })) }
}

function closeOwnedPanes(old: NonNullable<ReturnType<typeof oldPanes>>) {
  const list = weztermList(old.socket)
  for (const pane of old.panes.filter((pane) => windowOf(list, pane.id) === pane.window))
    killPane(pane.id, old.socket)
}

function weztermList(socket: string) {
  const list = Bun.spawnSync(["wezterm", "cli", "--no-auto-start", "list", "--format", "json"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, WEZTERM_UNIX_SOCKET: socket },
  })
  if (list.exitCode !== 0) throw new Error(`wezterm cli list failed: ${list.stderr.toString().trim()}`)
  return list.stdout.toString()
}

function windowOf(listJson: string, paneID: string) {
  return (JSON.parse(listJson) as Array<{ window_id: number; pane_id: number }>).find(
    (pane) => String(pane.pane_id) === paneID,
  )?.window_id
}

async function closeWindow(restart: Revive.RestartContext) {
  // The console or Windows Terminal tab closes once its shell and launcher are gone.
  if (restart.shellPid) {
    if (
      !restart.shellIdentity ||
      restart.shellIdentity.pid !== restart.shellPid ||
      !Revive.isShell(path.win32.basename(restart.shellIdentity.executable))
    )
      throw new Error(`Shell identity unavailable: ${restart.shellPid}`)
    await forceKill([restart.shellIdentity])
  }
}

function killPane(paneID: string, socket?: string) {
  const result = Bun.spawnSync(["wezterm", "cli", "--no-auto-start", "kill-pane", "--pane-id", paneID], {
    stdout: "pipe",
    stderr: "pipe",
    ...(socket ? { env: { ...process.env, WEZTERM_UNIX_SOCKET: socket } } : {}),
  })
  if (result.exitCode !== 0)
    throw new Error(`wezterm cli kill-pane ${paneID} failed: ${result.stderr.toString().trim() || result.exitCode}`)
}

// Resolves once the launched program exists; on Windows the Start-Process hop exits 0 after starting it.
function awaitLaunch(child: ReturnType<typeof launchDetached>) {
  child.ref()
  return new Promise<void>((resolve, reject) => {
    child.once("error", reject)
    if (process.platform !== "win32") {
      child.once("spawn", resolve)
      return
    }
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Launch failed: exit code ${code}`))))
  }).finally(() => child.unref())
}

function reviveLog() {
  const file = path.join(Global.Path.log, "revive.log")
  const write = async (line: string) => {
    console.log(`revive: ${line}`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, `${new Date().toISOString()} [${process.pid}] ${line}\n`)
  }
  const step = async <T>(label: string, action: () => T | Promise<T>) => {
    const start = Date.now()
    await write(`${label}...`)
    const result = await Promise.resolve()
      .then(action)
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
    if ("error" in result) {
      await write(`${label}: failed: ${result.error instanceof Error ? result.error.message : String(result.error)}`)
      throw result.error
    }
    await write(`${label}: done (${((Date.now() - start) / 1000).toFixed(1)}s)`)
    return result.value
  }
  return { file, write, step }
}

export async function startServer() {
  return withResidentLock(() => startServerUnlocked())
}

export function startupLockExpired(
  owner: { pid?: number; executable?: string; created?: string } | undefined,
  processes: TuiLedger.Process[],
  ageMs: number,
) {
  if (!owner?.pid) return ageMs > 120_000
  // Never steal a live owner's lock, even if startup is slower than expected.
  const live = processes.find((item) => item.pid === owner.pid)
  if (!live) return true
  if (!owner.created || !live.created || !live.executable) return false
  return !TuiLedger.sameIdentity(owner, live)
}

export async function withResidentLock<T>(
  action: () => Promise<T>,
  options: { lock?: string; attempts?: number; busy?: string } = {},
) {
  const lock = options.lock ?? `${serverStatePath()}.lock`
  await fs.mkdir(path.dirname(lock), { recursive: true })
  const identity =
    process.platform === "win32"
      ? (await TuiLedger.listProcessesAsync()).find((item) => item.pid === process.pid)
      : undefined
  if (process.platform === "win32" && !identity?.created) throw new Error("Startup lock owner identity unavailable")
  let handle: fs.FileHandle | undefined
  for (let attempt = 0; attempt < (options.attempts ?? 300); attempt++) {
    try {
      handle = await fs.open(lock, "wx")
      await handle.writeFile(JSON.stringify(identity ?? { pid: process.pid }))
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        if (handle) {
          await handle.close()
          await fs.rm(lock, { force: true })
        }
        throw error
      }
      try {
        const stat = await fs.stat(lock)
        const ageMs = Date.now() - stat.mtimeMs
        const contents = await fs.readFile(lock, "utf8")
        // A crash between create and write leaves an empty or partial lock. With no readable
        // owner, the ownerless age policy decides instead of the lock blocking every launch.
        const owner = parseLockOwner(contents)
        const expired = !owner
          ? startupLockExpired(undefined, [], ageMs)
          : process.platform === "win32"
            ? startupLockExpired(owner, await TuiLedger.listProcessesAsync(), ageMs)
            : !isPidAlive(owner.pid)
        if (expired && (await fs.readFile(lock, "utf8")) === contents) await fs.rm(lock, { force: true })
      } catch {}
      await Bun.sleep(100)
    }
  }
  if (!handle) throw new Error(options.busy ?? "Timed out waiting for resident OpenCode server startup")
  try {
    return await action()
  } finally {
    await handle.close()
    await fs.rm(lock, { force: true })
  }
}

function parseLockOwner(contents: string) {
  try {
    const owner: unknown = JSON.parse(contents)
    if (owner && typeof owner === "object" && Number.isInteger((owner as { pid?: unknown }).pid))
      return owner as TuiLedger.Process
  } catch {}
  return undefined
}

// Shared by `session bootstrap` and the launcher's server-side bootstrap.
export async function writeSidebar(directory: string) {
  const configDirectory = path.join(directory, ".config")
  const sidebarPath = path.join(configDirectory, "openSidebar.json")
  await fs.mkdir(configDirectory, { recursive: true })

  const settings = (
    (await Bun.file(sidebarPath).exists()) ? JSON.parse(await Bun.file(sidebarPath).text()) : {}
  ) as Record<string, unknown>
  if (settings === null || Array.isArray(settings) || typeof settings !== "object") {
    throw new Error("sidebar config must contain a JSON object")
  }
  settings.projectDirectory = directory

  const temporary = `${sidebarPath}.tmp-${process.pid}`
  try {
    await Bun.write(temporary, `${JSON.stringify(settings, null, 2)}\n`)
    await fs.rename(temporary, sidebarPath)
  } finally {
    await fs.rm(temporary, { force: true })
  }
}

// `crow`, then `crow1`, `crow2`, ... based on existing root session titles.
export function nextProjectTitle(titles: string[], directory: string) {
  const baseTitle = path.basename(directory) || directory
  const pattern = new RegExp(`^${baseTitle.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\d*$`)
  const numbers = titles.flatMap((title) => {
    if (!pattern.test(title)) return []
    if (title === baseTitle) return [0]
    return [Number(title.slice(baseTitle.length))]
  })
  return numbers.length === 0 ? baseTitle : `${baseTitle}${Math.max(...numbers) + 1}`
}

export * as OcConfig from "./oc"
