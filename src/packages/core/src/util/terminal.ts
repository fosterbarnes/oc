export type TerminalInfo = {
  kind: "wezterm" | "windows-terminal" | "terminal-app" | "generic"
  paneID?: string
}

export function detectTerminal(env: Record<string, string | undefined> = process.env): TerminalInfo {
  if (env.TERM_PROGRAM === "WezTerm" || env.WEZTERM_PANE) {
    return { kind: "wezterm", ...(env.WEZTERM_PANE ? { paneID: env.WEZTERM_PANE } : {}) }
  }
  if (env.WT_SESSION) return { kind: "windows-terminal" }
  if (env.TERM_PROGRAM === "Apple_Terminal") return { kind: "terminal-app" }
  return { kind: "generic" }
}

/** POSIX shell single-quoting. */
export function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/**
 * AppleScript that opens a new Terminal.app window running `command`. Each argument is single-quoted
 * for the window's login shell, then the whole line is escaped as an AppleScript string literal. The line
 * is typed into that shell, so it can land in shell history: never put secrets in it.
 */
export function terminalAppScript(command: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  const quote = shellQuote
  const line = [
    ...(options.cwd ? [`cd ${quote(options.cwd)} &&`] : []),
    "exec",
    ...(options.env && Object.keys(options.env).length
      ? ["env", ...Object.entries(options.env).map(([key, value]) => quote(`${key}=${value}`))]
      : []),
    ...command.map(quote),
  ].join(" ")
  const literal = `"${line.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
  return ["-e", `tell application "Terminal" to do script ${literal}`, "-e", 'tell application "Terminal" to activate']
}

export * as Terminal from "./terminal"
