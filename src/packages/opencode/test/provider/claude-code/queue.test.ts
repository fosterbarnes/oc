// Queued prompts on the Claude Code provider: they run one turn at a time in the order they were added,
// an interrupt keeps the rest queued until the user resumes, and each queued prompt is sent once.
import { describe, expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { cliIt } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { expectIsolated, openChat } from "./chatFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

describe.skipIf(!cliPath)("queued prompts on the Claude Code provider", () => {
  cliIt.live(
    "runs queued prompts one turn at a time, in order, each sent once",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const release = Promise.withResolvers<void>()
        yield* llm.hold("first reply", release.promise)
        yield* llm.text("second reply")
        yield* llm.text("third reply")

        const turn = yield* chat.prompt("first").pipe(Effect.forkScoped)
        yield* llm.wait(1)
        const queued = (text: string) =>
          Effect.promise(() =>
            chat.sdk.session.queue.update({
              sessionID: chat.sessionID,
              body: { type: "add", parts: [{ type: "text", text }] },
            }),
          )
        yield* queued("second")
        yield* queued("third")
        const waiting = yield* Effect.promise(() => chat.sdk.session.queue.get({ sessionID: chat.sessionID }))
        expect(waiting.data?.entries.map((entry) => entry.text)).toEqual(["second", "third"])
        expect(yield* llm.calls).toBe(1)

        release.resolve()
        yield* Fiber.join(turn)
        yield* pollWithTimeout(
          Effect.gen(function* () {
            const snapshot = yield* Effect.promise(() => chat.sdk.session.queue.get({ sessionID: chat.sessionID }))
            return snapshot.data?.entries.length === 0 && (yield* llm.calls) === 3 ? (true as const) : undefined
          }),
          "queued prompts never finished",
          "60 seconds",
        )

        const messages = yield* Effect.promise(() => chat.sdk.session.messages({ sessionID: chat.sessionID }))
        const users = (messages.data ?? [])
          .filter((message) => message.info.role === "user")
          .map((message) => message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(""))
        expect(users).toEqual(["first", "second", "third"])
        expectIsolated(yield* llm.inputs)
      }),
    120_000,
  )

  cliIt.live(
    "an interrupt keeps the queued prompt until the user resumes it",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const release = Promise.withResolvers<void>()
        yield* llm.hold("interrupted reply", release.promise)
        yield* llm.text("resumed reply")

        const turn = yield* chat.prompt("running").pipe(Effect.forkScoped)
        yield* llm.wait(1)
        yield* Effect.promise(() =>
          chat.sdk.session.queue.update({
            sessionID: chat.sessionID,
            body: { type: "add", parts: [{ type: "text", text: "waiting" }] },
          }),
        )

        yield* Effect.promise(() => chat.sdk.session.abort({ sessionID: chat.sessionID }))
        release.resolve()
        yield* Fiber.join(turn)

        const paused = yield* pollWithTimeout(
          Effect.gen(function* () {
            const snapshot = yield* Effect.promise(() => chat.sdk.session.queue.get({ sessionID: chat.sessionID }))
            return snapshot.data?.pause === "interrupted" ? snapshot.data : undefined
          }),
          "queue never paused after the interrupt",
          "30 seconds",
        )
        expect(paused.entries.map((entry) => entry.text)).toEqual(["waiting"])
        expect(yield* llm.calls).toBe(1)

        yield* Effect.promise(() => chat.sdk.session.queue.update({ sessionID: chat.sessionID, body: { type: "resume" } }))
        yield* pollWithTimeout(
          Effect.gen(function* () {
            const snapshot = yield* Effect.promise(() => chat.sdk.session.queue.get({ sessionID: chat.sessionID }))
            return snapshot.data?.entries.length === 0 && (yield* llm.calls) === 2 ? (true as const) : undefined
          }),
          "resumed prompt never sent",
          "60 seconds",
        )
        expectIsolated(yield* llm.inputs)
      }),
    120_000,
  )
})
