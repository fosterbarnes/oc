import assert from "node:assert/strict"
import test from "node:test"
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBuiltinPlugins } from "../../src/feature-plugins/builtins.ts"
import {
  defaultScriptSettings,
  ensureSessionScrollbarVisible,
  hasConfiguredScripts,
  loadSidebarSettings,
  normalizeExtension,
  normalizeSidebarSettings,
  normalizeScriptSettings,
  OPENCODE_SESSION_SCROLLBAR_KEY,
  parseLauncher,
  promptProjectDirectory,
  resolveScriptTerminal,
  scriptTerminals,
  saveSidebarSettings,
  saveUserScriptSettings,
  saveUserUsageProviders,
  sessionProjectDirectory,
  sidebarConfigPaths,
} from "../../src/routes/session/sidebar-tools/settings.ts"
import {
  readCursorSessionToken,
  writeCursorSessionToken,
  clearCursorSessionToken,
  cursorSessionSecretPath,
} from "../../src/routes/session/sidebar-tools/cursorToken.ts"
import {
  displayPath,
  everythingSearchArgs,
  everythingSearchQuery,
  MAX_RECENT_ROOTS,
  normalizeRootPath,
  rootPathKey,
  rootSections,
  runEverythingSearch,
  sameRootPath,
} from "../../src/routes/session/sidebar-tools/roots.ts"
import { readScripts, readTree } from "../../src/routes/session/sidebar-tools/scripts.ts"
import { probeClaudeCodePool, probeClaudeCodeUsage } from "../../src/routes/session/sidebar-tools/usage/claude.ts"
import {
  cursorSessionCookie,
  cursorDbPath,
  probeCursorUsage,
} from "../../src/routes/session/sidebar-tools/usage/cursor.ts"
import { resolveAuthPath } from "../../src/routes/session/sidebar-tools/usage/fetch.ts"
import { orderUsageWindows } from "../../src/routes/session/sidebar-tools/usage/format.ts"
import {
  probeOpenAIUsage,
  probeOpenCodeGoUsage,
  probeOpenRouterUsage,
} from "../../src/routes/session/sidebar-tools/usage/probes.ts"
import {
  DEFAULT_USAGE_PROVIDERS,
  normalizeUsageProviders,
  USAGE_PROVIDER_IDS,
} from "../../src/routes/session/sidebar-tools/usage/providers.ts"
import {
  commandArgs,
  copyToClipboard,
  fileClipboardText,
  scriptClipboardText,
  scriptCommand,
  weztermArgs,
  weztermExecutable,
  weztermSendArgs,
  windowsTerminalArgs,
  windowsTerminalScriptArgs,
  runScript,
  placeScript,
} from "../../src/routes/session/sidebar-tools/scriptRunner.ts"

test("keeps retained sidebar builtins while replacing files and footer", () => {
  const ids = createBuiltinPlugins({ experimentalEventSystem: false }).map((plugin) => plugin.id)
  assert.deepEqual(
    ids.filter((id) => id.startsWith("internal:sidebar-")),
    [
      "internal:sidebar-context",
      "internal:sidebar-mcp",
      "internal:sidebar-plugins",
      "internal:sidebar-lsp",
      "internal:sidebar-subagents",
      "internal:sidebar-todo",
    ],
  )
  assert.equal(ids.includes("internal:sidebar-files"), false)
  assert.equal(ids.includes("internal:sidebar-footer"), false)
})

test("reads sorted package scripts", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-tools-"))
  try {
    writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ scripts: { test: "test", build: "build", "bad && delete": "danger" } }),
    )
    assert.deepEqual(
      readScripts(root).map((script) => script.name),
      ["build", "test"],
    )
    const settings = defaultScriptSettings()
    settings.shell = { executable: "bash", args: ["-c"] }
    assert.deepEqual(readScripts(root, root, settings)[0].launcher, settings.shell)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("orders usage windows from shortest to longest", () => {
  const short = { usedPercent: 12, resetAt: "short", resetMs: null, minutes: 24 * 60 }
  const long = { usedPercent: 34, resetAt: "long", resetMs: null, minutes: 30 * 24 * 60 }
  assert.deepEqual(orderUsageWindows([long, short]), [short, long])
})

test("discovers supported files in the active .scripts directory", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-tools-"))
  try {
    mkdirSync(path.join(root, ".scripts"))
    writeFileSync(path.join(root, ".scripts", ".draftRelease.ps1"), "")
    writeFileSync(path.join(root, ".scripts", "notes.txt"), "")
    const scripts = readScripts(root, root)
    assert.deepEqual(
      scripts.map((script) => script.name),
      [path.join(".scripts", ".draftRelease.ps1")],
    )
    assert.match(scripts[0].command, /\.draftRelease\.ps1/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("builds persistent PowerShell arguments for native script runners", () => {
  const args = commandArgs("npm run build")
  assert.deepEqual(args.slice(0, 3), ["-NoLogo", "-NoExit", "-EncodedCommand"])
  assert.equal(Buffer.from(args[3], "base64").toString("utf16le"), "npm run build")
})

test("resolves OpenCode auth paths and parses subscription windows", async () => {
  assert.equal(
    resolveAuthPath({ platform: "win32", env: {}, homeDir: "C:\\Users\\test" }),
    path.join("C:\\Users\\test", "AppData", "Local", "opencode", "auth.json"),
  )
  assert.equal(
    resolveAuthPath({ platform: "linux", env: { XDG_DATA_HOME: "/tmp/data" }, homeDir: "/home/test" }),
    path.join("/tmp/data", "opencode", "auth.json"),
  )

  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(
      authPath,
      JSON.stringify({ openai: { access: "secret", accountId: "account", expires: Date.now() + 60_000 } }),
    )
    let requestUrl = ""
    let requestMethod = ""
    const result = await probeOpenAIUsage({
      authPath,
      fetchImpl: async (url, init) => {
        requestUrl = String(url)
        requestMethod = init?.method ?? "GET"
        return new Response(
          JSON.stringify({
            plan_type: "plus",
            rate_limit: {
              primary_window: { used_percent: 27.5, reset_after_seconds: 3600, limit_window_seconds: 18_000 },
              secondary_window: { used_percent: 101, reset_at: 3600, limit_window_seconds: 604_800 },
            },
          }),
          { status: 200 },
        )
      },
    })
    assert.equal(result.ok, true)
    assert.match(requestUrl, /chatgpt\.com\/backend-api\/wham\/usage$/)
    assert.equal(requestMethod, "GET")
    if (result.ok) {
      assert.equal(result.primary.usedPercent, 27.5)
      assert.equal(result.primary.minutes, 300)
      assert.equal(result.secondary.usedPercent, 100)
      assert.equal(result.primary.fetchedAt, result.secondary.fetchedAt)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects a successful response without usage windows", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openai: { access: "secret" } }))
    const result = await probeOpenAIUsage({
      authPath,
      fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    })
    assert.deepEqual(result, { ok: false })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects malformed usage window values", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openai: { access: "secret" } }))
    const result = await probeOpenAIUsage({
      authPath,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            plan_type: "plus",
            rate_limit: { primary_window: {}, secondary_window: { used_percent: 20 } },
          }),
          { status: 200 },
        ),
    })
    assert.deepEqual(result, { ok: false })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("accepts accounts with no secondary usage window", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openai: { access: "secret" } }))
    const result = await probeOpenAIUsage({
      authPath,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            plan_type: "plus",
            rate_limit: { primary_window: { used_percent: 4, reset_after_seconds: 60 }, secondary_window: null },
          }),
          { status: 200 },
        ),
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.primary.usedPercent, 4)
      assert.equal(result.secondary.usedPercent, null)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("returns a neutral state when OpenCode is not connected to OpenAI", async () => {
  const result = await probeOpenAIUsage({ authPath: path.join(os.tmpdir(), "missing-openai-auth.json") })
  assert.deepEqual(result, { ok: false })
})

