import { expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import os from "node:os"
import { Revive } from "../../src/config/revive"
import { detachedCommand, launchDetached, windowsArguments } from "@opencode-ai/core/util/launchDetached"
import { Global } from "@opencode-ai/core/global"
import { TuiLedger } from "../../src/config/tuiLedger"
import { tmpdir } from "../fixture/fixture"
import { OcConfig } from "../../src/config/oc"

const executable = "C:\\Apps\\oc\\oc.exe"
const nativeExe = "C:\\Apps\\oc\\opencode.exe"
const context = {
  mode: "no-install",
  terminal: "generic",
  directory: "C:\\Projects\\a %PATH% & b; c",
  sessionID: "ses_123",
} as const
const restart = { terminal: "generic", launcher: "occ", executable } as const

test("prefers sibling occ, then oc, then the current production executable", () => {
  expect(Revive.resolveLauncher(executable, (file) => file.endsWith("occ.exe"))).toBe("C:\\Apps\\oc\\occ.exe")
  expect(Revive.resolveLauncher(executable, (file) => file.endsWith("oc.exe"))).toBe("C:\\Apps\\oc\\oc.exe")
  expect(Revive.resolveLauncher(executable, () => false)).toBe(executable)
})

test("Bun development uses the current interpreter and its entrypoint", () => {
  expect(Revive.resolveLauncher("C:\\Tools\\bun.exe", () => true)).toBe("C:\\Tools\\bun.exe")
  const command = Revive.reopenCommand({
    ...restart,
    terminal: "wezterm",
    executable: "C:\\Tools\\bun.exe",
    entrypoint: "C:\\Source Code\\src\\index.ts",
  })
  expect(command.args).toEqual([
    "start",
    "--always-new-process",
    "--",
    "C:\\Tools\\bun.exe",
    "C:\\Source Code\\src\\index.ts",
    "oc",
    "previous",
    "--depth",
    "1",
  ])
})

test("the configured launcher picks the previous session (occ) or the home screen (oc)", () => {
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm" }).file).toBe("wezterm-gui")
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm" }).args).toEqual([
    "start",
    "--always-new-process",
    "--",
    executable,
    "oc",
    "previous",
    "--depth",
    "1",
  ])
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", launcher: "oc" }).args).toEqual([
    "start",
    "--always-new-process",
    "--",
    executable,
    "oc",
    "launch",
  ])
  expect(
    Revive.reopenCommand({
      ...restart,
      terminal: "wezterm",
      native: true,
      directory: context.directory,
      sessionID: context.sessionID,
    }).args,
  ).toEqual(["start", "--always-new-process", "--", nativeExe, context.directory, "--session", context.sessionID])
  // One snapshotted tab: occ reopens that pane's session, oc still opens Home.
  const one = [{ kind: "oc", directory: "C:\\Split", sessionID: "ses_split", paneID: "4" }] satisfies Revive.Tab[]
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", tabs: one }).args.slice(3, 6)).toEqual([
    executable,
    "oc",
    "revive-tabs",
  ])
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", launcher: "oc", tabs: one }).args.at(-1)).toBe(
    "launch",
  )
  expect(Revive.parseLauncher(undefined)).toBe("occ")
  expect(Revive.parseLauncher("oc")).toBe("oc")
  expect(() => Revive.parseLauncher("opencode")).toThrow()
})

test("Windows Terminal always opens a new window and escapes semicolons in paths with spaces", () => {
  const command = Revive.reopenCommand({
    ...restart,
    terminal: "windows-terminal",
    executable: "C:\\Apps; Tools\\occ.exe",
  })
  expect(command.file).toBe("wt.exe")
  expect(command.args).toEqual(["-w", "new", "new-tab", "C:\\Apps\\; Tools\\occ.exe", "oc", "previous", "--depth", "1"])
})

test("generic terminals use a new console with literal paths", () => {
  const launcher = "C:\\Apps %PATH% & Tools\\occ.exe"
  const command = Revive.reopenCommand({ ...restart, executable: launcher, launcher: "oc" })
  expect(command.file).toBe("cmd.exe")
  expect(command.windowsVerbatimArguments).toBe(true)
  expect(command.args).toEqual([
    "/d",
    "/v:off",
    "/c",
    'start "" "%OC_REVIVE_ARG_0%" "%OC_REVIVE_ARG_1%" "%OC_REVIVE_ARG_2%"',
  ])
  expect(command.env).toEqual({
    OC_FLAVOR: "oc",
    OC_REVIVE_ARG_0: launcher,
    OC_REVIVE_ARG_1: "oc",
    OC_REVIVE_ARG_2: "launch",
  })
})

