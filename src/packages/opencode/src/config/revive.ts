export * as Revive from "./revive"

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { OcRelease } from "@opencode-ai/core/util/ocRelease"
import type { TerminalInfo } from "@opencode-ai/core/util/terminal"
import { TuiLedger } from "./tuiLedger"

type Terminal = TerminalInfo["kind"]
const TERMINALS: readonly string[] = ["wezterm", "windows-terminal", "generic"]
const LAUNCHERS = ["oc", "occ"] as const
const SHELLS = new Set(["pwsh.exe", "powershell.exe", "cmd.exe", "bash.exe", "sh.exe", "zsh.exe", "fish.exe", "nu.exe"])
const LEFTOVER = /\.old-\d+$/
const RELEASE = /^\d+\.\d+\.\d+$/
// Cloned by the first /revive when the user chooses to build from source.
export const SOURCE_REPO = "https://github.com/fosterbarnes/oc"

export type Launcher = (typeof LAUNCHERS)[number]

/** Written by the TUI (handoff file or detached helper argument), read by the revive pipeline. */
export type ReviveContext = {
  // "update" installs the oc GitHub release `release` instead of building from source.
  // "single" builds and installs only native opencode, then runs it in a new tab; nothing else stops.
  mode: "install" | "no-install" | "update" | "single"
  release?: string
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
  // First /revive answer when oc.json has no `revive.build`: build from an existing source folder,
  // download the source into `sourceDir`, or never build.
  source?: "existing" | "download" | "none"
  sourceDir?: string
  // Revived from a native window: reopen native and leave the resident server alone.
  native?: boolean
}

/** One tab of the revived WezTerm window: an oc session, or a plain shell in its working directory. */
// `paneID` is the old-window pane the tab moves out of. Shell tabs are no longer produced; they stay
// decodable for contexts written by an older build.
export type Tab = { kind: "oc"; directory: string; sessionID?: string; paneID?: string } | { kind: "shell"; cwd: string }

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
}

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
    (value.mode !== "install" && value.mode !== "no-install" && value.mode !== "update" && value.mode !== "single") ||
    (value.mode === "update") !== (typeof value.release === "string" && RELEASE.test(value.release)) ||
    !TERMINALS.includes(value.terminal as string) ||
    !text(value.directory) ||
    !optional(value.sessionID, text) ||
    !optional(value.paneID, text) ||
    !optional(value.supervisorPid, pid) ||
    !optional(value.shellPid, pid) ||
    !optional(value.native, flag) ||
    !optional(value.hosted, flag) ||
    !optional(value.tuiPid, pid) ||
    !optional(value.shellIdentity, processIdentity) ||
    (value.shellIdentity !== undefined && (value.shellIdentity as TuiLedger.Process).pid !== value.shellPid) ||
    !optional(value.source, (item) => item === "existing" || item === "download" || item === "none") ||
    (value.source === "existing" || value.source === "download") !==
      (text(value.sourceDir) && path.isAbsolute(value.sourceDir as string))
  ) {
    throw new Error("Invalid revive context")
  }
  return value as ReviveContext
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
  const owned = [
    restart.paneID,
    ...(restart.tabs ?? []).map((tab) => (tab.kind === "oc" ? tab.paneID : undefined)),
  ]
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

/** Commands run in the source's workspace and the outputs they produce, from packages/opencode/script/build.ts --single. */
export function buildSteps(build: BuildConfig, variant?: "native") {
  const platform = process.platform === "win32" ? "windows" : process.platform
  const cwd = path.join(build.source, WORKSPACE)
  const dist = path.join(cwd, "packages", "opencode", "dist")
  const native = path.join(
    dist,
    `opencode-native-${platform}-${process.arch}`,
    "bin",
    process.platform === "win32" ? "opencode.exe" : "opencode",
  )
  if (variant === "native")
    return {
      cwd,
      commands: [
        ["bun", "install"],
        ["bun", "run", BUILD_SCRIPT, "--single", "--native-only"],
      ],
      output: [native],
    }
  return {
    cwd,
    commands: [
      ["bun", "install"],
      ["bun", "run", BUILD_SCRIPT, "--single"],
    ],
    // The native build ships only its executable; it shares the oc build's support files.
    output: [
      path.join(dist, `opencode-${platform}-${process.arch}`, "bin"),
      native,
    ],
  }
}

/**
 * Downloads and unpacks oc release `version` for this platform; returns the same output shape as
 * buildSteps (oc folder, native executable). Runs before shutdown,
 * so a missing asset or failed download leaves the running oc untouched.
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
      const folder = path.join(stage, variant)
      const archive = path.join(stage, asset.name)
      const response = await fetch(asset.url, { signal: AbortSignal.timeout(300_000) })
      if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${asset.name}`)
      await fsp.mkdir(folder, { recursive: true })
      await Bun.write(archive, response)
      // Windows 10+ ships bsdtar, which reads zip archives.
      const unpack = Bun.spawnSync(["tar", "-xf", archive, "-C", folder], { stdout: "pipe", stderr: "pipe" })
      if (unpack.exitCode !== 0) throw new Error(`Unpacking ${asset.name} failed: ${unpack.stderr.toString().trim()}`)
      return folder
    }),
  )
  // The native build ships only its executable; it shares the oc build's support files.
  return [folders[0], path.join(folders[1], process.platform === "win32" ? "opencode.exe" : "opencode")]
}

export function isShell(name: string) {
  return SHELLS.has(name.toLowerCase())
}

export function resolveLauncher(executable: string, exists: (file: string) => boolean = fs.existsSync) {
  const mod = executable.includes("\\") ? path.win32 : path.posix
  if (/^bun(?:\.exe)?$/i.test(mod.basename(executable))) return executable
  const names = ["occ.exe", "oc.exe"]
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
export function reopenCommand(restart: RestartContext) {
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
  return consoleStart(command, flavor)
}

// Expand paths once through env vars, so percent signs and shell metacharacters stay literal.
function consoleStart(command: string[], flavor: Record<string, string>) {
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
      if (!(await fsp.lstat(target).then(() => true, () => false))) continue
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
  if (item.kind === "oc") return text(item.directory) && optional(item.sessionID, text) && optional(item.paneID, text)
  return item.kind === "shell" && text(item.cwd)
}

function optional(value: unknown, check: (value: unknown) => boolean) {
  return value === undefined || check(value)
}