test("requires reauthentication for an expired OpenAI OAuth credential", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openai: { access: "secret", expires: 1_000 } }))
    let requested = false
    const result = await probeOpenAIUsage({
      authPath,
      nowMs: 2_000,
      fetchImpl: async () => {
        requested = true
        return new Response("", { status: 200 })
      },
    })
    assert.deepEqual(result, { ok: false, reason: "reauthenticate" })
    assert.equal(requested, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("requires reauthentication for an unauthorized OpenAI usage request", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openai: { access: "secret" } }))
    const result = await probeOpenAIUsage({
      authPath,
      fetchImpl: async () => new Response("", { status: 401 }),
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.reason, "reauthenticate")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("filters generated directories and respects expansion", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-tools-"))
  try {
    mkdirSync(path.join(root, "src", "nested"), { recursive: true })
    mkdirSync(path.join(root, "node_modules"))
    writeFileSync(path.join(root, "src", "main.ts"), "")
    writeFileSync(path.join(root, "src", "nested", "child.ts"), "")
    writeFileSync(path.join(root, ".scripts"), "")
    const tree = readTree(root, new Set(["src"]))
    assert.equal(
      tree.some((entry) => entry.name === "node_modules"),
      false,
    )
    assert.equal(
      tree.some((entry) => entry.name === ".scripts"),
      true,
    )
    assert.equal(
      tree.some((entry) => entry.relativePath === path.join("src", "main.ts")),
      true,
    )
    assert.equal(
      tree.some((entry) => entry.name === "child.ts"),
      false,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("expands directories beyond the old shallow depth limit", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-tools-"))
  try {
    const nested = path.join(root, "one", "two", "three", "four")
    mkdirSync(nested, { recursive: true })
    writeFileSync(path.join(nested, "deep.ts"), "")
    const expanded = new Set([
      "one",
      path.join("one", "two"),
      path.join("one", "two", "three"),
      path.join("one", "two", "three", "four"),
    ])
    const tree = readTree(root, expanded)
    assert.equal(
      tree.some((entry) => entry.name === "deep.ts"),
      true,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("normalizes script settings and extensions", () => {
  const settings = normalizeScriptSettings({
    shell: { executable: " bash ", args: ["-c"] },
    languages: [
      {
        id: "custom",
        title: "Custom",
        enabled: false,
        launcher: { executable: "runner", args: ["--watch"] },
        extensions: ["foo", ".FOO", "bad extension"],
      },
    ],
  })
  assert.deepEqual(settings.shell, { executable: "bash", args: ["-c"] })
  const custom = settings.languages.find((language) => language.id === "custom")
  assert.deepEqual(custom?.extensions, [".foo"])
  assert.equal(custom?.enabled, false)
  assert.equal(
    settings.languages.some((language) => language.id === "powershell"),
    true,
  )
  assert.equal(normalizeExtension(".d.ts"), ".d.ts")
  assert.equal(normalizeExtension("bad extension"), undefined)
})

test("parses custom executable arguments without a shell", () => {
  assert.deepEqual(parseLauncher('runner "--label=hello world"'), ["runner", "--label=hello world"])
  assert.equal(parseLauncher('runner "unterminated'), undefined)
})

test("normalizes native and WezTerm terminal settings", () => {
  assert.equal(normalizeScriptSettings({ terminal: "wezterm-window" }).terminal, "wezterm-window")
  assert.equal(normalizeScriptSettings({ terminal: "unsupported" }).terminal, "native")
  assert.equal(defaultScriptSettings().terminal, "native")
})

test("normalizes WezTerm split sizes and inherits missing defaults", () => {
  const settings = normalizeScriptSettings({
    wezterm: {
      horizontal: { Percent: 30 },
      vertical: { Cells: 20 },
    },
  })
  assert.deepEqual(settings.wezterm, { horizontal: { Percent: 30 }, vertical: { Cells: 20 } })
  assert.deepEqual(
    normalizeScriptSettings({ wezterm: { horizontal: { Percent: 100 }, vertical: { Cells: 0 } } }).wezterm,
    {
      horizontal: { Percent: 50 },
      vertical: { Percent: 50 },
    },
  )
  assert.deepEqual(normalizeScriptSettings({ wezterm: { horizontal: { Cells: 12 } } }).wezterm, {
    horizontal: { Cells: 12 },
    vertical: { Percent: 50 },
  })
})

test("builds shell commands for package and language scripts", () => {
  assert.equal(
    scriptCommand({
      name: "build",
      command: "npm run build",
      terminal: "native",
      launcher: { executable: "pwsh", args: [] },
      weztermSize: { Percent: 50 },
    }),
    "npm run build",
  )
  assert.equal(
    scriptCommand({
      name: "run.ps1",
      command: "",
      filePath: "C:\\work\\safe folder\\run.ps1",
      terminal: "native",
      launcher: { executable: "pwsh", args: ["-File"] },
      weztermSize: { Percent: 50 },
    }),
    "pwsh '-File' 'C:\\work\\safe folder\\run.ps1'",
  )
})

test("formats script and file clipboard text", () => {
  const powershell = {
    name: "push.ps1",
    command: "",
    filePath: "C:\\work\\safe folder\\push.ps1",
    terminal: "native" as const,
    launcher: { executable: "pwsh", args: ["-File"] },
    weztermSize: { Percent: 50 },
  }
  const python = {
    ...powershell,
    name: "run.py",
    filePath: "C:\\work\\run.py",
    launcher: { executable: "python", args: [] },
  }
  assert.equal(scriptClipboardText(powershell), "& 'C:\\work\\safe folder\\push.ps1'")
  assert.equal(scriptClipboardText(python), "python 'C:\\work\\run.py'")
  assert.equal(fileClipboardText("C:\\work\\notes.txt"), "'C:\\work\\notes.txt'")
})

test("writes clipboard text through clip.exe", async () => {
  // copyToClipboard is Windows-only and reports an error elsewhere.
  if (process.platform !== "win32") return
  let command = ""
  let args: string[] = []
  let input = ""
  const result = await copyToClipboard("'C:\\work\\notes.txt'", (nextCommand, nextArgs) => {
    command = nextCommand
    args = nextArgs
    return {
      stdin: {
        end(data: string) {
          input = data
        },
      },
      once(event: "error" | "close", listener: (value?: Error | number | null) => void) {
        if (event === "close") listener(0)
      },
    }
  })
  assert.deepEqual(result, { target: "Clipboard" })
  assert.equal(command, "clip.exe")
  assert.deepEqual(args, [])
  assert.equal(input, "'C:\\work\\notes.txt'")
})

test("maps WezTerm terminal choices to CLI placement arguments", () => {
  assert.deepEqual(weztermArgs("wezterm-tab", "C:\\work"), ["cli", "spawn", "--cwd", "C:\\work"])
  assert.deepEqual(weztermArgs("wezterm-window", "C:\\work"), ["cli", "spawn", "--new-window", "--cwd", "C:\\work"])
  assert.deepEqual(weztermArgs("wezterm-horizontal", "C:\\work", { Percent: 30 }), [
    "cli",
    "split-pane",
    "--horizontal",
    "--percent",
    "30",
    "--cwd",
    "C:\\work",
  ])
  assert.deepEqual(weztermArgs("wezterm-vertical", "C:\\work", { Cells: 20 }), [
    "cli",
    "split-pane",
    "--bottom",
    "--cells",
    "20",
    "--cwd",
    "C:\\work",
  ])
})

test("uses the WezTerm CLI executable when Windows provides the GUI executable", () => {
  if (process.platform !== "win32") return
  assert.equal(
    weztermExecutable("C:\\Users\\test\\Apps\\wezterm\\wezterm-gui.exe"),
    path.join("C:\\Users\\test\\Apps\\wezterm", "wezterm.exe"),
  )
})

test("maps Windows Terminal placements and percentage sizes to CLI arguments", () => {
  const cwd = "C:\\work\\safe folder"
  assert.deepEqual(windowsTerminalArgs("wezterm-tab", cwd), ["-w", "0", "new-tab", "-d", cwd])
  assert.deepEqual(windowsTerminalArgs("wezterm-window", cwd), ["-w", "new", "new-tab", "-d", cwd])
  assert.deepEqual(windowsTerminalArgs("wezterm-horizontal", cwd, { Percent: 30 }), [
    "-w",
    "0",
    "split-pane",
    "-V",
    "--size",
    "0.3",
    "-d",
    cwd,
  ])
  assert.deepEqual(windowsTerminalArgs("wezterm-vertical", cwd, { Percent: 70 }), [
    "-w",
    "0",
    "split-pane",
    "-H",
    "--size",
    "0.7",
    "-d",
    cwd,
  ])
  assert.deepEqual(windowsTerminalArgs("wezterm-vertical", cwd, { Cells: 20 }), [
    "-w",
    "0",
    "split-pane",
    "-H",
    "-d",
    cwd,
  ])
})

test("falls back to native in generic terminals without changing saved targets", () => {
  const settings = normalizeScriptSettings({ terminal: "wezterm-horizontal" })
  assert.deepEqual(scriptTerminals("generic"), [])
  assert.equal(resolveScriptTerminal(settings.terminal, "generic"), "native")
  assert.equal(settings.terminal, "wezterm-horizontal")
  for (const kind of ["wezterm", "windows-terminal"] as const) {
    assert.equal(scriptTerminals(kind).length, 4)
    for (const terminal of scriptTerminals(kind)) {
      assert.equal(resolveScriptTerminal(terminal.id, "generic"), "native")
      assert.equal(resolveScriptTerminal(terminal.id, kind), terminal.id)
    }
    assert.equal(resolveScriptTerminal("native", kind), "native")
  }
})

test("runs the WezTerm command in Windows Terminal from the script directory", () => {
  const script = {
    name: "run.ps1",
    command: "",
    filePath: path.join("C:\\work", "safe folder", "run.ps1"),
    terminal: "wezterm-tab" as const,
    launcher: { executable: "pwsh", args: ["-File"] },
    weztermSize: { Percent: 50 },
  }
  const args = windowsTerminalScriptArgs(script, "C:\\other")
  assert.deepEqual(args.slice(0, -1), [
    "-w",
    "0",
    "new-tab",
    "-d",
    path.dirname(script.filePath),
    "pwsh",
    "-NoLogo",
    "-NoExit",
    "-EncodedCommand",
  ])
  assert.equal(Buffer.from(args.at(-1)!, "base64").toString("utf16le"), weztermSendArgs(script, "7", false).at(-1))
})

test("falls back to native when wt.exe is unavailable without changing the saved target", async () => {
  const script = {
    name: "build",
    command: "npm run build",
    terminal: "wezterm-tab" as const,
    launcher: { executable: "pwsh", args: [] },
    weztermSize: { Percent: 50 },
  }
  const probed: string[] = []
  const launched: Array<{ command: string; args: string[]; cwd: string }> = []
  const result = await runScript(script, "C:\\work", {
    kind: "windows-terminal",
    available: async (command) => {
      probed.push(command)
      return command !== "wt.exe"
    },
    runCommand: async () => {
      throw new Error("WT must not run when unavailable")
    },
    spawnCommand: async (command, args, cwd) => {
      launched.push({ command, args, cwd })
      return { target: command }
    },
  })
  assert.deepEqual(probed, ["wt.exe", "pwsh"])
  assert.deepEqual(launched, [
    {
      command: process.platform === "win32" ? "cmd.exe" : "pwsh",
      args: process.platform === "win32" ? ["/d", "/c", "start", "", "pwsh", script.command] : [script.command],
      cwd: "C:\\work",
    },
  ])
  assert.equal(result.error, undefined)
  assert.equal(script.terminal, "wezterm-tab")
})

test("placing a script in Windows Terminal uses native instead of reporting unsupported placement", async () => {
  const script = {
    name: "build",
    command: "npm run build",
    terminal: "wezterm-horizontal" as const,
    launcher: { executable: "pwsh", args: [] },
    weztermSize: { Percent: 50 },
  }
  const probed: string[] = []
  let nativeLaunches = 0
  const result = await placeScript(script, "C:\\work", {
    kind: "windows-terminal",
    available: async (command) => {
      probed.push(command)
      return true
    },
    runCommand: async () => {
      throw new Error("Placement must use native")
    },
    spawnCommand: async (command) => {
      nativeLaunches++
      return { target: command }
    },
  })
  assert.deepEqual(probed, ["pwsh"])
  assert.equal(nativeLaunches, 1)
  assert.equal(result.error, undefined)
  assert.equal(script.terminal, "wezterm-horizontal")
})

// The prefix lets closeOut in .scripts\scriptHelper.ps1 kill the pane the sidebar made.
test("places commands without submitting them, submits only when running, and marks the pane as owned", () => {
  const script = {
    name: "build",
    command: "npm run build",
    terminal: "wezterm-tab" as const,
    launcher: { executable: "pwsh", args: [] },
    weztermSize: { Percent: 50 },
  }
  assert.deepEqual(weztermSendArgs(script, "7", false), [
    "cli",
    "send-text",
    "--pane-id",
    "7",
    "--no-paste",
    "$env:SCRIPT_OWN_PANE='1'; npm run build",
  ])
  assert.deepEqual(weztermSendArgs(script, "7", true), [
    "cli",
    "send-text",
    "--pane-id",
    "7",
    "--no-paste",
    "$env:SCRIPT_OWN_PANE='1'; npm run build\r",
  ])
})

test("discovers only enabled configured script extensions", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-tools-"))
  try {
    mkdirSync(path.join(root, ".scripts"))
    writeFileSync(path.join(root, ".scripts", "run.foo"), "")
    writeFileSync(path.join(root, ".scripts", "skip.bar"), "")
    const settings = defaultScriptSettings()
    settings.languages = [
      {
        id: "custom",
        title: "Custom",
        enabled: true,
        launcher: { executable: "runner", args: ["--file"] },
        extensions: [".foo"],
      },
      {
        id: "disabled",
        title: "Disabled",
        enabled: false,
        launcher: { executable: "runner", args: [] },
        extensions: [".bar"],
      },
    ]
    const scripts = readScripts(root, root, settings)
    assert.deepEqual(
      scripts.map((script) => script.name),
      [path.join(".scripts", "run.foo")],
    )
    assert.deepEqual(scripts[0].launcher, { executable: "runner", args: ["--file"] })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("orders recent roots and keeps favorites outside the recent limit", () => {
  const roots = Array.from({ length: MAX_RECENT_ROOTS + 2 }, (_, index) => `root-${MAX_RECENT_ROOTS + 1 - index}`)
  const sections = rootSections(roots, ["root-0", "root-0", "root-9"], () => true)
  assert.deepEqual(sections.favoriteRoots, ["root-0", "root-9"])
  assert.deepEqual(sections.recentRoots, [
    "root-8",
    "root-7",
    "root-6",
    "root-5",
    "root-4",
    "root-3",
    "root-2",
    "root-1",
  ])
})

test("filters stale roots and removes duplicate recent entries", () => {
  const sections = rootSections(
    ["missing", "valid", "valid", "favorite"],
    ["favorite", "stale"],
    (root) => root === "valid" || root === "favorite",
  )
  assert.deepEqual(sections, { recentRoots: ["valid"], favoriteRoots: ["favorite"] })
})

test("normalizes root paths for identity on Windows-style separators", () => {
  if (process.platform !== "win32") return
  const first = "C:\\Work\\repo"
  const second = "C:/Work/repo"
  assert.equal(rootPathKey(first), rootPathKey(second))
  assert.ok(sameRootPath(normalizeRootPath(first), normalizeRootPath(second)))
})

test("migrates recent file roots from legacy session customRoots", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-recent-"))
  const custom = path.join(root, "custom")
  mkdirSync(custom)
  try {
    const settings = normalizeSidebarSettings({
      fileRoots: { session: { customRoots: [custom, custom], activeRoot: custom } },
    })
    assert.deepEqual(settings.recentFileRoots, [normalizeRootPath(custom)])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("builds Everything search query scoped to roots", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-es-query-"))
  const nested = path.join(root, "nested")
  mkdirSync(nested)
  try {
    const query = everythingSearchQuery([root, nested], "readme")
    assert.match(query, /readme/)
    assert.doesNotMatch(query, /parent:/)
    assert.match(query, new RegExp(path.basename(root)))
    assert.match(query, /\|/)
    assert.ok(query.includes(`${nested}${path.sep}`))
    assert.doesNotMatch(query, /"/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("parses Everything search output and reports IPC errors", async () => {
  const file = path.join(os.tmpdir(), `sidebar-es-${process.pid}.txt`)
  writeFileSync(file, "sample")
  try {
    let capturedArgs: string[] = []
    const ok = await runEverythingSearch({
      query: "sample",
      roots: [os.tmpdir()],
      spawnImpl: async (_executable, args) => {
        capturedArgs = args
        return { stdout: `${file}\n`, code: 0 }
      },
    })
    assert.equal(ok.ok, true)
    if (ok.ok) {
      assert.equal(ok.entries.length, 1)
      assert.equal(ok.entries[0]?.directory, false)
    }
    assert.equal(capturedArgs.at(-2), "-search")
    assert.match(capturedArgs.at(-1) ?? "", /sample/)
    const ipc = await runEverythingSearch({
      query: "x",
      roots: [os.tmpdir()],
      spawnImpl: async () => ({ stdout: "", code: 8 }),
    })
    assert.deepEqual(ipc, { ok: false, error: "ipc-unavailable" })
    const missing = await runEverythingSearch({
      query: "x",
      roots: [os.tmpdir()],
      spawnImpl: async () => ({
        stdout: "",
        code: null,
        error: Object.assign(new Error("missing"), { code: "ENOENT" }),
      }),
    })
    assert.deepEqual(missing, { ok: false, error: "missing-es" })
    const aborted = new AbortController()
    aborted.abort()
    const cancelled = await runEverythingSearch({
      query: "x",
      roots: [os.tmpdir()],
      signal: aborted.signal,
      spawnImpl: async () => ({ stdout: "", code: 1 }),
    })
    assert.deepEqual(cancelled, { ok: false, error: "aborted" })
  } finally {
    rmSync(file, { force: true })
  }
  assert.deepEqual(everythingSearchArgs("test query"), [
    "-n",
    "80",
    "-timeout",
    "2000",
    "-hide-empty-search-results",
    "-search",
    "test query",
  ])
})

test("returns a neutral state for failed OpenAI usage requests", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openai: { access: "secret" } }))
    const nowMs = 1_700_000_000_000
    const result = await probeOpenAIUsage({
      authPath,
      nowMs,
      fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "120" } }),
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.metadata?.status, 429)
      assert.equal(result.metadata?.retryAt, nowMs + 120_000)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("parses OpenCode Go weekly and monthly usage with reset dates", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-go-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ "opencode-go": { key: "secret" } }))
    let requestUrl = ""
    let authorization = ""
    const result = await probeOpenCodeGoUsage({
      authPath,
      fetchImpl: async (url, init) => {
        requestUrl = String(url)
        authorization = String(new Headers(init?.headers).get("authorization"))
        return new Response(
          JSON.stringify({
            usage: {
              weekly: { status: "ok", percent: 27.5, resetsAt: "2026-08-17T00:00:00.000Z" },
              monthly: { status: "ok", percent: 12.4, resetsAt: "2026-09-01T12:00:00.000Z" },
            },
          }),
          { status: 200 },
        )
      },
    })
    assert.equal(result.ok, true)
    assert.equal(requestUrl, "https://opencode.ai/zen/go/v1/usage")
    assert.equal(authorization, "Bearer secret")
    if (result.ok) {
      const localDatePrefix = (timestamp: string) => {
        const date = new Date(timestamp)
        return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)} ~`
      }
      assert.equal(result.weekly.usedPercent, 27.5)
      assert.equal(result.weekly.minutes, 7 * 24 * 60)
      assert.match(result.weekly.resetAt ?? "", new RegExp(localDatePrefix("2026-08-17T00:00:00.000Z")))
      assert.equal(result.monthly?.usedPercent, 12.4)
      assert.equal(result.monthly.minutes, 30 * 24 * 60)
      assert.match(result.monthly.resetAt ?? "", new RegExp(localDatePrefix("2026-09-01T12:00:00.000Z")))
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("returns null OpenCode Go monthly usage when the response omits it", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-go-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ "opencode-go": { key: "secret" } }))
    const result = await probeOpenCodeGoUsage({
      authPath,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            usage: { weekly: { status: "ok", percent: 4, resetsAt: "2026-08-30T00:00:00.000Z" } },
          }),
          { status: 200 },
        ),
    })
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.weekly.usedPercent, 4)
      assert.equal(result.monthly, null)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("returns a neutral state for failed OpenCode Go usage requests", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-go-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ "opencode-go": { key: "secret" } }))
    const result = await probeOpenCodeGoUsage({
      authPath,
      fetchImpl: async () => new Response("", { status: 503 }),
    })
    assert.equal(result.ok, false)
    if (!result.ok) assert.equal(result.metadata?.status, 503)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("parses OpenRouter key usage against its credit limit", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-or-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openrouter: { type: "api", key: "secret" } }))
    let requestUrl = ""
    let authorization = ""
    const result = await probeOpenRouterUsage({
      authPath,
      fetchImpl: async (url, init) => {
        requestUrl = String(url)
        authorization = String(new Headers(init?.headers).get("authorization"))
        return new Response(JSON.stringify({ data: { limit: 5, limit_remaining: 2.9 } }), { status: 200 })
      },
    })
    assert.equal(result.ok, true)
    assert.equal(requestUrl, "https://openrouter.ai/api/v1/key")
    assert.equal(authorization, "Bearer secret")
    if (result.ok) {
      assert.ok(Math.abs(result.usedPercent - 42) < 1e-9)
      assert.ok(Math.abs(result.remainingPercent - 58) < 1e-9)
      assert.equal(result.usedUsd, 2.1)
      assert.equal(result.limitUsd, 5)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("falls back to the OPENROUTER_API_KEY environment variable", async () => {
  let authorization = ""
  const result = await probeOpenRouterUsage({
    authPath: path.join(os.tmpdir(), "missing-openrouter-auth.json"),
    env: { OPENROUTER_API_KEY: "env-secret" },
    fetchImpl: async (url, init) => {
      authorization = String(new Headers(init?.headers).get("authorization"))
      return new Response(JSON.stringify({ data: { limit: 5, limit_remaining: 5 } }), { status: 200 })
    },
  })
  assert.equal(result.ok, true)
  assert.equal(authorization, "Bearer env-secret")
})

test("returns a neutral state for failed OpenRouter usage requests", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-or-usage-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ openrouter: { type: "api", key: "secret" } }))
    const failed = await probeOpenRouterUsage({
      authPath,
      fetchImpl: async () => new Response("", { status: 503 }),
    })
    assert.equal(failed.ok, false)
    if (!failed.ok) assert.equal(failed.metadata?.status, 503)
    const noLimit = await probeOpenRouterUsage({
      authPath,
      fetchImpl: async () =>
        new Response(JSON.stringify({ data: { limit: null, limit_remaining: 2.9 } }), { status: 200 }),
    })
    assert.deepEqual(noLimit, { ok: false })
    const noRemaining = await probeOpenRouterUsage({
      authPath,
      fetchImpl: async () => new Response(JSON.stringify({ data: { limit: 5 } }), { status: 200 }),
    })
    assert.deepEqual(noRemaining, { ok: false })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("formats displayed paths relative to the home directory", () => {
  assert.equal(
    displayPath("C:\\Users\\example\\Documents\\GitHub\\openSidebar", "C:\\Users\\example"),
    "/~Documents/GitHub/openSidebar",
  )
  assert.equal(displayPath("C:\\Users\\example", "C:\\Users\\example"), "/~")
  assert.equal(displayPath("C:\\Work\\openSidebar", "C:\\Users\\example"), "C:/Work/openSidebar")
})

test("loads user sidebar visibility with nested, legacy and partial project overrides", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-config-"))
  try {
    const paths = sidebarConfigPaths(root, root)
    mkdirSync(path.dirname(paths.user), { recursive: true })
    mkdirSync(path.dirname(paths.project), { recursive: true })
    writeFileSync(paths.user, JSON.stringify({ showMcp: false, showLsp: true, scripts: { terminal: "wezterm-tab" } }))
    writeFileSync(paths.project, JSON.stringify({ showMcp: true, scripts: { terminal: "native" } }))
    const settings = loadSidebarSettings(root, root, paths.user, paths.project)
    assert.deepEqual(settings.visibility, { showMcp: true, showLsp: true })
    assert.equal(settings.scripts.terminal, "native")
    writeFileSync(
      paths.user,
      JSON.stringify({
        showMcp: true,
        showLsp: true,
        visibility: { showMcp: false, showLsp: false },
      }),
    )
    writeFileSync(paths.project, JSON.stringify({ visibility: { showMcp: true } }))
    assert.deepEqual(loadSidebarSettings(root, root).visibility, { showMcp: true, showLsp: false })
    writeFileSync(
      paths.project,
      JSON.stringify({
        showMcp: false,
        showLsp: false,
        visibility: { showMcp: true, showLsp: "invalid" },
      }),
    )
    assert.deepEqual(loadSidebarSettings(root, root).visibility, { showMcp: true, showLsp: false })
    for (const visibility of [null, "invalid", { showMcp: 0, showLsp: null }]) {
      writeFileSync(paths.project, JSON.stringify({ visibility, showMcp: "invalid" }))
      assert.deepEqual(loadSidebarSettings(root, root).visibility, { showMcp: false, showLsp: false })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("distinguishes explicit script config from inherited defaults", () => {
  assert.equal(hasConfiguredScripts({ scripts: {} }), true)
  assert.equal(hasConfiguredScripts({}), false)
  assert.equal(hasConfiguredScripts(undefined), false)
})

test("persists a project directory separately from OpenCode settings", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-config-"))
  const projectDirectory = path.join(root, "project")
  mkdirSync(projectDirectory)
  try {
    const settings = normalizeSidebarSettings({ projectDirectory })
    assert.equal(settings.projectDirectory, projectDirectory)
    assert.equal(normalizeSidebarSettings({ projectDirectory: path.join(root, "missing") }).projectDirectory, undefined)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("resolves a project from an initial cd prompt without changing directories", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-config-"))
  const project = path.join(root, "crow")
  mkdirSync(project)
  try {
    assert.equal(promptProjectDirectory(`cd ${project}`, root), project)
    assert.equal(promptProjectDirectory(`"cd ${project}"`, root), project)
    assert.equal(promptProjectDirectory(`cd ${path.join(root, "missing")}`, root), undefined)
    assert.equal(promptProjectDirectory(`Set directory to ${project}`, root), undefined)
    assert.equal(promptProjectDirectory(`run cd ${project} then npm test`, root), project)
    assert.equal(promptProjectDirectory(`cd ${project}\nSet the shell working directory to that path.`, root), project)
    assert.equal(promptProjectDirectory(`"cd ${project}\nmore lines\ncall a listed tool."`, root), project)
    assert.equal(
      sessionProjectDirectory([{ id: "message", role: "user" }], () => [{ type: "text", text: `cd ${project}` }], root),
      project,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("sidebar settings default to showing MCP and LSP and ignore malformed files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-config-"))
  try {
    const paths = sidebarConfigPaths(root, root)
    mkdirSync(path.dirname(paths.user), { recursive: true })
    writeFileSync(paths.user, "not json")
    assert.deepEqual(loadSidebarSettings(root, root, paths.user, path.join(root, "missing.json")).visibility, {
      showMcp: true,
      showLsp: true,
    })
    assert.deepEqual(normalizeSidebarSettings({ showMcp: false, showLsp: "yes" }).visibility, {
      showMcp: false,
      showLsp: true,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("normalizes persisted pins and session roots", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-config-"))
  const custom = path.join(root, "custom")
  mkdirSync(custom)
  try {
    const settings = normalizeSidebarSettings({
      scriptPins: ["build", "build", 4],
      favoriteFileRoots: [custom, "missing"],
      fileRoots: { session: { customRoots: [custom, custom], activeRoot: custom } },
    })
    assert.deepEqual(settings.scriptPins, ["build"])
    assert.deepEqual(settings.favoriteFileRoots, [custom])
    assert.deepEqual(settings.fileRoots.session, { customRoots: [custom], activeRoot: custom })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("migrates legacy file root pins to favorite file roots", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-favorites-"))
  const custom = path.join(root, "custom")
  mkdirSync(custom)
  try {
    const settings = normalizeSidebarSettings({ fileRootPins: [custom] })
    assert.deepEqual(settings.favoriteFileRoots, [custom])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("writes complete sidebar settings as JSON", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-config-"))
  try {
    const filePath = path.join(root, ".config", "openSidebar.json")
    const settings = defaultScriptSettings()
    const sidebar = normalizeSidebarSettings({
      scripts: settings,
      scriptPins: ["build"],
      visibility: { showMcp: false, showLsp: false },
    })
    saveSidebarSettings(filePath, sidebar)
    assert.deepEqual(loadSidebarSettings(root, root, path.join(root, "missing-user.json"), filePath), sidebar)
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")).visibility, { showMcp: false, showLsp: false })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("saveUserScriptSettings persists a global default applied when the project config has no scripts", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-user-scripts-"))
  try {
    const home = path.join(root, "home")
    const userPath = path.join(home, ".config", "openSidebar", "config.json")
    mkdirSync(path.dirname(userPath), { recursive: true })
    writeFileSync(userPath, JSON.stringify({ showMcp: true, scripts: { terminal: "native" } }))
    saveUserScriptSettings(
      home,
      normalizeScriptSettings({ terminal: "wezterm-vertical", wezterm: { vertical: { Cells: 20 } } }),
    )
    const projectPath = path.join(root, "project", ".config", "openSidebar.json")
    const settings = loadSidebarSettings(path.join(root, "project"), home, userPath, projectPath)
    assert.equal(settings.scripts.terminal, "wezterm-vertical")
    assert.deepEqual(settings.scripts.wezterm.vertical, { Cells: 20 })
    assert.equal(settings.visibility.showMcp, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("weekly usage defaults exclude opt-in providers", () => {
  const settings = normalizeSidebarSettings({})
  assert.deepEqual(settings.usageProviders, ["openai", "cursor", "opencode-go", "openrouter"])
  assert.deepEqual(DEFAULT_USAGE_PROVIDERS, ["openai", "cursor", "opencode-go", "openrouter"])
  assert.deepEqual([...USAGE_PROVIDER_IDS], ["openai", "cursor", "opencode-go", "openrouter", "claude-code"])
})

test("normalizes usage providers by filtering, deduplicating, and preserving an empty list", () => {
  assert.deepEqual(normalizeUsageProviders(["cursor", "openai", "cursor", "unknown", 4]), ["cursor", "openai"])
  assert.deepEqual(normalizeUsageProviders([]), [])
  assert.deepEqual(normalizeUsageProviders("openai"), [...DEFAULT_USAGE_PROVIDERS])
  assert.deepEqual(normalizeSidebarSettings({ usageProviders: [] }).usageProviders, [])
  assert.deepEqual(normalizeSidebarSettings({ usageProviders: ["openrouter", "openrouter", "nope"] }).usageProviders, [
    "openrouter",
  ])
})

test("usage spacing defaults off and accepts only booleans", () => {
  assert.equal(normalizeSidebarSettings({}).usageSpacing, false)
  assert.equal(normalizeSidebarSettings({ usageSpacing: true }).usageSpacing, true)
  assert.equal(normalizeSidebarSettings({ usageSpacing: "yes" }).usageSpacing, false)
})

test("reads Claude Code usage with its OAuth login and falls back to the cached result", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-claude-usage-"))
  try {
    const nowMs = 1_800_000_000_000
    const credentialsPath = path.join(root, ".credentials.json")
    const claudeUsageCachePath = path.join(root, "cache", "claude-usage.json")
    const requests: RequestInit[] = []
    const fetchImpl = async (_input: URL | RequestInfo, init?: RequestInit) => {
      requests.push(init ?? {})
      return Response.json({
        five_hour: { utilization: 8.4, resets_at: "2027-01-20T08:00:00Z" },
        seven_day: { utilization: 101, resets_at: null },
      })
    }
    writeFileSync(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: "tok", expiresAt: nowMs + 1 } }))
    const options = { claudeCredentialsPath: credentialsPath, claudeUsageCachePath, fetchImpl, nowMs }
    const result = await probeClaudeCodeUsage(options)
    assert.equal(result.ok, true)
    if (result.ok) {
      assert.equal(result.fiveHour.usedPercent, 8.4)
      assert.equal(result.weekly.usedPercent, 100)
      assert.equal(result.fiveHour.fetchedAt, nowMs)
      assert.ok(result.fiveHour.resetAt)
      assert.equal(result.weekly.resetAt, null)
    }
    assert.equal((requests[0].headers as Record<string, string>).Authorization, "Bearer tok")
    const rateLimited = await probeClaudeCodeUsage({
      ...options,
      fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    })
    assert.equal(rateLimited.ok, true)
    if (rateLimited.ok) {
      assert.equal(rateLimited.source, "cache")
      assert.equal(rateLimited.metadata?.status, 429)
      assert.equal(rateLimited.metadata?.retryAt, nowMs + 60_000)
    }
    writeFileSync(credentialsPath, JSON.stringify({ claudeAiOauth: { accessToken: "tok", expiresAt: nowMs } }))
    const cached = await probeClaudeCodeUsage(options)
    assert.equal(result.ok && result.source, "live")
    assert.equal(cached.ok && cached.source, "cache")
    if (cached.ok && result.ok) {
      assert.deepEqual(
        [cached.fiveHour.usedPercent, cached.weekly.usedPercent],
        [result.fiveHour.usedPercent, result.weekly.usedPercent],
      )
      // Full cache reads stay last-known: windows read as cached with the original reading time.
      assert.equal(cached.fiveHour.cached, true)
      assert.equal(cached.weekly.cached, true)
      assert.equal(cached.fiveHour.fetchedAt, result.fetchedAt)
    }
    assert.equal(requests.length, 1)
    const reset = await probeClaudeCodeUsage({ ...options, nowMs: Date.parse("2027-01-21T00:00:00Z") })
    assert.equal(reset.ok && reset.source, "cache")
    assert.ok(reset.ok && reset.fiveHour.expired)
    assert.ok(reset.ok && reset.fiveHour.cached)
    if (reset.ok) {
      assert.equal(reset.fiveHour.usedPercent, 0)
      assert.equal(reset.weekly.usedPercent, 100)
      assert.equal(reset.weekly.cached, true)
    }
    rmSync(claudeUsageCachePath)
    assert.deepEqual(await probeClaudeCodeUsage(options), { ok: false, reason: "expired" })
    rmSync(credentialsPath)
    assert.deepEqual(await probeClaudeCodeUsage(options), { ok: false, reason: "signed-out" })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("a Claude pool with one live account reads as live even when another is cached", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-claude-pool-"))
  try {
    const nowMs = 1_800_000_000_000
    const login = (dir: string, expiresAt: number) => {
      mkdirSync(path.join(root, dir), { recursive: true })
      writeFileSync(
        path.join(root, dir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: "tok", expiresAt } }),
      )
    }
    login(".claude", nowMs + 1)
    login(".claudeSecond", nowMs)
    const body = { five_hour: { utilization: 1, resets_at: null }, seven_day: { utilization: 0, resets_at: null } }
    mkdirSync(path.join(root, ".cache", "opencode"), { recursive: true })
    writeFileSync(
      path.join(root, ".cache", "opencode", "claude-usage-claudeSecond.json"),
      JSON.stringify({
        ...body,
        _configDir: path.join(root, ".claudeSecond").replace(/\\/g, "/"),
      }),
    )
    const result = await probeClaudeCodePool(["~/.claude", "~/.claudeSecond"], {
      homeDir: root,
      nowMs,
      fetchImpl: async () => Response.json(body),
    })
    assert.equal(result.ok && result.source, "live")
    assert.equal(result.ok && result.fetchedAt, nowMs)
    assert.deepEqual(result.ok && result.accounts?.map((account) => account.usage.ok && account.usage.source), [
      "live",
      "cache",
    ])
    if (result.ok && result.accounts) {
      assert.match(result.accounts[0].id ?? "", /claude$/i)
      assert.match(result.accounts[1].id ?? "", /claudeSecond$/i)
      assert.equal(result.accounts[0].usage.ok && result.accounts[0].usage.fiveHour.usedPercent, 1)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("saveUserUsageProviders persists the selection without overwriting other sidebar settings", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-user-usage-"))
  try {
    const home = path.join(root, "home")
    const userPath = path.join(home, ".config", "openSidebar", "config.json")
    mkdirSync(path.dirname(userPath), { recursive: true })
    writeFileSync(userPath, JSON.stringify({ showMcp: false, scripts: { terminal: "wezterm-tab" }, extra: "keep" }))
    saveUserUsageProviders(home, ["opencode-go", "openrouter"])
    const stored = JSON.parse(readFileSync(userPath, "utf8")) as {
      extra?: string
      scripts?: { terminal?: string }
      showMcp?: boolean
      usageProviders?: string[]
    }
    assert.equal(stored.extra, "keep")
    assert.equal(stored.showMcp, false)
    assert.equal(stored.scripts?.terminal, "wezterm-tab")
    assert.deepEqual(stored.usageProviders, ["opencode-go", "openrouter"])
    const projectPath = path.join(root, "project", ".config", "openSidebar.json")
    const settings = loadSidebarSettings(path.join(root, "project"), home, userPath, projectPath)
    assert.deepEqual(settings.usageProviders, ["opencode-go", "openrouter"])
    assert.equal(settings.scripts.terminal, "wezterm-tab")
    assert.equal(settings.visibility.showMcp, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

const emptyAuthEnv = { OPENCODE_AUTH_CONTENT: "{}" }

function fakeCursorJwt(sub: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "none", typ: "JWT" })}.${encode({ sub, aud: "https://cursor.com", type: "session" })}.signature`
}

function cursorSummaryResponse(overrides: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      billingCycleStart: "2026-08-18T04:42:35.000Z",
      billingCycleEnd: "2026-09-18T04:42:35.000Z",
      membershipType: "pro",
      isUnlimited: false,
      individualUsage: { plan: { used: 28, limit: 2000, remaining: 1972, totalPercentUsed: 0.0566 } },
      ...overrides,
    }),
    { status: 200 },
  )
}

test("parses Cursor monthly usage with a pasted session cookie", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const missingDb = path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb")
  let requestUrl = ""
  let cookie = ""
  const result = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: missingDb,
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async (url, init) => {
      requestUrl = String(url)
      cookie = String(new Headers(init?.headers).get("cookie"))
      return cursorSummaryResponse()
    },
  })
  assert.equal(result.ok, true)
  assert.equal(requestUrl, "https://cursor.com/api/usage-summary")
  assert.equal(cookie, `WorkosCursorSessionToken=auth0%7Cuser_test%3A%3A${jwt}`)
  if (result.ok) {
    assert.ok(Math.abs((result.monthly.usedPercent ?? 0) - 1.4) < 1e-9)
    assert.equal(result.monthly.apiUsedPercent, null)
    assert.match(result.monthly.resetAt ?? "", /9\/18\/26 ~/)
    assert.equal(result.metadata?.accountSource, "cookie")
  }
})

