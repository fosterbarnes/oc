import { describe, expect, test } from "bun:test"
import { resolveCommandToLoad } from "../../src/cli/command-loader"

describe("CLI command loading", () => {
  test("loads TUI for the default path", () => {
    expect(resolveCommandToLoad([])).toBe("tui")
    expect(resolveCommandToLoad(["--model", "providers"])).toBe("tui")
    expect(resolveCommandToLoad(["--log-level", "DEBUG", "--continue"])).toBe("tui")
  })

  test("loads the selected top-level command", () => {
    expect(resolveCommandToLoad(["providers", "list"])).toBe("providers")
    expect(resolveCommandToLoad(["--pure", "session", "list"])).toBe("session")
  })

  test("resolves command aliases", () => {
    expect(resolveCommandToLoad(["auth", "list"])).toBe("providers")
    expect(resolveCommandToLoad(["plug", "module"])).toBe("plugin")
  })
})
