import { afterEach, expect } from "bun:test"
import { createServer, type Server } from "node:http"
import { streamText } from "ai"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Effect } from "effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { testProviderConfig } from "../lib/test-provider"
import { Env } from "@/env"
import { Plugin } from "@/plugin"
import { Provider } from "@/provider/provider"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(LayerNode.group([Provider.node, Env.node, Plugin.node, CrossSpawnSpawner.node])),
)

const finished = [
  'data: {"choices":[{"delta":{"vendor_reasoning":"thinking"}}]}',
  'data: {"choices":[{"delta":{"content":"done"}}]}',
  'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
  "data: [DONE]",
]
const unfinished = ['data: {"choices":[{"delta":{"content":"cut"}}]}', "data: [DONE]"]

it.live("compatibility settings rename max tokens and read a custom reasoning field", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => sseServer(finished)),
      (server) => Effect.sync(() => server.server.close()),
    )
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const result = yield* stream({ maxOutputTokens: 123 })
          expect(yield* Effect.promise(() => result.reasoningText)).toBe("thinking")
          expect(yield* Effect.promise(() => result.text)).toBe("done")
          expect(server.bodies[0]).toMatchObject({ max_completion_tokens: 123 })
          expect(server.bodies[0]).not.toHaveProperty("max_tokens")
        }),
      {
        config: compatibilityConfig(server.url, {
          reasoningField: "vendor_reasoning",
          maxTokensField: "max_completion_tokens",
        }),
      },
    )
  }),
)

it.live("requireFinishReason fails a stream that ends without one", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => sseServer(unfinished)),
      (server) => Effect.sync(() => server.server.close()),
    )
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const result = yield* stream({})
          // The AI SDK surfaces a body stream error either as an `error` part or a rejected read.
          const error = yield* Effect.promise(() =>
            Array.fromAsync(result.fullStream).then(
              (parts) => parts.find((part) => part.type === "error")?.error,
              (error: unknown) => error,
            ),
          )
          expect(String(error)).toContain("ended without finish_reason")
        }),
      { config: compatibilityConfig(server.url, { requireFinishReason: true }) },
    )
  }),
)

it.live("streams without a finish_reason still finish by default", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.promise(() => sseServer(unfinished)),
      (server) => Effect.sync(() => server.server.close()),
    )
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const result = yield* stream({})
          expect(yield* Effect.promise(() => result.text)).toBe("cut")
          expect(server.bodies[0]).toHaveProperty("max_tokens")
        }),
      { config: compatibilityConfig(server.url, {}) },
    )
  }),
)

function stream(options: { maxOutputTokens?: number }) {
  return Effect.gen(function* () {
    const provider = yield* Provider.Service
    const model = yield* provider.getModel(ProviderV2.ID.make("test"), ModelV2.ID.make("test-model"))
    return streamText({
      model: yield* provider.getLanguage(model),
      messages: [{ role: "user", content: "hello" }],
      maxOutputTokens: options.maxOutputTokens ?? 50,
    })
  })
}

function compatibilityConfig(url: string, compatibility: Record<string, unknown>) {
  const config = testProviderConfig(url)
  return {
    ...config,
    provider: {
      test: {
        ...config.provider.test,
        models: { "test-model": { ...config.provider.test.models["test-model"], compatibility } },
      },
    },
  }
}

async function sseServer(lines: string[]): Promise<{ server: Server; url: string; bodies: unknown[] }> {
  const bodies: unknown[] = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(chunk))
    req.on("end", () => {
      bodies.push(JSON.parse(Buffer.concat(chunks).toString()))
      res.writeHead(200, { "content-type": "text/event-stream" })
      res.end(lines.map((line) => line + "\n\n").join(""))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("server did not bind to a TCP port")
  return { server, url: `http://127.0.0.1:${address.port}`, bodies }
}
