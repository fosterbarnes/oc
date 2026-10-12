import { describe, expect, test } from "bun:test"
import { attachArgs, launcher, spawnCommand, unavailable } from "../../src/util/sessionTab"

const target = { url: "http://127.0.0.1:4096/", directory: "C:\\work dir", sessionID: "ses_1" }

describe("util.sessionTab", () => {
  test("needs a real server url and a tab-capable terminal", () => {
    expect(unavailable("http://opencode.internal", "wezterm")).toContain("resident oc server")
    expect(unavailable(target.url, "generic")).toContain("WezTerm or Windows Terminal")
    expect(unavailable(target.url, "wezterm")).toBeUndefined()
    expect(unavailable(target.url, "windows-terminal")).toBeUndefined()
  })

  test("attach args carry the server credentials the new tab cannot inherit", () => {
    expect(attachArgs(target, {})).toEqual(["attach", target.url, "--dir", target.directory, "--session", "ses_1"])
    expect(attachArgs(target, { OPENCODE_SERVER_PASSWORD: "pw", OPENCODE_SERVER_USERNAME: "u" }).slice(-4)).toEqual([
      "--password",
      "pw",
      "--username",
      "u",
    ])
  })

  test("launcher adds the entry script only under bun", () => {
    expect(launcher("C:\\bun\\bun.exe", "C:\\src\\index.ts")).toEqual(["C:\\bun\\bun.exe", "C:\\src\\index.ts"])
    expect(launcher("C:\\Apps\\opencode\\opencode.exe", "ignored")).toEqual(["C:\\Apps\\opencode\\opencode.exe"])
  })

  test("spawns a tab in the current window", () => {
    expect(spawnCommand("wezterm", "C:\\work", ["oc", "attach"])?.args).toEqual([
      "cli",
      "spawn",
      "--cwd",
      "C:\\work",
      "--",
      "oc",
      "attach",
    ])
    expect(spawnCommand("windows-terminal", "C:\\work", ["oc", "a;b"])).toEqual({
      file: "wt.exe",
      args: ["-w", "0", "new-tab", "-d", "C:\\work", "oc", "a\\;b"],
    })
    expect(spawnCommand("generic", "C:\\work", ["oc"])).toBeUndefined()
  })
})
