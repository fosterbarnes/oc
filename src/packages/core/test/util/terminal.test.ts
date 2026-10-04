import { describe, expect, test } from "bun:test"
import { detectTerminal } from "@opencode-ai/core/util/terminal"

describe("util.terminal", () => {
  test("detects WezTerm from TERM_PROGRAM without a pane", () => {
    expect(detectTerminal({ TERM_PROGRAM: "WezTerm" })).toEqual({ kind: "wezterm" })
  })

  test("detects WezTerm from its pane and preserves the pane id", () => {
    expect(detectTerminal({ WEZTERM_PANE: "0" })).toEqual({ kind: "wezterm", paneID: "0" })
  })

  test("prefers WezTerm over an inherited Windows Terminal session", () => {
    expect(detectTerminal({ TERM_PROGRAM: "WezTerm", WT_SESSION: "session" })).toEqual({ kind: "wezterm" })
    expect(detectTerminal({ WEZTERM_PANE: "42", WT_SESSION: "session" })).toEqual({
      kind: "wezterm",
      paneID: "42",
    })
  })

  test("detects Windows Terminal", () => {
    expect(detectTerminal({ WT_SESSION: "session" })).toEqual({ kind: "windows-terminal" })
  })

  test("uses generic for missing, empty, or unrelated markers", () => {
    expect(detectTerminal({})).toEqual({ kind: "generic" })
    expect(detectTerminal({ TERM_PROGRAM: "", WEZTERM_PANE: "", WT_SESSION: "" })).toEqual({ kind: "generic" })
    expect(detectTerminal({ TERM_PROGRAM: "other", TERM: "xterm-256color" })).toEqual({ kind: "generic" })
  })
})
