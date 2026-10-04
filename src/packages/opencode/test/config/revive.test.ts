import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Revive } from "../../src/config/revive"
import { detachedCommand, windowsArguments } from "@opencode-ai/core/util/launch-detached"
import { Global } from "@opencode-ai/core/global"
import { TuiLedger } from "../../src/config/tuiLedger"
import { tmpdir } from "../fixture/fixture"

const executable = "C:\\Apps\\oc\\opencode.exe"
const context = { mode: "no-install", terminal: "generic", directory: "C:\\Projects\\a %PATH% & b; c",
  sessionID: "ses_123" } as const
const restart = { terminal: "generic", launcher: "occ", executable } as const

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

test("Bun development uses the current interpreter and its entrypoint", () => {
  expect(Revive.resolveLauncher("C:\\Tools\\bun.exe", true, () => true)).toBe("C:\\Tools\\bun.exe")
  const command = Revive.reopenCommand({ ...restart, terminal: "wezterm", executable: "C:\\Tools\\bun.exe",
    entrypoint: "C:\\Source Code\\src\\index.ts" })
  expect(command.args).toEqual(["start", "--always-new-process", "--", "C:\\Tools\\bun.exe",
    "C:\\Source Code\\src\\index.ts", "oc", "previous", "--depth", "1"])
})

test("the configured launcher picks the previous session (occ) or the home screen (oc)", () => {
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm" }).file).toBe("wezterm-gui")
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm" }).args)
    .toEqual(["start", "--always-new-process", "--", executable, "oc", "previous", "--depth", "1"])
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", launcher: "oc" }).args)
    .toEqual(["start", "--always-new-process", "--", executable, "oc", "launch"])
  expect(Revive.parseLauncher(undefined)).toBe("occ")
  expect(Revive.parseLauncher("oc")).toBe("oc")
  expect(() => Revive.parseLauncher("opencode")).toThrow()
})

test("Windows Terminal always opens a new window and escapes semicolons in paths with spaces", () => {
  const command = Revive.reopenCommand({ ...restart, terminal: "windows-terminal", executable: "C:\\Apps; Tools\\occ.exe" })
  expect(command.file).toBe("wt.exe")
  expect(command.args).toEqual(["-w", "new", "new-tab", "C:\\Apps\\; Tools\\occ.exe", "oc", "previous", "--depth", "1"])
})

test("generic terminals use a new console with literal paths", () => {
  const launcher = "C:\\Apps %PATH% & Tools\\occ.exe"
  const command = Revive.reopenCommand({ ...restart, executable: launcher, launcher: "oc" })
  expect(command.file).toBe("cmd.exe")
  expect(command.windowsVerbatimArguments).toBe(true)
  expect(command.args).toEqual(["/d", "/v:off", "/c",
    'start "" "%OC_REVIVE_ARG_0%" "%OC_REVIVE_ARG_1%" "%OC_REVIVE_ARG_2%"'])
  expect(command.env).toEqual({ OC_REVIVE_ARG_0: launcher, OC_REVIVE_ARG_1: "oc", OC_REVIVE_ARG_2: "launch" })
})

test("reopening every terminal uses a normal-window Start-Process hop instead of a hidden target", () => {
  for (const terminal of ["wezterm", "windows-terminal", "generic"] as const) {
    const command = Revive.reopenCommand({ ...restart, terminal })
    const launch = detachedCommand(command.file, command.args, {
      windowStyle: "Normal", env: command.env, windowsVerbatimArguments: command.windowsVerbatimArguments,
    }, "win32")
    const env: Record<string, string | undefined> = launch.options.env
    expect(launch.file).toBe("pwsh")
    expect(launch.args.at(-1)).toContain("Start-Process @parameters")
    expect(env.OC_LAUNCH_STYLE).toBe("Normal")
    expect(env.OC_LAUNCH_EXE).toBe(command.file)
    expect(env.OC_LAUNCH_ARGS)
      .toBe(command.windowsVerbatimArguments ? command.args.join(" ") : windowsArguments(command.args))
    if (terminal === "generic") {
      expect(env.OC_REVIVE_ARG_0).toBe(executable)
      expect(env.OC_LAUNCH_ARGS).not.toContain('\\"')
    }
  }
  const helper = detachedCommand(executable, ["oc", "--revive-terminal", "context"], {}, "win32")
  expect(helper.options.env.OC_LAUNCH_STYLE).toBe("Hidden")
})

