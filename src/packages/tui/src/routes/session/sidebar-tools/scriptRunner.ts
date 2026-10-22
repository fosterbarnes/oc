import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { detectTerminal, type TerminalInfo } from "@opencode-ai/core/util/terminal"
import { resolveScriptTerminal } from "./settings.js"
import type { ScriptLauncher, ScriptTerminal, WezTermSplitSize } from "./settings.js"
import type { Script } from "./scripts.js"

export type RunResult = { target: string; error?: string }
export type ClipboardSpawn = (
  command: string,
  args: string[],
) => {
  stdin: { end(data: string): void }
  once(event: "error" | "close", listener: (value?: Error | number | null) => void): void
}

function available(command: string): Promise<boolean> {
  if (path.isAbsolute(command)) return Promise.resolve(existsSync(command))
  return new Promise((resolve) => {
    const probe = spawn(process.platform === "win32" ? "where.exe" : "which", [command], {
      stdio: "ignore",
      windowsHide: true,
    })
    probe.once("error", () => resolve(false))
    probe.once("close", (code) => resolve(code === 0))
  })
}

function spawnCommand(command: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    let settled = false
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    })
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      resolve({ target: command, ...(error ? { error: error.message } : {}) })
    }
    child.once("error", (error) => finish(error))
    child.once("spawn", () => {
      child.unref()
      finish()
    })
  })
}

function runCommand(command: string, args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: "ignore", windowsHide: true })
    child.once("error", (error) => resolve({ target: command, error: error.message }))
    child.once("close", (code) =>
      resolve(code === 0 ? { target: command } : { target: command, error: `Exited with code ${code ?? "unknown"}.` }),
    )
  })
}

// Marks a pane the sidebar made for this script: `closeOut` in a repo's .scripts\scriptHelper.ps1
// kills the pane on success (base and oc). PowerShell syntax: the WezTerm pane runs the default
// shell (pwsh) and the Windows Terminal path starts pwsh explicitly.
const OWN_PANE = "$env:SCRIPT_OWN_PANE='1'; "

function shellArgs(command: string): string[] {
  const encoded = Buffer.from(command, "utf16le").toString("base64")
  return ["-NoLogo", "-NoExit", "-EncodedCommand", encoded]
}

function launchArgs(launcher: ScriptLauncher, target: string): string[] {
  return [...launcher.args, target]
}

function quoteCommandArg(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

export function scriptClipboardText(script: Script): string {
  if (!script.filePath) return script.command
  const executable = path
    .basename(script.launcher.executable)
    .toLowerCase()
    .replace(/\.exe$/, "")
  return executable === "pwsh" || executable === "powershell"
    ? `& ${quoteCommandArg(script.filePath)}`
    : scriptCommand(script)
}

export function fileClipboardText(filePath: string): string {
  return quoteCommandArg(filePath)
}

export function copyToClipboard(
  text: string,
  spawnImpl: ClipboardSpawn = (command, args) => spawn(command, args, { windowsHide: true }),
): Promise<RunResult> {
  if (process.platform !== "win32")
    return Promise.resolve({ target: "Clipboard", error: "Clipboard copying requires Windows." })
  return new Promise((resolve) => {
    const child = spawnImpl("clip.exe", [])
    child.once("error", (error) =>
      resolve({
        target: "Clipboard",
        error: error instanceof Error ? error.message : "Could not access the clipboard.",
      }),
    )
    child.once("close", (code) =>
      resolve(
        code === 0
          ? { target: "Clipboard" }
          : { target: "Clipboard", error: `Clipboard exited with code ${code ?? "unknown"}.` },
      ),
    )
    child.stdin.end(text)
  })
}

export function scriptCommand(script: Script): string {
  if (!script.filePath) return script.command
  return [script.launcher.executable, ...launchArgs(script.launcher, script.filePath).map(quoteCommandArg)].join(" ")
}

export function weztermArgs(
  terminal: Exclude<ScriptTerminal, "native">,
  cwd: string,
  size?: WezTermSplitSize,
): string[] {
  if (terminal === "wezterm-window") return ["cli", "spawn", "--new-window", "--cwd", cwd]
  if (terminal === "wezterm-horizontal") return ["cli", "split-pane", "--horizontal", ...sizeArgs(size), "--cwd", cwd]
  if (terminal === "wezterm-vertical") return ["cli", "split-pane", "--bottom", ...sizeArgs(size), "--cwd", cwd]
  return ["cli", "spawn", "--cwd", cwd]
}

function sizeArgs(size: WezTermSplitSize | undefined): string[] {
  if (!size) return []
  return "Percent" in size ? ["--percent", String(size.Percent)] : ["--cells", String(size.Cells)]
}

export function windowsTerminalArgs(
  terminal: Exclude<ScriptTerminal, "native">,
  cwd: string,
  size?: WezTermSplitSize,
): string[] {
  if (terminal === "wezterm-window") return ["-w", "new", "new-tab", "-d", cwd]
  if (terminal === "wezterm-tab") return ["-w", "0", "new-tab", "-d", cwd]
  return [
    "-w",
    "0",
    "split-pane",
    terminal === "wezterm-horizontal" ? "-V" : "-H",
    ...(size && "Percent" in size ? ["--size", String(size.Percent / 100)] : []),
    "-d",
    cwd,
  ]
}

export function windowsTerminalScriptArgs(script: Script, cwd: string): string[] {
  if (script.terminal === "native") return []
  return [
    ...windowsTerminalArgs(script.terminal, script.filePath ? path.dirname(script.filePath) : cwd, script.weztermSize),
    "pwsh",
    ...shellArgs(`${OWN_PANE}${scriptCommand(script)}`),
  ]
}

export function weztermExecutable(configured = process.env.WEZTERM_EXECUTABLE): string {
  if (process.platform === "win32" && configured && path.basename(configured).toLowerCase() === "wezterm-gui.exe") {
    return path.join(path.dirname(configured), "wezterm.exe")
  }
  return configured || "wezterm"
}

function weztermCommand(): string {
  return weztermExecutable()
}

function spawnWezterm(commandArgs: string[], cwd: string): Promise<{ paneID?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(weztermCommand(), commandArgs, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.once("error", (error) => resolve({ error: error.message }))
    child.once("close", (code) =>
      resolve(
        code === 0 && output.trim()
          ? { paneID: output.trim() }
          : { error: `WezTerm exited with code ${code ?? "unknown"}.` },
      ),
    )
  })
}

