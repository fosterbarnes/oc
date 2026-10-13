// /btw is not supported on the Claude Code provider yet. The request must be refused before any
// model call, and an active Claude turn must finish as if the request never happened.
import { describe, expect } from "bun:test"
import { Effect, Fiber } from "effect"
import { cliIt } from "../../lib/cli-process"
import { expectIsolated, openChat } from "./chatFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

describe.skipIf(!cliPath)("/btw on the Claude Code provider", () => {
  cliIt.live(
    "refuses a side question with zero model calls while a turn is running",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        const release = Promise.withResolvers<void>()
        yield* llm.hold("active turn reply", release.promise)

        const turn = yield* chat.prompt("Start a long answer.").pipe(Effect.forkScoped)
        yield* llm.wait(1)
        const calls = yield* llm.calls

        const refused = yield* Effect.promise(() =>
          chat.sdk.session.generate({ sessionID: chat.sessionID, prompt: "What is the answer?" }),
        )
        expect(refused.response.status).toBe(422)
        expect(refused.error).toMatchObject({
          _tag: "UnsupportedProviderError",
          message: "/btw is not available on Claude Code yet",
        })
        expect(yield* llm.calls).toBe(calls)

        release.resolve()
        yield* Fiber.join(turn)
        expectIsolated(yield* llm.inputs)
        const parts = yield* chat.parts
        expect(parts.findLast((part) => part.type === "text")).toMatchObject({ text: "active turn reply" })
      }),
    120_000,
  )
})