test("uses Cursor autoPercentUsed when used over limit would disagree", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const result = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb"),
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () =>
      cursorSummaryResponse({
        individualUsage: {
          plan: {
            used: 467,
            limit: 2000,
            remaining: 1533,
            autoPercentUsed: 1.0377777777777777,
            apiPercentUsed: 0,
            totalPercentUsed: 0.9434343434343434,
          },
        },
      }),
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(Math.abs((result.monthly.usedPercent ?? 0) - 1.0377777777777777) < 0.0001)
    assert.equal(result.monthly.apiUsedPercent, 0)
  }
})

test("parses Cursor Other Models API percent independently", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const missingDb = path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb")
  const result = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: missingDb,
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () =>
      cursorSummaryResponse({
        individualUsage: {
          plan: {
            used: 467,
            limit: 2000,
            remaining: 1533,
            autoPercentUsed: 13.4,
            apiPercentUsed: 3.333,
          },
        },
      }),
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.monthly.usedPercent, 13.4)
    assert.equal(result.monthly.apiUsedPercent, 3.333)
  }
  const omitted = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: missingDb,
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () =>
      cursorSummaryResponse({
        individualUsage: { plan: { autoPercentUsed: 13 } },
      }),
  })
  assert.equal(omitted.ok, true)
  if (omitted.ok) {
    assert.equal(omitted.monthly.usedPercent, 13)
    assert.equal(omitted.monthly.apiUsedPercent, null)
  }
})