export function weztermSendArgs(script: Script, paneID: string, submit: boolean): string[] {
  return [
    "cli",
    "send-text",
    "--pane-id",
    paneID,
    "--no-paste",
    `${OWN_PANE}${scriptCommand(script)}${submit ? "\r" : ""}`,
  ]
}

async function runWezterm(
  script: Script,
  cwd: string,
  terminal: Exclude<ScriptTerminal, "native">,
  submit: boolean,
): Promise<RunResult> {
  if (!(await available(weztermCommand()))) return { target: "WezTerm", error: "Executable not found: wezterm" }
  const pane = await spawnWezterm(weztermArgs(terminal, cwd, script.weztermSize), cwd)
  if (!pane.paneID) return { target: "WezTerm", error: pane.error || "Could not create a WezTerm pane." }
  const sent = await runCommand(weztermCommand(), weztermSendArgs(script, pane.paneID, submit), cwd)
  return sent.error ? { target: "WezTerm", error: sent.error } : { target: "WezTerm" }
}

type RunnerOptions = {
  kind?: TerminalInfo["kind"]
  available?: typeof available
  spawnCommand?: typeof spawnCommand
  runCommand?: typeof runCommand
}

export async function runScript(script: Script, cwd: string, options: RunnerOptions = {}): Promise<RunResult> {
  const kind = options.kind ?? detectTerminal().kind
  const probe = options.available ?? available
  const terminal = resolveScriptTerminal(script.terminal, kind)
  if (terminal !== "native") {
    if (kind === "wezterm") return runWezterm(script, cwd, terminal, true)
    if (await probe("wt.exe"))
      return (options.runCommand ?? runCommand)("wt.exe", windowsTerminalScriptArgs(script, cwd), cwd)
  }
  const target = script.filePath || script.command
  if (!(await probe(script.launcher.executable))) {
    return { target: script.launcher.executable, error: `Executable not found: ${script.launcher.executable}` }
  }
  const args = launchArgs(script.launcher, target)
  const command = process.platform === "win32" ? "cmd.exe" : script.launcher.executable
  const commandArgs =
    process.platform === "win32" ? ["/d", "/c", "start", "", script.launcher.executable, ...args] : args
  return (options.spawnCommand ?? spawnCommand)(command, commandArgs, cwd)
}

export async function placeScript(script: Script, cwd: string, options: RunnerOptions = {}): Promise<RunResult> {
  const kind = options.kind ?? detectTerminal().kind
  const terminal = resolveScriptTerminal(script.terminal, kind)
  if (terminal === "native" || kind === "windows-terminal")
    return runScript({ ...script, terminal: "native" }, cwd, options)
  return runWezterm(script, cwd, terminal, false)
}

export function commandArgs(command: string): string[] {
  return shellArgs(command)
}
