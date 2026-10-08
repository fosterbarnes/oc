// Drives oc's real TUI, run from source, inside a WezTerm pane so a test can read what the screen
// shows. Opt-in (OC_TUI_PANE=1): needs wezterm on PATH and the `claude` CLI. The test starts its
// own headless wezterm-mux-server with its own config and socket, so the user's WezTerm window is
// never touched. The pane gets the CLI fixture's isolated oc home, a file OPENCODE_DB, and Claude
// pointed at TestLLMServer, through the server's env and its config (see `openPane`).
import { describe, expect } from "bun:test"
import { Database } from "bun:sqlite"
import path from "node:path"
import { Effect } from "effect"
import { cliIt, hostEnv, isolatedEnv, type CliFixture } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { reply } from "../../lib/llm-server"
import { chatConfig, claudeEnv, expectIsolated, initRepo, outsideProfile } from "./chat-fixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")
const muxPath = Bun.which("wezterm-mux-server")
const opencodeRoot = path.resolve(import.meta.dir, "../../..")

describe.skipIf(!process.env.OC_TUI_PANE || !cliPath || !muxPath)("oc TUI in a WezTerm pane", () => {
  if (process.platform === "win32") cliIt.live(
    "cleanup tolerates a test child that already exited",
    () => Effect.gen(function* () {
      const result = yield* Effect.promise(() => powershell([
        "$process = Start-Process pwsh -ArgumentList '-NoProfile', '-NonInteractive', '-Command', 'exit 0' -WindowStyle Hidden -PassThru",
        "$process.WaitForExit()",
        "$item = @{ ProcessId = $process.Id }",
        ...stopPaneChild(),
        "$process.Dispose()",
      ].join("\n")))
      expect(result.exitCode, result.stderr.toString()).toBe(0)
    }),
    30_000,
  )
  cliIt.live(
    "Esc interrupts a turn and the next reply has no abandoned text",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.push(reply().text("SUMMARY-LEFTOVER").hang())
        yield* fixture.llm.text("FRESH-REPLY")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("summarize files\r")
        yield* pane.waitFor("SUMMARY-LEFTOVER")
        yield* pane.type("\x1b")
        yield* pane.waitFor("again to interrupt")
        yield* pane.type("\x1b")
        yield* pane.waitFor("interrupted")
        yield* pane.type("ignore that, reply again\r")
        const shown = yield* pane.waitFor("FRESH-REPLY")
        expect(shown).toContain("ignore that, reply again")
        expect(shown.slice(shown.lastIndexOf("ignore that, reply again"))).not.toContain("SUMMARY-LEFTOVER")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )
  cliIt.live(
    "a prompt typed into the TUI shows the fake model's reply",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.text("PONG-FROM-FAKE")

        yield* pane.waitFor("Ask anything")
        yield* pane.type("hello")
        yield* pane.type("\r")
        yield* pane.waitFor("PONG-FROM-FAKE")

        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(1)
        expectIsolated(inputs)
        // The chat landed in the fixture database, not one named by the user's environment.
        expect(yield* pane.sessions).toBeGreaterThan(0)
      }),
    180_000,
  )
  cliIt.live(
    "question form keys send the selected answer to Claude",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.tool("mcp__opencode_proxy__question", {
          questions: [{
            question: "Should I delete ocToolCheck.txt?",
            header: "Delete file",
            options: [
              { label: "Yes", description: "Delete it" },
              { label: "No", description: "Keep it" },
            ],
          }],
        })
        yield* fixture.llm.text("keeping ocToolCheck.txt")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("ask before deleting\r")
        yield* pane.waitFor("Should I delete ocToolCheck.txt?")
        yield* pane.waitFor("Keep it")
        yield* pane.type("2")
        yield* pane.waitFor("keeping ocToolCheck.txt")
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(2)
        expect(JSON.stringify((inputs[1].messages as unknown[]).at(-1))).toContain(
          JSON.stringify('"Should I delete ocToolCheck.txt?"="No"').slice(1, -1),
        )
        expectIsolated(inputs)
      }),
    180_000,
  )
  cliIt.live(
    "todos enabled shows Claude's todo panel",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.tool("TodoWrite", {
          todos: [
            { content: "check revert", status: "completed", activeForm: "Checking revert" },
            { content: "check todos", status: "pending", activeForm: "Checking todos" },
          ],
        })
        yield* fixture.llm.text("TODO-REPLY")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("make two todos\r")
        yield* pane.waitFor("TODO-REPLY")
        const shown = yield* pane.waitFor("check todos")
        // Sidebar is the rightmost 42 columns; tool rows in the chat cannot satisfy this.
        const sidebar = shown.split("\n").map((line) => line.slice(118)).join("\n")
        expect(sidebar).toContain("Todo")
        expect(sidebar).toContain("check revert")
        expect(sidebar).toContain("check todos")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )
  cliIt.live(
    "/compact shows the Compacted divider",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.text("NOTED-77")
        yield* fixture.llm.text("SUMMARY-77: the codeword is PELICAN-77")
        yield* fixture.llm.text("AFTER-COMPACT: PELICAN-77")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("remember PELICAN-77\r")
        yield* pane.waitFor("NOTED-77")
        yield* pane.type("/compact")
        yield* pane.type("\r")
        yield* pane.waitFor("Compacted")
        yield* pane.type("codeword?\r")
        // Not the summary's own text, so this proves the turn after compaction.
        yield* pane.waitFor("AFTER-COMPACT: PELICAN-77")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )
  cliIt.live(
    "an API error the CLI reports twice shows once",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.error(400, { type: "error", error: { type: "invalid_request_error", message: "FAKE-BAD-REQUEST-81" } })
        yield* fixture.llm.text("AFTER-ERROR")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("codeword?\r")
        yield* pane.waitFor("FAKE-BAD-REQUEST-81")
        yield* pane.type("again\r")
        // The duplicate used to land when the failed turn ended, before the next reply.
        const shown = yield* pane.waitFor("AFTER-ERROR")
        expect(shown.split("FAKE-BAD-REQUEST-81")).toHaveLength(2)
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )
  cliIt.live(
    "rewinding Claude shows the provider notice in the transcript",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.text("noted")
        yield* fixture.llm.text("noted")
        yield* fixture.llm.text("NOTICE-REPLY")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("remember PELICAN-77\r")
        yield* pane.waitFor("noted")
        yield* pane.type("new codeword OSPREY-12\r")
        // Wait for the second reply, not the first identical one still on screen.
        yield* pane.waitFor("new codeword OSPREY-12", (shown) => shown.split("noted").length === 3)
        yield* pane.type("/undo")
        yield* pane.type("\r")
        yield* pane.waitFor("reverted")
        yield* pane.type("\x15")
        yield* pane.type("codeword?\r")
        yield* pane.waitFor("NOTICE-REPLY")
        yield* pane.waitFor("Claude conversation rewound")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )
})