test("reopening every terminal uses a normal-window Start-Process hop instead of a hidden target", () => {
  for (const terminal of ["wezterm", "windows-terminal", "generic"] as const) {
    const command = Revive.reopenCommand({ ...restart, terminal })
    const launch = detachedCommand(
      command.file,
      command.args,
      {
        windowStyle: "Normal",
        env: command.env,
        windowsVerbatimArguments: command.windowsVerbatimArguments,
      },
      "win32",
    )
    const env: Record<string, string | undefined> = launch.options.env
    expect(launch.file).toBe("pwsh")
    expect(launch.args.at(-1)).toContain("Start-Process @parameters")
    expect(env.OC_LAUNCH_STYLE).toBe("Normal")
    expect(env.OC_LAUNCH_EXE).toBe(command.file)
    expect(env.OC_LAUNCH_ARGS).toBe(
      command.windowsVerbatimArguments ? command.args.join(" ") : windowsArguments(command.args),
    )
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
  const record = {
    pid: 10,
    instance: "opencode",
    executable: Global.resolveExecutablePath(occ),
    startedAt: 1000,
    created: "133000000000000000",
  }
  const live = { pid: 10, parentPid: 1, executable: occ, startedAt: 1000, created: "133000000000000000" }
  expect(helper).toBe(executable)
  expect(TuiLedger.select([record], [live], "opencode", helper, 100)).toEqual([10])
  expect(TuiLedger.select([record], [{ ...live, created: "133000000000000001" }], "opencode", helper, 100)).toEqual([])
  expect(TuiLedger.select([{ ...record, created: undefined }], [live], "opencode", helper, 100)).toEqual([])
})

test("revive and restart contexts round-trip and reject bad input before shutdown", () => {
  const full = {
    ...context,
    mode: "install",
    paneID: "3",
    supervisorPid: 40,
    shellPid: 30,
    source: "existing",
    sourceDir: "C:\\src\\oc",
    native: true,
    tuiPid: 50,
  } as const
  expect(Revive.decodeContext(Revive.encode(full))).toEqual(full)
  const update = { ...context, mode: "update", release: "0.3.1" } as const
  expect(Revive.decodeContext(Revive.encode(update))).toEqual(update)
  for (const input of [
    null,
    [],
    {},
    { ...context, mode: "other" },
    { ...context, mode: "update" },
    { ...context, mode: "update", release: "latest" },
    { ...context, mode: "update", release: "0.3.1; calc" },
    { ...context, release: "0.3.1" },
    { ...context, terminal: "other" },
    { ...context, directory: "" },
    { ...context, directory: "bad\0path" },
    { ...context, sessionID: 5 },
    { ...context, supervisorPid: 0 },
    { ...context, shellPid: 1.5 },
    { ...context, source: "maybe" },
    { ...context, source: "download" },
    { ...context, source: "existing", sourceDir: "relative" },
    { ...context, source: "none", sourceDir: "C:\\src\\oc" },
    { ...context, native: "yes" },
    { ...context, tuiPid: 0 },
  ]) {
    expect(() => Revive.decodeContext(Buffer.from(JSON.stringify(input)).toString("base64url"))).toThrow()
  }
  expect(() => Revive.decodeContext("not-json")).toThrow()
  const worker = {
    ...restart,
    paneID: "3",
    shellPid: 30,
    waitPid: 40,
    installDir: "C:\\Apps\\oc",
    native: true,
    directory: context.directory,
    sessionID: context.sessionID,
  } as const
  expect(Revive.decodeRestart(Revive.encode(worker))).toEqual(worker)
  for (const input of [
    { ...restart, launcher: "opencode" },
    { ...restart, executable: "" },
    { ...restart, waitPid: -1 },
    { ...worker, directory: undefined },
    { ...worker, sessionID: 1 },
  ])
    expect(() => Revive.decodeRestart(Buffer.from(JSON.stringify(input)).toString("base64url"))).toThrow()
})

test("native revive reopens opencode with the exact session or Home and directory in every new-window command", () => {
  for (const terminal of ["wezterm", "windows-terminal", "generic"] as const) {
    for (const launcher of ["oc", "occ"] as const) {
      const input = {
        ...restart,
        terminal,
        launcher,
        native: true,
        directory: context.directory,
        sessionID: context.sessionID,
      }
      const command = Revive.reopenCommand(input)
      const args = terminal === "generic" ? Object.values(command.env) : command.args
      expect(args).toContain(nativeExe)
      expect(args).toContain(
        terminal === "windows-terminal" ? context.directory.replaceAll(";", "\\;") : context.directory,
      )
      expect(args).toContain(context.sessionID)
      expect(args).not.toContain("oc")
      expect(command.env.OC_FLAVOR).toBe("native")
      const home = Revive.reopenCommand({ ...input, sessionID: undefined })
      expect(terminal === "generic" ? Object.values(home.env) : home.args).not.toContain("--session")
    }
  }
})

test.skipIf(process.platform !== "win32")("native terminal restart preserves the live hosting shell", async () => {
  const shell = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", "[Console]::ReadLine()"], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
    windowsHide: true,
  })
  try {
    const launched: string[][] = []
    for (const terminal of ["wezterm", "windows-terminal", "generic"] as const) {
      await OcConfig.restartTerminal(
        {
          ...restart,
          terminal,
          native: true,
          shellPid: shell.pid,
          directory: context.directory,
          sessionID: context.sessionID,
        },
        async (command) => {
          launched.push(terminal === "generic" ? Object.values(command.env) : command.args)
        },
      )
      expect(OcConfig.isPidAlive(shell.pid)).toBe(true)
    }
    expect(launched).toHaveLength(3)
    expect(launched.every((args) => args.includes(context.sessionID))).toBe(true)
  } finally {
    shell.kill()
    await shell.exited
  }
})

