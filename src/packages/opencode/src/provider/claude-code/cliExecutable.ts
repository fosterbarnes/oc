import { existsSync } from "node:fs"
import path from "node:path"

export function cliCommand(cliPath: string, args: string[]) {
  const resolved = process.platform === "win32" ? (Bun.which(cliPath) ?? cliPath) : cliPath
  const native = path.join(path.dirname(resolved), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
  const cmdShim = process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd")
  // The npm shim would make oc own cmd.exe, which leaves Claude alive on cancellation.
  const command = cmdShim && existsSync(native) ? native : resolved
  const nodeScript = process.platform === "win32" && command.toLowerCase().endsWith(".cjs")
  return {
    command: nodeScript ? process.execPath : command,
    args: nodeScript ? [command, ...args] : args,
    shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(command),
  }
}