test("builds a session cookie from a bare Cursor JWT", () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  assert.equal(cursorSessionCookie(jwt), `auth0%7Cuser_test%3A%3A${jwt}`)
  assert.equal(cursorSessionCookie(`auth0|user_test%3A%3A${jwt}`), `auth0%7Cuser_test%3A%3A${jwt}`)
  assert.equal(cursorSessionCookie("not-a-jwt"), undefined)
  assert.equal(cursorSessionCookie(""), undefined)
})

test("auto-reads the Cursor session token from state.vscdb", async (t) => {
  if (process.platform === "win32") {
    t.skip("Bun keeps node:sqlite database handles open on Windows during cleanup")
    return
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-db-"))
  try {
    let sqlite: typeof import("node:sqlite")
    try {
      sqlite = await import("node:sqlite")
    } catch {
      t.skip("node:sqlite unavailable")
      return
    }
    const dbPath = path.join(root, "state.vscdb")
    const jwt = fakeCursorJwt("auth0|user_db")
    const db = new sqlite.DatabaseSync(dbPath)
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)")
    db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run("cursorAuth/accessToken", jwt)
    db.close()
    let cookie = ""
    const result = await probeCursorUsage({
      env: emptyAuthEnv,
      cursorDbPath: dbPath,
      fetchImpl: async (url, init) => {
        cookie = String(new Headers(init?.headers).get("cookie"))
        return cursorSummaryResponse()
      },
    })
    assert.equal(result.ok, true)
    assert.equal(cookie, `WorkosCursorSessionToken=auth0%7Cuser_db%3A%3A${jwt}`)
    assert.equal(result.metadata?.accountSource, "desktop")
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
})

test("prefers a pasted Cursor session token over the desktop app database", async (t) => {
  if (process.platform === "win32") {
    t.skip("Bun keeps node:sqlite database handles open on Windows during cleanup")
    return
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-db-first-"))
  try {
    let sqlite: typeof import("node:sqlite")
    try {
      sqlite = await import("node:sqlite")
    } catch {
      t.skip("node:sqlite unavailable")
      return
    }
    const dbPath = path.join(root, "state.vscdb")
    const dbJwt = fakeCursorJwt("auth0|user_db")
    const pasteJwt = fakeCursorJwt("auth0|user_paste")
    const db = new sqlite.DatabaseSync(dbPath)
    db.exec("CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)")
    db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)").run("cursorAuth/accessToken", dbJwt)
    db.close()
    let cookie = ""
    const result = await probeCursorUsage({
      env: emptyAuthEnv,
      cursorDbPath: dbPath,
      cursorSessionToken: `auth0|user_paste::${pasteJwt}`,
      fetchImpl: async (_url, init) => {
        cookie = String(new Headers(init?.headers).get("cookie"))
        return cursorSummaryResponse()
      },
    })
    assert.equal(result.ok, true)
    assert.equal(cookie, `WorkosCursorSessionToken=auth0%7Cuser_paste%3A%3A${pasteJwt}`)
    assert.equal(result.metadata?.accountSource, "cookie")
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
})

test("prefers OpenCode Cursor OAuth over desktop and pasted tokens", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-oc-auth-"))
  try {
    const authPath = path.join(root, "auth.json")
    const jwt = fakeCursorJwt("auth0|user_oc")
    writeFileSync(
      authPath,
      JSON.stringify({ cursor: { type: "oauth", access: jwt, refresh: "refresh", expires: Date.now() + 60_000 } }),
    )
    let cookie = ""
    const result = await probeCursorUsage({
      authPath,
      cursorDbPath: path.join(root, "missing", "state.vscdb"),
      cursorSessionToken: `auth0|user_paste::${fakeCursorJwt("auth0|user_paste")}`,
      fetchImpl: async (_url, init) => {
        cookie = String(new Headers(init?.headers).get("cookie"))
        return cursorSummaryResponse()
      },
    })
    assert.equal(result.ok, true)
    assert.equal(cookie, `WorkosCursorSessionToken=auth0%7Cuser_oc%3A%3A${jwt}`)
    assert.equal(result.ok && result.metadata?.accountSource, "opencode")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("does not fall back to desktop when configured OpenCode Cursor auth fails", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-oc-fail-"))
  try {
    const authPath = path.join(root, "auth.json")
    const jwt = fakeCursorJwt("auth0|user_oc")
    writeFileSync(
      authPath,
      JSON.stringify({ cursor: { type: "oauth", access: jwt, refresh: "refresh", expires: Date.now() + 60_000 } }),
    )
    let called = false
    const result = await probeCursorUsage({
      authPath,
      cursorSessionToken: `auth0|user_paste::${fakeCursorJwt("auth0|user_paste")}`,
      fetchImpl: async () => {
        called = true
        return new Response("", { status: 401 })
      },
    })
    assert.equal(called, true)
    assert.deepEqual(result, {
      ok: false,
      reason: "reauthenticate",
      metadata: { status: 401, accountSource: "opencode" },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("treats crsr API keys in OpenCode auth as unavailable without desktop fallback", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-crsr-"))
  try {
    const authPath = path.join(root, "auth.json")
    writeFileSync(authPath, JSON.stringify({ cursor: { type: "api", key: "crsr_secret" } }))
    const dbPath = path.join(root, "state.vscdb")
    let called = false
    const result = await probeCursorUsage({
      authPath,
      cursorDbPath: dbPath,
      fetchImpl: async () => {
        called = true
        return cursorSummaryResponse()
      },
    })
    assert.equal(called, false)
    assert.deepEqual(result, { ok: false, reason: "need-token", metadata: { accountSource: "opencode" } })
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
})

test("resolves the Cursor state database path per platform", () => {
  assert.equal(
    cursorDbPath({
      platform: "win32",
      env: { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
      homeDir: "C:\\Users\\test",
    }),
    path.join("C:\\Users\\test\\AppData\\Roaming", "Cursor", "User", "globalStorage", "state.vscdb"),
  )
  assert.equal(
    cursorDbPath({ platform: "darwin", env: {}, homeDir: "/Users/test" }),
    path.join("/Users/test", "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb"),
  )
  assert.equal(
    cursorDbPath({ platform: "linux", env: { XDG_CONFIG_HOME: "/tmp/config" }, homeDir: "/home/test" }),
    path.join("/tmp/config", "Cursor", "User", "globalStorage", "state.vscdb"),
  )
})

test("requests a Cursor session token when none is available", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-missing-"))
  try {
    const result = await probeCursorUsage({
      env: emptyAuthEnv,
      cursorDbPath: path.join(root, "missing", "state.vscdb"),
      fetchImpl: async () => {
        throw new Error("should not be called")
      },
    })
    assert.deepEqual(result, { ok: false, reason: "need-token" })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("requires a fresh Cursor session token for unauthorized requests", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const result = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb"),
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () => new Response("", { status: 401 }),
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.reason, "reauthenticate")
    assert.equal(result.metadata?.status, 401)
  }
})

test("returns a neutral state for failed Cursor usage requests", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const missingDb = path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb")
  const failed = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: missingDb,
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () => new Response("", { status: 503 }),
  })
  assert.equal(failed.ok, false)
  if (!failed.ok) assert.equal(failed.metadata?.status, 503)
  const malformed = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: missingDb,
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () =>
      new Response(JSON.stringify({ billingCycleEnd: "2026-09-18T04:42:35.000Z" }), { status: 200 }),
  })
  assert.deepEqual(malformed, { ok: false })
})

test("never uses the Cursor billing cycle start as the reset", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const result = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb"),
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () => cursorSummaryResponse({ billingCycleEnd: undefined }),
  })
  assert.deepEqual(result, { ok: false })
})

