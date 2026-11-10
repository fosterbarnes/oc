export * as Revive from "./revive"

import fs from "node:fs"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { OcRelease } from "@opencode-ai/core/util/ocRelease"
import { OcSource } from "@opencode-ai/core/util/ocSource"
import { terminalAppScript, type TerminalInfo } from "@opencode-ai/core/util/terminal"
import type { WeztermWindow } from "@opencode-ai/core/util/weztermWindow"
import { TuiLedger } from "./tuiLedger"

type Terminal = TerminalInfo["kind"]
const TERMINALS: readonly string[] = ["wezterm", "windows-terminal", "terminal-app", "generic"]
const LAUNCHERS = ["oc", "occ"] as const
// Matched without `.exe`, so macOS shell paths (/bin/zsh) match too.
const SHELLS = new Set(["pwsh", "powershell", "cmd", "bash", "sh", "zsh", "fish", "nu"])
const EXE = process.platform === "win32" ? ".exe" : ""
const LEFTOVER = /\.old-\d+$/
const RELEASE = /^\d+\.\d+\.\d+$/
const COMMIT = /^[0-9a-f]{40}$/
// Cloned by the first /revive when the user chooses to build from source.
export const SOURCE_REPO = OcSource.REPO_URL

export type Launcher = (typeof LAUNCHERS)[number]

/** Written by the TUI (handoff file or detached helper argument), read by the revive pipeline. */
export type ReviveContext = {
  // "install" installs `output`, which `oc --revive-prepare` built or downloaded while the TUI stayed open.
  // "single" builds and installs only native opencode, then runs it in a new tab; nothing else stops.
  mode: "install" | "no-install" | "single"
  // Install only: the build or release folders/files to install, all under PREPARE_ROOT or the update cache.
  output?: string[]
  // Single only: set once the pipeline runs inside its new tab (the first helper just opens it).
  hosted?: boolean
  terminal: Terminal
  directory: string
  sessionID?: string
  paneID?: string
  // Set by the `oc`/`occ` launcher that hosted the TUI. It shows the pipeline output, and worker 2 waits for it to exit.
  supervisorPid?: number
  // The launcher's parent. Worker 2 kills it to close Windows Terminal tabs and plain consoles.
  shellPid?: number
  shellIdentity?: TuiLedger.Process
  // Native (opencode) TUI: the helper waits for its graceful shutdown before building.
  tuiPid?: number
  // Revived from a native window: reopen native and leave the resident server alone.
  native?: boolean
  // ReviveResume id of the steps typed after this revive; the pipeline settles it ready or failed.
  resume?: string
  // macOS WezTerm: where the window sat, so the reopened one lands in the same place.
  window?: WeztermWindow.Placement
}

/** Written by the TUI for `oc oc --revive-prepare`: the slow, failure-prone work before oc stops. */
export type PrepareRequest = {
  // First /revive answer when oc.json has no `revive.build`: build from an existing source folder,
  // download the source into `sourceDir`, or never build.
  source?: "existing" | "download" | "none"
  sourceDir?: string
  // Download and verify this oc release instead of building. Dormant: /update syncs source until releases ship.
  release?: string
  // /update (temporary, see core/util/ocSource.ts): reset `revive.build.source` to this main commit first.
  update?: string
  // Where the helper writes `{ "output": [...] }` (empty: nothing to install); under Global.Path.state.
  result: string
}

/** One oc tab of the revived WezTerm window. `paneID` is the old-window pane the tab moves out of. */
export type Tab = { kind: "oc"; directory: string; sessionID?: string; paneID?: string }

/** Handed from the revive pipeline to the detached terminal restarter (worker 2). */
export type RestartContext = {
  terminal: Terminal
  launcher: Launcher
  executable: string
  entrypoint?: string
  paneID?: string
  shellPid?: number
  shellIdentity?: TuiLedger.Process
  waitPid?: number
  // Set after an install; worker 2 removes `.old-*` leftovers there once the old processes exit.
  installDir?: string
  // Reopen the native opencode executable beside `executable` in `directory`, not a launcher.
  native?: boolean
  directory?: string
  sessionID?: string
  // Every tab of the window, in order (WezTerm only). More than one entry restores them all.
  tabs?: Tab[]
  window?: WeztermWindow.Placement
}

// Staging folders `oc --revive-prepare` builds into; the swap installs from them.
export const PREPARE_ROOT = path.join(Global.Path.cache, "oc-revive-build")

