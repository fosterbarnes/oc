// A message sent while a Claude turn runs goes into that turn (turnStream.ts `onSteer`) and is
// never sent again. Real CLI against TestLLMServer; skipped when no `claude` CLI is installed.
import { describe, expect } from "bun:test"
import { Effect, Fiber } from "effect"
import path from "node:path"
import { Database } from "bun:sqlite"
import { cliIt } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { reply } from "../../lib/llm-server"
import { chatConfig, expectIsolated, openChat } from "./chatFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

const steerScenario = (late: boolean) =>
  cliIt.live(
    late
      ? "a steer sent after the last tool call runs in the same oc step"
      : "a steer reaches the running turn at its next tool boundary",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        if (late) {
          yield* llm.push(reply().wait(release.promise).text("FIRST-DONE").stop())
          yield* llm.text("SECOND-DONE")
        }
        if (!late) {
          yield* llm.push(reply().wait(release.promise).tool("Bash", { command: "echo one", description: "one" }))
          yield* llm.text("FIRST-DONE")
        }

        const turn = yield* chat.prompt("START-TURN").pipe(Effect.forkScoped)
        yield* llm.wait(1)
        const steer = yield* chat.prompt("STEER-ONE").pipe(Effect.forkScoped)
        const messages = Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID })).pipe(
          Effect.map((result) => result.data!),
        )
        yield* pollWithTimeout(
          messages.pipe(
            Effect.map((all) => (all.filter((message) => message.info.role === "user").length === 2 ? true : undefined)),
          ),
          "the steer was never stored",
          "30 seconds",
        )
        release.resolve()
        yield* Fiber.join(turn)
        yield* Fiber.join(steer)

        const inputs = yield* llm.inputs
        expect(inputs).toHaveLength(2)
        expect(JSON.stringify((inputs[1].messages as unknown[]).at(-1))).toContain("STEER-ONE")
        const all = yield* messages
        expect(all.filter((message) => message.info.role === "assistant")).toHaveLength(1)
        const sent = all.find((message) => message.parts.some((part) => part.type === "text" && part.text === "STEER-ONE"))
        expect(sent?.parts.find((part) => part.type === "text")?.metadata?.steered).toBeNumber()
        expect(JSON.stringify(all)).toContain(late ? "SECOND-DONE" : "FIRST-DONE")
        expectIsolated(inputs)
      }),
    120_000,
  )

