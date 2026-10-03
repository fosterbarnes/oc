import { expect, test } from "bun:test"
import { Revive } from "../../src/config/revive"
import { detachedCommand, windowsArguments } from "@opencode-ai/core/util/launch-detached"
import { Global } from "@opencode-ai/core/global"
import { TuiLedger } from "../../src/config/tuiLedger"

const executable = "C:\\Apps\\oc\\opencode.exe"
const context = { terminal: "generic", directory: "C:\\Projects\\a %PATH% & b; c", sessionID: "ses_123" } as const

test("prefers sibling occ, then oc, then the current production executable", () => {
  expect(Revive.resolveLauncher(executable, false, (file) => file.endsWith("occ.exe")))
    .toBe("C:\\Apps\\oc\\occ.exe")
  expect(Revive.resolveLauncher(executable, false, (file) => file.endsWith("oc.exe")))
    .toBe("C:\\Apps\\oc\\oc.exe")
  expect(Revive.resolveLauncher(executable, false, () => false)).toBe(executable)
})

test("debug retains its own executable and never selects a production sibling", () => {
  expect(Revive.resolveLauncher("C:\\Apps\\oc\\ocdebug.exe", true, () => true))
    .toBe("C:\\Apps\\oc\\ocdebug.exe")
  expect(Revive.resolveLauncher(executable, true, (file) => file.endsWith("ocdebug.exe")))
    .toBe("C:\\Apps\\oc\\ocdebug.exe")
  expect(() => Revive.resolveLauncher(executable, true, (file) => file.endsWith("occ.exe"))).toThrow()
})

test("Bun development uses the current interpreter instead of unrelated siblings", () => {
  expect(Revive.resolveLauncher("C:\\Tools\\bun.exe", true, () => true)).toBe("C:\\Tools\\bun.exe")
  const command = Revive.reopenCommand("C:\\Tools\\bun.exe", { ...context, terminal: "wezterm" },
    "C:\\Source Code\\src\\index.ts")
  expect(command.args.slice(0, -1)).toEqual(["start", "--always-new-process", "--", "C:\\Tools\\bun.exe",
    "C:\\Source Code\\src\\index.ts", "oc", "--revive"])
})

test("WezTerm opens a fresh GUI with the selected launcher and saved context", () => {
  const input = { ...context, terminal: "wezterm" } as const
  const command = Revive.reopenCommand(executable, input)
  expect(command.file).toBe("wezterm")
  expect(command.args.slice(0, -1)).toEqual(["start", "--always-new-process", "--", executable, "oc", "--revive"])
  expect(Revive.decodeContext(command.args.at(-1)!)).toEqual({ ...input, reopen: true })
  expect(command.env).toEqual({})
})

test("Windows Terminal always opens a new window and escapes semicolons in paths with spaces", () => {
  const command = Revive.reopenCommand("C:\\Apps; Tools\\occ.exe", { ...context, terminal: "windows-terminal" })
  expect(command.file).toBe("wt.exe")
  expect(command.args.slice(0, -1)).toEqual(["-w", "new", "new-tab", "C:\\Apps\\; Tools\\occ.exe", "oc", "--revive"])
  expect(Revive.decodeContext(command.args.at(-1)!)).toEqual({ ...context, terminal: "windows-terminal", reopen: true })
})

test("generic terminals use a new console with literal paths and shell-safe encoded metadata", () => {
  const launcher = "C:\\Apps %PATH% & Tools\\occ.exe"
  const command = Revive.reopenCommand(launcher, context)
  expect(command.file).toBe("cmd.exe")
  expect(command.windowsVerbatimArguments).toBe(true)
  expect(command.args).toEqual(["/d", "/v:off", "/c",
    'start "" "%OC_REVIVE_ARG_0%" "%OC_REVIVE_ARG_1%" "%OC_REVIVE_ARG_2%" "%OC_REVIVE_ARG_3%"'])
  expect(command.env.OC_REVIVE_ARG_0).toBe(launcher)
  expect(command.env.OC_REVIVE_ARG_1).toBe("oc")
  expect(command.env.OC_REVIVE_ARG_2).toBe("--revive")
  expect(Revive.decodeContext(command.env.OC_REVIVE_ARG_3)).toEqual({ ...context, reopen: true })
})