// Starts the mux server with oc as its first pane, in a git-inited `work` folder under a root
// outside the profile (see `outsideProfile`). Scoped: closing the pane and the server comes
// before the root is removed.
const openPane = Effect.fnUntraced(function* (fixture: CliFixture) {
  const root = yield* outsideProfile
  const project = path.join(root, "work")
  yield* initRepo(project)
  const socket = path.join(root, "wezterm.sock")
  const configFile = path.join(root, "wezterm.lua")
  const config = { ...chatConfig(fixture.llm.url), model: "claude-code/claude-sonnet-4-5" }
  const db = path.join(fixture.home, "opencode.db")
  const paneEnv = {
    ...isolatedEnv(fixture.home, JSON.stringify(config)),
    ...claudeEnv(root, fixture.llm.url),
    // The test preload's in-memory database is per process; the pane is a separate process.
    OPENCODE_DB: db,
  }
  // On Windows WezTerm builds each pane's env from its own env overlaid with the registry's
  // (HKCU\Environment), so a user-level OPENCODE_DB there sent panes to the real database.
  // `set_environment_variables` is applied after that overlay. JSON strings are valid Lua strings.
  // `Hold` keeps the pane open after oc exits, so a startup crash stays readable by `waitFor`.
  yield* Effect.promise(() =>
    Bun.write(
      configFile,
      [
        "return {",
        `  unix_domains = { { name = "ocTest", socket_path = [[${socket}]] } },`,
        "  initial_cols = 160, initial_rows = 40, exit_behavior = 'Hold',",
        "  set_environment_variables = {",
        ...Object.entries(paneEnv).map(([key, value]) => `    [${JSON.stringify(key)}] = ${JSON.stringify(value)},`),
        "  },",
        "}",
        "",
      ].join("\n"),
    ),
  )
  // WEZTERM_PANE would aim `wezterm cli` at the user's pane. An oc session can also inherit a dead
  // GUI's socket; `--no-auto-start` stops `wezterm cli` from spawning a stray mux server then.
  const cliEnv = {
    ...Object.fromEntries(Object.entries(hostEnv()).filter(([key]) => key !== "WEZTERM_PANE")),
    WEZTERM_UNIX_SOCKET: socket,
  }
  const serverEnv = { ...cliEnv, ...paneEnv }
  const wez = (args: string[]) => Bun.$`wezterm cli --no-auto-start ${args}`.env(cliEnv).quiet().text()

  // `bun dev`'s shape: bun must start in packages/opencode to load its bunfig preload (Solid JSX).
  const command = ["bun", "run", "--cwd", opencodeRoot, "src/index.ts", project]
  // Never throws once the server is spawned, so the release below always runs.
  const server = yield* Effect.acquireRelease(
    Effect.promise(async () => {
      const proc = Bun.spawn([muxPath!, "--config-file", configFile, "--cwd", project, "--", ...command], {
        env: serverEnv,
        stdio: ["ignore", "ignore", "ignore"],
      })
      if (process.platform !== "win32") return { proc, created: "" }
      const created = await powershell(`${cimProcess(proc.pid)}.CreationDate.ToFileTimeUtc()`)
      return { proc, created: created.exitCode === 0 ? created.stdout.toString().trim() : "" }
    }),
    (server) =>
      Effect.promise(async () => {
        if (process.platform === "win32") {
          // Stops only processes this test started. Anchor: the mux server, identified by the CIM
          // creation time recorded at spawn (a reused PID has a different one). A descendant is a
          // process whose parent is in the tree and was created no earlier than that parent, so a
          // live parent rules out PID reuse. Each process is rechecked right before it is stopped.
          // CIM is compared to CIM only: Get-Process.StartTime has a different precision.
          // `taskkill /T` once followed reused PIDs into unrelated processes; never use it here.
          const result =
            server.created && server.proc.exitCode === null
              ? await powershell(
                  [
                    `$root = ${cimProcess(server.proc.pid)}`,
                    `if (-not $root -or $root.CreationDate.ToFileTimeUtc() -ne ${server.created}) { throw 'mux server identity changed' }`,
                    "$all = @(Get-CimInstance Win32_Process)",
                    "$tree = @($root)",
                    "for ($i = 0; $i -lt $tree.Count; $i++) {",
                    "  $parent = $tree[$i]",
                    "  $tree += @($all | Where-Object { $_.ParentProcessId -eq $parent.ProcessId -and $_.CreationDate -ge $parent.CreationDate })",
                    "}",
                    "$leaves = @($tree | Select-Object -Skip 1)",
                    "[array]::Reverse($leaves)",
                    "foreach ($item in $leaves) {",
                    `  $live = ${cimProcess("$item.ProcessId")}`,
                    "  if ($live -and $live.CreationDate -eq $item.CreationDate) {",
                    ...stopPaneChild(),
                    "  }",
                    "}",
                  ].join("\n"),
                )
              : undefined
          // Bun kills through its own process handle, which a reused PID cannot redirect.
          server.proc.kill()
          await server.proc.exited
          if (result?.exitCode === 0) return
          throw new Error(
            `Pane cleanup did not stop the mux server's descendants (bun, claude); they may still be running. ${result?.stderr.toString() ?? "Mux server identity unknown or it exited early."}`,
          )
        }
        await wez(["list", "--format", "json"])
          .then((list) => JSON.parse(list) as { pane_id: number }[])
          .then((panes) => Promise.all(panes.map((item) => wez(["kill-pane", "--pane-id", String(item.pane_id)]))))
          .catch(() => undefined)
        server.proc.kill()
        await server.proc.exited
      }),
  )
  const paneID = yield* pollWithTimeout(
    Effect.promise(() =>
      wez(["list", "--format", "json"]).then(
        (list) => (JSON.parse(list) as { pane_id: number }[])[0]?.pane_id,
        () => (server.proc.exitCode === null ? undefined : Promise.reject(new Error("mux server exited"))),
      ),
    ),
    "mux server never listed a pane",
    "30 seconds",
  )
  const screen = Effect.promise(() => wez(["get-text", "--pane-id", String(paneID)]))
  return {
    // Sessions the pane's oc stored in the fixture database.
    sessions: Effect.sync(() => {
      const database = new Database(db, { readonly: true })
      const count = database.query("select count(*) as count from session").get() as { count: number }
      database.close()
      return count.count
    }),
    type: (text: string) => Effect.promise(() => wez(["send-text", "--pane-id", String(paneID), "--no-paste", text])),
    // Polls the visible screen; on timeout the error carries the last screen.
    waitFor: (text: string, matches: (shown: string) => boolean = () => true) =>
      pollWithTimeout(
        Effect.sleep("250 millis").pipe(
          Effect.andThen(screen),
          Effect.map((shown) => (shown.includes(text) && matches(shown) ? shown : undefined)),
        ),
        `"${text}" never appeared`,
        "60 seconds",
      ).pipe(
        Effect.catchCause((cause) =>
          screen.pipe(Effect.flatMap((shown) => Effect.fail(new Error(`${String(cause)}. Screen:\n${shown}`)))),
        ),
      ),
  }
})

// The child can exit between the CIM identity check and Stop-Process. Tolerate only absence;
// access failures and a reused PID still fail cleanup without another termination attempt.
const stopPaneChild = () => [
  "try { Stop-Process -Id $item.ProcessId -Force } catch {",
  "  if ($_.FullyQualifiedErrorId -notlike 'NoProcessFoundForGivenId,*') { throw }",
  `  if (${cimProcess("$item.ProcessId")}) { throw }`,
  "}",
]

// Windows only. Callers check exitCode; any error fails the script.
const powershell = (script: string) =>
  Bun.$`pwsh -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(`$ErrorActionPreference = 'Stop'\n${script}`, "utf16le").toString("base64")}`
    .nothrow()
    .quiet()

const cimProcess = (pid: number | string) => `(Get-CimInstance Win32_Process -Filter ('ProcessId=' + ${pid}))`