test.skipIf(process.platform !== "win32")("terminal restart closes the old shell only after the launch succeeds", async () => {
  const shell = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", "[Console]::ReadLine()"], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "ignore",
    windowsHide: true,
  })
  try {
    const shellIdentity = TuiLedger.listProcesses().find((item) => item.pid === shell.pid)
    if (!shellIdentity) throw new Error("test shell identity unavailable")
    const input = { ...restart, shellPid: shell.pid, shellIdentity }
    await expect(
      OcConfig.restartTerminal(input, async () => {
        throw new Error("launch rejected")
      }),
    ).rejects.toThrow("launch rejected")
    expect(OcConfig.isPidAlive(shell.pid)).toBe(true)
    await OcConfig.restartTerminal(input, async () => {
      expect(OcConfig.isPidAlive(shell.pid)).toBe(true)
    })
    await shell.exited
  } finally {
    shell.kill()
  }
})

test.skipIf(process.platform !== "win32")("the launch hop fails when the target exits with an error during the settle window", async () => {
  const run = (code: number) =>
    new Promise<number | null>((resolve) =>
      launchDetached("pwsh", ["-NoProfile", "-NonInteractive", "-Command", `exit ${code}`], { settleMs: 1500 }).once(
        "exit",
        resolve,
      ),
    )
  expect(await run(3)).toBe(2)
  // A clean exit passes: wt.exe and `cmd /c start` are stubs that hand off and exit 0 right away.
  expect(await run(0)).toBe(0)
})

const windowList = JSON.stringify([
  { window_id: 0, tab_id: 9, pane_id: 1, cwd: "file:///C:/Projects/crow" },
  { window_id: 0, tab_id: 1, pane_id: 2, cwd: "file:///C:/Users/example/Projects%20A" },
  { window_id: 0, tab_id: 2, pane_id: 3, cwd: "file:///C:/Work" },
  { window_id: 0, tab_id: 2, pane_id: 4, cwd: "file:///C:/Work" },
  { window_id: 0, tab_id: 3, pane_id: 5, cwd: "file:///C:/Projects/b" },
  { window_id: 1, tab_id: 4, pane_id: 6, cwd: "file:///C:/Window2" },
])
const ledgerRecords = [
  { paneID: "1", directory: "C:\\Projects\\crow", sessionID: "ses_a" },
  { paneID: "4", directory: "C:\\Split", sessionID: "ses_split" },
  { paneID: "5", directory: "C:\\Projects\\b" },
  { paneID: "6", directory: "C:\\Window2" },
]

test("windowTabs moves only owned oc panes of the trigger's window, in list order", () => {
  // Pane 2 (shell) and pane 3 (first pane of a split, e.g. native) are not owned: they stay behind.
  // Pane 4 is the owned second pane of that split tab, so it moves on its own.
  expect(Revive.windowTabs(windowList, ledgerRecords, "1")).toEqual([
    { kind: "oc", directory: "C:\\Projects\\crow", sessionID: "ses_a", paneID: "1" },
    { kind: "oc", directory: "C:\\Split", sessionID: "ses_split", paneID: "4" },
    { kind: "oc", directory: "C:\\Projects\\b", paneID: "5" },
  ])
  expect(Revive.windowTabs(windowList, ledgerRecords, "6")).toEqual([
    { kind: "oc", directory: "C:\\Window2", paneID: "6" },
  ])
  expect(Revive.windowTabs(windowList, ledgerRecords, "99")).toEqual([])
  expect(Revive.windowTabs(windowList, [], "1")).toEqual([])
})

