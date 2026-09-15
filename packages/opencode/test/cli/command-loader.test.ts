import { describe, expect, test } from "bun:test"
import { resolveCommandToLoad, withOcLaunchDefault } from "../../src/cli/command-loader"

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

  test("debug ocdebug default is oc launch, not TUI", () => {
    expect(withOcLaunchDefault([], true)).toEqual(["oc", "launch"])
    expect(withOcLaunchDefault(["C:\\proj"], true)).toEqual(["oc", "launch", "C:\\proj"])
    expect(withOcLaunchDefault(["serve", "--port", "4097"], true)).toEqual(["serve", "--port", "4097"])
    expect(withOcLaunchDefault(["--version"], true)).toEqual(["--version"])
    expect(withOcLaunchDefault([], false)).toEqual([])
  })
})
