export * as Revive from "./revive"

import fs from "node:fs"
import fsp from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import type { TerminalInfo } from "@opencode-ai/core/util/terminal"

type Terminal = TerminalInfo["kind"]
const TERMINALS: readonly string[] = ["wezterm", "windows-terminal", "generic"]
const LAUNCHERS = ["oc", "occ"] as const
const SHELLS = new Set(["pwsh.exe", "powershell.exe", "cmd.exe", "bash.exe", "sh.exe", "zsh.exe", "fish.exe", "nu.exe"])
const LEFTOVER = /\.old-\d+$/
// Cloned by the first /revive when the user chooses to build from source.
export const SOURCE_REPO = "https://github.com/fosterbarnes/oc"

export type Launcher = (typeof LAUNCHERS)[number]

/** Written by the TUI (handoff file or detached helper argument), read by the revive pipeline. */
export type ReviveContext = {
  mode: "install" | "no-install"
  terminal: Terminal
  directory: string
  sessionID?: string
  paneID?: string
  // Set by the `oc`/`occ` launcher that hosted the TUI. It shows the pipeline output, and worker 2 waits for it to exit.
  supervisorPid?: number
  // The launcher's parent. Worker 2 kills it to close Windows Terminal tabs and plain consoles.
  shellPid?: number
  // Unhosted single TUI: the helper waits for its graceful shutdown before building.
  tuiPid?: number
  // First /revive answer when oc.json has no `revive.build`: build from an existing source folder,
  // download the source into `sourceDir`, or never build.
  source?: "existing" | "download" | "none"
  sourceDir?: string
  // Revived from a single-instance window: reopen single and leave the resident server alone.
  single?: boolean
  // Single window on ocPortable.db (`--portable`); reopen keeps it.
  portable?: boolean
}

/** Handed from the revive pipeline to the detached terminal restarter (worker 2). */
export type RestartContext = {
  terminal: Terminal
  launcher: Launcher
  executable: string
  entrypoint?: string
  paneID?: string
  shellPid?: number
  waitPid?: number
  // Set after an install; worker 2 removes `.old-*` leftovers there once the old processes exit.
  installDir?: string
  single?: boolean
  portable?: boolean
  directory?: string
  sessionID?: string
}

// `source` is the user's oc source folder (chosen or downloaded on the first /revive); revive never pulls it.
export type BuildConfig = { source: string; debug: boolean }
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

