export type TerminalInfo = {
  kind: "wezterm" | "windows-terminal" | "generic"
  paneID?: string
}

export function detectTerminal(env: Record<string, string | undefined> = process.env): TerminalInfo {
  if (env.TERM_PROGRAM === "WezTerm" || env.WEZTERM_PANE) {
    return { kind: "wezterm", ...(env.WEZTERM_PANE ? { paneID: env.WEZTERM_PANE } : {}) }
  }
  if (env.WT_SESSION) return { kind: "windows-terminal" }
  return { kind: "generic" }
}

export * as Terminal from "./terminal"
