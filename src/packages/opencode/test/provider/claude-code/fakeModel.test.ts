// Runs the real Claude Code CLI against TestLLMServer's Anthropic endpoint, so Claude chats can
// be driven by a scripted model: no login, no tokens, the same answer every run. Everything the
// CLI writes goes to a temp CLAUDE_CONFIG_DIR. Skipped when no `claude` CLI is installed.
import { describe, expect, test } from "bun:test"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Cause, Effect, Exit, Fiber } from "effect"
import { tmpdir } from "../../fixture/fixture"
import { cliIt, type CliFixture } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { reply, TestLLMServer } from "../../lib/llm-server"
import { chatConfig, claudeEnv, expectIsolated, initRepo, openChat, outsideProfile } from "./chatFixture"
import { flowReport, stepRunner } from "./flowReport"

const handoff = (session: { metadata?: unknown }) =>
  (session.metadata as { ocWorkHandoff?: { phase?: string; error?: string } } | undefined)?.ocWorkHandoff

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

const conflictChat = Effect.fnUntraced(function* (fixture: CliFixture, name: string) {
  const project = path.join(fixture.home, "work")
  yield* initRepo(project)
  yield* Effect.promise(async () => {
    await Bun.$`git config user.name Test`.cwd(project).quiet()
    await Bun.$`git config user.email test@opencode.test`.cwd(project).quiet()
    await Bun.write(path.join(project, "note.txt"), "BASE\n")
    await Bun.$`git add note.txt`.cwd(project).quiet()
    await Bun.$`git -c commit.gpgsign=false commit -m fixture`.cwd(project).quiet()
  })
  const chat = yield* openChat(fixture)
  yield* fixture.llm.text("NOTED")
  yield* chat.prompt("Keep parent and copy intent.")
  const result = yield* Effect.promise(() =>
    chat.sdk.experimental.projectCopy.work({ sessionID: chat.sessionID, name }, { throwOnError: true }),
  )
  const copy = result.data.directory
  yield* Effect.promise(async () => {
    await Bun.write(path.join(project, "note.txt"), "PARENT\n")
    await Bun.write(path.join(copy, "note.txt"), "COPY\n")
  })
  const sdk = createOpencodeClient({ baseUrl: chat.server.url, directory: copy, throwOnError: true })
  return { chat, copy, sdk }
})