test("Home context can reopen without a session id", () => {
  const input = { terminal: "generic", directory: "C:\\Projects" } as const
  const command = Revive.reopenCommand(executable, input)
  expect(Revive.decodeContext(command.env.OC_REVIVE_ARG_3)).toEqual({ ...input, reopen: true })
  expect(Revive.attachArguments("http://127.0.0.1:4096", input))
    .toEqual(["attach", "http://127.0.0.1:4096", "--dir", input.directory])
})

test("session reopen attaches only the saved session in its directory", () => {
  expect(Revive.attachArguments("http://127.0.0.1:4096", context))
    .toEqual(["attach", "http://127.0.0.1:4096", "--dir", context.directory, "--session", context.sessionID])
})

test("reopening every terminal uses a normal-window Start-Process hop instead of a hidden target", () => {
  for (const terminal of ["wezterm", "windows-terminal", "generic"] as const) {
    const command = Revive.reopenCommand(executable, { ...context, terminal })
    const launch = detachedCommand(command.file, command.args, {
      windowStyle: "Normal", env: command.env, windowsVerbatimArguments: command.windowsVerbatimArguments,
    }, "win32")
    expect(launch.file).toBe("pwsh")
    expect(launch.args.at(-1)).toContain("Start-Process @parameters")
    expect(launch.args.at(-1)).toContain("WindowStyle = $env:OC_LAUNCH_STYLE")
    expect(launch.options.env.OC_LAUNCH_STYLE).toBe("Normal")
    expect(launch.options.env.OC_LAUNCH_EXE).toBe(command.file)
    expect(launch.options.env.OC_LAUNCH_ARGS)
      .toBe(command.windowsVerbatimArguments ? command.args.join(" ") : windowsArguments(command.args))
    if (terminal === "generic") {
      expect(launch.options.env.OC_REVIVE_ARG_0).toBe(executable)
      expect(launch.options.env.OC_LAUNCH_ARGS).toContain('start "" "%OC_REVIVE_ARG_0%"')
      expect(launch.options.env.OC_LAUNCH_ARGS).not.toContain('\\"')
    }
  }
  const helper = detachedCommand(executable, ["oc", "--revive", "context"], {}, "win32")
  expect(helper.options.env.OC_LAUNCH_STYLE).toBe("Hidden")
})

test("occ-started TUI identity matches its resolved helper and reopens with its own launcher", () => {
  const occ = "C:\\Apps\\oc\\occ.exe"
  const helper = Global.resolveExecutablePath(occ)
  const record = { pid: 10, instance: "opencode", executable: Global.resolveExecutablePath(occ), startedAt: 1000 }
  expect(helper).toBe(executable)
  expect(TuiLedger.select([record], [{ pid: 10, parentPid: 1, executable: occ, startedAt: 1000 }],
    "opencode", helper, 100)).toEqual([10])
  const launcher = Revive.resolveLauncher(helper, false, (file) => file === occ)
  expect(Revive.reopenCommand(launcher, { ...context, terminal: "windows-terminal" }).args.slice(0, -1))
    .toEqual(["-w", "new", "new-tab", occ, "oc", "--revive"])
})

test("invalid revive context is rejected before shutdown", () => {
  for (const input of [null, [], {}, { ...context, terminal: "other" }, { ...context, directory: "" },
    { ...context, directory: "bad\0path" }, { ...context, sessionID: 5 }, { ...context, reopen: "true" }]) {
    expect(() => Revive.decodeContext(Buffer.from(JSON.stringify(input)).toString("base64url"))).toThrow()
  }
  expect(() => Revive.decodeContext("not-json")).toThrow()
})

test("detached helper arguments quote spaces, quotes and trailing backslashes for Start-Process", () => {
  expect(windowsArguments([])).toBe("")
  expect(windowsArguments(["oc", "--revive", "abc_123-XYZ"])).toBe('"oc" "--revive" "abc_123-XYZ"')
  expect(windowsArguments(["C:\\Source Code\\index.ts", 'say "hi"', "C:\\dir\\"]))
    .toBe('"C:\\Source Code\\index.ts" "say \\"hi\\"" "C:\\dir\\\\"')
})