export function encode(value: ReviveContext | RestartContext) {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

export function decodeContext(encoded: string) {
  return parseContext(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
}

export function parseContext(input: unknown): ReviveContext {
  const value = record(input)
  if ((value.mode !== "install" && value.mode !== "no-install") || !TERMINALS.includes(value.terminal as string) ||
    !text(value.directory) || !optional(value.sessionID, text) || !optional(value.paneID, text) ||
    !optional(value.supervisorPid, pid) || !optional(value.shellPid, pid) || !optional(value.single, flag) ||
    !optional(value.portable, flag) || !optional(value.tuiPid, pid) ||
    !optional(value.source, (item) => item === "existing" || item === "download" || item === "none") ||
    ((value.source === "existing" || value.source === "download") !==
      (text(value.sourceDir) && path.isAbsolute(value.sourceDir as string)))) {
    throw new Error("Invalid revive context")
  }
  return value as ReviveContext
}

export function decodeRestart(encoded: string): RestartContext {
  const value = record(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")))
  if (!TERMINALS.includes(value.terminal as string) || !LAUNCHERS.includes(value.launcher as Launcher) ||
    !text(value.executable) || !optional(value.entrypoint, text) || !optional(value.paneID, text) ||
    !optional(value.shellPid, pid) || !optional(value.waitPid, pid) || !optional(value.installDir, text) ||
    !optional(value.single, flag) || !optional(value.portable, flag) ||
    !optional(value.directory, text) || !optional(value.sessionID, text) ||
    (value.single === true && !text(value.directory))) {
    throw new Error("Invalid revive restart context")
  }
  return value as RestartContext
}

export function parseLauncher(input: unknown): Launcher {
  if (input === undefined) return "occ"
  if (LAUNCHERS.includes(input as Launcher)) return input as Launcher
  throw new Error(`revive.launcher must be "oc" or "occ": ${JSON.stringify(input)}`)
}

/**
 * Validates `revive.build` from oc.json: the oc source folder and whether to also build `ocdebug`.
 * `false` (or unset) means /revive restarts without building.
 */
export function parseBuild(input: unknown): BuildConfig | undefined {
  if (input === undefined || input === false) return undefined
  const value = typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : {}
  if (!text(value.source) || !path.isAbsolute(value.source as string))
    throw new Error("revive.build.source must be the absolute path of an oc source folder")
  if (!optional(value.debug, (item) => typeof item === "boolean")) throw new Error("revive.build.debug must be true or false")
  return { source: value.source as string, debug: value.debug === true }
}

/** Commands run in the source's workspace and the outputs they produce, from packages/opencode/script/build.ts --single. */
export function buildSteps(build: BuildConfig) {
  const platform = process.platform === "win32" ? "windows" : process.platform
  const cwd = path.join(build.source, WORKSPACE)
  const dist = path.join(cwd, "packages", "opencode", "dist")
  return {
    cwd,
    commands: [["bun", "install"],
      ["bun", "run", BUILD_SCRIPT, "--single", ...(build.debug ? ["--with-debug"] : [])]],
    output: [path.join(dist, `opencode-${platform}-${process.arch}`, "bin"),
      ...(build.debug ? [path.join(dist, `opencode-debug-${platform}-${process.arch}`, "bin",
        process.platform === "win32" ? "ocdebug.exe" : "ocdebug")] : [])],
  }
}

export function isShell(name: string) {
  return SHELLS.has(name.toLowerCase())
}

export function resolveLauncher(executable: string, debug: boolean, exists: (file: string) => boolean = fs.existsSync) {
  const mod = executable.includes("\\") ? path.win32 : path.posix
  if (/^bun(?:\.exe)?$/i.test(mod.basename(executable))) return executable
  if (debug && Global.isDebugExecutable(executable)) return executable
  const names = debug ? ["ocdebug.exe", "oc-debug.exe", "opencode-debug.exe"] : ["occ.exe", "oc.exe"]
  const sibling = names.map((name) => mod.join(mod.dirname(executable), name)).find(exists)
  if (sibling) return sibling
  if (debug) throw new Error("No debug oc launcher exists beside this executable")
  return executable
}

/** Opens a fresh terminal running the configured launcher, so the next revive is hosted in place again. */
export function reopenCommand(restart: RestartContext) {
  const command = [restart.executable, ...(restart.entrypoint ? [restart.entrypoint] : []), "oc",
    ...(restart.single
      ? ["single", restart.directory!, ...(restart.sessionID ? ["--session", restart.sessionID] : ["--home"])]
      : restart.launcher === "occ" ? ["previous", "--depth", "1"] : ["launch"]),
    ...(restart.portable ? ["--portable"] : [])]
  if (restart.terminal === "wezterm") {
    // A fresh GUI process reloads wezterm.lua and inherits this environment instead of an unrelated mux server's.
    // wezterm-gui, not the console-subsystem wezterm CLI: that one would show its own console window
    // for as long as the new GUI runs.
    return { file: "wezterm-gui", args: ["start", "--always-new-process", "--", ...command],
      env: {}, windowsVerbatimArguments: false }
  }
  if (restart.terminal === "windows-terminal") {
    return { file: "wt.exe", args: ["-w", "new", "new-tab", ...command.map((arg) => arg.replaceAll(";", "\\;"))],
      env: {}, windowsVerbatimArguments: false }
  }
  // Expand paths once through env vars, so percent signs and shell metacharacters stay literal.
  const env = Object.fromEntries(command.map((arg, index) => [`OC_REVIVE_ARG_${index}`, arg]))
  return { file: "cmd.exe", args: ["/d", "/v:off", "/c",
    `start "" ${command.map((_, index) => `"%OC_REVIVE_ARG_${index}%"`).join(" ")}`],
    env, windowsVerbatimArguments: true }
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
 * executable, not overwriting it). Hard-link aliases of replaced files (oc.exe, occ.exe -> opencode.exe)
 * are relinked to the new file. Any failure removes what was placed and restores the old names.
 */
export async function install(sources: readonly InstallSource[], directory: string, stamp = Date.now()) {
  const aliases = await aliasNames(directory, sources.map((source) => source.name))
  const moved: Array<{ from: string; to: string }> = []
  const placed: string[] = []
  const aside = async (target: string) => {
    if (!(await fsp.lstat(target).then(() => true, () => false))) return
    const to = `${target}.old-${stamp}`
    await retry(() => fsp.rename(target, to))
    moved.push({ from: target, to })
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
    // Restore every name even when one step fails, then report what could not be restored.
    const failed: string[] = []
    for (const target of placed.toReversed())
      await retry(() => fsp.rm(target, { recursive: true, force: true })).catch(() => failed.push(target))
    for (const item of moved.toReversed())
      await retry(() => fsp.rename(item.to, item.from)).catch(() => failed.push(item.to))
    if (failed.length) throw new Error(`Install failed and rollback is incomplete; fix by hand: ${failed.join(", ")}`,
      { cause: error })
    throw error
  }
}

/** Best-effort removal of `.old-*` files left by installs; returns names still in use. */
export async function removeLeftovers(directory: string) {
  const names = (await fsp.readdir(directory)).filter((name) => LEFTOVER.test(name))
  const results = await Promise.allSettled(names.map((name) => fsp.rm(path.join(directory, name), { recursive: true, force: true })))
  return names.filter((_, index) => results[index].status === "rejected")
}

// Other names in `directory` that share a file identity with a file being replaced.
async function aliasNames(directory: string, targets: readonly string[]) {
  const lower = new Set(targets.map((name) => name.toLowerCase()))
  const files = await Promise.all((await fsp.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !LEFTOVER.test(entry.name))
    .map(async (entry) => ({ name: entry.name, stat: await fsp.stat(path.join(directory, entry.name), { bigint: true }) })))
  return files.flatMap((file) => {
    if (lower.has(file.name.toLowerCase())) return []
    const target = files.find((other) => lower.has(other.name.toLowerCase()) &&
      other.stat.ino === file.stat.ino && other.stat.dev === file.stat.dev)
    return target ? [{ name: file.name, target: target.name }] : []
  })
}

// Defender and indexers briefly hold freshly written executables.
async function retry<T>(action: () => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    const result = await action().then((value) => ({ value }), (error: NodeJS.ErrnoException) => ({ error }))
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

function optional(value: unknown, check: (value: unknown) => boolean) {
  return value === undefined || check(value)
}
