import { beforeEach, expect } from "bun:test"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Agent } from "@/agent/agent"
import { MCP } from "@/mcp"
import { Permission } from "@/permission"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { SessionProcessor } from "@/session/processor"
import { SessionTools } from "@/session/tools"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { Plugin } from "@/plugin"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { asSchema, type Tool as AITool } from "ai"
import { Effect, Layer, Schema } from "effect"
import { testEffect } from "../lib/effect"

const sessionID = SessionID.make("ses_repair")
const messageID = MessageID.ascending()
const seen: unknown[] = []

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

const limitedParams = Schema.Struct({ limit: Schema.Number })
const optionalParams = Schema.Struct({ note: Schema.optional(Schema.String) })

// Mirrors the strict decode that Tool.define runs inside execute, so unrepaired input is rejected by the tool itself.
const strict = <A>(schema: Schema.Decoder<A>, args: unknown) =>
  Schema.decodeUnknownEffect(schema)(args).pipe(Effect.orDie)

const registryTools: Tool.Def[] = [
  {
    id: "limited",
    description: "reads a limit",
    parameters: limitedParams,
    execute: (args) =>
      Effect.gen(function* () {
        seen.push(args)
        const decoded = yield* strict(limitedParams, args)
        return { title: "limited", metadata: {}, output: `limit=${decoded.limit}` }
      }),
  },
  {
    id: "optional",
    description: "takes an optional note",
    parameters: optionalParams,
    execute: (args) =>
      Effect.gen(function* () {
        seen.push(args)
        const decoded = yield* strict(optionalParams, args)
        return { title: "optional", metadata: {}, output: `note=${decoded.note ?? "none"}` }
      }),
  },
  {
    id: "closed",
    description: "plugin-style closed schema",
    parameters: Schema.Unknown,
    jsonSchema: {
      type: "object",
      properties: { limit: { type: "integer" } },
      required: ["limit"],
      additionalProperties: false,
    },
    execute: (args) =>
      Effect.sync(() => {
        seen.push(args)
        return { title: "closed", metadata: {}, output: "closed" }
      }),
  },
  {
    id: "gated",
    description: "asks permission before running",
    parameters: limitedParams,
    execute: (args, ctx) =>
      Effect.gen(function* () {
        seen.push(args)
        yield* ctx.ask({ permission: "gated", patterns: ["*"], always: ["*"], metadata: {} })
        return { title: "gated", metadata: {}, output: "ran" }
      }),
  },
]

const layer = Layer.mergeAll(
  Layer.succeed(
    Plugin.Service,
    Plugin.Service.of({
      init: () => Effect.void,
      list: () => Effect.succeed([]),
      status: () => Effect.succeed([]),
      trigger: (_name, _input, output) => Effect.succeed(output),
    } satisfies Plugin.Interface),
  ),
  Layer.succeed(
    Permission.Service,
    Permission.Service.of({
      ask: () => Effect.die(new Error("permission denied")),
      reply: () => Effect.void,
      list: () => Effect.succeed([]),
    } satisfies Permission.Interface),
  ),
  Layer.succeed(
    MCP.Service,
    MCP.Service.of({
      tools: () => Effect.succeed({}),
      clients: () => Effect.succeed({}),
    } as Partial<MCP.Interface> as MCP.Interface),
  ),
  Layer.succeed(
    Truncate.Service,
    Truncate.Service.of({
      cleanup: () => Effect.void,
      write: () => Effect.succeed("output.txt"),
      output: (text: string) => Effect.succeed({ content: text, truncated: false }),
      limits: () => Effect.succeed({ maxLines: 2000, maxBytes: 50 * 1024 }),
    } satisfies Truncate.Interface),
  ),
  RuntimeFlags.layer(),
  Layer.succeed(
    ToolRegistry.Service,
    ToolRegistry.Service.of({
      ids: () => Effect.succeed(registryTools.map((tool) => tool.id)),
      all: () => Effect.succeed([]),
      named: () => Effect.die("unused"),
      tools: () => Effect.succeed(registryTools),
    }),
  ),
)

