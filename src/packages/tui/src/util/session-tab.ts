import { spawn } from "node:child_process"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { detectTerminal, type TerminalInfo } from "@opencode-ai/core/util/terminal"
import { weztermExecutable } from "../routes/session/sidebar-tools/script-runner"

// The single-instance TUI talks to its worker over RPC under this URL; no other process can attach.
const INTERNAL_URL = "http://opencode.internal"

export type Target = { url: string; directory: string; sessionID: string }
type Env = Record<string, string | undefined>

/** Why a session cannot open in a new tab here, or undefined when it can. */
export function unavailable(url: string, kind: TerminalInfo["kind"]): string | undefined {
  if (url === INTERNAL_URL) return "Subagent tabs need the resident oc server; this window has none to attach to"
  if (kind === "generic") return "Subagent tabs need WezTerm or Windows Terminal"
}

/** Executable (plus the script under bun dev runs) that starts this oc build. */
export function launcher(execPath = process.execPath, entry = process.argv[1]): string[] {
  const bun = /^bun(?:\.exe)?$/i.test(path.basename(execPath))
  return [Global.resolveExecutablePath(execPath), ...(bun && entry ? [entry] : [])]
}

/** `attach` arguments for a second TUI on the same server. The new tab does not inherit this env. */
export function attachArgs(target: Target, env: Env = process.env): string[] {
  return [
    "attach", target.url, "--dir", target.directory, "--session", target.sessionID,
    ...(env.OPENCODE_SERVER_PASSWORD ? ["--password", env.OPENCODE_SERVER_PASSWORD] : []),
    ...(env.OPENCODE_SERVER_USERNAME ? ["--username", env.OPENCODE_SERVER_USERNAME] : []),
  ]
}

export function spawnCommand(kind: TerminalInfo["kind"], cwd: string, command: string[]) {
  if (kind === "wezterm") return { file: weztermExecutable(), args: ["cli", "spawn", "--cwd", cwd, "--", ...command] }
  if (kind === "windows-terminal") {
    // wt treats a bare `;` as a command separator.
    return { file: "wt.exe", args: ["-w", "0", "new-tab", "-d", cwd, ...command.map((arg) => arg.replaceAll(";", "\\;"))] }
  }
}

/** Opens the session in a new tab of the current terminal. Resolves to an error message on failure. */
export function openSessionTab(target: Target, kind = detectTerminal().kind): Promise<string | undefined> {
  const reason = unavailable(target.url, kind)
  if (reason) return Promise.resolve(reason)
  const command = spawnCommand(kind, target.directory, [...launcher(), ...attachArgs(target)])!
  return new Promise((resolve) => {
    const child = spawn(command.file, command.args, { cwd: target.directory, stdio: "ignore", windowsHide: true })
    child.once("error", (error) => resolve(error.message))
    child.once("close", (code) =>
      resolve(code === 0 ? undefined : `${command.file} exited with code ${code ?? "unknown"}`),
    )
  })
}
