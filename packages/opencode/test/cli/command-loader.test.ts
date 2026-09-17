import { describe, expect, test } from "bun:test"
import { resolveCommandToLoad, withExecutableDefault, withOcLaunchDefault } from "../../src/cli/command-loader"

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
    expect(withOcLaunchDefault(["project"], true)).toEqual(["oc", "launch", "project"])
    expect(withOcLaunchDefault(["C:\\proj"], true)).toEqual(["oc", "launch", "C:\\proj"])
    expect(withOcLaunchDefault(["serve", "--port", "4097"], true)).toEqual(["serve", "--port", "4097"])
    expect(withOcLaunchDefault(["--version"], true)).toEqual(["--version"])
    expect(withOcLaunchDefault(["--register"], true)).toEqual(["--register"])
    expect(withOcLaunchDefault([], false)).toEqual([])
  })

  test("executable default oc maps to oc launch", () => {
    expect(withExecutableDefault([], "C:\\Apps\\opencode\\oc.exe")).toEqual(["oc", "launch"])
    expect(withExecutableDefault(["C:\\proj"], "C:\\Apps\\opencode\\oc.exe")).toEqual(["oc", "launch", "C:\\proj"])
    expect(withExecutableDefault(["oc"], "C:\\Apps\\opencode\\oc.exe")).toEqual(["oc", "launch", "oc"])
  })

  test("executable default occ maps to oc previous depth 1", () => {
    expect(withExecutableDefault([], "C:\\Apps\\opencode\\occ.exe")).toEqual(["oc", "previous", "--depth", "1"])
    expect(withExecutableDefault(["C:\\proj"], "/usr/local/bin/occ")).toEqual([
      "oc",
      "previous",
      "--depth",
      "1",
      "C:\\proj",
    ])
  })

  test("executable default leaves explicit commands untouched", () => {
    expect(withExecutableDefault(["serve", "--port", "4097"], "C:\\Apps\\opencode\\oc.exe")).toEqual([
      "serve",
      "--port",
      "4097",
    ])
    expect(withExecutableDefault(["serve", "--register"], "C:\\Apps\\opencode\\occ.exe")).toEqual([
      "serve",
      "--register",
    ])
    expect(withExecutableDefault(["oc", "config", "get"], "C:\\Apps\\opencode\\oc.exe")).toEqual([
      "oc",
      "config",
      "get",
    ])
    expect(withExecutableDefault(["--register"], "C:\\Apps\\opencode\\oc.exe")).toEqual(["--register"])
    expect(withExecutableDefault(["--help"], "C:\\Apps\\opencode\\oc.exe")).toEqual(["--help"])
    expect(withExecutableDefault(["-h"], "C:\\Apps\\opencode\\occ.exe")).toEqual(["-h"])
    expect(withExecutableDefault(["--version"], "C:\\Apps\\opencode\\oc.exe")).toEqual(["--version"])
    expect(withExecutableDefault(["-v"], "C:\\Apps\\opencode\\oc.exe")).toEqual(["-v"])
  })

  test("executable default leaves bun and opencode unchanged", () => {
    expect(withExecutableDefault([], "/usr/local/bin/bun")).toEqual([])
    expect(withExecutableDefault(["C:\\proj"], "C:\\Program Files\\bun\\bun.exe")).toEqual(["C:\\proj"])
    expect(withExecutableDefault([], "C:\\Apps\\opencode\\opencode.exe")).toEqual([])
    expect(withExecutableDefault([], "C:\\Apps\\opencode\\ocdebug.exe")).toEqual([])
    expect(withExecutableDefault([], "C:\\Apps\\opencode\\opencode-debug.exe")).toEqual([])
  })
})
