export * as Revive from "./revive"

import fs from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import type { TerminalInfo } from "@opencode-ai/core/util/terminal"

export type ReviveContext = {
  terminal: TerminalInfo["kind"]
  directory: string
  sessionID?: string
  reopen?: boolean
}

export function decodeContext(encoded: string): ReviveContext {
  const input: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  if (typeof input !== "object" || input === null ||
    !("terminal" in input) ||
    (input.terminal !== "wezterm" && input.terminal !== "windows-terminal" && input.terminal !== "generic") ||
    !("directory" in input) || typeof input.directory !== "string" || !input.directory || input.directory.includes("\0") ||
    ("sessionID" in input && (typeof input.sessionID !== "string" || !input.sessionID)) ||
    ("reopen" in input && typeof input.reopen !== "boolean")) {
    throw new Error("Invalid revive context")
  }
  return {
    terminal: input.terminal,
    directory: input.directory,
    ...("sessionID" in input ? { sessionID: input.sessionID as string } : {}),
    ...("reopen" in input ? { reopen: input.reopen as boolean } : {}),
  }
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

export function reopenCommand(executable: string, context: ReviveContext, entrypoint?: string) {
  const command = [executable, ...(entrypoint ? [entrypoint] : []), "oc", "--revive",
    Buffer.from(JSON.stringify({ ...context, reopen: true })).toString("base64url")]
  if (context.terminal === "wezterm") {
    // A fresh GUI inherits this instance's environment instead of an unrelated mux server's.
    return { file: "wezterm", args: ["start", "--always-new-process", "--", ...command],
      env: {}, windowsVerbatimArguments: false }
  }
  if (context.terminal === "windows-terminal") {
    return { file: "wt.exe", args: ["-w", "new", "new-tab", ...command.map((arg) => arg.replaceAll(";", "\\;"))],
      env: {}, windowsVerbatimArguments: false }
  }
  // Expand paths once through env vars, so percent signs and shell metacharacters stay literal.
  const env = Object.fromEntries(command.map((arg, index) => [`OC_REVIVE_ARG_${index}`, arg]))
  return { file: "cmd.exe", args: ["/d", "/v:off", "/c",
    `start "" ${command.map((_, index) => `"%OC_REVIVE_ARG_${index}%"`).join(" ")}`],
    env, windowsVerbatimArguments: true }
}

export function attachArguments(url: string, context: ReviveContext) {
  return ["attach", url, "--dir", context.directory,
    ...(context.sessionID ? ["--session", context.sessionID] : [])]
}