test("occ-started TUI identity matches its resolved helper", () => {
  const occ = "C:\\Apps\\oc\\occ.exe"
  const helper = Global.resolveExecutablePath(occ)
  const record = { pid: 10, instance: "opencode", executable: Global.resolveExecutablePath(occ), startedAt: 1000 }
  expect(helper).toBe(executable)
  expect(TuiLedger.select([record], [{ pid: 10, parentPid: 1, executable: occ, startedAt: 1000 }],
    "opencode", helper, 100)).toEqual([10])
})

test("revive and restart contexts round-trip and reject bad input before shutdown", () => {
  const full = { ...context, mode: "install", paneID: "3", supervisorPid: 40, shellPid: 30, source: "existing",
    sourceDir: "C:\\src\\oc" } as const
  expect(Revive.decodeContext(Revive.encode(full))).toEqual(full)
  for (const input of [null, [], {}, { ...context, mode: "other" }, { ...context, terminal: "other" },
    { ...context, directory: "" }, { ...context, directory: "bad\0path" }, { ...context, sessionID: 5 },
    { ...context, supervisorPid: 0 }, { ...context, shellPid: 1.5 }, { ...context, source: "maybe" },
    { ...context, source: "download" }, { ...context, source: "existing", sourceDir: "relative" },
    { ...context, source: "none", sourceDir: "C:\\src\\oc" }]) {
    expect(() => Revive.decodeContext(Buffer.from(JSON.stringify(input)).toString("base64url"))).toThrow()
  }
  expect(() => Revive.decodeContext("not-json")).toThrow()
  const worker = { ...restart, paneID: "3", shellPid: 30, waitPid: 40, installDir: "C:\\Apps\\oc" } as const
  expect(Revive.decodeRestart(Revive.encode(worker))).toEqual(worker)
  for (const input of [{ ...restart, launcher: "opencode" }, { ...restart, executable: "" }, { ...restart, waitPid: -1 }])
    expect(() => Revive.decodeRestart(Buffer.from(JSON.stringify(input)).toString("base64url"))).toThrow()
})

test("revive.build is a source folder with an optional debug build", () => {
  expect(Revive.parseBuild({ source: "C:\\src\\oc" })).toEqual({ source: "C:\\src\\oc", debug: false })
  expect(Revive.parseBuild({ source: "C:\\src\\oc", debug: true })).toEqual({ source: "C:\\src\\oc", debug: true })
  expect(Revive.parseBuild(undefined)).toBeUndefined()
  expect(Revive.parseBuild(false)).toBeUndefined()
  for (const input of [true, "C:\\src\\oc", { source: "relative" }, { source: "C:\\src\\oc", debug: "yes" },
    { cwd: "C:\\src\\oc", command: ["pwsh"], output: ["bin"] }])
    expect(() => Revive.parseBuild(input)).toThrow()
})

test("build steps run build.ts in the source folder and add ocdebug only for debug builds", () => {
  const dist = "C:\\src\\oc\\src\\packages\\opencode\\dist"
  const release = Revive.buildSteps({ source: "C:\\src\\oc", debug: false })
  expect(release.cwd).toBe("C:\\src\\oc\\src")
  expect(release.commands).toEqual([["bun", "install"],
    ["bun", "run", "packages/opencode/script/build.ts", "--single"]])
  expect(release.output).toEqual([`${dist}\\opencode-windows-${process.arch}\\bin`])
  const debug = Revive.buildSteps({ source: "C:\\src\\oc", debug: true })
  expect(debug.commands[1]).toEqual(["bun", "run", "packages/opencode/script/build.ts", "--single", "--with-debug"])
  expect(debug.output).toEqual([`${dist}\\opencode-windows-${process.arch}\\bin`,
    `${dist}\\opencode-debug-windows-${process.arch}\\bin\\ocdebug.exe`])
})

