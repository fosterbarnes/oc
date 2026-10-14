import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export function cliCommand(cliPath: string, args: string[]) {
  const resolved = process.platform === "win32" ? (Bun.which(cliPath) ?? cliPath) : cliPath
  const native = path.join(path.dirname(resolved), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
  // The stock npm shim otherwise makes oc own cmd.exe, which leaves Claude alive on cancellation.
  const command = process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd") &&
    existsSync(native) && readFileSync(resolved, "utf8").replaceAll("\r\n", "\n").trim() === [
      "@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b", ":start", "SETLOCAL",
      "CALL :find_dp0", '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*',
    ].join("\n") ? native : resolved
  const nodeScript = process.platform === "win32" && command.toLowerCase().endsWith(".cjs")
  return {
    command: nodeScript ? process.execPath : command,
    args: nodeScript ? [command, ...args] : args,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
  }
}