test("ownedPanes closes only the trigger and moved panes that still exist", () => {
  const tabs = Revive.windowTabs(windowList, ledgerRecords, "1")
  expect(Revive.ownedPanes(windowList, { paneID: "1", tabs })).toEqual(["1", "4", "5"])
  // A pane closed meanwhile (or a reused id from another window) is skipped, never guessed.
  const later = JSON.stringify(JSON.parse(windowList).filter((pane: { pane_id: number }) => pane.pane_id !== 5))
  expect(Revive.ownedPanes(later, { paneID: "1", tabs })).toEqual(["1", "4"])
  expect(Revive.ownedPanes(windowList, { paneID: "1" })).toEqual(["1"])
  expect(Revive.ownedPanes(windowList, { paneID: "1", tabs: [{ kind: "shell", cwd: "C:\\Work" }] })).toEqual(["1"])
})

test("restart tabs round-trip, and a bad tab rejects the restart context", () => {
  const tabs: Revive.Tab[] = [
    { kind: "oc", directory: context.directory, sessionID: context.sessionID },
    { kind: "shell", cwd: "C:\\Work" },
  ]
  const worker = { ...restart, paneID: "3", tabs }
  expect(Revive.decodeRestart(Revive.encode(worker))).toEqual(worker)
  expect(Revive.decodeTabs(Revive.encode(tabs))).toEqual(tabs)
  expect(() => Revive.decodeTabs(Revive.encode([]))).toThrow()
  for (const tab of [
    { kind: "oc" },
    { kind: "shell", cwd: "" },
    { kind: "other", cwd: "C:\\Work" },
    null,
    "C:\\Work",
  ]) {
    expect(() => Revive.decodeRestart(Revive.encode({ ...restart, tabs: [tab] }))).toThrow()
  }
  expect(() => Revive.decodeRestart(Revive.encode({ ...restart, tabs: "C:\\Work" }))).toThrow()
})

test("wezterm restores several tabs through revive-tabs; no snapshot and other terminals keep previous", () => {
  const tabs: Revive.Tab[] = [
    { kind: "oc", directory: context.directory, sessionID: context.sessionID },
    { kind: "shell", cwd: "C:\\Work" },
  ]
  const command = Revive.reopenCommand({ ...restart, terminal: "wezterm", tabs })
  expect(command.file).toBe("wezterm-gui")
  expect(command.args).toEqual([
    "start",
    "--always-new-process",
    "--",
    executable,
    "oc",
    "revive-tabs",
    Revive.encode(tabs),
  ])
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", entrypoint: "C:\\src\\index.ts", tabs }).args).toEqual(
    ["start", "--always-new-process", "--", executable, "C:\\src\\index.ts", "oc", "revive-tabs", Revive.encode(tabs)],
  )
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", tabs: [tabs[0]] }).args).toEqual([
    "start",
    "--always-new-process",
    "--",
    executable,
    "oc",
    "revive-tabs",
    Revive.encode([tabs[0]]),
  ])
  expect(Revive.reopenCommand({ ...restart, terminal: "wezterm", tabs: [] }).args).toContain("previous")
  expect(Revive.reopenCommand({ ...restart, terminal: "windows-terminal", tabs }).args).toContain("previous")
})

test("revive.build is a source folder", () => {
  expect(Revive.parseBuild({ source: "C:\\src\\oc" })).toEqual({ source: "C:\\src\\oc" })
  expect(Revive.parseBuild({ source: "C:\\src\\oc", debug: true })).toEqual({ source: "C:\\src\\oc" })
  expect(Revive.parseBuild(undefined)).toBeUndefined()
  expect(Revive.parseBuild(false)).toBeUndefined()
  for (const input of [
    true,
    "C:\\src\\oc",
    { source: "relative" },
    { cwd: "C:\\src\\oc", command: ["pwsh"], output: ["bin"] },
  ])
    expect(() => Revive.parseBuild(input)).toThrow()
})