describe.skipIf(!cliPath)("Claude mid-turn steering", () => {
  steerScenario(false)
  steerScenario(true)

  cliIt.live("held proxy steers can be edited or deleted and delivered messages stay owned", (fixture) =>
    Effect.gen(function* () {
      const config = chatConfig(fixture.llm.url)
      const logDir = path.join(fixture.home, "heldLog")
      const chat = yield* openChat(fixture, { config: { provider: { ...config.provider,
        "claude-code": { options: { ...config.provider["claude-code"].options,
          logging: { file: true, dir: logDir } } } } } })
      yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
      const release = Promise.withResolvers<void>()
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      yield* fixture.llm.push(reply().wait(release.promise).text("HELD-DONE").stop())
      const turn = yield* chat.prompt("SAME-TEXT").pipe(Effect.forkScoped)
      const question = yield* waitQuestion(chat)
      const editing = yield* chat.prompt("EDIT-ME").pipe(Effect.forkScoped)
      const edit = yield* waitMessage(chat, "EDIT-ME")
      yield* waitAccepted(logDir, edit.info.id)
      expect((yield* Effect.promise(() => chat.sdk.session.deleteMessage({ sessionID: chat.sessionID,
        messageID: edit.info.id }))).error).toBeUndefined()
      const deleting = yield* chat.prompt("DELETE-ME").pipe(Effect.forkScoped)
      const deleted = yield* waitMessage(chat, "DELETE-ME")
      yield* waitAccepted(logDir, deleted.info.id)
      expect((yield* Effect.promise(() => chat.sdk.session.deleteMessage({ sessionID: chat.sessionID,
        messageID: deleted.info.id }))).error).toBeUndefined()
      const edited = yield* chat.prompt("EDITED-TEXT").pipe(Effect.forkScoped)
      const editedMessage = yield* waitMessage(chat, "EDITED-TEXT")
      yield* waitAccepted(logDir, editedMessage.info.id)
      yield* Effect.promise(() => chat.sdk.question.reply({ requestID: question.id, answers: [["Continue"]] }))
      yield* fixture.llm.wait(2)
      const all = yield* pollWithTimeout(messages(chat).pipe(Effect.map((all) =>
        all.filter((msg) => msg.parts.some((part) => part.type === "text" && part.metadata?.steered)).length === 1
          ? all : undefined)), "delivery receipt never saved", "30 seconds")
      const delivered = all.find((msg) => msg.parts.some((part) => part.type === "text" && part.text === "EDITED-TEXT"))!
      const denied = yield* Effect.promise(() => chat.sdk.session.deleteMessage({ sessionID: chat.sessionID,
        messageID: delivered.info.id }))
      expect(denied.error).toBeDefined()
      release.resolve()
      yield* Effect.forEach([turn, editing, deleting, edited], Fiber.join, { discard: true })
      const inputs = yield* fixture.llm.inputs
      expect(inputs).toHaveLength(2)
      expect(JSON.stringify(inputs)).not.toContain("EDIT-ME")
      expect(JSON.stringify(inputs)).not.toContain("DELETE-ME")
      expect(JSON.stringify(inputs[1].messages)).toContain("EDITED-TEXT")
      expect((yield* messages(chat)).filter((msg) => msg.info.role === "assistant")).toHaveLength(1)
      // Idle history deletion remains supported, even for delivered messages.
      expect((yield* Effect.promise(() => chat.sdk.session.deleteMessage({ sessionID: chat.sessionID,
        messageID: delivered.info.id }))).error).toBeUndefined()
      expectIsolated(inputs)
    }), 120_000)

  for (const mode of ["held", "written", "streamed"] as const)
    cliIt.live(mode === "held" ? "cancel never flushes a held proxy steer"
      : mode === "streamed" ? "cancel retires written unread input after visible content"
      : "cancel retires written unread CLI input", (fixture) =>
      Effect.gen(function* () {
        const written = mode !== "held"
        const config = chatConfig(fixture.llm.url)
        const logDir = path.join(fixture.home, "steeringLog")
        const chat = yield* openChat(fixture, { config: { provider: { ...config.provider,
          "claude-code": { options: { ...config.provider["claude-code"].options,
            logging: { file: true, dir: logDir, level: "debug" } } } } } })
        if (written) {
          yield* fixture.llm.text("CANCEL-PRIOR-DONE")
          yield* chat.prompt("CANCEL-PRIOR")
        }
        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        const timeline: { event: string; at: number }[] = []
        let cancelling = true
        if (written) {
          yield* fixture.llm.pushMatch(() => { timeline.push({ event: "initial request", at: Date.now() }); return true },
            mode === "streamed" ? reply().text("CANCEL-STARTED").hang()
              : reply().wait(release.promise).text("CANCEL-STARTED").stop())
          yield* fixture.llm.pushMatch(() => {
            if (!cancelling) return false
            timeline.push({ event: "steer request", at: Date.now() })
            return true
          }, reply().hang())
        }
        if (!written) yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
        const turn = yield* chat.prompt("CANCEL-TURN").pipe(Effect.forkScoped)
        yield* fixture.llm.wait(written ? 2 : 1)
        if (mode === "streamed") yield* pollWithTimeout(
          Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text()).pipe(Effect.map((text) =>
            text.split("doStream starting").at(-1)?.includes('"type":"content_block_delta"') ? true : undefined)),
          "visible content never streamed", "30 seconds")
        if (!written) yield* waitQuestion(chat)
        const steer = yield* chat.prompt("CANCEL-STEER").pipe(Effect.forkScoped)
        yield* waitMessage(chat, "CANCEL-STEER")
        if (written) yield* pollWithTimeout(Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text()).pipe(
          Effect.map((text) => text.includes("steered user message into running turn") ? true : undefined)),
          "steer was not written", "30 seconds")
        timeline.push({ event: "explicit abort issued", at: Date.now() })
        yield* Effect.promise(() => chat.sdk.session.abort({ sessionID: chat.sessionID }))
        timeline.push({ event: "explicit abort returned", at: Date.now() })
        yield* Fiber.join(turn)
        yield* Fiber.join(steer)
        const log = yield* Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text())
        if (mode === "streamed") expect(log).toContain("abort signal received mid-turn")
        if (!written) expect(log).not.toContain("steered user message into running turn")
        if (written) yield* pollWithTimeout(Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text()).pipe(
          Effect.map((text) => text.includes("claude process exited") ? true : undefined)),
          "cancelled CLI did not exit", "30 seconds")
        release.resolve()
        expect(yield* fixture.llm.inputs, JSON.stringify(timeline)).toHaveLength(written ? 2 : 1)
        expect(timeline.some((entry) => entry.event === "steer request")).toBe(false)
        cancelling = false
        const pending = yield* waitMessage(chat, "CANCEL-STEER")
        expect(pending.parts.some((part) => part.type === "text" && part.metadata?.steered)).toBe(false)
        yield* fixture.llm.text("PENDING-DONE")
        yield* fixture.llm.text("NEXT-DONE")
        const next = yield* chat.prompt("NEXT-AFTER-CANCEL").pipe(Effect.forkScoped)
        timeline.push({ event: "next prompt started", at: Date.now() })
        if (written) {
          const confirm = yield* waitQuestion(chat)
          timeline.push({ event: "fresh confirmed", at: Date.now() })
          expect(confirm.questions[0].header).toBe("Claude session lost")
          yield* Effect.promise(() => chat.sdk.question.reply({ requestID: confirm.id, answers: [["Start fresh"]] }))
        }
        const result = yield* Fiber.join(next)
        expect(result.error, JSON.stringify(result)).toBeUndefined()
        expect(result.data?.info.role === "assistant" ? result.data.info.error : undefined, JSON.stringify(result)).toBeUndefined()
        const inputs = yield* fixture.llm.inputs
        expect(inputs).toHaveLength(written ? 4 : 3)
        expect(JSON.stringify(inputs[written ? 2 : 1].messages)).toContain("CANCEL-STEER")
        expect(JSON.stringify(inputs[written ? 2 : 1].messages)).not.toContain("NEXT-AFTER-CANCEL")
        expect(JSON.stringify(inputs.at(-1)!.messages)).toContain("NEXT-AFTER-CANCEL")
        expectIsolated(inputs)
      }), 120_000)

  cliIt.live("identical steer text saves each UUID receipt exactly once", (fixture) =>
    Effect.gen(function* () {
      const chat = yield* openChat(fixture)
      yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
      yield* fixture.llm.text("REPEATED-DONE")
      yield* fixture.llm.text("REPEATED-LATE-DONE")
      const turn = yield* chat.prompt("REPEATED-TEXT").pipe(Effect.forkScoped)
      const question = yield* waitQuestion(chat)
      const first = yield* chat.prompt("REPEATED-TEXT").pipe(Effect.forkScoped)
      yield* waitMessage(chat, "REPEATED-TEXT", 2)
      const second = yield* chat.prompt("REPEATED-TEXT").pipe(Effect.forkScoped)
      yield* waitMessage(chat, "REPEATED-TEXT", 3)
      yield* Effect.promise(() => chat.sdk.question.reply({ requestID: question.id, answers: [["Continue"]] }))
      yield* Effect.forEach([turn, first, second], Fiber.join, { discard: true })
      const all = yield* messages(chat)
      const users = all.filter((msg) => msg.info.role === "user")
      expect(users).toHaveLength(3)
      expect(users[0].parts.find((part) => part.type === "text")?.metadata?.steered).toBeUndefined()
      for (const message of users.slice(1)) {
        const metadata = message.parts.find((part) => part.type === "text")?.metadata
        expect(metadata?.steered).toBeNumber()
        expect(metadata?.steeredParentID).toBe(users[0].info.id)
      }
      expect(all.filter((msg) => msg.info.role === "assistant")).toHaveLength(1)
      const inputs = yield* fixture.llm.inputs
      expect(inputs).toHaveLength(3)
      expectIsolated(inputs)
    }), 120_000)

  cliIt.live("failed receipt save stops the turn with an error instead of resending the steer", (fixture) =>
    Effect.gen(function* () {
      const config = chatConfig(fixture.llm.url)
      const logDir = path.join(fixture.home, "receiptLog")
      const chat = yield* openChat(fixture, { config: { provider: { ...config.provider,
        "claude-code": { options: { ...config.provider["claude-code"].options,
          logging: { file: true, dir: logDir } } } } } })
      yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
      const release = Promise.withResolvers<void>()
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      yield* fixture.llm.push(reply().wait(release.promise).text("MUST-NOT-FINISH").stop())
      const turn = yield* chat.prompt("RECEIPT-TURN").pipe(Effect.forkScoped)
      const question = yield* waitQuestion(chat)
      const steer = yield* chat.prompt("RECEIPT-STEER").pipe(Effect.forkScoped)
      const queued = yield* waitMessage(chat, "RECEIPT-STEER")
      yield* waitAccepted(logDir, queued.info.id)
      yield* Effect.sync(() => {
        using db = new Database(path.join(fixture.home, "opencode.db"))
        db.exec(`CREATE TRIGGER rejectSteerReceipt BEFORE UPDATE ON part
          WHEN json_extract(NEW.data, '$.metadata.steered') IS NOT NULL
          BEGIN SELECT RAISE(ABORT, 'test receipt save failure'); END`)
      })
      yield* Effect.promise(() => chat.sdk.question.reply({ requestID: question.id, answers: [["Continue"]] }))
      const result = yield* Fiber.join(turn)
      yield* Fiber.join(steer)
      const receiptLog = yield* Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text())
      expect(receiptLog).toContain("claude consumed steered message")
      expect(JSON.stringify(result.data?.info.role === "assistant" ? result.data.info.error : "no assistant"))
        .toContain("saving its delivery receipt failed")
      yield* pollWithTimeout(Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text()).pipe(
        Effect.map((text) => text.includes("claude process exited") ? text : undefined)),
        "receipt failure did not retire the CLI", "30 seconds")
      release.resolve()
      const all = yield* messages(chat)
      expect(all.filter((msg) => msg.info.role === "assistant")).toHaveLength(1)
      expect(JSON.stringify(all)).not.toContain("MUST-NOT-FINISH")
      expect(all.find((msg) => msg.parts.some((part) => part.type === "text" && part.text === "RECEIPT-STEER"))
        ?.parts.find((part) => part.type === "text")?.metadata?.steered).toBeUndefined()
      const log = yield* Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text())
      expect(log.split("doStream starting")).toHaveLength(2)
      expect((yield* fixture.llm.inputs).length).toBeLessThanOrEqual(2)
      expectIsolated(yield* fixture.llm.inputs)
    }), 120_000)

  cliIt.live("denying a held proxy call never delivers its held steer", (fixture) =>
    Effect.gen(function* () {
      const chat = yield* openChat(fixture)
      yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
      const turn = yield* chat.prompt("DENIAL-TURN").pipe(Effect.forkScoped)
      const question = yield* waitQuestion(chat)
      const steer = yield* chat.prompt("DENIED-STEER").pipe(Effect.forkScoped)
      yield* waitMessage(chat, "DENIED-STEER")
      yield* Effect.promise(() => chat.sdk.question.reject({ requestID: question.id }))
      yield* Fiber.join(turn)
      yield* Fiber.join(steer)
      const all = yield* messages(chat)
      expect(all.filter((msg) => msg.info.role === "assistant")).toHaveLength(1)
      expect(all.some((msg) => msg.parts.some((part) => part.type === "tool" && part.state.status === "error"))).toBe(true)
      const pending = yield* waitMessage(chat, "DENIED-STEER")
      expect(pending.parts.some((part) => part.type === "text" && part.metadata?.steered)).toBe(false)
      expect(JSON.stringify(yield* fixture.llm.inputs)).not.toContain("DENIED-STEER")
      expectIsolated(yield* fixture.llm.inputs)
    }), 120_000)

  for (const restrictedFirst of [false, true])
    cliIt.live(restrictedFirst ? "ordinary prompt ends a restricted command turn at its next tool boundary"
      : "permission-bearing command ends the running turn at its next tool boundary", (fixture) =>
      Effect.gen(function* () {
        const config = chatConfig(fixture.llm.url)
        const logDir = path.join(fixture.home, "preemptLog")
        const chat = yield* openChat(fixture, { config: {
          provider: { ...config.provider, "claude-code": { options: { ...config.provider["claude-code"].options,
            logging: { file: true, dir: logDir } } } },
          command: { restricted: { template: "RESTRICTED-TURN", permission: { "*": "deny", read: "allow" } } },
        } })
        const [first, second] = restrictedFirst ? ["RESTRICTED-TURN", "ORDINARY-TURN"] : ["ORDINARY-TURN", "RESTRICTED-TURN"]
        const release = Promise.withResolvers<void>()
        yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
        const sent = (body: Record<string, unknown>, text: string) => JSON.stringify(body.messages).includes(text)
        yield* fixture.llm.pushMatch((hit) => sent(hit.body, second), reply().text("FOLLOWUP-DONE").stop())
        // The continuation after the tool result must never answer: the turn ends at that boundary.
        yield* fixture.llm.pushMatch((hit) => sent(hit.body, "tool_result"), reply().text("INITIAL-NEVER").hang())
        yield* fixture.llm.pushMatch((hit) => sent(hit.body, first), reply().wait(release.promise)
          .tool("Read", { file_path: path.join(chat.project, "preempt.txt") }))
        const command = Effect.promise(() => chat.sdk.session.command({ sessionID: chat.sessionID,
          command: "restricted", arguments: "", model: "claude-code/claude-sonnet-4-5" }))
        const initial = yield* (restrictedFirst ? command : chat.prompt("ORDINARY-TURN")).pipe(Effect.forkScoped)
        yield* fixture.llm.wait(1)
        const next = yield* (restrictedFirst ? chat.prompt("ORDINARY-TURN") : command).pipe(Effect.forkScoped)
        const queued = yield* waitMessage(chat, second)
        yield* waitAccepted(logDir, queued.info.id, "accepted preempting message")
        release.resolve()
        yield* Fiber.join(initial)
        yield* Fiber.join(next)
        const log = yield* Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text())
        expect(log).toContain("preempting claude turn for a queued message")
        const inputs = yield* fixture.llm.inputs
        const followups = inputs.filter((input) => sent(input, second))
        expect(followups).toHaveLength(1)
        expect(inputs.at(-1)).toBe(followups[0])
        // Claude's transcript kept the tool result the turn ended on.
        expect(JSON.stringify(followups[0].messages)).toContain("tool_result")
        const names = [inputs[0], followups[0]].map((input) => (input.tools as { name: string }[]).map((tool) => tool.name))
        expect(names[restrictedFirst ? 0 : 1]).not.toContain("Write")
        expect(names[restrictedFirst ? 0 : 1]).not.toContain("mcp__opencode_proxy__write")
        expect(names[restrictedFirst ? 1 : 0]).toContain("Write")
        const all = yield* messages(chat)
        expect(all.filter((msg) => msg.info.role === "assistant")).toHaveLength(2)
        expect(JSON.stringify(all)).not.toContain("INITIAL-NEVER")
        expect(JSON.stringify(all)).toContain("FOLLOWUP-DONE")
        expect(all.some((msg) => msg.parts.some((part) => part.type === "text" && part.metadata?.steered))).toBe(false)
        expect((yield* Effect.promise(() => chat.sdk.session.get({ sessionID: chat.sessionID }))).data!.permission ?? []).toEqual([])
        expectIsolated(inputs)
      }), 120_000)

  cliIt.live("deleting a message waiting to end the turn lets the turn finish", (fixture) =>
    Effect.gen(function* () {
      const config = chatConfig(fixture.llm.url)
      const logDir = path.join(fixture.home, "preemptDeleteLog")
      const chat = yield* openChat(fixture, { config: {
        provider: { ...config.provider, "claude-code": { options: { ...config.provider["claude-code"].options,
          logging: { file: true, dir: logDir } } } },
        command: { restricted: { template: "RESTRICTED-TURN", permission: { "*": "deny", read: "allow" } } },
      } })
      yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
      yield* fixture.llm.text("HELD-DONE")
      const turn = yield* chat.prompt("ORDINARY-TURN").pipe(Effect.forkScoped)
      const question = yield* waitQuestion(chat)
      const command = yield* Effect.promise(() => chat.sdk.session.command({ sessionID: chat.sessionID,
        command: "restricted", arguments: "", model: "claude-code/claude-sonnet-4-5" })).pipe(Effect.forkScoped)
      const queued = yield* waitMessage(chat, "RESTRICTED-TURN")
      yield* waitAccepted(logDir, queued.info.id, "accepted preempting message")
      expect((yield* Effect.promise(() => chat.sdk.session.deleteMessage({ sessionID: chat.sessionID,
        messageID: queued.info.id }))).error).toBeUndefined()
      yield* Effect.promise(() => chat.sdk.question.reply({ requestID: question.id, answers: [["Continue"]] }))
      yield* Fiber.join(turn)
      yield* Fiber.join(command)
      const log = yield* Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text())
      expect(log).not.toContain("preempting claude turn for a queued message")
      const inputs = yield* fixture.llm.inputs
      expect(inputs).toHaveLength(2)
      expect(JSON.stringify(inputs)).not.toContain("RESTRICTED-TURN")
      const all = yield* messages(chat)
      expect(all.filter((msg) => msg.info.role === "assistant")).toHaveLength(1)
      expect(JSON.stringify(all)).toContain("HELD-DONE")
      expectIsolated(inputs)
    }), 120_000)

  for (const prior of [false, true])
    cliIt.live(prior ? "delivered steer revert restores patches and rewinds to the prior exchange"
      : "delivered steer revert restores patches and resets an empty conversation", (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture)
        if (prior) {
          yield* fixture.llm.text("PRIOR-REPLY")
          yield* chat.prompt("KEEP-PRIOR")
        }
        const before = path.join(chat.project, "beforeSteer.txt")
        const after = path.join(chat.project, "afterSteer.txt")
        yield* fixture.llm.tool("Write", { file_path: before, content: "before" })
        yield* fixture.llm.tool("mcp__opencode_proxy__question", heldQuestion)
        yield* fixture.llm.tool("Write", { file_path: after, content: "after" })
        yield* fixture.llm.text("REVERT-TURN-DONE")
        const turn = yield* chat.prompt("REVERT-ORIGINAL").pipe(Effect.forkScoped)
        const question = yield* waitQuestion(chat)
        const steer = yield* chat.prompt("REVERT-STEER").pipe(Effect.forkScoped)
        const sent = yield* waitMessage(chat, "REVERT-STEER")
        yield* Effect.promise(() => chat.sdk.question.reply({ requestID: question.id, answers: [["Continue"]] }))
        yield* Fiber.join(turn)
        yield* Fiber.join(steer)
        const original = yield* waitMessage(chat, "REVERT-ORIGINAL")
        const delivered = yield* waitMessage(chat, "REVERT-STEER")
        expect(delivered.parts.find((part) => part.type === "text")?.metadata?.steeredParentID).toBe(original.info.id)
        expect(yield* Effect.promise(() => Bun.file(before).text())).toBe("before")
        expect(yield* Effect.promise(() => Bun.file(after).text())).toBe("after")
        const revert = yield* Effect.promise(() => chat.sdk.session.revert({ sessionID: chat.sessionID, messageID: sent.info.id }))
        expect(revert.error).toBeUndefined()
        expect(revert.data?.revert?.messageID).toBe(original.info.id)
        expect(yield* Effect.promise(() => Bun.file(before).exists())).toBe(false)
        expect(yield* Effect.promise(() => Bun.file(after).exists())).toBe(false)
        yield* fixture.llm.text("AFTER-REVERT-DONE")
        yield* chat.prompt("AFTER-REVERT")
        const inputs = yield* fixture.llm.inputs
        const last = JSON.stringify(inputs.at(-1)!.messages)
        expect(last).not.toContain("REVERT-ORIGINAL")
        expect(last).not.toContain("REVERT-STEER")
        if (prior) expect(last).toContain("KEEP-PRIOR")
        if (!prior) expect((inputs.at(-1)!.messages as unknown[])).toHaveLength(1)
        expectIsolated(inputs)
      }), 120_000)
})

