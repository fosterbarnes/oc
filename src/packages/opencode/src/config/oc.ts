import fs from "fs/promises"
import os from "os"
import path from "path"
import { spawn } from "child_process"
import { randomBytes } from "crypto"
import { Global } from "@opencode-ai/core/global"
import { DebugConfig } from "@opencode-ai/core/debug-config"
import { TuiLedger } from "./tuiLedger"
import { Revive } from "./revive"
import { launchDetached } from "@opencode-ai/core/util/launch-detached"

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
    throw new Error(`Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export async function update(key: Key, value: string) {
  const parsed: Value = value === "true" ? true : value === "false" ? false : value
  const settings = await read()
  return write(
    key === "serverStartOnWindowsUserStart"
      ? { ...settings, server: { ...settings.server, startOnWindowsUserStart: parsed } }
      : { ...settings, [key]: parsed },
  )
}

async function write<T extends object>(next: T) {
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

function ocProcesses(): TuiLedger.Process[] {
  if (process.platform !== "win32") return []
  const list = Bun.spawnSync(["pwsh", "-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and (Split-Path -Parent $_.ExecutablePath) -eq $env:OC_PROCESS_DIRECTORY } | ForEach-Object { @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; executable = $_.ExecutablePath; startedAt = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } }) -Compress"],
    { stdout: "pipe", stderr: "pipe", windowsHide: true,
      env: { ...process.env, OC_PROCESS_DIRECTORY: path.normalize(path.dirname(executablePath())) } })
  if (list.exitCode !== 0) throw new Error(`Failed to list processes: ${list.stderr.toString()}`)
  return TuiLedger.parseProcesses(list.stdout.toString())
}

function listOcProcesses(list = ocProcesses) {
  try {
    return list()
  } catch (error) {
    console.warn("Skipping oc terminal cleanup: failed to list processes", error)
    return null
  }
}

async function ocProcessIds(processes: TuiLedger.Process[], directory = Global.Path.state) {
  return TuiLedger.select(await TuiLedger.read(directory, processes), processes,
    Global.Path.app, executablePath(), process.pid)
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

export async function stopServer(directory = serverStateDirectory(), opts: {
  killTuis?: boolean
  processes?: TuiLedger.Process[] | null
  listProcesses?: () => TuiLedger.Process[]
} = {}) {
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
  const processes = opts.processes === undefined ? listOcProcesses(opts.listProcesses) : opts.processes
  if (alive) {
    if (process.platform === "win32" && processes !== null && !processes.some((item) =>
      item.pid === pid && TuiLedger.sameExecutable(item.executable, executablePath()))) {
      throw new Error(`Resident server ${pid} does not belong to this executable`)
    }
    await requestShutdown(directory, state!)
    // Graceful exit is scheduled right after the response; force-kill only if it never happens.
    if (!(await waitForExit(pid, 5_000))) {
      process.kill(pid, "SIGKILL")
      if (!(await waitForExit(pid, 5_000))) throw new Error(`Resident server ${pid} did not exit`)
    }
  }
  await clearServerState(directory)
  await fs.rm(`${serverStatePath(directory)}.lock`, { force: true }).catch(() => undefined)
  if (killTuis && processes !== null) forceKill(await ocProcessIds(processes, directory))
  return { stopped: alive, pid }
}

/** Closes this instance's oc terminals, then stops its resident server gracefully. */
export async function shutdownAll(opts: { directory?: string; listProcesses?: () => TuiLedger.Process[] } = {}) {
  const directory = opts.directory ?? serverStateDirectory()
  const processes = listOcProcesses(opts.listProcesses)
  const records = processes === null ? [] : await TuiLedger.read(directory, processes)
  const pids = processes === null ? [] : TuiLedger.select(records, processes, Global.Path.app, executablePath(), process.pid)
  const owned = records.filter((record) => pids.includes(record.pid))
  for (const record of owned) {
    if (!record.paneID) continue
    // Missing panes and unavailable CLI are harmless; never kill the terminal GUI.
    try { Bun.spawnSync(["wezterm", "cli", "kill-pane", "--pane-id", record.paneID], { stdout: "pipe", stderr: "pipe" }) } catch {}
  }
  // TUIs have nothing to save; killing them up front avoids the "Unable to connect" screen while servers stop.
  forceKill(pids)
  const stopped = await stopServer(directory, { killTuis: false, processes })
  const leftovers = pids.filter(isPidAlive)
  await Promise.all(owned.filter((record) => !isPidAlive(record.pid)).map((record) => TuiLedger.remove(directory, record.pid)))
  return { servers: [stopped], leftovers: leftovers.length }
}

export async function restartServer() {
  await stopServer(undefined, { killTuis: false })
  return startServer()
}

/**
 * Revive pipeline (worker 1). Runs as a child of the `oc`/`occ` launcher so its output shows in the
 * window that hosted the TUI, or as a hidden detached helper when no launcher hosts the TUI.
 * Everything that can fail runs before shutdown or before handing off to the terminal restarter.
 */
export async function revive(context: Revive.ReviveContext) {
  const log = reviveLog()
  // First /revive source choice; parseContext guarantees `sourceDir` for "existing" and "download".
  const sourceDir = context.sourceDir
  if (context.source === "download" && sourceDir)
    await log.step(`Downloading oc source to ${sourceDir}`, () => downloadSource(sourceDir))
  if (context.source === "existing" && sourceDir)
    await log.step(`Using oc source at ${sourceDir}`, () => saveReviveBuild({ source: sourceDir, debug: false }))
  if (context.source === "none") await log.step("Saving revive without a source build", () => saveReviveBuild(false))
  const settings = await read()
  const bun = /^bun(?:\.exe)?$/i.test(path.basename(process.execPath))
  const build = context.mode === "install" ? Revive.parseBuild(settings.revive?.build) : undefined
  if (build && bun) throw new Error("Install revive needs an installed oc executable, not Bun")
  const executable = Revive.resolveLauncher(executablePath(), Global.Path.debug)
  // Without the terminal CLI, reopen in a plain console instead of stranding the user.
  const cli = { wezterm: "wezterm-gui", "windows-terminal": "wt.exe", generic: undefined }[context.terminal]
  const installDir = path.dirname(executablePath())
  const restart: Revive.RestartContext = {
    terminal: cli && !Bun.which(cli) ? "generic" : context.terminal,
    launcher: Revive.parseLauncher(settings.revive?.launcher),
    executable,
    ...(bun ? { entrypoint: process.argv[1] } : {}),
    ...(context.paneID ? { paneID: context.paneID } : {}),
    ...(context.shellPid && shellProcess(context.shellPid) ? { shellPid: context.shellPid } : {}),
    ...(context.supervisorPid ? { waitPid: context.supervisorPid } : {}),
    ...(build ? { installDir } : {}),
  }
  const steps = build ? Revive.buildSteps(build) : undefined
  for (const command of steps?.commands ?? [])
    await log.step(command.join(" "), () => runVisible(command, steps?.cwd))
  const sources = steps ? await log.step("Checking build output", () => Revive.installSources(steps.output)) : undefined
  // Ctrl+C from here would leave oc stopped or half installed.
  const ignore = () => {}
  process.on("SIGINT", ignore)
  const failure = await (async () => {
    await log.step("Stopping oc", () => shutdownAll())
    if (sources) await log.step(`Installing into ${installDir}`, () => Revive.install(sources, installDir))
    await log.step("Starting server", () => startServer())
  })().then(() => undefined, (error: unknown) => ({ error }))
  process.off("SIGINT", ignore)
  // A hosting launcher shows the error and reattaches. A hidden helper has no window left, so it
  // still reopens the terminal on the old version before reporting.
  if (failure && context.supervisorPid) throw failure.error
  if (failure) await log.step("Starting server again", () => startServer())
  await log.step(`Handing off to the terminal restarter (log: ${log.file})`, () =>
    awaitLaunch(launchDetached(process.execPath, [...(bun ? [process.argv[1]] : []),
      "oc", "--revive-terminal", Revive.encode(restart)])))
  if (failure) throw failure.error
}

// First /revive only: clone into `directory` (or update an earlier clone there once) and point
// `revive.build` at it. Later revives build the folder as the user left it.
async function downloadSource(directory: string) {
  const cloned = await fs.stat(path.join(directory, ".git")).then(() => true, () => false)
  await runVisible(cloned ? ["git", "-C", directory, "pull", "--ff-only"] : ["git", "clone", Revive.SOURCE_REPO, directory])
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
export async function restartTerminal(restart: Revive.RestartContext) {
  const log = reviveLog()
  if (restart.waitPid && !(await waitForExit(restart.waitPid, 10_000)))
    await log.write(`Launcher ${restart.waitPid} still running after 10s; closing its window anyway`)
  // A failed close still opens the new terminal; a second window beats none.
  await log.step("Closing the old window", () => closeWindow(restart)).catch(() => undefined)
  const command = Revive.reopenCommand(restart)
  await log.step(`Opening ${restart.terminal} with ${restart.launcher}`, () => awaitLaunch(launchDetached(command.file,
    command.args, { cwd: os.homedir(), env: command.env, windowStyle: "Normal",
      windowsVerbatimArguments: command.windowsVerbatimArguments })))
  if (!restart.installDir) return
  const kept = await Revive.removeLeftovers(restart.installDir)
  if (kept.length) await log.write(`Kept in-use leftovers: ${kept.join(", ")}`)
}

function closeWindow(restart: Revive.RestartContext) {
  if (restart.terminal === "wezterm" && restart.paneID) {
    const list = Bun.spawnSync(["wezterm", "cli", "list", "--format", "json"], { stdout: "pipe", stderr: "pipe" })
    if (list.exitCode !== 0) throw new Error(`wezterm cli list failed: ${list.stderr.toString().trim()}`)
    const panes = JSON.parse(list.stdout.toString()) as Array<{ window_id: number; pane_id: number }>
    const window = panes.find((pane) => String(pane.pane_id) === restart.paneID)?.window_id
    for (const pane of panes.filter((pane) => window !== undefined && pane.window_id === window))
      Bun.spawnSync(["wezterm", "cli", "kill-pane", "--pane-id", String(pane.pane_id)], { stdout: "pipe", stderr: "pipe" })
    return
  }
  // The console or Windows Terminal tab closes once its shell and launcher are gone.
  if (restart.shellPid) forceKill([restart.shellPid])
}

// Only a known shell is killed: oc may be the pane's own program, with the terminal itself as parent.
function shellProcess(pid: number) {
  if (process.platform !== "win32") return false
  const result = Bun.spawnSync(["pwsh", "-NoProfile", "-NonInteractive", "-Command",
    `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").Name`], { stdout: "pipe", stderr: "pipe", windowsHide: true })
  return result.exitCode === 0 && Revive.isShell(result.stdout.toString().trim())
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
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Launch failed: exit code ${code}`)))
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
    const result = await Promise.resolve().then(action).then((value) => ({ value }), (error: unknown) => ({ error }))
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
