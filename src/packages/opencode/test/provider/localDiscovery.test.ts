import { expect } from "bun:test"
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import { Provider } from "@/provider/provider"
import { LocalDiscovery } from "@/provider/localDiscovery"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Provider.node, CrossSpawnSpawner.node, httpClient])))
const lm = (key: string, type = "llm") => ({
  key,
  type,
  display_name: "Local model",
  max_context_length: 32768,
  loaded_instances: [{ config: { context_length: 8192 } }],
  capabilities: { vision: true, trained_for_tool_use: true },
})
const inventories = [
  { id: "lmstudio", path: "/proxy/api/v1/models", body: { models: [lm("local"), lm("embed", "embedding")] } },
  { id: "ollama", path: "/proxy/api/tags", body: { models: [{ model: "local", name: "local" }, { model: "" }] } },
  {
    id: "vllm",
    path: "/proxy/v1/models",
    body: {
      data: [
        { id: "local", owned_by: "vllm", max_model_len: 16384 },
        { id: "foreign", owned_by: "other", max_model_len: null },
      ],
    },
  },
] as const

for (const inventory of inventories) {
  it.live(`${inventory.id} discovers models through real HTTP and preserves configured metadata`, () =>
    Effect.gen(function* () {
      const requests: { path: string; authorization: string | null; custom: string | null }[] = []
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch(request) {
              requests.push({
                path: new URL(request.url).pathname,
                authorization: request.headers.get("authorization"),
                custom: request.headers.get("x-local"),
              })
              return Response.json(inventory.body)
            },
          }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      )
      const http = yield* HttpClient.HttpClient
      const baseURL = `${server.url.origin}/proxy/v1/`
      const models = yield* LocalDiscovery.discover(http, inventory.id, baseURL)
      expect(models.map((model) => model.id)).toEqual(["local"])
      if (inventory.id === "lmstudio") {
        expect(models[0]).toMatchObject({
          name: "Local model",
          tool_call: true,
          attachment: true,
          limit: { context: 8192 },
        })
      }
      if (inventory.id === "vllm") expect(models[0].limit.context).toBe(16384)
      if (inventory.id === "ollama") expect(models[0].tool_call).toBe(false)

      yield* provideTmpdirInstance(
        () =>
          Effect.gen(function* () {
            const service = yield* Provider.Service
            const providers = yield* service.list()
            const provider = providers[ProviderV2.ID.make(inventory.id)]
            expect(provider.models.local.api).toEqual({ id: "local", url: baseURL, npm: "@ai-sdk/openai-compatible" })
            expect(provider.models.saved.name).toBe("Configured")
            expect(provider.models.saved.limit.context).toBe(4096)
          }),
        {
          config: {
            provider: {
              [inventory.id]: {
                options: { baseURL, apiKey: "secret", headers: { "x-local": "yes" } },
                models: { saved: { name: "Configured", limit: { context: 4096, output: 1024 } } },
              },
            },
          },
        },
      )
      expect(requests).toEqual([
        { path: inventory.path, authorization: null, custom: null },
        { path: inventory.path, authorization: "Bearer secret", custom: "yes" },
      ])

      yield* provideTmpdirInstance(
        () =>
          Effect.gen(function* () {
            const service = yield* Provider.Service
            const providers = yield* service.list()
            expect(providers[ProviderV2.ID.make(inventory.id)].models.local.name).toBe("Override")
          }),
        {
          config: {
            provider: {
              [inventory.id]: {
                options: { baseURL },
                models: { local: { name: "Override", tool_call: true } },
              },
            },
          },
        },
      )
    }),
  )
}

it.live("unreachable endpoints retain configured models", () =>
  Effect.gen(function* () {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ data: [] }) })
    const baseURL = `${server.url.origin}/v1`
    yield* Effect.promise(() => server.stop(true))
    const http = yield* HttpClient.HttpClient
    for (const inventory of inventories) {
      expect(yield* LocalDiscovery.discover(http, inventory.id, baseURL)).toEqual([])
    }
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const service = yield* Provider.Service
          const providers = yield* service.list()
          for (const inventory of inventories) {
            const models = providers[ProviderV2.ID.make(inventory.id)].models
            expect(models.saved.name).toBe("Saved")
            expect(models.local).toBeUndefined()
          }
        }),
      {
        config: {
          provider: Object.fromEntries(
            inventories.map((inventory) => [
              inventory.id,
              {
                options: { baseURL },
                models: { saved: { name: "Saved" } },
              },
            ]),
          ),
        },
      },
    )
  }),
)

it.live("slow response bodies are bounded by the discovery deadline", () =>
  Effect.gen(function* () {
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: () =>
            new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('{"data":['))
                },
              }),
            ),
        }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    )
    const http = yield* HttpClient.HttpClient
    const started = Date.now()
    expect(yield* LocalDiscovery.discover(http, "vllm", `${server.url.origin}/v1`)).toEqual([])
    expect(Date.now() - started).toBeLessThan(3000)
  }),
)

it.live("disabled providers and model filters apply to discovered inventories", () =>
  Effect.gen(function* () {
    const requests: string[] = []
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch(request) {
            requests.push(new URL(request.url).pathname)
            return Response.json({ models: [{ model: "local" }, { model: "blocked" }] })
          },
        }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    )
    yield* provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const service = yield* Provider.Service
          const providers = yield* service.list()
          expect(providers[ProviderV2.ID.make("lmstudio")]).toBeUndefined()
          expect(Object.keys(providers[ProviderV2.ID.make("ollama")].models)).toEqual(["local"])
          expect(requests).toEqual(["/api/tags"])
        }),
      {
        config: {
          disabled_providers: ["lmstudio"],
          provider: {
            lmstudio: { options: { baseURL: `${server.url.origin}/v1` } },
            ollama: { options: { baseURL: `${server.url.origin}/v1` }, blacklist: ["blocked"] },
          },
        },
      },
    )
  }),
)

it.live("invalid JSON, HTTP failures, and invalid URLs leave discovery empty", () =>
  Effect.gen(function* () {
    const state = { status: 200, body: "not JSON" }
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(state.body, { status: state.status }) }),
      ),
      (server) => Effect.promise(() => server.stop(true)),
    )
    const http = yield* HttpClient.HttpClient
    expect(yield* LocalDiscovery.discover(http, "vllm", `${server.url.origin}/v1`)).toEqual([])
    state.status = 503
    expect(yield* LocalDiscovery.discover(http, "vllm", `${server.url.origin}/v1`)).toEqual([])
    expect(yield* LocalDiscovery.discover(http, "vllm", "invalid")).toEqual([])
  }),
)