test("shows an unlimited Cursor plan with its reset date", async () => {
  const jwt = fakeCursorJwt("auth0|user_test")
  const result = await probeCursorUsage({
    env: emptyAuthEnv,
    cursorDbPath: path.join(os.tmpdir(), "sidebar-cursor-missing-db", "state.vscdb"),
    cursorSessionToken: `auth0|user_test::${jwt}`,
    fetchImpl: async () => cursorSummaryResponse({ isUnlimited: true }),
  })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.monthly.usedPercent, null)
    assert.equal(result.monthly.apiUsedPercent, null)
    assert.match(result.monthly.resetAt ?? "", /9\/18\/26 ~/)
  }
})

test("persists a Cursor session token without disturbing other settings", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-config-"))
  try {
    const configPath = path.join(root, ".config", "openSidebar", "config.json")
    const secretPath = cursorSessionSecretPath(root)
    assert.equal(readCursorSessionToken(root), undefined)
    mkdirSync(path.dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify({ showMcp: false, visibility: { showMcp: false } }))
    writeCursorSessionToken(root, "  auth0|user_test::eyJ.eyJ.x  ")
    const settings = JSON.parse(readFileSync(configPath, "utf8"))
    assert.equal(settings.showMcp, false)
    assert.equal(settings.cursorSessionToken, undefined)
    assert.equal(readFileSync(secretPath, "utf8").trim(), "auth0|user_test::eyJ.eyJ.x")
    assert.equal(readCursorSessionToken(root), "auth0|user_test::eyJ.eyJ.x")
    writeCursorSessionToken(root, "next-token")
    assert.equal(readCursorSessionToken(root), "next-token")
    assert.equal(JSON.parse(readFileSync(configPath, "utf8")).cursorSessionToken, undefined)
    clearCursorSessionToken(root)
    assert.equal(readCursorSessionToken(root), undefined)
    assert.equal(existsSync(secretPath), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("moves a Cursor session token out of config.json into the secrets file", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sidebar-cursor-migrate-"))
  try {
    const configPath = path.join(root, ".config", "openSidebar", "config.json")
    mkdirSync(path.dirname(configPath), { recursive: true })
    writeFileSync(configPath, JSON.stringify({ showMcp: false, cursorSessionToken: "legacy-token" }))
    assert.equal(readCursorSessionToken(root), "legacy-token")
    const settings = JSON.parse(readFileSync(configPath, "utf8"))
    assert.equal(settings.showMcp, false)
    assert.equal(settings.cursorSessionToken, undefined)
    assert.equal(readFileSync(cursorSessionSecretPath(root), "utf8").trim(), "legacy-token")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("enables the host session scrollbar only when the key was never set", () => {
  const writes: Array<[string, unknown]> = []
  const kv = {
    store: new Map<string, unknown>(),
    get(key: string) {
      return this.store.get(key)
    },
    set(key: string, value: unknown) {
      writes.push([key, value] as [string, unknown])
      this.store.set(key, value)
    },
  }
  ensureSessionScrollbarVisible(kv)
  assert.deepEqual(writes, [[OPENCODE_SESSION_SCROLLBAR_KEY, true]])
  writes.length = 0
  ensureSessionScrollbarVisible(kv)
  assert.deepEqual(writes, [])
  kv.store.set(OPENCODE_SESSION_SCROLLBAR_KEY, false)
  ensureSessionScrollbarVisible(kv)
  assert.deepEqual(writes, [])
  assert.equal(kv.store.get(OPENCODE_SESSION_SCROLLBAR_KEY), false)
})