describe.skipIf(!cliPath)("Claude Code CLI against TestLLMServer", () => {
  cliIt.live(
    "work handoff: Claude cwd follows work and model completion after the tool turn",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        yield* Effect.promise(async () => {
          await Bun.$`git config user.name Test`.cwd(project).quiet()
          await Bun.$`git config user.email test@opencode.test`.cwd(project).quiet()
          await Bun.write(path.join(project, "note.txt"), "BASE\n")
          await Bun.$`git add note.txt`.cwd(project).quiet()
          await Bun.$`git -c commit.gpgsign=false commit -m fixture`.cwd(project).quiet()
        })
        const chat = yield* openChat(fixture)
        yield* fixture.llm.text("NOTED")
        yield* chat.prompt("Remember the codeword HANDOFF-77.")
        const moved = yield* Effect.promise(() =>
          chat.sdk.experimental.projectCopy.work({ sessionID: chat.sessionID, name: "fake" }, { throwOnError: true }),
        )
        const copy = moved.data.directory
        const sdk = createOpencodeClient({ baseUrl: chat.server.url, directory: copy, throwOnError: true })
        yield* fixture.llm.tool("Read", { file_path: path.join(copy, "note.txt") })
        yield* fixture.llm.tool("Write", { file_path: path.join(copy, "note.txt"), content: "COPY\n" })
        yield* fixture.llm.tool("mcp__opencode_proxy__work_done", {})
        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        yield* fixture.llm.push(reply().wait(release.promise).text("HANDOFF-END").stop())
        const turn = yield* Effect.promise(() =>
          sdk.session.prompt(
            {
              sessionID: chat.sessionID,
              model: { providerID: "claude-code", modelID: "claude-sonnet-4-5" },
              parts: [{ type: "text", text: "Update note.txt, finish work, then stop." }],
            },
            { throwOnError: true },
          ),
        ).pipe(Effect.forkScoped)
        yield* fixture.llm.wait(5)
        expect(
          (yield* Effect.promise(() => sdk.session.get({ sessionID: chat.sessionID }, { throwOnError: true }))).data
            .directory,
        ).toBe(copy)
        expect(yield* Effect.promise(() => Bun.file(path.join(chat.project, "note.txt")).text())).toBe("BASE\n")
        expect(yield* Effect.promise(() => Bun.file(path.join(copy, "note.txt")).text())).toBe("COPY\n")
        release.resolve()
        yield* Fiber.join(turn)
        yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.get({ sessionID: chat.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "complete" ? result.data : undefined)),
          ),
          "model work_done did not finish",
          "30 seconds",
        )
        expect(
          (yield* Effect.promise(() => Bun.file(path.join(chat.project, "note.txt")).text())).replaceAll("\r\n", "\n"),
        ).toBe("COPY\n")
        expect(yield* Effect.promise(() => Bun.file(path.join(copy, ".git")).exists())).toBe(false)
        yield* fixture.llm.text("PARENT-AGAIN")
        yield* chat.prompt("Which directory are you in now?")
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(6)
        expect(JSON.stringify(inputs[1].messages)).toContain(JSON.stringify(copy).slice(1, -1))
        expect(JSON.stringify(inputs[5].messages)).toContain(JSON.stringify(chat.project).slice(1, -1))
        expectIsolated(inputs)
      }),
    120_000,
  )

  cliIt.live(
    "work handoff: queued done stops after cancel and busy work refuses",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        yield* Effect.promise(async () => {
          await Bun.$`git config user.name Test`.cwd(project).quiet()
          await Bun.$`git config user.email test@opencode.test`.cwd(project).quiet()
          await Bun.write(path.join(project, "note.txt"), "BASE\n")
          await Bun.$`git add note.txt`.cwd(project).quiet()
          await Bun.$`git -c commit.gpgsign=false commit -m fixture`.cwd(project).quiet()
        })
        const chat = yield* openChat(fixture)
        yield* fixture.llm.text("NOTED")
        yield* chat.prompt("Remember HANDOFF-77.")
        const moved = yield* Effect.promise(() =>
          chat.sdk.experimental.projectCopy.work({ sessionID: chat.sessionID, name: "cancel" }, { throwOnError: true }),
        )
        const copy = moved.data.directory
        const sdk = createOpencodeClient({ baseUrl: chat.server.url, directory: copy, throwOnError: true })
        yield* fixture.llm.push(reply().text("RUNNING").hang())
        const turn = yield* Effect.promise(() =>
          sdk.session.prompt({
            sessionID: chat.sessionID,
            model: { providerID: "claude-code", modelID: "claude-sonnet-4-5" },
            parts: [{ type: "text", text: "Work slowly." }],
          }),
        ).pipe(Effect.forkScoped)
        yield* fixture.llm.wait(2)
        const busy = yield* Effect.promise(() =>
          sdk.experimental.projectCopy.work({ sessionID: chat.sessionID, name: "refused" }),
        ).pipe(Effect.exit)
        expect(Exit.isFailure(busy)).toBe(true)
        yield* Effect.promise(() =>
          sdk.experimental.projectCopy.done({ sessionID: chat.sessionID }, { throwOnError: true }),
        )
        yield* Effect.promise(() => sdk.session.abort({ sessionID: chat.sessionID }))
        yield* Fiber.join(turn)
        const stopped = yield* pollWithTimeout(
          Effect.promise(() => sdk.session.get({ sessionID: chat.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "stopped" ? result.data : undefined)),
          ),
          "queued handoff did not stop after cancellation",
          "30 seconds",
        )
        expect(stopped.directory).toBe(copy)
        expect(yield* Effect.promise(() => Bun.file(path.join(chat.project, "note.txt")).text())).toBe("BASE\n")
        yield* Effect.promise(() =>
          sdk.experimental.projectCopy.done({ sessionID: chat.sessionID }, { throwOnError: true }),
        )
        yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.get({ sessionID: chat.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "complete" ? result.data : undefined)),
          ),
          "explicit retry did not complete",
          "30 seconds",
        )
        expectIsolated(yield* fixture.llm.inputs)
      }),
    120_000,
  )

  cliIt.live(
    "work handoff: server resolves conflicts and preserves the Claude agent model and permission",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        yield* Effect.promise(async () => {
          await Bun.$`git config user.name Test`.cwd(project).quiet()
          await Bun.$`git config user.email test@opencode.test`.cwd(project).quiet()
          await Bun.write(path.join(project, "note.txt"), "BASE\n")
          await Bun.$`git add note.txt`.cwd(project).quiet()
          await Bun.$`git -c commit.gpgsign=false commit -m fixture`.cwd(project).quiet()
        })
        const chat = yield* openChat(fixture)
        const permission = [{ permission: "bash", pattern: "*", action: "deny" as const }]
        yield* Effect.promise(() =>
          chat.sdk.session.update({ sessionID: chat.sessionID, permission }, { throwOnError: true }),
        )
        yield* fixture.llm.text("NOTED")
        yield* chat.prompt("Remember HANDOFF-77.", { variant: "low" })
        const before = (yield* Effect.promise(() =>
          chat.sdk.session.get({ sessionID: chat.sessionID }, { throwOnError: true }),
        )).data
        const moved = yield* Effect.promise(() =>
          chat.sdk.experimental.projectCopy.work(
            { sessionID: chat.sessionID, name: "resolve" },
            { throwOnError: true },
          ),
        )
        const copy = moved.data.directory
        yield* Effect.promise(async () => {
          await Bun.write(path.join(project, "note.txt"), "PARENT\n")
          await Bun.write(path.join(copy, "note.txt"), "COPY\n")
        })
        yield* fixture.llm.tool("Read", { file_path: path.join(copy, "note.txt") })
        yield* fixture.llm.tool("Write", { file_path: path.join(copy, "note.txt"), content: "PARENT and COPY\n" })
        yield* fixture.llm.tool("mcp__opencode_proxy__work_done", { resolved: ["note.txt"] })
        yield* fixture.llm.text("RESOLVED")
        const sdk = createOpencodeClient({ baseUrl: chat.server.url, directory: copy, throwOnError: true })
        yield* Effect.promise(() =>
          sdk.experimental.projectCopy.done({ sessionID: chat.sessionID }, { throwOnError: true }),
        )
        const finished = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.get({ sessionID: chat.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "complete" ? result.data : undefined)),
          ),
          "server conflict resolution did not finish",
          "45 seconds",
        )
        expect(finished.directory).toBe(project)
        expect(finished.agent).toBe(before.agent)
        expect(finished.model).toEqual(before.model)
        expect(finished.permission).toEqual(before.permission)
        expect(
          (yield* Effect.promise(() => Bun.file(path.join(project, "note.txt")).text())).replaceAll("\r\n", "\n"),
        ).toBe("PARENT and COPY\n")
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(5)
        expect(JSON.stringify(inputs[1].messages)).toContain("refs/oc/work-base/")
        expect(JSON.stringify(inputs[2].messages)).toContain("<<<<<<<")
        expectIsolated(inputs)
      }),
    120_000,
  )

  cliIt.live(
    "work handoff: aborted conflict resolution never merges even after markers were removed",
    (fixture) =>
      Effect.gen(function* () {
        const work = yield* conflictChat(fixture, "abort-resolution")
        yield* fixture.llm.tool("Read", { file_path: path.join(work.copy, "note.txt") })
        yield* fixture.llm.tool("Write", { file_path: path.join(work.copy, "note.txt"), content: "PARENT and COPY\n" })
        yield* fixture.llm.tool("mcp__opencode_proxy__work_done", { resolved: ["note.txt"] })
        yield* fixture.llm.push(reply().text("RESOLVING").hang())
        yield* Effect.promise(() =>
          work.sdk.experimental.projectCopy.done({ sessionID: work.chat.sessionID }, { throwOnError: true }),
        )
        yield* fixture.llm.wait(5)
        yield* Effect.promise(() => work.sdk.session.abort({ sessionID: work.chat.sessionID }, { throwOnError: true }))
        const stopped = yield* pollWithTimeout(
          Effect.promise(() => work.sdk.session.get({ sessionID: work.chat.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "stopped" ? result.data : undefined)),
          ),
          "cancelled resolution did not stop",
          "30 seconds",
        )
        expect(stopped.directory).toBe(work.copy)
        expect(yield* Effect.promise(() => Bun.file(path.join(work.chat.project, "note.txt")).text())).toBe("PARENT\n")
        expect(yield* Effect.promise(() => Bun.file(path.join(work.copy, ".git")).exists())).toBe(true)
        expect(yield* fixture.llm.calls).toBe(5)
        expectIsolated(yield* fixture.llm.inputs)
      }),
    120_000,
  )

  cliIt.live(
    "work handoff: unresolved conflicts stop after exactly two model rounds",
    (fixture) =>
      Effect.gen(function* () {
        const work = yield* conflictChat(fixture, "two-rounds")
        for (const round of [1, 2]) {
          yield* fixture.llm.tool("Read", { file_path: path.join(work.copy, "note.txt") })
          yield* fixture.llm.tool("mcp__opencode_proxy__work_done", { resolved: ["note.txt"] })
          yield* fixture.llm.text(`UNRESOLVED-${round}`)
        }
        yield* fixture.llm.text("MUST-NOT-START-THIRD-ROUND")
        yield* Effect.promise(() =>
          work.sdk.experimental.projectCopy.done({ sessionID: work.chat.sessionID }, { throwOnError: true }),
        )
        const stopped = yield* pollWithTimeout(
          Effect.promise(() => work.sdk.session.get({ sessionID: work.chat.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "stopped" ? result.data : undefined)),
          ),
          "two-round resolution did not stop",
          "45 seconds",
        )
        expect(stopped.directory).toBe(work.copy)
        expect(yield* fixture.llm.calls).toBe(7)
        expect(yield* fixture.llm.pending).toBe(1)
        expect(yield* Effect.promise(() => Bun.file(path.join(work.chat.project, "note.txt")).text())).toBe("PARENT\n")
        expect(yield* Effect.promise(() => Bun.file(path.join(work.copy, "note.txt")).text())).toContain("<<<<<<<")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    120_000,
  )

  cliIt.live(
    "work handoff: a restarted server resumes failed cleanup without another model turn",
    (fixture) =>
      Effect.gen(function* () {
        const work = yield* conflictChat(fixture, "restart-cleanup")
        yield* Effect.promise(() => Bun.$`git worktree lock ${work.copy}`.cwd(work.chat.project).quiet())
        yield* fixture.llm.tool("Read", { file_path: path.join(work.copy, "note.txt") })
        yield* fixture.llm.tool("Write", { file_path: path.join(work.copy, "note.txt"), content: "PARENT and COPY\n" })
        yield* fixture.llm.tool("mcp__opencode_proxy__work_done", { resolved: ["note.txt"] })
        yield* fixture.llm.text("RESOLVED")
        yield* Effect.promise(() =>
          work.sdk.experimental.projectCopy.done({ sessionID: work.chat.sessionID }, { throwOnError: true }),
        )
        yield* pollWithTimeout(
          Effect.promise(() =>
            work.chat.sdk.session.get({ sessionID: work.chat.sessionID }, { throwOnError: true }),
          ).pipe(
            Effect.map((result) =>
              result.data.directory === work.chat.project &&
              handoff(result.data)?.phase === "merged" &&
              handoff(result.data)?.error
                ? result.data
                : undefined,
            ),
          ),
          "cleanup did not reach the moved parent",
          "45 seconds",
        )
        work.chat.server.kill()
        yield* Effect.promise(() => work.chat.server.exited)
        yield* Effect.promise(() => Bun.$`git worktree unlock ${work.copy}`.cwd(work.chat.project).quiet())
        const resumed = yield* openChat(fixture, { resume: work.chat.sessionID })
        yield* Effect.promise(() =>
          resumed.sdk.experimental.projectCopy.done({ sessionID: resumed.sessionID }, { throwOnError: true }),
        )
        const finished = yield* pollWithTimeout(
          Effect.promise(() => resumed.sdk.session.get({ sessionID: resumed.sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (handoff(result.data)?.phase === "complete" ? result.data : undefined)),
          ),
          "restarted cleanup did not finish",
          "30 seconds",
        )
        expect(finished.directory).toBe(work.chat.project)
        expect(yield* Effect.promise(() => Bun.file(path.join(work.copy, ".git")).exists())).toBe(false)
        expect(yield* fixture.llm.calls).toBe(5)
        expect(
          (yield* Effect.promise(() => Bun.file(path.join(work.chat.project, "note.txt")).text())).replaceAll(
            "\r\n",
            "\n",
          ),
        ).toBe("PARENT and COPY\n")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    150_000,
  )

  cliIt.live(
    "oc's claude-code provider returns local time through the default proxy",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        yield* fixture.llm.tool("mcp__opencode_proxy__time", {})
        yield* fixture.llm.text("TIME-RECEIVED")
        const result = yield* fixture.opencode.run("Call the time tool.", {
          model: "claude-code/claude-sonnet-4-5",
          env: claudeEnv(fixture.home, fixture.llm.url),
          extraArgs: ["--dir", project],
          timeoutMs: 60_000,
        })
        fixture.opencode.expectExit(result, 0)
        expect(result.stdout).toContain("TIME-RECEIVED")
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(2)
        const returned = JSON.stringify((inputs[1].messages as unknown[]).at(-1))
        expect(returned).toContain("tool_result")
        expect(returned).toMatch(/\d{4}-\d{2}-\d{2} (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{2}:\d{2} [+-]\d{2}:\d{2}/)
        expectIsolated(inputs)
      }),
    90_000,
  )

  cliIt.live(
    "oc automatic rename uses a separate model alongside the first Claude turn and survives restart",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        const env = {
          ...claudeEnv(fixture.home, fixture.llm.url),
          OPENCODE_DB: path.join(fixture.home, "opencode.db"),
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            ...chatConfig(fixture.llm.url),
            enabled_providers: ["test", "claude-code"],
            agent: { rename: { model: "test/test-model" } },
          }),
        }
        const server = yield* fixture.opencode.serve({ env })
        const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
        const session = yield* Effect.promise(() =>
          sdk.session.create(
            {
              title: "work3",
              metadata: { ocAutoRename: { state: "pending", title: "work3" } },
            },
            { throwOnError: true },
          ),
        )
        const sessionID = session.data.id
        const model = { providerID: "claude-code", modelID: "claude-sonnet-4-5" }
        yield* Effect.promise(() =>
          sdk.session.prompt({
            sessionID,
            model,
            noReply: true,
            parts: [{ type: "text", synthetic: true, text: `Working directory initialized: ${project}` }],
          }),
        )
        expect(yield* fixture.llm.calls).toBe(0)
        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        yield* fixture.llm.pushMatch(
          (hit) => hit.body.model === "test-model",
          reply().wait(release.promise).text("work - first task").stop(),
        )
        yield* fixture.llm.textMatch((hit) => hit.url.pathname === "/v1/messages", "FIRST-CLAUDE-REPLY")
        const first = yield* Effect.promise(() =>
          sdk.session.prompt(
            {
              sessionID,
              model,
              parts: [{ type: "text", text: "Fix the first task" }],
            },
            { throwOnError: true },
          ),
        )
        expect(JSON.stringify(first.data.parts)).toContain("FIRST-CLAUDE-REPLY")
        expect((yield* Effect.promise(() => sdk.session.get({ sessionID }, { throwOnError: true }))).data.title).toBe(
          "work3",
        )
        release.resolve()
        yield* pollWithTimeout(
          Effect.promise(() => sdk.session.get({ sessionID }, { throwOnError: true })).pipe(
            Effect.map((result) => (result.data.title === "work - first task" ? result.data : undefined)),
          ),
          "Claude session's automatic rename never landed",
          "30 seconds",
        )
        expect((yield* fixture.llm.hits).filter((hit) => hit.body.model === "test-model")).toHaveLength(1)
        const claudeInputs = (yield* fixture.llm.hits).filter((hit) => hit.url.pathname === "/v1/messages")
        expect(claudeInputs).toHaveLength(1)
        expect(JSON.stringify(claudeInputs[0].body.messages)).not.toContain("Generate a concise title")
        const messages = (yield* Effect.promise(() => sdk.session.messages({ sessionID }, { throwOnError: true }))).data
        expect(messages.filter((message) => message.info.role === "user")).toHaveLength(2)

        server.kill()
        yield* Effect.promise(() => server.exited)
        const restarted = yield* fixture.opencode.serve({ env })
        const reopened = createOpencodeClient({ baseUrl: restarted.url, directory: project, throwOnError: true })
        yield* fixture.llm.textMatch((hit) => hit.url.pathname === "/v1/messages", "SECOND-CLAUDE-REPLY")
        yield* Effect.promise(() =>
          reopened.session.prompt({
            sessionID,
            model,
            parts: [{ type: "text", text: "A different second task" }],
          }),
        )
        expect((yield* Effect.promise(() => reopened.session.get({ sessionID }))).data).toMatchObject({
          title: "work - first task",
          metadata: { ocAutoRename: { state: "attempted", title: "work3" } },
        })
        expect((yield* fixture.llm.hits).filter((hit) => hit.body.model === "test-model")).toHaveLength(1)
        expect((yield* fixture.llm.hits).filter((hit) => hit.url.pathname === "/v1/messages")).toHaveLength(2)
        expectIsolated(yield* fixture.llm.inputs)
      }),
    120_000,
  )

  test("streams scripted replies and round-trips a tool call", async () => {
    await using tmp = await tmpdir()
    const note = path.join(tmp.path, "work", "note.txt")
    await Bun.write(note, "PELICAN-77")

    await Effect.gen(function* () {
      const llm = yield* TestLLMServer
      yield* llm.push(reply().reason("reading the note").tool("Read", { file_path: note }))
      yield* llm.text("the note says PELICAN-77")

      const result = yield* Effect.promise(() => runClaude(tmp.path, llm.url))
      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.events.find((event) => event.type === "result")?.result).toBe("the note says PELICAN-77")

      // The second request carries the Read result back, so the tool really ran in the CLI.
      const inputs = yield* llm.inputs
      expect(inputs).toHaveLength(2)
      expect(JSON.stringify(inputs[1].messages)).toContain("tool_result")
      expect(JSON.stringify(inputs[1].messages)).toContain("PELICAN-77")
      expectIsolated(inputs)

      // `/api/hello` is the CLI's startup probe. Any other path is a side request the fake
      // does not answer yet and a scenario would silently depend on.
      const misses = yield* llm.misses
      expect(misses.map((miss) => miss.url.pathname).filter((name) => name !== "/api/hello")).toEqual([])
    }).pipe(Effect.scoped, Effect.provide(TestLLMServer.layer), Effect.runPromise)
  }, 60_000)

  // The same round trip through oc: `opencode run` in a git-inited `work` folder of the CLI
  // fixture's isolated home (see `initRepo`), with the built-in claude-code provider spawning the
  // real CLI against the fake.
  cliIt.live(
    "oc's claude-code provider round-trips a tool call",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        const note = path.join(project, "note.txt")
        yield* Effect.promise(() => Bun.write(note, "PELICAN-77"))
        yield* fixture.llm.push(reply().reason("reading the note").tool("Read", { file_path: note }))
        yield* fixture.llm.text("the note says PELICAN-77")

        const result = yield* fixture.opencode.run("read note.txt", {
          model: "claude-code/claude-sonnet-4-5",
          env: claudeEnv(fixture.home, fixture.llm.url),
          extraArgs: ["--dir", project],
          timeoutMs: 60_000,
        })
        fixture.opencode.expectExit(result, 0)
        expect(result.stdout).toContain("the note says PELICAN-77")

        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(2)
        expect(JSON.stringify(inputs[1].messages)).toContain("PELICAN-77")
        expectIsolated(inputs)
        const misses = yield* fixture.llm.misses
        expect(misses.map((miss) => miss.url.pathname).filter((name) => name !== "/api/hello")).toEqual([])
      }),
    90_000,
  )

  // claudeTestFlow.md step 0: the user's ~/.claude/CLAUDE.md and the project's CLAUDE.md reach
  // Claude. Needs a root outside the profile (see `outsideProfile`), so the CLI's parent-folder
  // CLAUDE.md walk can stay on without finding the real files.
  cliIt.live(
    "claudeTestFlow step 0: user and project CLAUDE.md reach the model",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const root = yield* outsideProfile
        yield* Effect.promise(() =>
          Promise.all([
            Bun.write(path.join(root, "claude", "CLAUDE.md"), "USER-RULE-31: build test inputs from the real caller."),
            Bun.write(path.join(root, "work", "CLAUDE.md"), "PROJECT-RULE-47: keep diffs minimal."),
          ]),
        )
        const chat = yield* openChat(fixture, { root })
        yield* llm.text("Build test inputs from the real caller.")

        yield* chat.prompt("Without reading any files, quote the rule in your instructions about test inputs.")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(1)
        expectIsolated(inputs)
        const sent = JSON.stringify(inputs[0])
        expect(sent).toContain("USER-RULE-31")
        expect(sent).toContain("PROJECT-RULE-47")
      }),
    120_000,
  )

  // claudeTestFlow.md step 1 plus the memory half of step 2: turn 1 seeds a codeword and runs
  // native tools, turn 2 must still carry that codeword.
  cliIt.live(
    "claudeTestFlow steps 1-2: native tools, then memory across turns",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const file = path.join(chat.project, "ocToolCheck.txt")
        yield* llm.tool("Write", { file_path: file, content: "hello from claude" })
        yield* llm.tool("Edit", { file_path: file, old_string: "claude", new_string: "claude, edited" })
        yield* llm.tool("Read", { file_path: file })
        yield* llm.tool("Bash", { command: "echo shell-ok", description: "Print a marker" })
        yield* llm.text("all four tools done")
        yield* llm.text("the codeword is PELICAN-77")

        yield* chat.prompt(
          "Remember for later: the codeword is PELICAN-77. Now write, edit, read, and run a shell command.",
        )
        expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("hello from claude, edited")
        yield* chat.prompt("What's the codeword?")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(6)
        expectIsolated(inputs)
        // The CLI ran in the session's folder, not the server's cwd.
        expect(JSON.stringify(inputs[0].messages)).toContain(
          `Primary working directory: ${JSON.stringify(chat.project).slice(1, -1)}`,
        )
        // Each tool's result went back to the model: the edit landed before the Read, and Bash ran.
        expect(JSON.stringify(inputs[3].messages)).toContain("hello from claude, edited")
        expect(JSON.stringify(inputs[4].messages)).toContain("shell-ok")
        // Turn 2 is a continuation of the same Claude conversation, not a fresh one.
        expect(JSON.stringify(inputs[5].messages)).toContain("PELICAN-77")

        const parts = yield* chat.parts
        const answer = parts.findLast((part) => part.type === "text")
        expect(answer?.type === "text" && answer.text).toBe("the codeword is PELICAN-77")
        expect(JSON.stringify(parts)).not.toContain("conversation lost")
        // oc recorded each native tool as a completed tool row under its own tool name.
        expect(
          parts.flatMap((part) => (part.type === "tool" && part.state.status === "completed" ? [part.tool] : [])),
        ).toEqual(["write", "edit", "read", "bash"])
      }),
    120_000,
  )

  // claudeTestFlow.md step 2, subagent half: one task_batch call runs two explore subagents,
  // each its own oc session and `claude` process. Each child's reply is held until both
  // children have called the model, so the test only finishes if they really overlap.
  cliIt.live(
    "claudeTestFlow step 2: task_batch runs two subagents at the same time",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const both = Effect.runPromise(llm.wait(3))
        const child = (token: string) => (hit: { body: Record<string, unknown> }) =>
          JSON.stringify((hit.body.messages as unknown[] | undefined)?.at(-1)).includes(token)
        yield* llm.pushMatch(child("CHILD-PS1"), reply().wait(both).text("found 3 ps1 files"))
        yield* llm.pushMatch(child("CHILD-MD"), reply().wait(both).text("found 5 md files"))
        yield* llm.tool("mcp__opencode_proxy__task_batch", {
          tasks: [
            { description: "Count ps1 files", prompt: "Count .ps1 files. CHILD-PS1", subagent_type: "explore" },
            { description: "Count md files", prompt: "Count .md files. CHILD-MD", subagent_type: "explore" },
          ],
        })
        yield* llm.text("ps1: 3, md: 5")

        yield* chat.prompt("Run two explore subagents at the same time: one counts .ps1 files, one counts .md files.")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(4)
        expectIsolated(inputs)
        // Both children's answers came back to the parent in one tool result.
        expect(JSON.stringify(inputs[3].messages)).toContain("found 3 ps1 files")
        expect(JSON.stringify(inputs[3].messages)).toContain("found 5 md files")

        const parts = yield* chat.parts
        const answer = parts.findLast((part) => part.type === "text")
        expect(answer?.type === "text" && answer.text).toBe("ps1: 3, md: 5")
        const children = yield* Effect.promise(() => chat.sdk.session.children({ sessionID: chat.sessionID }))
        expect(children.data).toHaveLength(2)
      }),
    120_000,
  )

  // claudeTestFlow.md step 1, item 8: Claude's question opens oc's question form, the answer
  // picked there goes back to Claude as the tool result.
  cliIt.live(
    "claudeTestFlow step 1.8: Claude's question is answered through oc's question form",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.tool("mcp__opencode_proxy__question", {
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
        yield* llm.text("keeping ocToolCheck.txt")

        const turn = yield* chat.prompt("Ask me whether to delete ocToolCheck.txt.").pipe(Effect.forkScoped)
        const pending = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.question.list()).pipe(Effect.map((result) => result.data?.at(0))),
          "Claude's question never reached oc's question form",
          "30 seconds",
        )
        expect(pending.questions[0].question).toBe("Should I delete ocToolCheck.txt?")
        yield* Effect.promise(() => chat.sdk.question.reply({ requestID: pending.id, answers: [["No"]] }))
        yield* Fiber.join(turn)

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(2)
        expectIsolated(inputs)
        // The tool result Claude got back carries the picked answer.
        const result = JSON.stringify((inputs[1].messages as unknown[]).at(-1))
        expect(result).toContain("tool_result")
        expect(result).toContain(JSON.stringify(`"Should I delete ocToolCheck.txt?"="No"`).slice(1, -1))

        const parts = yield* chat.parts
        const answer = parts.findLast((part) => part.type === "text")
        expect(answer?.type === "text" && answer.text).toBe("keeping ocToolCheck.txt")
      }),
    120_000,
  )

  // claudeTestFlow.md step 3: Esc mid-turn (the TUI calls session abort), then a new message.
  // The Claude conversation must survive the interrupt and the partial text must not leak.
  cliIt.live(
    "claudeTestFlow step 3: interrupt mid-turn, then the conversation continues",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const file = path.join(chat.project, "a.txt")
        yield* Effect.promise(() => Bun.write(file, "file a"))
        yield* llm.tool("Read", { file_path: file })
        yield* llm.push(reply().text("SUMMARY-LEFTOVER of a.txt").hang())
        yield* llm.text("the codeword is PELICAN-77")

        const report = flowReport({ modelID: "claude-sonnet-4-5", switchModelID: "claude-haiku-4-5" })
        yield* stepRunner(report)("3 interrupt", chat, (_, prompt) =>
          Effect.gen(function* () {
            const turn = yield* prompt(
              "Remember the codeword PELICAN-77, then read every file and summarize each.",
            ).pipe(Effect.forkScoped)
            yield* llm.wait(2)
            yield* Effect.promise(() => chat.sdk.session.abort({ sessionID: chat.sessionID }))
            yield* Fiber.join(turn)
            yield* prompt("Ignore that. What's the codeword?")
          }),
        )
        expect(report.render()).not.toContain("harness failure:")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(3)
        expectIsolated(inputs)
        // The next turn still holds turn 1's codeword and Read result.
        const history = JSON.stringify(inputs[2].messages)
        expect(history).toContain("PELICAN-77")
        expect(history).toContain("file a")

        const messages = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        const last = messages.at(-1)!
        expect(last.info.role).toBe("assistant")
        expect(last.info.role === "assistant" && last.info.error).toBeFalsy()
        expect(last.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))).toEqual([
          "the codeword is PELICAN-77",
        ])
        const interrupted = messages.findLast((message) => message.info.role === "assistant" && message.info.error)
        expect(interrupted?.info.role === "assistant" && interrupted.info.error?.name).toBe("MessageAbortedError")
        expect(JSON.stringify(messages)).not.toContain("conversation lost")
      }),
    120_000,
  )

  // claudeTestFlow.md step 4: oc's /compact runs Claude Code's own `/compact` in the live
  // conversation. The CLI asks the model for a summary, and the next turn starts from it.
  cliIt.live(
    "claudeTestFlow step 4: /compact runs Claude Code's compaction, then the chat continues",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.text("noted")
        yield* llm.text("SUMMARY-77: the codeword is PELICAN-77")
        yield* llm.text("the codeword is PELICAN-77")

        yield* chat.prompt("Remember for later: the codeword is PELICAN-77.")
        yield* Effect.promise(() =>
          chat.sdk.session.summarize({
            sessionID: chat.sessionID,
            providerID: "claude-code",
            modelID: "claude-sonnet-4-5",
          }),
        )
        yield* chat.prompt("What's the codeword?")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(3)
        expectIsolated(inputs)
        // The summary request carries the conversation; the next turn carries the summary.
        expect(JSON.stringify(inputs[1].messages)).toContain("PELICAN-77")
        expect(JSON.stringify(inputs[2].messages)).toContain("SUMMARY-77")

        const messages = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        // Claude Code's summary is the compaction message's text, shown under "Compacted".
        const summary = messages.find((message) => message.info.role === "assistant" && message.info.summary)
        expect(JSON.stringify(summary?.parts)).toContain("SUMMARY-77")
        const sent = JSON.stringify(messages)
        expect(sent).not.toContain("no Claude Code conversation to compact")
        expect(sent).not.toContain("conversation lost")
        const last = messages.at(-1)!
        expect(last.parts.flatMap((part) => (part.type === "text" ? [part.text] : []))).toEqual([
          "the codeword is PELICAN-77",
        ])
      }),
    120_000,
  )

  // claudeTestFlow.md step 5: reverting a message in oc rewinds the Claude conversation to the
  // last exchange both still share, and the todo list still mirrors into oc afterward. Both
  // replies are the same text, so the revert can only be seen by the exchange's position.
  cliIt.live(
    "claudeTestFlow step 5: revert rewinds the Claude conversation, todos still update",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.text("noted")
        yield* llm.text("noted")
        yield* llm.tool("TodoWrite", {
          todos: [
            { content: "check revert", status: "completed", activeForm: "Checking revert" },
            { content: "check todos", status: "pending", activeForm: "Checking todos" },
          ],
        })
        yield* llm.text("the codeword is PELICAN-77")

        yield* chat.prompt("Remember for later: the codeword is PELICAN-77.")
        const reverted = yield* chat.prompt("The new codeword is OSPREY-12.")
        yield* Effect.promise(() =>
          chat.sdk.session.revert({ sessionID: chat.sessionID, messageID: reverted.data!.info.parentID }),
        )
        yield* chat.prompt(
          "What's the codeword? Then make a todo list with two items, check revert and check todos, and mark the first one done.",
        )

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(4)
        expectIsolated(inputs)
        // The rewound conversation still has turn 1 and no longer has the reverted turn.
        const history = JSON.stringify(inputs[2].messages)
        expect(history).toContain("PELICAN-77")
        expect(history).not.toContain("OSPREY-12")

        const messages = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        expect(JSON.stringify(messages)).not.toContain("OSPREY-12")
        expect(JSON.stringify(messages)).not.toContain("conversation lost")
        expect(JSON.stringify(messages)).toContain("Claude conversation rewound")
        const last = messages.at(-1)!
        expect(last.parts.findLast((part) => part.type === "text")).toMatchObject({
          text: "the codeword is PELICAN-77",
        })
        const todos = (yield* Effect.promise(() => chat.sdk.session.todo({ sessionID: chat.sessionID }))).data!
        expect(todos.map((todo) => [todo.content, todo.status])).toEqual([
          ["check revert", "completed"],
          ["check todos", "pending"],
        ])
      }),
    120_000,
  )

  // claudeTestFlow.md step 6: quit oc and reopen the chat. The new server resumes the same
  // Claude conversation from its saved session id, with no "conversation lost" prompt.
  cliIt.live(
    "claudeTestFlow step 6: restarting oc resumes the same Claude conversation",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        yield* llm.text("noted")
        yield* llm.text("the codeword is PELICAN-77")

        const first = yield* openChat(fixture)
        yield* first.prompt("Remember for later: the codeword is PELICAN-77.")
        first.server.kill()
        yield* Effect.promise(() => first.server.exited)
        const chat = yield* openChat(fixture, { resume: first.sessionID })
        yield* chat.prompt("Codeword?")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(2)
        expectIsolated(inputs)
        // The resumed conversation sends turn 1 as real history, not a catch-up summary.
        const messages = inputs[1].messages as { role: string }[]
        expect(messages.map((message) => message.role)).toEqual(["user", "assistant", "user"])
        expect(JSON.stringify(messages[0])).toContain("PELICAN-77")

        const stored = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        expect(JSON.stringify(stored)).not.toContain("conversation lost")
        expect(stored.at(-1)!.parts.findLast((part) => part.type === "text")).toMatchObject({
          text: "the codeword is PELICAN-77",
        })
      }),
    120_000,
  )

  // claudeTestFlow.md step 7: switching model and effort mid-chat keeps the Claude
  // conversation, and the new model can still use tools.
  cliIt.live(
    "claudeTestFlow step 7: model and effort switch keeps the conversation",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const file = path.join(chat.project, "ocToolCheck.txt")
        yield* Effect.promise(() => Bun.write(file, "hello from claude, edited"))
        yield* llm.text("noted")
        yield* llm.tool("Bash", { command: "rm ocToolCheck.txt", description: "Delete the file" })
        yield* llm.text("PELICAN-77, and ocToolCheck.txt is deleted")

        yield* chat.prompt("Remember for later: the codeword is PELICAN-77.")
        yield* chat.prompt("Still remember the codeword? Also delete ocToolCheck.txt.", {
          modelID: "claude-opus-4-5",
          variant: "low",
        })

        expect(yield* Effect.promise(() => Bun.file(file).exists())).toBe(false)
        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(3)
        expectIsolated(inputs)
        expect(inputs.map((input) => input.model)).toEqual(["claude-sonnet-4-5", "claude-opus-4-5", "claude-opus-4-5"])
        expect(JSON.stringify(inputs[1].messages)).toContain("PELICAN-77")

        const stored = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        expect(JSON.stringify(stored)).not.toContain("conversation lost")
        expect(stored.at(-1)!.parts.findLast((part) => part.type === "text")).toMatchObject({
          text: "PELICAN-77, and ocToolCheck.txt is deleted",
        })
      }),
    120_000,
  )

  // The real flow's order: restart, then switch to Haiku 5.5, which deletes the file with the
  // Windows PowerShell tool (oc turns it on) rather than Bash. The command is the shape real
  // Haiku sent: a quoted absolute path and -Force.
  cliIt.live(
    "claudeTestFlow step 7: after a restart, a switched model deletes a file with its shell tool",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        yield* llm.text("noted")
        const first = yield* openChat(fixture)
        const file = path.join(first.project, "ocToolCheck.txt")
        const shell =
          process.platform === "win32"
            ? { tool: "PowerShell", command: `Remove-Item "${file}" -Force` }
            : { tool: "Bash", command: `rm -f "${file}"` }
        yield* llm.tool(shell.tool, { command: shell.command, description: "Delete the file" })
        yield* llm.text("PELICAN-77, and ocToolCheck.txt is deleted")

        yield* Effect.promise(() => Bun.write(file, "hello from claude, edited"))
        yield* first.prompt("Remember for later: the codeword is PELICAN-77.")
        first.server.kill()
        yield* Effect.promise(() => first.server.exited)
        const chat = yield* openChat(fixture, { resume: first.sessionID })
        yield* chat.prompt("Still remember the codeword? Also delete ocToolCheck.txt.", { modelID: "claude-haiku-5-5" })

        const inputs = yield* llm.inputs
        expect(inputs.map((input) => input.model)).toEqual([
          "claude-sonnet-4-5",
          "claude-haiku-5-5",
          "claude-haiku-5-5",
        ])
        expect((inputs[1].tools as { name: string }[]).map((tool) => tool.name)).toContain(shell.tool)
        expectIsolated(inputs)
        const stored = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        const row = stored.at(-1)!.parts.find((part) => part.type === "tool")
        expect(row?.type === "tool" && row.state.status).toBe("completed")
        expect(yield* Effect.promise(() => Bun.file(file).exists())).toBe(false)
      }),
    120_000,
  )

  // claudeTestFlow.md step 8: the same question twice. Claude's prompt cache only hits when
  // the second request starts with exactly the bytes of the first, so check that prefix.
  cliIt.live(
    "claudeTestFlow step 8: a repeated turn keeps the cached prefix stable",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.text("PELICAN-77")
        yield* llm.text("PELICAN-77")

        yield* chat.prompt("Codeword?")
        yield* chat.prompt("Codeword?")

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(2)
        expectIsolated(inputs)
        // cache_control markers move to the newest message each turn; everything else must match.
        const plain = (value: unknown) =>
          JSON.parse(JSON.stringify(value, (key, item) => (key === "cache_control" ? undefined : item)))
        expect(plain(inputs[1].system)).toEqual(plain(inputs[0].system))
        expect(plain(inputs[1].tools)).toEqual(plain(inputs[0].tools))
        const first = plain(inputs[0].messages) as unknown[]
        expect(plain(inputs[1].messages).slice(0, first.length)).toEqual(first)
      }),
    120_000,
  )

  cliIt.live(
    "flow report: a refused step 5 stops before revert and later steps",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture, { turnStats: true })
        yield* fixture.llm.text("noted")
        yield* chat.prompt("Remember PELICAN-77.")
        const before =
          (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data ?? []
        yield* fixture.llm.error(403, {
          type: "error",
          error: { type: "authentication_error", message: "FLOW-AUTH-BLOCK" },
        })
        yield* fixture.llm.text("MUST-NOT-RUN")
        const report = flowReport({ modelID: "claude-sonnet-4-5", switchModelID: "claude-haiku-4-5" })
        const step = stepRunner(report)
        const exit = yield* Effect.gen(function* () {
          yield* step("5 revert", chat, (_, prompt) =>
            Effect.gen(function* () {
              report.check("earlier check", false, "independent failure")
              const reverted = yield* prompt("The new codeword is OSPREY-12.")
              if (!reverted.data) return yield* Effect.fail(new Error("no prompt response"))
              yield* Effect.promise(() =>
                chat.sdk.session.revert({ sessionID: chat.sessionID, messageID: reverted.data.info.parentID }),
              )
              yield* prompt("What's the codeword?")
            }),
          )
          for (const name of ["6 restart", "7 switch model", "8 cache"])
            yield* step(name, chat, (_, prompt) => prompt("MUST-NOT-RUN").pipe(Effect.asVoid))
        }).pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        const file = path.join(fixture.home, "refused-report.md")
        yield* Effect.promise(() => report.write(file))
        const written = yield* Effect.promise(() => Bun.file(file).text())
        expect(written).toContain("last step reached: 5 revert")
        expect(written).toContain("| request accepted | blocked |")
        expect(written).toContain("| earlier check | FAIL | independent failure |")
        expect(written).not.toMatch(/\| [678] (restart|switch model|cache) \|/)
        expect(yield* fixture.llm.calls).toBe(2)
        expect(yield* fixture.llm.pending).toBe(1)
        const after = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data ?? []
        expect(after.slice(0, before.length).map((message) => message.info.id)).toEqual(
          before.map((message) => message.info.id),
        )
        expect(JSON.stringify(after)).toContain("OSPREY-12")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    120_000,
  )

  cliIt.live(
    "flow report: reverted tokens and costs survive a later harness failure",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture, { turnStats: true })
        yield* fixture.llm.text("noted", { usage: { input: 99, output: 99 } })
        yield* chat.prompt("Remember PELICAN-77.")
        yield* fixture.llm.text("noted", { usage: { input: 10, output: 20 } })
        yield* fixture.llm.text("PELICAN-77", { usage: { input: 30, output: 40 } })
        const report = flowReport({ modelID: "claude-sonnet-4-5", switchModelID: "claude-haiku-4-5" })
        const exit = yield* stepRunner(report)("5 revert", chat, (_, prompt) =>
          Effect.gen(function* () {
            const reverted = yield* prompt("The new codeword is OSPREY-12.")
            if (!reverted.data) return yield* Effect.fail(new Error("no prompt response"))
            yield* Effect.promise(() =>
              chat.sdk.session.revert({ sessionID: chat.sessionID, messageID: reverted.data.info.parentID }),
            )
            yield* prompt("What's the codeword?")
            return yield* Effect.fail(new Error("FLOW-DELIBERATE-FAILURE"))
          }),
        ).pipe(Effect.exit)
        expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("FLOW-DELIBERATE-FAILURE")
        const file = path.join(fixture.home, "reverted-report.md")
        yield* Effect.promise(() => report.write(file))
        const written = yield* Effect.promise(() => Bun.file(file).text())
        expect(written).toContain("| 5 revert | 40 | 60 | 0 | 0 |")
        // Sonnet prices these scripted calls at $0.00033 and $0.00069; footers round each.
        expect(written).toContain("CLI cost total: $0.0010")
        expect(written).toContain("harness failure:")
        expect(written).not.toContain("| request accepted | blocked |")
        const messages =
          (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data ?? []
        expect(JSON.stringify(messages)).not.toContain("OSPREY-12")
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(3)
        expect(JSON.stringify(inputs[2].messages)).not.toContain("OSPREY-12")
        expectIsolated(inputs)
      }),
    120_000,
  )

  cliIt.live(
    "flow report: cost deltas handle compaction gaps, restart, and collection failure",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture, { turnStats: true })
        const report = flowReport({ modelID: "claude-sonnet-4-5", switchModelID: "claude-haiku-4-5" })
        const step = stepRunner(report)
        for (const name of ["1 first", "2 repeat"]) {
          yield* fixture.llm.text("PELICAN-77", { usage: { input: 100, output: 100 } })
          yield* step(name, chat, (_, prompt) => prompt("Remember PELICAN-77.").pipe(Effect.asVoid))
        }
        expect(report.render()).toContain("CLI cost total: $0.0036 (2/2 turns)")
        yield* fixture.llm.text("SUMMARY: remember PELICAN-77", { usage: { input: 5, output: 5 } })
        yield* fixture.llm.text("PELICAN-77", { usage: { input: 100, output: 100 } })
        yield* step("4 compact", chat, (since, prompt, accept) =>
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              chat.sdk.session.summarize({
                sessionID: chat.sessionID,
                providerID: "claude-code",
                modelID: "claude-sonnet-4-5",
              }),
            )
            const messages =
              (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data ?? []
            const summary = messages.find(
              (message) =>
                message.info.time.created >= since && message.info.role === "assistant" && message.info.summary,
            )
            if (!summary) return yield* Effect.fail(new Error("compaction produced no summary"))
            yield* accept(summary)
            yield* prompt("Codeword?")
          }),
        )
        expect(report.render()).toContain("CLI cost total: $0.0036 (partial, 2/4 turns)")
        chat.server.kill()
        yield* Effect.promise(() => chat.server.exited)
        const resumed = yield* openChat(fixture, { resume: chat.sessionID, turnStats: true })
        yield* fixture.llm.text("PELICAN-77", { usage: { input: 100, output: 100 } })
        yield* step("6 restart", resumed, (_, prompt) => prompt("Codeword?").pipe(Effect.asVoid))
        expect(report.render()).toContain("CLI cost total: $0.0054 (partial, 3/5 turns)")
        const exit = yield* step("accounting failure", resumed, () =>
          Effect.gen(function* () {
            resumed.server.kill()
            yield* Effect.promise(() => resumed.server.exited)
            return yield* Effect.fail(new Error("FLOW-ORIGINAL-FAILURE"))
          }),
        ).pipe(Effect.exit)
        expect(Exit.isFailure(exit) && Cause.pretty(exit.cause)).toContain("FLOW-ORIGINAL-FAILURE")
        const file = path.join(fixture.home, "cost-report.md")
        yield* Effect.promise(() => report.write(file))
        const written = yield* Effect.promise(() => Bun.file(file).text())
        expect(written).toContain("| accounting failure | unavailable |")
        expect(written).toContain("accounting unavailable:")
        expect(written).toContain("3/5 turns; accounting unavailable")
        const failedAccounting = yield* step("accounting after success", resumed, () => Effect.void).pipe(Effect.exit)
        expect(Exit.isFailure(failedAccounting) && Cause.pretty(failedAccounting.cause)).toContain(
          "step accounting failed",
        )
        expect(report.render()).toContain("| accounting after success | unavailable |")
        expectIsolated(yield* fixture.llm.inputs)
      }),
    180_000,
  )

  cliIt.live(
    "handoff now writes a linked session from a normal Claude turn, not CLI compact",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture)
        yield* fixture.llm.text("WORK-DONE")
        yield* fixture.llm.text("HANDOFF-SUMMARY next: keep going")
        yield* fixture.llm.text("CONTINUED-FROM-HANDOFF")
        const first = yield* Effect.promise(() =>
          chat.sdk.session.prompt(
            {
              sessionID: chat.sessionID,
              model: { providerID: "claude-code", modelID: "claude-sonnet-4-5" },
              parts: [{ type: "text", text: "Finish the first task" }],
            },
            { throwOnError: true },
          ),
        )
        expect(JSON.stringify(first.data)).toContain("WORK-DONE")
        const started = yield* Effect.promise(() =>
          chat.sdk.session.handoff({ sessionID: chat.sessionID }, { throwOnError: true }),
        )
        expect(started.data).toBe(true)
        const child = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.children({ sessionID: chat.sessionID })).pipe(
            Effect.map((result) => result.data?.[0]),
          ),
          "handoff child missing",
          "30 seconds",
        )
        expect(child.parentID).toBe(chat.sessionID)
        const messages = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.messages({ sessionID: child.id })).pipe(
            Effect.map((result) => {
              const text = JSON.stringify(result.data)
              if (!text.includes("Resume the next step from this handoff")) return
              return result.data
            }),
          ),
          "handoff child not ready",
          "30 seconds",
        )
        expect(JSON.stringify(messages[0]?.parts)).toContain("Resume the next step from this handoff")
        const continued = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.messages({ sessionID: child.id })).pipe(
            Effect.map((result) => {
              if (!JSON.stringify(result.data).includes("CONTINUED-FROM-HANDOFF")) return
              return result.data
            }),
          ),
          "handoff child never continued",
          "60 seconds",
        )
        expect(JSON.stringify(continued)).toContain("CONTINUED-FROM-HANDOFF")
        const inputs = yield* fixture.llm.inputs
        expect(JSON.stringify(inputs)).not.toContain("/compact")
        expectIsolated(inputs)
      }),
    180_000,
  )

  cliIt.live(
    "context limit handoff auto-triggers at the token threshold and the child continues",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        const env = {
          ...claudeEnv(fixture.home, fixture.llm.url),
          OPENCODE_DB: path.join(fixture.home, "opencode.db"),
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            ...chatConfig(fixture.llm.url),
            compaction: { limit: { tokens: 1, action: "handoff" } },
          }),
        }
        const server = yield* fixture.opencode.serve({ env })
        const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
        const created = yield* Effect.promise(() =>
          sdk.session.create({ title: "autoHandoff" }, { throwOnError: true }),
        )
        const sessionID = created.data.id
        const model = { providerID: "claude-code", modelID: "claude-sonnet-4-5" }
        yield* fixture.llm.text("WORK-AUTO", { usage: { input: 500, output: 50 } })
        yield* fixture.llm.text("HANDOFF-SUMMARY-AUTO next: keep going")
        yield* fixture.llm.text("CONTINUED-AUTO")
        yield* Effect.promise(() =>
          sdk.session.prompt(
            { sessionID, model, parts: [{ type: "text", text: "Do the first task" }] },
            { throwOnError: true },
          ),
        )
        const child = yield* pollWithTimeout(
          Effect.promise(() => sdk.session.children({ sessionID })).pipe(Effect.map((result) => result.data?.[0])),
          "auto handoff child missing",
          "30 seconds",
        )
        expect(child.parentID).toBe(sessionID)
        const messages = yield* pollWithTimeout(
          Effect.promise(() => sdk.session.messages({ sessionID: child.id })).pipe(
            Effect.map((result) => {
              if (!JSON.stringify(result.data).includes("Resume the next step from this handoff")) return
              return result.data
            }),
          ),
          "auto handoff child not ready",
          "30 seconds",
        )
        expect(JSON.stringify(messages[0]?.parts)).toContain("Resume the next step from this handoff")
        const continued = yield* pollWithTimeout(
          Effect.promise(() => sdk.session.messages({ sessionID: child.id })).pipe(
            Effect.map((result) => {
              if (!JSON.stringify(result.data).includes("CONTINUED-AUTO")) return
              return result.data
            }),
          ),
          "auto handoff child never continued",
          "60 seconds",
        )
        expect(JSON.stringify(continued)).toContain("CONTINUED-AUTO")
        const inputs = yield* fixture.llm.inputs
        expect(JSON.stringify(inputs)).not.toContain("/compact")
        expectIsolated(inputs)
      }),
    180_000,
  )

  // claudeTestFlow report token table: oc stores the turn's last API call (context size), and
  // that call's output count only arrives in message_delta, after the CLI's `assistant` line.
  cliIt.live(
    "claudeTestFlow tokens: oc records the last call's final output and cache counts",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const file = path.join(chat.project, "a.txt")
        yield* Effect.promise(() => Bun.write(file, "file a"))
        yield* llm.push(
          reply().tool("Read", { file_path: file }).usage({ input: 4, output: 30, cacheRead: 900, cacheWrite: 100 }),
        )
        yield* llm.text("read a.txt", { usage: { input: 6, output: 42, cacheRead: 1000, cacheWrite: 20 } })

        yield* chat.prompt("Read a.txt.")

        const messages = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        const last = messages.at(-1)!
        expect(last.info.role === "assistant" && last.info.tokens).toMatchObject({
          input: 6,
          output: 42,
          cache: { read: 1000, write: 20 },
        })
        expectIsolated(yield* llm.inputs)
      }),
    120_000,
  )

  // The whole agent loop is one oc step, so without live usage the footer and sidebar context
  // stay empty until the turn ends. Hold the second call and read tokens mid-turn.
  cliIt.live(
    "live context: tokens update before the turn finishes",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const file = path.join(chat.project, "a.txt")
        yield* Effect.promise(() => Bun.write(file, "file a"))
        const release = Promise.withResolvers<void>()
        yield* llm.push(
          reply().tool("Read", { file_path: file }).usage({ input: 4, output: 30, cacheRead: 900, cacheWrite: 100 }),
        )
        yield* llm.push(
          reply()
            .wait(release.promise)
            .text("read a.txt")
            .stop()
            .usage({ input: 6, output: 42, cacheRead: 1000, cacheWrite: 20 }),
        )

        const turn = yield* chat.prompt("Read a.txt.").pipe(Effect.forkScoped)
        yield* llm.wait(2)
        const live = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID })).pipe(
            Effect.map((result) => {
              const info = result.data?.at(-1)?.info
              return info?.role === "assistant" && !info.time.completed && info.tokens.output > 0 ? info : undefined
            }),
          ),
          "no live tokens while the turn was running",
          "30 seconds",
        )
        expect(live.tokens).toMatchObject({ input: 4, output: 30, cache: { read: 900, write: 100 } })
        expect(live.cost).toBe(0)

        release.resolve()
        yield* Fiber.join(turn)
        const last = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!.at(
          -1,
        )!
        expect(last.info.role === "assistant" && last.info.tokens).toMatchObject({ input: 6, output: 42 })
        expectIsolated(yield* llm.inputs)
      }),
    120_000,
  )

  // claudeTestFlow report steps 5-8 (usage limit) and the auth-failure run: an API error the
  // CLI reports both as a synthetic assistant reply and as the failed result's text.
  cliIt.live(
    "an API error the CLI reports twice shows once",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.error(400, {
          type: "error",
          error: { type: "invalid_request_error", message: "FAKE-BAD-REQUEST-81" },
        })

        yield* chat.prompt("Codeword?")

        const messages = (yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))).data!
        const shown = messages
          .at(-1)!
          .parts.flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n")
        expect(shown.split("FAKE-BAD-REQUEST-81")).toHaveLength(2)
        expectIsolated(yield* llm.inputs)
      }),
    120_000,
  )
})

async function runClaude(dir: string, llmUrl: string) {
  const proc = Bun.spawn(
    [cliPath!, "-p", "read note.txt", "--output-format", "stream-json", "--verbose", "--model", "claude-sonnet-4-5"],
    {
      cwd: path.join(dir, "work"),
      // Drop the shell's Anthropic and Claude settings (CLAUDECODE included) so a real key or
      // login can never be used; unlike `hostEnv`, this also drops CLAUDE_CODE_OAUTH_TOKEN.
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLAUDE|ANTHROPIC)/.test(key))),
        ...claudeEnv(dir, llmUrl),
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 45_000,
    },
  )
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const events = stdout
    .split("\n")
    .filter((text) => text.startsWith("{"))
    .map((text) => JSON.parse(text) as { type?: string; result?: string })
  return { exitCode, stderr, events }
}
