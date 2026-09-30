import { expect } from "bun:test"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Agent } from "@/agent/agent"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { SessionProcessor } from "@/session/processor"
import { SessionTools } from "@/session/tools"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Deferred, Effect, Layer, Schema } from "effect"
import { testEffect } from "../lib/effect"

const callID = "call-test"
const sessionID = SessionID.make("ses_test")
const messageID = MessageID.ascending()
const partID = PartID.ascending()

const agent: Agent.Info = {
  name: "build",
  mode: "primary",
  options: {},
  permission: [{ permission: "*", pattern: "*", action: "allow" }],
}

const model = {
  providerID: ProviderV2.ID.make("test"),
  api: { id: "test-model" },
} as Provider.Model

function fakeMcp() {
  return MCP.Service.of({
    tools: () => Effect.succeed({}),
    clients: () => Effect.succeed({}),
  } as Partial<MCP.Interface> as MCP.Interface)
}

const fakePlugin = Plugin.Service.of({
  init: () => Effect.void,
  list: () => Effect.succeed([]),
  trigger: (_name, _input, output) => Effect.succeed(output),
} satisfies Plugin.Interface)

const fakePermission = Permission.Service.of({
  ask: () => Effect.void,
  reply: () => Effect.void,
  list: () => Effect.succeed([]),
} satisfies Permission.Interface)

const fakeTruncate = Truncate.Service.of({
  cleanup: () => Effect.void,
  write: () => Effect.succeed("output.txt"),
  output: (text: string) => Effect.succeed({ content: text, truncated: false }),
  limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
} satisfies Truncate.Interface)

const layer = Layer.mergeAll(
  Layer.succeed(Plugin.Service, fakePlugin),
  Layer.succeed(Permission.Service, fakePermission),
  Layer.succeed(MCP.Service, fakeMcp()),
  Layer.succeed(Truncate.Service, fakeTruncate),
  RuntimeFlags.layer(),
  Layer.succeed(
    ToolRegistry.Service,
    ToolRegistry.Service.of({
      ids: () => Effect.succeed(["timing"]),
      all: () => Effect.succeed([]),
      named: () => Effect.die("unused"),
      tools: () =>
        Effect.succeed([
          {
            id: "timing",
            description: "updates metadata more than once",
            parameters: Schema.Struct({}),
            jsonSchema: { type: "object", properties: {} },
            execute: (_args, ctx) =>
              Effect.gen(function* () {
                yield* ctx.metadata({ metadata: { output: "first" } })
                yield* ctx.metadata({ metadata: { output: "second" } })
                return { title: "timing", metadata: {}, output: "done" }
              }),
          } satisfies Tool.Def,
        ]),
    }),
  ),
)

const it = testEffect(layer)

function timingTool(toolPartReady: () => Effect.Effect<void> = () => Effect.void) {
  const state: SessionV1.ToolPart = {
    id: partID,
    sessionID,
    messageID,
    type: "tool",
    tool: "timing",
    callID,
    state: {
      status: "running",
      input: {},
      time: { start: 100 },
    },
  }
  const updates: number[] = []
  const processor = {
    message: {
      id: messageID,
      sessionID,
      role: "assistant",
      parentID: MessageID.ascending(),
      agent: "build",
      mode: "build",
      path: { cwd: "/tmp", root: "/tmp" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: ModelV2.ID.make("test-model"),
      providerID: ProviderV2.ID.make("test"),
      time: { created: 1 },
    } satisfies SessionV1.Assistant,
    updateToolCall: (_toolCallID, update) =>
      Effect.sync(() => {
        const next = update(state)
        state.state = next.state
        if (state.state.status === "running") updates.push(state.state.time.start)
        return state
      }),
    completeToolCall: () => Effect.void,
    toolPartReady,
  } satisfies Pick<SessionProcessor.Handle, "message" | "updateToolCall" | "completeToolCall" | "toolPartReady">
  return Effect.gen(function* () {
    const tools = yield* SessionTools.resolve({
      agent,
      model,
      session: { id: sessionID, permission: [] } as unknown as Session.Info,
      processor,
      bypassAgentCheck: false,
      messages: [],
      promptOps: {} as never,
    })
    const execute = tools.timing.execute
    if (!execute) throw new Error("timing tool is missing execute")
    return {
      state,
      updates,
      run: (experimental_context?: unknown, abortSignal = new AbortController().signal) =>
        execute({}, { toolCallId: callID, abortSignal, messages: [], experimental_context }),
    }
  })
}

it.effect("preserves running tool start time across metadata updates", () =>
  Effect.gen(function* () {
    const timing = yield* timingTool()
    yield* Effect.promise(() => timing.run())

    expect(timing.updates).toEqual([100, 100])
    expect(timing.state.state.status).toBe("running")
    if (timing.state.state.status === "running") {
      expect(timing.state.state.time.start).toBe(100)
    }
  }),
)

it.live("provider-executed calls wait for their tool part before running", () =>
  Effect.gen(function* () {
    const ready = Deferred.makeUnsafe<void>()
    const timing = yield* timingTool(() => Deferred.await(ready))
    const result = timing.run({ awaitToolPart: true })
    yield* Effect.sleep(20)
    expect(timing.updates).toEqual([])

    yield* Deferred.succeed(ready, undefined)
    yield* Effect.promise(() => result)
    expect(timing.updates).toEqual([100, 100])
  }),
)

it.live("an aborted provider call interrupts the readiness wait without executing", () =>
  Effect.gen(function* () {
    const ready = Deferred.makeUnsafe<void>()
    const timing = yield* timingTool(() => Deferred.await(ready))
    const cancellation = new AbortController()
    const result = timing.run({ awaitToolPart: true }, cancellation.signal).then(() => false, () => true)
    cancellation.abort()
    expect(yield* Effect.promise(() => result)).toBe(true)
    yield* Deferred.succeed(ready, undefined)
    expect(timing.updates).toEqual([])
  }),
)
