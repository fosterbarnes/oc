import fs from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import net from "net"
import { randomBytes } from "crypto"
import { Global } from "@opencode-ai/core/global"
import { launchDetached } from "@opencode-ai/core/util/launchDetached"
import { CliError } from "@/cli/effect-cmd"
import { TuiLedger } from "./tuiLedger"
import { defaultServerPort, executablePath, filePath, read } from "./oc"
import { killPane } from "./wezterm"

export const RESIDENT_ENV = "OC_RESIDENT"

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

export function serverStateDirectory() {
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
    // Called by path: Git's coreutils whoami.exe can come first on PATH and rejects `/user`.
    const user = Bun.spawnSync(
      [path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "whoami.exe"), "/user"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    ).stdout.toString()
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
  otherBuild?: boolean
}

export type ResidentLaunchAction =
  | "reuse"
  | "wait"
  | "wait-unowned"
  | "spawn"
  | "clear-spawn"
  | "refuse-foreign"
  | "refuse-other-build"

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
  // Dev and stable installs share the state file and port; never attach one to the other's server.
  if (observation.healthy && observation.matches && observation.alive && observation.otherBuild)
    return "refuse-other-build"
  if (observation.healthy && observation.matches && observation.alive) return "reuse"
  if (observation.healthy && observation.hasState && (!observation.matches || !observation.alive))
    return "refuse-foreign"
  if (observation.healthy) return "wait-unowned"
  if (!observation.hasState) return "spawn"
  if (!observation.healthy && observation.hasState && observation.matches && observation.alive) return "wait"
  return "clear-spawn"
}

// Refusals are CliErrors, so the CLI prints just the message, without the "Unexpected error" banner.
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
    return new CliError({
      message: `Resident port ${hostname}:${port} is occupied (health true) but no launcher state exists at ${serverStatePath()}.${detail} Not claiming ownership.`,
    })
  }
  return new CliError({
    message: `Resident port ${hostname}:${port} is occupied by a server not owned by this launcher (pid ${state.pid ?? "unknown"} ${alive ? "alive" : "dead"}, state ${matches ? "matches" : "mismatched"}). Health is true but PID is not a live owner. Remove ${serverStatePath()} or free the port.`,
  })
}

function otherBuildRefusal(executable: string | undefined) {
  return new CliError({
    message: `The background server is running from another oc install (${executable}). Close it with "${executable}" --shutdown-all, then start this oc again.`,
  })
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
    otherBuild: !!state?.executable && !TuiLedger.sameExecutable(state.executable, executablePath()),
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
    if (observed.action === "refuse-other-build") throw otherBuildRefusal(observed.state?.executable)
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
    if (observed.action === "refuse-other-build") throw otherBuildRefusal(observed.state?.executable)
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

// Resolves once the launched program exists; on Windows the Start-Process hop exits 0 after starting it.
export function awaitLaunch(child: ReturnType<typeof launchDetached>) {
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
export function listOcProcesses(list = ocProcesses) {
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
export async function forceKill(processes: TuiLedger.Process[]) {
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

export async function waitForExit(pid: number, timeoutMs: number, identity?: ResidentState) {
  const deadline = Date.now() + timeoutMs
  while (isPidAlive(pid, identity) && Date.now() < deadline) await Bun.sleep(50)
  return !isPidAlive(pid, identity)
}

/** Asks the resident server to cancel its work and exit. The server bounds its own cleanup to 30 seconds. */
async function requestShutdown(url: string, secret: string) {
  const response = await fetch(`${url}/global/shutdown`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`opencode:${secret}`).toString("base64")}` },
    signal: AbortSignal.timeout(35_000),
  })
  if (!response.ok) throw new Error(`Resident shutdown failed: HTTP ${response.status}`)
}

/**
 * Reads the resident state and checks that a stop can proceed, so callers can fail before killing anything.
 * The shutdown request carries `oc-server.secret`, which only our server accepts, and `isPidAlive` matches
 * the recorded creation time, so the server's executable need not match this process's.
 */
async function prepareStop(directory: string, processes: TuiLedger.Process[] | null) {
  let state: ResidentState
  try {
    state = JSON.parse(await fs.readFile(serverStatePath(directory), "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return undefined
  }
  const pid = state.pid
  const alive = pid !== undefined && (processes === null ? isPidAlive(pid) : isPidAlive(pid, state, () => processes))
  if (!alive) return { state, pid, live: undefined }
  if (!state.hostname || !state.port) throw new Error(`Resident server ${pid} address unavailable`)
  const secret = (await fs.readFile(path.join(directory, "oc-server.secret"), "utf8")).trim()
  if (!secret) throw new Error("Resident server secret unavailable")
  const identity = processes?.find((item) => TuiLedger.sameIdentity(state, item))
  return { state, pid, live: { pid, url: residentUrl(state.hostname, state.port), secret, identity } }
}

async function runStop(
  directory: string,
  prepared: NonNullable<Awaited<ReturnType<typeof prepareStop>>>,
  keepState?: boolean,
) {
  const { state, live } = prepared
  if (live) {
    await requestShutdown(live.url, live.secret)
    if (!(await waitForExit(live.pid, 35_000, state))) {
      if (!live.identity) throw new Error(`Resident server ${live.pid} identity unavailable for forced stop`)
      await forceKill([live.identity])
      if (!(await waitForExit(live.pid, 5_000, state))) throw new Error(`Resident server ${live.pid} did not exit`)
    }
  }
  if (!keepState) await clearServerState(directory)
  return { stopped: live !== undefined, pid: prepared.pid }
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
  const processes = opts.processes === undefined ? listOcProcesses(opts.listProcesses) : opts.processes
  const prepared = await prepareStop(directory, processes)
  if (!prepared) return { stopped: false }
  const stopped = await runStop(directory, prepared, opts.keepState)
  if ((opts.killTuis ?? true) && processes !== null) {
    const pids = await ocProcessIds(processes, directory)
    await forceKill(processes.filter((item) => pids.includes(item.pid)))
  }
  return stopped
}

/** Closes this instance's oc terminals, then stops its resident server gracefully. */
// `keepPanes`: WezTerm panes a revive moves to its new window; the restarter closes them after the launch.
export async function shutdownAll(
  opts: { directory?: string; listProcesses?: () => TuiLedger.Process[]; keepPanes?: string[] } = {},
) {
  const directory = opts.directory ?? serverStateDirectory()
  const processes = listOcProcesses(opts.listProcesses)
  // Before any kill: a stop that cannot proceed must leave the terminals and server both running.
  const prepared = await prepareStop(directory, processes)
  const records = processes === null ? [] : await TuiLedger.read(directory, processes)
  const pids =
    processes === null ? [] : TuiLedger.select(records, processes, Global.Path.app, executablePath(), process.pid)
  const owned = records.filter((record) => pids.includes(record.pid))
  for (const record of owned) {
    if (!record.paneID || opts.keepPanes?.includes(record.paneID)) continue
    killPane(record.paneID, record.weztermSocket)
  }
  // TUIs have nothing to save; killing them up front avoids the "Unable to connect" screen while servers stop.
  if (processes !== null) await forceKill(processes.filter((item) => pids.includes(item.pid)))
  const stopped = prepared ? await runStop(directory, prepared) : { stopped: false }
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

export * as Resident from "./resident"
