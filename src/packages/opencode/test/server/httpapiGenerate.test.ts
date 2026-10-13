import { expect } from "bun:test"
import path from "path"
import { Cause, Effect, Exit, Fiber } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import { SessionPrompt } from "@/session/prompt"
import { SessionRevert } from "@/session/revert"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionPrompt.node,
      SessionRevert.node,
      SessionCompaction.node,
      Session.node,
      SessionProjector.node,
      EventV2Bridge.node,
      llmNode,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })]],
  ),
)

const setup = Effect.fnUntraced(function* () {
  const instance = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* Effect.promise(() =>
    Bun.write(
      path.join(instance.directory, "opencode.json"),
      JSON.stringify({
        ...testProviderConfig(llm.url),
        enabled_providers: ["test"],
        model: "test/test-model",
        snapshot: false,
      }),
    ),
  )
  return {
    directory: instance.directory,
    llm,
    sessions: yield* Session.Service,
    prompt: yield* SessionPrompt.Service,
    revert: yield* SessionRevert.Service,
    compaction: yield* SessionCompaction.Service,
  }
})
type Fixture = Effect.Success<ReturnType<typeof setup>>

// A finished user turn with a scripted reply.
const turn = (fixture: Fixture, sessionID: SessionID, text: string, reply: string) =>
  Effect.gen(function* () {
    yield* fixture.llm.text(reply)
    yield* fixture.prompt.prompt({ sessionID, model: ref, parts: [{ type: "text", text }] })
  })

const side = (fixture: Fixture, sessionID: SessionID, prompt: string) => fixture.prompt.generate({ sessionID, prompt })

const failureOf = (exit: Exit.Exit<unknown, unknown>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined)

// JSON of the request body the model received last.
const lastRequest = (fixture: Fixture) => Effect.map(fixture.llm.inputs, (bodies) => JSON.stringify(bodies.at(-1)))

it.instance("answers from the history and writes nothing back to the session", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "side question" })
    yield* turn(fixture, session.id, "first question", "first reply")
    const messages = yield* fixture.sessions.messages({ sessionID: session.id })
    const info = yield* fixture.sessions.get(session.id)

    yield* fixture.llm.text("side answer")
    const result = yield* side(fixture, session.id, "what was asked first?")

    expect(result).toEqual({ text: "side answer", providerID: ref.providerID, modelID: ref.modelID })
    expect(yield* fixture.sessions.messages({ sessionID: session.id })).toEqual(messages)
    expect(yield* fixture.sessions.get(session.id)).toEqual(info)

    const request = yield* lastRequest(fixture)
    expect(request).toContain("first question")
    expect(request).toContain("what was asked first?")
    expect(request).toContain("This answer is not added to the conversation.")
    expect(request).not.toContain('"tools"')
  }),
)

it.instance("sends only the history that survives revert and skips unfinished output", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "revert" })
    yield* turn(fixture, session.id, "kept question", "kept reply")
    const unfinished = yield* fixture.sessions.updateMessage({
      id: MessageID.ascending(),
      role: "assistant",
      parentID: (yield* fixture.sessions.messages({ sessionID: session.id })).at(-1)!.info.id,
      sessionID: session.id,
      mode: "build",
      agent: "build",
      path: { cwd: fixture.directory, root: fixture.directory },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ref.modelID,
      providerID: ref.providerID,
      time: { created: Date.now() },
    })
    yield* fixture.sessions.updatePart({
      id: PartID.ascending(),
      messageID: unfinished.id,
      sessionID: session.id,
      type: "text",
      text: "unfinished partial output",
    })
    yield* turn(fixture, session.id, "reverted question", "reverted reply")
    const reverted = (yield* fixture.sessions.messages({ sessionID: session.id })).at(-2)!
    yield* fixture.revert.revert({ sessionID: session.id, messageID: reverted.info.id })

    yield* fixture.llm.text("side answer")
    yield* side(fixture, session.id, "after revert?")

    const request = yield* lastRequest(fixture)
    expect(request).toContain("kept question")
    expect(request).toContain("after revert?")
    expect(request).not.toContain("reverted question")
    expect(request).not.toContain("unfinished partial output")
  }),
)

it.instance("uses the compacted summary as the context", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "compacted" })
    yield* turn(fixture, session.id, "old question", "old reply")
    yield* fixture.llm.text("COMPACTED-SUMMARY")
    yield* fixture.compaction.create({ sessionID: session.id, agent: "build", model: ref, auto: false })
    yield* fixture.prompt.loop({ sessionID: session.id })

    yield* fixture.llm.text("side answer")
    yield* side(fixture, session.id, "after compaction?")

    expect(yield* lastRequest(fixture)).toContain("COMPACTED-SUMMARY")
  }),
)

it.instance("reports provider failures, tool calls, and empty answers as errors without writing history", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "failures" })
    yield* turn(fixture, session.id, "first question", "first reply")
    const count = (yield* fixture.sessions.messages({ sessionID: session.id })).length

    yield* fixture.llm.error(500, { error: "upstream down" })
    const failed = yield* side(fixture, session.id, "one").pipe(Effect.exit)
    expect(failureOf(failed)).toMatchObject({ _tag: "GenerateFailedError" })

    yield* fixture.llm.tool("bash", { command: "ls" })
    const tool = yield* side(fixture, session.id, "two").pipe(Effect.exit)
    expect(failureOf(tool)).toMatchObject({ _tag: "GenerateFailedError", message: expect.stringContaining("tool") })

    yield* fixture.llm.text("")
    const empty = yield* side(fixture, session.id, "three").pipe(Effect.exit)
    expect(failureOf(empty)).toMatchObject({ _tag: "GenerateFailedError", message: expect.stringContaining("empty") })

    expect((yield* fixture.sessions.messages({ sessionID: session.id })).length).toBe(count)
  }),
)

it.instance("times out after 120 seconds", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "timeout" })
    yield* fixture.llm.hang

    const fiber = yield* side(fixture, session.id, "slow?").pipe(Effect.exit, Effect.forkChild)
    yield* fixture.llm.wait(1)
    yield* TestClock.adjust("121 seconds")
    const exit = yield* Fiber.join(fiber)
    expect(failureOf(exit)).toMatchObject({ _tag: "GenerateTimeoutError" })
  }).pipe(Effect.provide(TestClock.layer())),
)

it.instance("stops the model request when the caller is interrupted", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "interrupt" })
    yield* fixture.llm.hang

    const fiber = yield* side(fixture, session.id, "stop me").pipe(Effect.forkChild)
    yield* fixture.llm.wait(1)
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    expect(yield* fixture.sessions.messages({ sessionID: session.id })).toEqual([])
  }),
)