// `source` is the user's oc source folder (chosen or downloaded on the first /revive); revive never pulls it.
export type BuildConfig = { source: string }
// The Bun workspace inside an oc source folder; build commands run there.
export const WORKSPACE = "src"
// Relative to WORKSPACE; also how the TUI recognizes an oc source folder.
export const BUILD_SCRIPT = "packages/opencode/script/build.ts"
export type InstallSource = { name: string; path: string }

/** Shared with `reviveCommands` in packages/tui/src/app.tsx, which writes this file before exiting. */
export function handoffPath(supervisorPid: number) {
  return path.join(Global.Path.state, "oc-revive", `${supervisorPid}.json`)
}

// Only the exiting unhosted TUI writes this acknowledgement, after worker/descendant cleanup.
export function shutdownPath(tuiPid: number) {
  return path.join(Global.Path.state, "oc-revive", `${tuiPid}.stopped`)
}

export function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

export function decodeContext(encoded: string) {
  return parseContext(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
}

export function parseContext(input: unknown): ReviveContext {
  const value = record(input)
  if (
    (value.mode !== "install" && value.mode !== "no-install" && value.mode !== "single") ||
    (value.mode === "install") !== (value.output !== undefined) ||
    !optional(value.output, (item) => Array.isArray(item) && item.length > 0 && item.every(insideCache)) ||
    !TERMINALS.includes(value.terminal as string) ||
    !text(value.directory) ||
    !optional(value.sessionID, text) ||
    !optional(value.paneID, text) ||
    !optional(value.supervisorPid, pid) ||
    !optional(value.shellPid, pid) ||
    !optional(value.native, flag) ||
    !optional(value.hosted, flag) ||
    !optional(value.tuiPid, pid) ||
    !optional(value.resume, text) ||
    !optional(value.window, placement) ||
    !optional(value.shellIdentity, processIdentity) ||
    (value.shellIdentity !== undefined && (value.shellIdentity as TuiLedger.Process).pid !== value.shellPid)
  ) {
    throw new Error("Invalid revive context")
  }
  return value as ReviveContext
}

export function decodePrepare(encoded: string): PrepareRequest {
  const value = record(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
  if (
    !optional(value.release, (item) => typeof item === "string" && RELEASE.test(item)) ||
    !optional(value.update, (item) => typeof item === "string" && COMMIT.test(item)) ||
    !optional(value.source, (item) => item === "existing" || item === "download" || item === "none") ||
    (value.source === "existing" || value.source === "download") !==
      (text(value.sourceDir) && path.isAbsolute(value.sourceDir as string)) ||
    [value.release, value.update, value.source].filter((item) => item !== undefined).length > 1 ||
    !inside(Global.Path.state, value.result)
  ) {
    throw new Error("Invalid revive prepare request")
  }
  return value as PrepareRequest
}

export function decodeRestart(encoded: string): RestartContext {
  const value = record(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
  if (
    !TERMINALS.includes(value.terminal as string) ||
    !LAUNCHERS.includes(value.launcher as Launcher) ||
    !text(value.executable) ||
    !optional(value.entrypoint, text) ||
    !optional(value.paneID, text) ||
    !optional(value.shellPid, pid) ||
    !optional(value.waitPid, pid) ||
    !optional(value.installDir, text) ||
    !optional(value.native, flag) ||
    !optional(value.shellIdentity, processIdentity) ||
    (value.shellIdentity !== undefined && (value.shellIdentity as TuiLedger.Process).pid !== value.shellPid) ||
    !optional(value.directory, text) ||
    !optional(value.sessionID, text) ||
    !optional(value.tabs, tabList) ||
    !optional(value.window, placement) ||
    (value.native === true && !text(value.directory))
  ) {
    throw new Error("Invalid revive restart context")
  }
  return value as RestartContext
}

/** Reads the tabs `oc revive-tabs` receives from reopenCommand. */
export function decodeTabs(encoded: string) {
  const value: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  if (!tabList(value) || value.length === 0) throw new Error("Invalid revive tabs")
  return value
}

/**
 * The oc panes this instance owns in the window that holds `paneID`, in `wezterm cli list` (tab) order.
 * Revive moves only these to the new window and closes only these; shells, native, and other
 * instances' panes are not in `records`, so they stay running in the old window.
 */
export function windowTabs(
  listJson: string,
  records: Pick<TuiLedger.Record, "paneID" | "directory" | "sessionID">[],
  paneID: string,
): Tab[] {
  const panes = JSON.parse(listJson) as Array<{ window_id: number; pane_id: number }>
  const window = panes.find((pane) => String(pane.pane_id) === paneID)?.window_id
  if (window === undefined) return []
  return panes
    .filter((pane) => pane.window_id === window)
    .flatMap((pane): Tab[] => {
      const record = records.find((item) => item.paneID === String(pane.pane_id) && item.directory !== undefined)
      if (!record?.directory) return []
      return [
        {
          kind: "oc",
          directory: record.directory,
          ...(record.sessionID ? { sessionID: record.sessionID } : {}),
          paneID: String(pane.pane_id),
        },
      ]
    })
}

/** Old-window panes the restarter may close: owned tabs plus the trigger, only while they still exist. */
export function ownedPanes(listJson: string, restart: Pick<RestartContext, "paneID" | "tabs">) {
  const live = new Set((JSON.parse(listJson) as Array<{ pane_id: number }>).map((pane) => String(pane.pane_id)))
  const owned = [restart.paneID, ...(restart.tabs ?? []).map((tab) => tab.paneID)]
  return [...new Set(owned.filter((id): id is string => id !== undefined && live.has(id)))]
}

export function parseLauncher(input: unknown): Launcher {
  if (input === undefined) return "occ"
  if (LAUNCHERS.includes(input as Launcher)) return input as Launcher
  throw new Error(`revive.launcher must be "oc" or "occ": ${JSON.stringify(input)}`)
}

/**
 * Validates `revive.build` from oc.json: the oc source folder. A `debug` key left by older builds is ignored.
 * `false` (or unset) means /revive restarts without building.
 */
export function parseBuild(input: unknown): BuildConfig | undefined {
  if (input === undefined || input === false) return undefined
  const value =
    typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {}
  if (!text(value.source) || !path.isAbsolute(value.source as string))
    throw new Error("revive.build.source must be the absolute path of an oc source folder")
  return { source: value.source as string }
}

/**
 * Commands run in the source's workspace and the outputs they produce, from packages/opencode/script/build.ts --single.
 * `outdir` (absolute) replaces the build's `dist` folder. `--skip-install`: the cross-platform package
 * installs are for all-targets release builds only.
 */
export function buildSteps(build: BuildConfig, options: { variant?: "native"; outdir?: string } = {}) {
  const platform = process.platform === "win32" ? "windows" : process.platform
  const cwd = path.join(build.source, WORKSPACE)
  const dist = options.outdir ?? path.join(cwd, "packages", "opencode", "dist")
  const outdir = options.outdir ? ["--outdir", options.outdir] : []
  const native = path.join(dist, `opencode-native-${platform}-${process.arch}`, "bin", `opencode${EXE}`)
  if (options.variant === "native")
    return {
      cwd,
      commands: [
        ["bun", "install"],
        ["bun", "run", BUILD_SCRIPT, "--single", "--skip-install", "--native-only", ...outdir],
      ],
      output: [native],
    }
  return {
    cwd,
    commands: [
      ["bun", "install"],
      ["bun", "run", BUILD_SCRIPT, "--single", "--skip-install", ...outdir],
    ],
    // The native build ships only its executable; it shares the oc build's support files.
    output: [path.join(dist, `opencode-${platform}-${process.arch}`, "bin"), native],
  }
}

/**
 * Downloads and unpacks oc release `version` for this platform; returns the same output shape as
 * buildSteps (oc folder, native executable). Runs before shutdown,
 * so a missing asset, failed download, or digest mismatch leaves the running oc untouched.
 */
export async function downloadRelease(version: string) {
  const release = await OcRelease.lookup(version)
  const variants: OcRelease.Variant[] = ["oc", "native"]
  const stage = path.join(Global.Path.cache, "oc-update", version)
  await fsp.rm(stage, { recursive: true, force: true })
  const folders = await Promise.all(
    variants.map(async (variant) => {
      const asset = OcRelease.asset(release, variant)
      if (!asset) throw new Error(`oc v${version} has no ${variant} download for ${process.platform}-${process.arch}`)
      if (!asset.sha256) throw new Error(`oc v${version} has no published SHA-256 for ${asset.name}`)
      const folder = path.join(stage, variant)
      const archive = path.join(stage, asset.name)
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(300_000) })
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${asset.name}`)
      // Nothing is written or unpacked until the bytes match GitHub's published digest.
      const bytes = await response.bytes()
      const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
      if (sha256 !== asset.sha256)
        throw new Error(`${asset.name} SHA-256 mismatch: expected ${asset.sha256}, got ${sha256}`)
      await fsp.mkdir(folder, { recursive: true })
      await Bun.write(archive, bytes)
      // Windows 10+ and macOS ship bsdtar, which reads zips; Git's GNU tar can come first on PATH on
      // Windows and cannot, so the system copy is called by path. bsdtar reads its arguments in the ANSI
      // code page on Windows, so it runs inside the folder and only sees the ASCII archive name (a profile
      // path like C:\Users\用户 would turn into ??).
      const tar =
        process.platform === "win32"
          ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
          : "/usr/bin/tar"
      const unpack = Bun.spawnSync([tar, "-xf", path.join("..", asset.name)], {
        cwd: folder,
        stdout: "pipe",
        stderr: "pipe",
      })
      if (unpack.exitCode !== 0) throw new Error(`Unpacking ${asset.name} failed: ${unpack.stderr.toString().trim()}`)
      return folder
    }),
  )
  // The native build ships only its executable; it shares the oc build's support files.
  return [folders[0], path.join(folders[1], `opencode${EXE}`)]
}

export function isShell(name: string) {
  return SHELLS.has(name.toLowerCase().replace(/\.exe$/, ""))
}

export function resolveLauncher(executable: string, exists: (file: string) => boolean = fs.existsSync) {
  const mod = executable.includes("\\") ? path.win32 : path.posix
  if (/^bun(?:\.exe)?$/i.test(mod.basename(executable))) return executable
  const ext = mod.extname(executable)
  const names = [`occ${ext}`, `oc${ext}`]
  const sibling = names.map((name) => mod.join(mod.dirname(executable), name)).find(exists)
  if (sibling) return sibling
  return executable
}

/** The native opencode executable installed beside an oc launcher; Bun dev runs reuse Bun. */
export function nativeExecutable(executable: string) {
  const mod = executable.includes("\\") ? path.win32 : path.posix
  if (/^bun(?:\.exe)?$/i.test(mod.basename(executable))) return executable
  return mod.join(mod.dirname(executable), `opencode${mod.extname(executable)}`)
}

/** Opens a fresh terminal running the configured launcher, so the next revive is hosted in place again. */
export function reopenCommand(restart: RestartContext, platform = process.platform) {
  // A WezTerm snapshot restarts from tab 0, which spawns the rest into this window (`oc revive-tabs`).
  // One snapshotted tab goes through it only for `occ`, which reopens that pane's own session rather than
  // whatever `previous` finds; `oc` keeps opening Home.
  const count = restart.terminal === "wezterm" ? (restart.tabs?.length ?? 0) : 0
  const tabs = count > 1 || (count === 1 && restart.launcher === "occ") ? restart.tabs : undefined
  const entrypoint = restart.entrypoint ? [restart.entrypoint] : []
  const command = restart.native
    ? [
        nativeExecutable(restart.executable),
        ...entrypoint,
        restart.directory!,
        ...(restart.sessionID ? ["--session", restart.sessionID] : []),
      ]
    : [
        restart.executable,
        ...entrypoint,
        "oc",
        ...(tabs
          ? ["revive-tabs", encode(tabs)]
          : restart.launcher === "occ"
            ? ["previous", "--depth", "1"]
            : ["launch"]),
      ]
  // Compiled builds bake the flavor in; a Bun dev run needs it in the environment.
  const flavor: Record<string, string> = { OC_FLAVOR: restart.native ? "native" : "oc" }
  if (restart.terminal === "wezterm" && platform === "darwin") {
    // Through LaunchServices, which brings the new window to the front; a GUI spawned by this detached
    // helper would open behind the active app. `open` passes this environment on. `--config` is a
    // global option and must come before `start`. OC_REVIVE_FULLSCREEN is always set, so a value
    // inherited from an earlier revived window never leaks into this one; wezterm.lua's gui-startup
    // reads it.
    const window = restart.window
    const place = window && !("fullScreen" in window) ? window : undefined
    return {
      file: "open",
      args: [
        "-n",
        "-b",
        "com.github.wez.wezterm",
        "--args",
        ...(place ? ["--config", `initial_cols=${place.cols}`, "--config", `initial_rows=${place.rows}`] : []),
        "start",
        "--always-new-process",
        ...(place ? ["--position", `${place.x},${place.y}`] : []),
        "--cwd",
        os.homedir(),
        "--",
        ...command,
      ],
      env: { ...flavor, OC_REVIVE_FULLSCREEN: window && "fullScreen" in window ? "1" : "0" },
      windowsVerbatimArguments: false,
    }
  }
  if (restart.terminal === "wezterm") {
    // A fresh GUI process reloads wezterm.lua and inherits this environment instead of an unrelated mux server's.
    // wezterm-gui, not the console-subsystem wezterm CLI: that one would show its own console window
    // for as long as the new GUI runs.
    return {
      file: "wezterm-gui",
      args: ["start", "--always-new-process", "--", ...command],
      env: flavor,
      windowsVerbatimArguments: false,
    }
  }
  if (restart.terminal === "windows-terminal") {
    return {
      file: "wt.exe",
      args: ["-w", "new", "new-tab", ...command.map((arg) => arg.replaceAll(";", "\\;"))],
      env: flavor,
      windowsVerbatimArguments: false,
    }
  }
  return consoleStart(command, flavor)
}

// Windows: a new console. macOS (Terminal.app and unknown terminals): a new Terminal.app window, which
// does not inherit this environment, so the flavor goes on the command line.
function consoleStart(command: string[], flavor: Record<string, string>, cwd?: string) {
  if (process.platform === "darwin")
    return {
      file: "osascript",
      args: terminalAppScript(command, { cwd, env: flavor }),
      env: flavor,
      windowsVerbatimArguments: false,
    }
  return windowsConsoleStart(command, flavor)
}

/** Opens `command` in a new tab of the current WezTerm or Windows Terminal window, else a new console. */
export function openTabCommand(command: string[], options: { terminal: Terminal; directory: string }) {
  const flavor: Record<string, string> = { OC_FLAVOR: "oc" }
  if (options.terminal === "wezterm")
    return {
      file: "wezterm",
      args: ["cli", "--no-auto-start", "spawn", "--cwd", options.directory, "--", ...command],
      env: flavor,
      windowsVerbatimArguments: false,
    }
  if (options.terminal === "windows-terminal")
    return {
      file: "wt.exe",
      args: ["-w", "0", "new-tab", "-d", options.directory, ...command.map((arg) => arg.replaceAll(";", "\\;"))],
      env: flavor,
      windowsVerbatimArguments: false,
    }
  return consoleStart(command, flavor, options.directory)
}

// Expand paths once through env vars, so percent signs and shell metacharacters stay literal.
function windowsConsoleStart(command: string[], flavor: Record<string, string>) {
  const env = { ...flavor, ...Object.fromEntries(command.map((arg, index) => [`OC_REVIVE_ARG_${index}`, arg])) }
  return {
    file: "cmd.exe",
    args: ["/d", "/v:off", "/c", `start "" ${command.map((_, index) => `"%OC_REVIVE_ARG_${index}%"`).join(" ")}`],
    env,
    windowsVerbatimArguments: true,
  }
}

/** Lists what each build output provides: a directory's children, or a file itself. Runs before shutdown. */
export async function installSources(output: readonly string[]) {
  const sources: InstallSource[] = []
  for (const item of output) {
    const stat = await fsp.stat(item).catch(() => undefined)
    if (!stat) throw new Error(`Build output not found: ${item}`)
    const entries = stat.isDirectory()
      ? (await fsp.readdir(item)).map((name) => ({ name, path: path.join(item, name) }))
      : [{ name: path.basename(item), path: item }]
    for (const entry of entries) {
      if (sources.some((source) => source.name.toLowerCase() === entry.name.toLowerCase()))
        throw new Error(`Two build outputs provide ${entry.name}`)
      sources.push(entry)
    }
  }
  return sources
}

/**
 * Installs sources into `directory`. Current files are renamed aside (Windows allows renaming a running
 * executable, not overwriting it). Hard-link aliases of replaced files (occ.exe -> oc.exe)
 * are relinked to the new file. Any failure removes what was placed and restores the old names.
 * Returns that same rollback so the caller can undo a finished install until the new server is ready.
 */
export async function install(sources: readonly InstallSource[], directory: string, stamp = Date.now()) {
  const aliases = await aliasNames(
    directory,
    sources.map((source) => source.name),
  )
  const moved: Array<{ from: string; to: string }> = []
  const placed: string[] = []
  const aside = async (target: string) => {
    if (
      !(await fsp.lstat(target).then(
        () => true,
        () => false,
      ))
    )
      return
    const to = `${target}.old-${stamp}`
    await retry(() => fsp.rename(target, to))
    moved.push({ from: target, to })
  }
  // Restores every name even when one step fails, then reports what could not be restored. New files
  // go aside under a later stamp instead of being deleted: a started new server may be running them.
  const rollback = async (error: unknown) => {
    const failed: string[] = []
    for (const [index, target] of placed.toReversed().entries()) {
      if (
        !(await fsp.lstat(target).then(
          () => true,
          () => false,
        ))
      )
        continue
      await retry(() => fsp.rename(target, `${target}.old-${stamp + 1 + index}`)).catch(() => failed.push(target))
    }
    for (const item of moved.toReversed())
      await retry(() => fsp.rename(item.to, item.from)).catch(() => failed.push(item.to))
    if (failed.length)
      throw new Error(`Install failed and rollback is incomplete; fix by hand: ${failed.join(", ")}`, { cause: error })
  }
  try {
    for (const source of sources) {
      const target = path.join(directory, source.name)
      await aside(target)
      placed.push(target)
      await retry(() => fsp.cp(source.path, target, { recursive: true, errorOnExist: true, force: false }))
    }
    for (const alias of aliases) {
      const target = path.join(directory, alias.name)
      await aside(target)
      placed.push(target)
      await fsp.link(path.join(directory, alias.target), target)
    }
  } catch (error) {
    await rollback(error)
    throw error
  }
  return rollback
}

/** Best-effort removal of `.old-*` files left by installs; returns names still in use. */
export async function removeLeftovers(directory: string) {
  const names = (await fsp.readdir(directory)).filter((name) => LEFTOVER.test(name))
  const results = await Promise.allSettled(
    names.map((name) => fsp.rm(path.join(directory, name), { recursive: true, force: true })),
  )
  return names.filter((_, index) => results[index].status === "rejected")
}

// Other names in `directory` that share a file identity with a file being replaced.
async function aliasNames(directory: string, targets: readonly string[]) {
  const lower = new Set(targets.map((name) => name.toLowerCase()))
  const files = await Promise.all(
    (await fsp.readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && !LEFTOVER.test(entry.name))
      .map(async (entry) => ({
        name: entry.name,
        stat: await fsp.stat(path.join(directory, entry.name), { bigint: true }),
      })),
  )
  return files.flatMap((file) => {
    if (lower.has(file.name.toLowerCase())) return []
    const target = files.find(
      (other) =>
        lower.has(other.name.toLowerCase()) && other.stat.ino === file.stat.ino && other.stat.dev === file.stat.dev,
    )
    return target ? [{ name: file.name, target: target.name }] : []
  })
}

// Defender and indexers briefly hold freshly written executables.
async function retry<T>(action: () => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    const result = await action().then(
      (value) => ({ value }),
      (error: NodeJS.ErrnoException) => ({ error }),
    )
    if ("value" in result) return result.value
    if (attempt >= 5 || !["EBUSY", "EPERM", "EACCES"].includes(result.error.code ?? "")) throw result.error
    await Bun.sleep(200 * attempt)
  }
}

function record(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error("Invalid revive context")
  return input as Record<string, unknown>
}

function text(value: unknown) {
  return typeof value === "string" && value !== "" && !value.includes("\0")
}

function pid(value: unknown) {
  return Number.isInteger(value) && (value as number) > 0
}

function flag(value: unknown) {
  return typeof value === "boolean"
}

function processIdentity(value: unknown) {
  if (typeof value !== "object" || value === null) return false
  const item = value as TuiLedger.Process
  return (
    pid(item.pid) &&
    Number.isInteger(item.parentPid) &&
    text(item.executable) &&
    Number.isFinite(item.startedAt) &&
    typeof item.created === "string" &&
    /^\d+$/.test(item.created)
  )
}

function tabList(value: unknown): value is Tab[] {
  return Array.isArray(value) && value.every(tab)
}

function tab(value: unknown) {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>
  return item.kind === "oc" && text(item.directory) && optional(item.sessionID, text) && optional(item.paneID, text)
}

function placement(value: unknown) {
  if (typeof value !== "object" || value === null) return false
  const item = value as Record<string, unknown>
  if (item.fullScreen === true) return true
  return (
    Number.isInteger(item.x) && Number.isInteger(item.y) && pid(item.cols) && pid(item.rows) && !("fullScreen" in item)
  )
}

// An absolute path strictly inside `root`.
function inside(root: string, value: unknown) {
  if (!text(value) || !path.isAbsolute(value as string)) return false
  const relative = path.relative(root, value as string)
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
}

// Install outputs come only from oc's own cache: build staging or the release download.
function insideCache(value: unknown) {
  return inside(Global.Path.cache, value)
}

function optional(value: unknown, check: (value: unknown) => boolean) {
  return value === undefined || check(value)
}