test("build steps run build.ts in the source folder", () => {
  const dist = "C:\\src\\oc\\src\\packages\\opencode\\dist"
  const release = Revive.buildSteps({ source: "C:\\src\\oc" })
  expect(release.cwd).toBe("C:\\src\\oc\\src")
  expect(release.commands).toEqual([
    ["bun", "install"],
    ["bun", "run", "packages/opencode/script/build.ts", "--single"],
  ])
  const native = `${dist}\\opencode-native-windows-${process.arch}\\bin\\opencode.exe`
  expect(release.output).toEqual([`${dist}\\opencode-windows-${process.arch}\\bin`, native])
})

test("single revive builds and installs only native opencode", () => {
  const steps = Revive.buildSteps({ source: "C:\\src\\oc" }, "native")
  expect(steps.commands[1]).toEqual(["bun", "run", "packages/opencode/script/build.ts", "--single", "--native-only"])
  expect(steps.output).toEqual([
    `C:\\src\\oc\\src\\packages\\opencode\\dist\\opencode-native-windows-${process.arch}\\bin\\opencode.exe`,
  ])
  expect(Revive.parseContext({ ...context, mode: "single", hosted: true }).hosted).toBe(true)
  expect(() => Revive.parseContext({ ...context, mode: "single", hosted: "yes" })).toThrow()
})

test("single revive opens a new tab in the current terminal, or a new console", () => {
  const command = [executable, "oc", "--revive", "ctx"]
  const options = { directory: context.directory }
  expect(Revive.openTabCommand(command, { ...options, terminal: "wezterm" })).toMatchObject({
    file: "wezterm",
    args: ["cli", "--no-auto-start", "spawn", "--cwd", context.directory, "--", ...command],
  })
  expect(Revive.openTabCommand(command, { ...options, terminal: "windows-terminal" })).toMatchObject({
    file: "wt.exe",
    args: ["-w", "0", "new-tab", "-d", context.directory, ...command],
  })
  const generic = Revive.openTabCommand(command, { ...options, terminal: "generic" })
  expect(generic.file).toBe("cmd.exe")
  expect(generic.env).toMatchObject({ OC_REVIVE_ARG_0: executable, OC_REVIVE_ARG_3: "ctx" })
})

test("single revive waits for the terminal CLI and reports a rejected tab launch", async () => {
  const command = {
    file: process.execPath,
    args: ["-e", "process.exit(process.env.OC_REVIVE_TEST_EXIT === '7' ? 7 : 0)"],
    env: { OC_FLAVOR: "oc", OC_REVIVE_TEST_EXIT: "0" },
    windowsVerbatimArguments: false,
  }
  await expect(OcConfig.openReviveTab(command, os.tmpdir())).resolves.toBeUndefined()
  await expect(OcConfig.openReviveTab({
    ...command,
    env: { ...command.env, OC_REVIVE_TEST_EXIT: "7" },
  }, os.tmpdir())).rejects.toThrow("exited with code 7")
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
  expect((await fs.readdir(app)).sort()).toEqual([
    "keep.txt",
    "occ.exe",
    "occ.exe.old-7",
    "opencode.exe",
    "opencode.exe.old-7",
    "runtime",
    "runtime.old-7",
  ])
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
  const sources = [...(await Revive.installSources([build])), { name: "runtime", path: path.join(build, "missing") }]

  await expect(Revive.install(sources, app, 7)).rejects.toThrow()

  expect(await fs.readFile(path.join(app, "opencode.exe"), "utf8")).toBe("old")
  expect(await fs.readFile(path.join(app, "runtime"), "utf8")).toBe("old runtime")
  expect(await Revive.removeLeftovers(app)).toEqual([])
  expect((await fs.readdir(app)).sort()).toEqual(["opencode.exe", "runtime"])
})

test("a finished install rolls back files and aliases when the new server is not ready", async () => {
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

  const rollback = await Revive.install(await Revive.installSources([build]), app, 7)
  await rollback(new Error("not ready"))

  expect(await fs.readFile(path.join(app, "opencode.exe"), "utf8")).toBe("old")
  expect(await fs.readFile(path.join(app, "occ.exe"), "utf8")).toBe("old")
  expect(await fs.readFile(path.join(app, "runtime", "a.js"), "utf8")).toBe("old runtime")
  const main = await fs.stat(path.join(app, "opencode.exe"), { bigint: true })
  expect((await fs.stat(path.join(app, "occ.exe"), { bigint: true })).ino).toBe(main.ino)
  expect(await Revive.removeLeftovers(app)).toEqual([])
  expect((await fs.readdir(app)).sort()).toEqual(["occ.exe", "opencode.exe", "runtime"])
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