const it = testEffect(layer)

beforeEach(() => {
  seen.length = 0
})

const resolve = Effect.fn("test.resolve")(function* () {
  const processor = {
    message: { id: messageID } as SessionProcessor.Handle["message"],
    updateToolCall: () => Effect.succeed(undefined),
    completeToolCall: () => Effect.void,
    toolPartReady: () => Effect.void,
  }
  return yield* SessionTools.resolve({
    agent,
    model,
    session: { id: sessionID, permission: [] } as unknown as Session.Info,
    processor,
    bypassAgentCheck: false,
    messages: [],
    promptOps: {} as never,
  })
})

const run = (item: AITool, args: unknown) => {
  if (!item.execute) throw new Error("tool is missing execute")
  return item.execute(args, { toolCallId: "call-repair", abortSignal: new AbortController().signal, messages: [] })
}

const rejects = (promise: PromiseLike<unknown>) =>
  Promise.resolve(promise).then(
    () => false,
    () => true,
  )

it.effect("advertised schema keeps the original field types", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const advertised = asSchema(tools.limited.inputSchema).jsonSchema as { properties: Record<string, unknown> }
    expect(advertised.properties.limit).toEqual({ type: "number" })
  }),
)

it.effect("AI SDK input validation repairs a stringified number before execute", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const validated = yield* Effect.promise(async () => asSchema(tools.limited.inputSchema).validate!({ limit: "20" }))
    expect(validated).toEqual({ success: true, value: { limit: 20 } })
  }),
)

it.effect("streamed-style call runs the tool with the repaired value", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const validate = asSchema(tools.limited.inputSchema).validate!
    const validated = yield* Effect.promise(async () => validate({ limit: "20" }))
    if (!validated.success) throw new Error("validation failed")
    const result = yield* Effect.promise(() => run(tools.limited, validated.value))
    expect(result).toMatchObject({ output: "limit=20" })
    expect(seen).toEqual([{ limit: 20 }])
  }),
)

it.effect("direct executor call repairs input that skips schema validation", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const result = yield* Effect.promise(() => run(tools.limited, { limit: "20" }))
    expect(result).toMatchObject({ output: "limit=20" })
    expect(seen).toEqual([{ limit: 20 }])
  }),
)

it.effect("a stringified root object is repaired on direct execution", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const result = yield* Effect.promise(() => run(tools.limited, '{"limit":"20"}'))
    expect(result).toMatchObject({ output: "limit=20" })
  }),
)

it.effect("an optional null placeholder is removed before the tool's strict decode", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const result = yield* Effect.promise(() => run(tools.optional, { note: null }))
    expect(result).toMatchObject({ output: "note=none" })
  }),
)

it.effect("input the tool cannot accept is still rejected after the repair attempt", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const validate = asSchema(tools.limited.inputSchema).validate!
    const validated = yield* Effect.promise(async () => validate({ limit: "abc" }))
    expect(validated).toEqual({ success: true, value: { limit: "abc" } })
    expect(yield* Effect.promise(() => rejects(run(tools.limited, { limit: "abc" })))).toBe(true)
    expect(seen).toEqual([{ limit: "abc" }])
  }),
)

it.effect("a closed schema drops undeclared keys before execution", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    yield* Effect.promise(() => run(tools.closed, { limit: "20", extra: true }))
    expect(seen).toEqual([{ limit: 20 }])
  }),
)

it.effect("permission denial still applies after the repair", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    expect(yield* Effect.promise(() => rejects(run(tools.gated, { limit: "20" })))).toBe(true)
    expect(seen).toEqual([{ limit: 20 }])
  }),
)

it.effect("valid input passes through unchanged", () =>
  Effect.gen(function* () {
    const tools = yield* resolve()
    const result = yield* Effect.promise(() => run(tools.limited, { limit: 20 }))
    expect(result).toMatchObject({ output: "limit=20" })
    expect(seen).toEqual([{ limit: 20 }])
  }),
)