test("only known shells are treated as killable window owners", () => {
  expect(Revive.isShell("pwsh.exe")).toBe(true)
  expect(Revive.isShell("CMD.EXE")).toBe(true)
  expect(Revive.isShell("wezterm-gui.exe")).toBe(false)
  expect(Revive.isShell("WindowsTerminal.exe")).toBe(false)
})

test("install renames old files aside, relinks hard-link aliases, and leftovers are removable", async () => {
  await using tmp = await tmpdir()
  const build = path.join(tmp.path, "build")
  const app = path.join(tmp.path, "app")
  await fs.mkdir(path.join(build, "runtime"), { recursive: true })
  await fs.mkdir(path.join(app, "runtime"), { recursive: true })
  await fs.writeFile(path.join(build, "opencode.exe"), "new")
  await fs.writeFile(path.join(build, "runtime", "a.js"), "new runtime")
  await fs.writeFile(path.join(app, "opencode.exe"), "old")
  await fs.writeFile(path.join(app, "runtime", "a.js"), "old runtime")
  await fs.link(path.join(app, "opencode.exe"), path.join(app, "occ.exe"))
  await fs.writeFile(path.join(app, "keep.txt"), "untouched")

  await Revive.install(await Revive.installSources([build]), app, 7)

  expect(await fs.readFile(path.join(app, "opencode.exe"), "utf8")).toBe("new")
  expect(await fs.readFile(path.join(app, "occ.exe"), "utf8")).toBe("new")
  expect(await fs.readFile(path.join(app, "runtime", "a.js"), "utf8")).toBe("new runtime")
  expect(await fs.readFile(path.join(app, "keep.txt"), "utf8")).toBe("untouched")
  const main = await fs.stat(path.join(app, "opencode.exe"), { bigint: true })
  expect((await fs.stat(path.join(app, "occ.exe"), { bigint: true })).ino).toBe(main.ino)
  expect((await fs.readdir(app)).sort()).toEqual(["keep.txt", "occ.exe", "occ.exe.old-7", "opencode.exe",
    "opencode.exe.old-7", "runtime", "runtime.old-7"])
  expect(await Revive.removeLeftovers(app)).toEqual([])
  expect((await fs.readdir(app)).sort()).toEqual(["keep.txt", "occ.exe", "opencode.exe", "runtime"])
})

test("a failed install restores the previous files", async () => {
  await using tmp = await tmpdir()
  const build = path.join(tmp.path, "build")
  const app = path.join(tmp.path, "app")
  await fs.mkdir(build, { recursive: true })
  await fs.mkdir(app, { recursive: true })
  await fs.writeFile(path.join(build, "opencode.exe"), "new")
  await fs.writeFile(path.join(app, "opencode.exe"), "old")
  await fs.writeFile(path.join(app, "runtime"), "old runtime")
  const sources = [...await Revive.installSources([build]), { name: "runtime", path: path.join(build, "missing") }]

  await expect(Revive.install(sources, app, 7)).rejects.toThrow()

  expect((await fs.readdir(app)).sort()).toEqual(["opencode.exe", "runtime"])
  expect(await fs.readFile(path.join(app, "opencode.exe"), "utf8")).toBe("old")
  expect(await fs.readFile(path.join(app, "runtime"), "utf8")).toBe("old runtime")
})

test("build outputs must exist and must not provide the same name twice", async () => {
  await using tmp = await tmpdir()
  const first = path.join(tmp.path, "first")
  const second = path.join(tmp.path, "second")
  await fs.mkdir(first)
  await fs.mkdir(second)
  await fs.writeFile(path.join(first, "runtime"), "a")
  await fs.writeFile(path.join(second, "runtime"), "b")
  await expect(Revive.installSources([first, second])).rejects.toThrow("Two build outputs provide runtime")
  await expect(Revive.installSources([path.join(tmp.path, "missing")])).rejects.toThrow("Build output not found")
})