const heldQuestion = { questions: [{ header: "Hold turn", question: "Continue this held tool?",
  options: [{ label: "Continue", description: "Release the tool" }] }] }

const messages = (chat: Effect.Success<ReturnType<typeof openChat>>) =>
  Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }, { throwOnError: true })).pipe(
    Effect.map((result) => result.data))

const waitMessage = (chat: Effect.Success<ReturnType<typeof openChat>>, text: string, count = 1) =>
  pollWithTimeout(messages(chat).pipe(Effect.map((all) => {
    // A command's text starts with its `[/name is active ...]` header, then a blank line and the template.
    const found = all.filter((msg) => msg.parts.some((part) => part.type === "text" &&
      (part.text === text || part.text.endsWith(`\n\n${text}`))))
    return found.length >= count ? found.at(-1) : undefined
  })), `message ${text} was never stored`, "30 seconds")

const waitQuestion = (chat: Effect.Success<ReturnType<typeof openChat>>) =>
  pollWithTimeout(Effect.promise(() => chat.sdk.question.list()).pipe(Effect.map((result) => result.data?.at(0))),
    "held question never appeared", "30 seconds")

// Saving a prompt precedes intake. Wait for ownership before racing Edit/Delete or the tool result.
const waitAccepted = (logDir: string, messageID: string, event = "accepted steered message") => pollWithTimeout(
  Effect.promise(() => Bun.file(path.join(logDir, "plugin.log")).text()).pipe(Effect.map((text) =>
    text.split("\n").some((line) => line.includes(event) && line.includes(messageID))
      ? true : undefined)), `${event} never logged`, "30 seconds")
