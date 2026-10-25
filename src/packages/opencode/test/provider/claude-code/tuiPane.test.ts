// oc's real TUI in a WezTerm pane, driven through `openPane` (paneFixture.ts). Opt-in
// (OC_TUI_PANE=1): needs wezterm on PATH and the `claude` CLI.
import { describe, expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { cliIt } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { reply } from "../../lib/llm-server"
import { expectIsolated } from "./chatFixture"
import { openPane, paneReady, powershell, stopPaneChild } from "./paneFixture"
import { QUOTA_MENU_HOURLY_UPDATED } from "./quotaFixture"

describe.skipIf(!paneReady)("oc TUI in a WezTerm pane", () => {
  cliIt.live(
    "steering actions preserve edited text and show QUEUED, SENT, and whole-turn revert",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture, { steering: true })
        const ready = path.join(pane.project, "steeringReady")
        const release = path.join(pane.project, "steeringRelease")
        const final = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => final.resolve()))
        const project = pane.project.replaceAll("\\", "/")
        yield* fixture.llm.tool("mcp__opencode_proxy__bash", {
          command: `& "${process.execPath}" -e "await Bun.write('${project}/steeringReady', 'ready'); await new Promise(resolve => { const watcher = require('fs').watch('${project}', (_, name) => { if (name === 'steeringRelease') { watcher.close(); resolve(); } }); });"`,
          description: "Hold steering tool",
        })
        yield* fixture.llm.push(reply().wait(final.promise).text("STEERING-PANE-DONE").stop())
        yield* pane.waitFor("Ask anything")
        yield* pane.type("STEERING-PANE-START\r")
        yield* pollWithTimeout(
          Effect.promise(() => Bun.file(ready).exists()).pipe(Effect.map((exists) => (exists ? true : undefined))),
          "proxy tool never became ready",
          "30 seconds",
        )
        yield* pane.type("PANE-EDIT-ME\r")
        yield* pane.waitFor("QUEUED")
        yield* pane.click("PANE-EDIT-ME")
        yield* pane.waitFor("take back and put in the prompt")
        yield* pane.type("\r")
        yield* pane.waitFor(
          "PANE-EDIT-ME",
          (shown) => !shown.includes("QUEUED") && shown.split("PANE-EDIT-ME").length === 2,
        )
        yield* pane.type("\x15")
        yield* pane.type("PANE-DELETE-ME\r")
        yield* pane.waitFor("QUEUED")
        yield* pane.click("PANE-DELETE-ME")
        yield* pane.waitFor("take back before it is sent")
        yield* pane.type("\x1b[B\r")
        yield* pane.waitFor(
          "STEERING-PANE-START",
          (shown) => !shown.includes("PANE-DELETE-ME") && !shown.includes("QUEUED"),
        )
        yield* pane.type("PANE-DELIVERED\r")
        yield* pane.waitFor("QUEUED")
        yield* Effect.promise(() => Bun.write(release, "release"))
        yield* fixture.llm.wait(2)
        yield* pane.waitFor("SENT")
        yield* pane.click("PANE-DELIVERED")
        yield* pane.waitFor("Revert whole turn")
        yield* pane.type("\r")
        yield* pane.waitFor("Revert failed")
        final.resolve()
        yield* pane.waitFor("STEERING-PANE-DONE", (shown) => !/esc\s+interrupt/.test(shown))
        // The reply split where Claude read the message: the rest of the turn renders below it.
        yield* pane.waitFor(
          "read mid-turn",
          (shown) => shown.indexOf("PANE-DELIVERED") < shown.lastIndexOf("STEERING-PANE-DONE"),
        )
        yield* Effect.sleep("2 seconds")
        yield* pane.click("PANE-DELIVERED")
        yield* Effect.sleep("1 second")
        yield* pane.waitFor("Revert whole turn")
        yield* pane.type("\r")
        yield* pane.waitFor("2 messages reverted")
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(2)
        expect(JSON.stringify(inputs[1].messages)).toContain("PANE-DELIVERED")
        expect(JSON.stringify(inputs)).not.toContain("PANE-EDIT-ME")
        expect(JSON.stringify(inputs)).not.toContain("PANE-DELETE-ME")
        expectIsolated(inputs)
      }),
    180_000,
  )
  cliIt.live(
    "oc automatic rename updates a Home-created Claude session title once",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture, { autoRename: true })
        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        yield* fixture.llm.pushMatch(
          (hit) => hit.body.model === "test-model",
          reply().wait(release.promise).text("work - first task").stop(),
        )
        yield* fixture.llm.textMatch((hit) => hit.url.pathname === "/v1/messages", "FIRST-CLAUDE-REPLY")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("fix the first task\r")
        yield* pane.waitFor("FIRST-CLAUDE-REPLY")
        release.resolve()
        yield* pane.waitFor("work - first task")
        yield* fixture.llm.textMatch((hit) => hit.url.pathname === "/v1/messages", "SECOND-CLAUDE-REPLY")
        yield* pane.type("a different second task\r")
        const shown = yield* pane.waitFor("SECOND-CLAUDE-REPLY")
        expect(shown).toContain("work - first task")
        expect((yield* fixture.llm.hits).filter((hit) => hit.body.model === "test-model")).toHaveLength(1)
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )

  if (process.platform === "win32")
    cliIt.live(
      "cleanup tolerates a test child that already exited",
      () =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(() =>
            powershell(
              [
                "$process = Start-Process pwsh -ArgumentList '-NoProfile', '-NonInteractive', '-Command', 'exit 0' -WindowStyle Hidden -PassThru",
                "$process.WaitForExit()",
                "$item = @{ ProcessId = $process.Id }",
                ...stopPaneChild(),
                "$process.Dispose()",
              ].join("\n"),
            ),
          )
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
    "Esc stops a busy main turn alone, then its background subagent",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        // Main turns are Claude (/v1/messages); the subagent runs on the test provider, so each side
        // gets its own scripted replies.
        const main = (hit: { url: URL }) => hit.url.pathname === "/v1/messages"
        const child = (hit: { body: Record<string, unknown> }) => hit.body.model === "test-model"
        yield* fixture.llm.toolMatch(main, "mcp__opencode_proxy__task", {
          description: "esc stage target",
          prompt: "hold",
          subagent_type: "general",
          model: "test/test-model",
          background: true,
        })
        yield* fixture.llm.pushMatch(main, reply().text("MAIN-STILL-BUSY").hang())
        yield* fixture.llm.pushMatch(child, reply().text("CHILD-STILL-BUSY").hang())
        yield* pane.waitFor("Ask anything")
        yield* pane.type("ESC-STAGE-START\r")
        yield* pane.waitFor("MAIN-STILL-BUSY", (shown) => sidebarColumn(shown).includes(". working"))

        yield* pane.type("\x1b")
        yield* pane.waitFor("again to interrupt")
        yield* pane.type("\x1b")
        // Stage 1: the main turn stopped, the subagent did not.
        const afterMain = yield* pane.waitFor("esc stop subagents", (shown) => !/esc\s+interrupt/.test(shown))
        expect(sidebarColumn(afterMain)).toContain(". working")

        yield* pane.type("\x1b")
        yield* pane.waitFor("again to stop subagents")
        yield* pane.type("\x1b")
        // Stage 2: the subagent stopped, and nothing is left for Esc.
        yield* pane.waitFor(
          "stopped",
          (shown) => sidebarColumn(shown).includes(". stopped") && !shown.includes("stop subagents"),
        )

        // A stop sends the main chat no notice, so Claude gets no further request.
        yield* Effect.sleep("2 seconds")
        expect((yield* fixture.llm.hits).filter(main)).toHaveLength(2)
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
          questions: [
            {
              question: "Should I delete ocToolCheck.txt?",
              header: "Delete file",
              options: [
                { label: "Yes", description: "Delete it" },
                { label: "No", description: "Keep it" },
              ],
            },
          ],
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
        const sidebar = shown
          .split("\n")
          .map((line) => line.slice(118))
          .join("\n")
        expect(sidebar).toContain("Todo")
        expect(sidebar).toContain("check revert")
        expect(sidebar).toContain("check todos")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )
  cliIt.live(
    "/contextLimit opens the Context limit action dialog",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* pane.waitFor("Ask anything")
        yield* pane.type("/contextLimit")
        yield* pane.type("\r")
        // The scope picker comes first; "All providers" is selected.
        yield* pane.waitFor("Context limit scope", (shown) => shown.includes("All providers"))
        yield* pane.type("\r")
        const shown = yield* pane.waitFor("Context limit action", (shown) => shown.includes("Handoff"))
        expect(shown).toContain("Compact")
        expect(shown).toContain("Handoff")
        expect(shown).toContain("Off")
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
        yield* fixture.llm.error(400, {
          type: "error",
          error: { type: "invalid_request_error", message: "FAKE-BAD-REQUEST-81" },
        })
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
    "claude warm-up palette opens the schedule dialog",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture, { warmupAuth: true })
        const store = path.join(fixture.home, ".local", "share", "opencode", "claude-code", "warmup.json")
        yield* pane.waitFor("Ask anything")
        yield* pane.type("\x0f")
        yield* pane.waitFor("Commands")
        yield* pane.type("Schedule Claude warm-up")
        const listed = yield* pane.waitFor("Third party harness management")
        expect(listed).toContain("Schedule Claude warm-up:")
        yield* pane.type("\r")
        yield* pane.waitFor("Times: (none)")
        // Selection starts on "Time format", above the mode and Times rows.
        yield* pane.type("\x1b[B")
        yield* pane.type("\x1b[B")
        yield* pane.type("\r")
        yield* pane.waitFor("Times")
        yield* pane.type("07:00")
        const first = yield* pane.waitFor("Est. reset 12:00")
        expect(first).toContain("If this starts a new 5-hour window.")
        yield* pane.paste(", 12:00, 22:00, 07:")
        const dailyPreview = yield* pane.waitFor("Est. reset 17:00")
        expect(dailyPreview).toContain("Est. reset 12:00")
        expect(dailyPreview).toContain("Est. reset 03:00 next day")
        expect(dailyPreview).toContain("If this starts a new 5-hour window.")
        // The trailing incomplete "07:" adds no fourth row: exactly the
        // three complete times preview. ("Send at 07:" is a prefix of the
        // valid "Send at 07:00" row, so count rows instead.)
        expect(dailyPreview.split("Send at")).toHaveLength(4)
        yield* pane.type("\x1b")
        expect(yield* Effect.promise(() => Bun.file(store).exists())).toBe(false)
        yield* pane.type("\x0f")
        yield* pane.waitFor("Search")
        yield* pane.type("Schedule Claude warm-up\r")
        yield* pane.waitFor("Every day")
        yield* pane.type("\x1b[B")
        yield* pane.type("\r")
        const weekday = yield* pane.waitFor("By weekday")
        expect(weekday).toContain("Sunday:")
        // The redraw puts the selection back on "Time format": mode, then Monday..Sunday.
        for (const _ of Array.from({ length: 8 })) yield* pane.type("\x1b[B")
        yield* pane.type("\r")
        yield* pane.type("22:00")
        const sunday = yield* pane.waitFor("Est. reset Monday 03:00")
        expect(sunday).toContain("If this starts a new 5-hour window.")
        yield* pane.type("\x1b")
        expect(yield* Effect.promise(() => Bun.file(store).exists())).toBe(false)
        expect(yield* fixture.llm.inputs).toEqual([])
      }),
    180_000,
  )
  cliIt.live(
    "Claude fractional usage updates in the sidebar and Usage menu during a long turn",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture, { quotaUsage: true })
        const releasePath = pane.releasePath!
        yield* pane.waitFor("Ask anything")
        yield* pane.type("check quota mid-turn\r")
        const mid = yield* pane.waitFor("12.5%h")
        expect(sidebarColumn(mid)).toContain("8.25%w")
        yield* pane.click("Usage:")
        yield* pane.waitFor("5-hour")
        yield* Effect.promise(() => Bun.write(releasePath, "go"))
        yield* pane.waitFor(QUOTA_MENU_HOURLY_UPDATED)
        yield* pane.type("\x1b")
        const sidebar = yield* pane.waitFor("18.5%h", (shown) => sidebarColumn(shown).includes("18.5%h"))
        expect(sidebarColumn(sidebar)).toContain("18.5%h")
        const transcript = yield* pane.waitFor("QUOTA-DONE")
        expect(transcript).toContain("QUOTA-DONE")
        expect((yield* fixture.llm.inputs).length).toBe(0)
      }),
    180_000,
  )
  cliIt.live(
    "sidebar and oc palette entries open their menus",
    (fixture) =>
      Effect.gen(function* () {
        const pane = yield* openPane(fixture)
        yield* fixture.llm.text("MENUS-READY")
        yield* pane.waitFor("Ask anything")
        // Sidebar commands register with the session route's sidebar.
        yield* pane.type("open the sidebar\r")
        yield* pane.waitFor("MENUS-READY")
        // Sidebar commands are keymap commands, not palette entries: open each menu from its header.
        const closes = (shows: string) =>
          Effect.gen(function* () {
            yield* pane.type("\x1b")
            yield* pane.waitFor("MENUS-READY", (screen) => !screen.includes(shows))
          })
        yield* pane.click("files [work]")
        yield* pane.waitFor("Add custom dir...")
        yield* closes("Add custom dir...")
        yield* pane.click("scripts")
        yield* pane.waitFor("Global script settings", (shown) => shown.includes("Languages"))
        yield* closes("Global script settings")
        yield* pane.click("Usage:")
        yield* pane.waitFor("Usage calendar")
        yield* pane.type("Usage calendar")
        yield* pane.type("\r")
        yield* pane.waitFor("Add subscription date...")
        yield* closes("Add subscription date...")
        // Esc in the calendar goes back to the Usage menu.
        yield* closes("Usage calendar")
        yield* pane.type("\x0f")
        yield* pane.waitFor("Commands")
        yield* pane.type("Home sort order")
        const listed = yield* pane.waitFor("Layout")
        expect(listed).toContain("Home sort order")
        yield* pane.type("\x1b")
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

function sidebarColumn(shown: string) {
  return shown
    .split("\n")
    .map((line) => line.slice(118))
    .join("\n")
}
