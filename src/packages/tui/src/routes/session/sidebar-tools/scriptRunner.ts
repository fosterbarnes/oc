import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { open } from "node:fs/promises"
import path from "node:path"
import { detectTerminal, terminalAppScript, type TerminalInfo } from "@opencode-ai/core/util/terminal"
import { resolveScriptTerminal } from "./settings.js"
import type { ScriptLauncher, ScriptTerminal, WezTermSplitSize } from "./settings.js"
import type { Script } from "./scripts.js"
import { write } from "../../../clipboard"

export type RunResult = { target: string; error?: string }

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

export type PaneSyntax = "pwsh" | "posix"

// Text typed into a pane is read by the pane's own shell (paneSyntax). `ownPane` marks a pane the
// sidebar made for this script: `closeOut` in a repo's .scripts/scriptHelper.ps1 (or posix/scriptHelper.sh)
// kills the pane on success. The Windows Terminal path starts pwsh explicitly.
const SYNTAX = {
  pwsh: { ownPane: "$env:SCRIPT_OWN_PANE='1'; ", quote: quoteCommandArg },
  posix: { ownPane: "export SCRIPT_OWN_PANE=1; ", quote: (value: string) => `'${value.replaceAll("'", "'\\''")}'` },
}

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

export function copyToClipboard(text: string): Promise<RunResult> {
  return write(text).then(
    () => ({ target: "Clipboard" }),
    (error) => ({
      target: "Clipboard",
      error: error instanceof Error ? error.message : "Could not access the clipboard.",
    }),
  )
}

export function scriptCommand(script: Script, syntax: PaneSyntax = "pwsh"): string {
  if (!script.filePath) return script.command
  return [script.launcher.executable, ...launchArgs(script.launcher, script.filePath).map(SYNTAX[syntax].quote)].join(
    " ",
  )
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
    ...shellArgs(`${SYNTAX.pwsh.ownPane}${scriptCommand(script)}`),
  ]
}

// WezTerm sets WEZTERM_EXECUTABLE to its GUI binary, which has no `cli` (exit 2 on macOS too);
// the CLI is `wezterm` in the same folder.
export function weztermExecutable(configured = process.env.WEZTERM_EXECUTABLE): string {
  if (configured && /^wezterm-gui(\.exe)?$/i.test(path.basename(configured))) {
    return path.join(path.dirname(configured), path.basename(configured).replace(/-gui/i, ""))
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

export function weztermSendArgs(
  script: Script,
  paneID: string,
  submit: boolean,
  syntax: PaneSyntax = "pwsh",
): string[] {
  return [
    "cli",
    "send-text",
    "--pane-id",
    paneID,
    "--no-paste",
    `${SYNTAX[syntax].ownPane}${scriptCommand(script, syntax)}${submit ? "\r" : ""}`,
  ]
}

// A new pane runs WezTerm's default program, which oc does not choose (pwsh or zsh on the Mac).
// macOS/Linux: that program is the session leader on the pane's tty. Its line editor (PSReadLine,
// zle, readline) turns canonical mode off while it waits at a prompt; an Enter typed before then is
// lost (pwsh with a profile takes ~250 ms), so this waits for that, up to 5 s. Windows has no tty to
// read and its panes run pwsh, so it keeps PowerShell syntax, as do panes that cannot be inspected.
async function preparePane(paneID: string): Promise<PaneSyntax> {
  if (process.platform === "win32") return "pwsh"
  const panes: unknown = JSON.parse((await output(weztermCommand(), ["cli", "list", "--format", "json"])) || "[]")
  const tty = Array.isArray(panes) ? panes.find((pane) => String(pane?.pane_id) === paneID)?.tty_name : undefined
  if (typeof tty !== "string") return "pwsh"
  // pwsh turns canonical mode off for ~25 ms during startup and back on before its prompt, so the
  // non-canonical state must hold for 4 polls (~100 ms).
  for (let attempt = 0, held = 0; attempt < 200 && held < 4; attempt++) {
    held = (await output("stty", ["-a"], tty))?.includes("-icanon") ? held + 1 : 0
    if (held < 4) await new Promise((resolve) => setTimeout(resolve, 25))
  }
  const leader = (await output("ps", ["-o", "stat=,comm=", "-t", tty]))
    ?.split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find((fields) => fields[0]?.includes("s"))
  const shell = path.basename(leader?.slice(1).join(" ") ?? "").replace(/^-/, "")
  return !shell || shell === "pwsh" || shell === "powershell" ? "pwsh" : "posix"
}

// stdout of a command, or undefined when it fails. `stdin` is a tty path for `stty`.
async function output(command: string, args: string[], stdin?: string): Promise<string | undefined> {
  const input = stdin ? await open(stdin, "r").catch(() => undefined) : undefined
  if (stdin && !input) return undefined
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: [input?.fd ?? "ignore", "pipe", "ignore"], windowsHide: true })
    const finish = (value: string | undefined) => {
      void input?.close()
      resolve(value)
    }
    let text = ""
    child.stdout?.on("data", (chunk) => {
      text += chunk.toString()
    })
    child.once("error", () => finish(undefined))
    child.once("close", (code) => finish(code === 0 ? text : undefined))
  })
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
  const syntax = await preparePane(pane.paneID)
  const sent = await runCommand(weztermCommand(), weztermSendArgs(script, pane.paneID, submit, syntax), cwd)
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
  // macOS: a native launch gets its own Terminal.app window, like Windows' new console.
  if (process.platform === "darwin")
    return (options.spawnCommand ?? spawnCommand)(
      "osascript",
      terminalAppScript([script.launcher.executable, ...args], { cwd }),
      cwd,
    )
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
