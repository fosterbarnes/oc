import { Effect, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import type { ModelsDev } from "@opencode-ai/core/models-dev"

export const defaults = {
  lmstudio: "http://127.0.0.1:1234/v1",
  ollama: "http://127.0.0.1:11434/v1",
  vllm: "http://127.0.0.1:8000/v1",
}

const LMStudio = Schema.Struct({
  models: Schema.Array(
    Schema.Struct({
      type: Schema.String,
      key: Schema.String,
      display_name: Schema.String,
      max_context_length: Schema.Int,
      loaded_instances: Schema.Array(Schema.Struct({ config: Schema.Struct({ context_length: Schema.Int }) })),
      capabilities: Schema.optional(Schema.Struct({ vision: Schema.Boolean, trained_for_tool_use: Schema.Boolean })),
    }),
  ),
})
const Ollama = Schema.Struct({ models: Schema.Array(Schema.Struct({ model: Schema.String })) })
const VLLM = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      owned_by: Schema.String,
      max_model_len: Schema.optional(Schema.NullOr(Schema.Int)),
    }),
  ),
})

export const discover = Effect.fn("LocalDiscovery.discover")(
  function* (
    http: HttpClient.HttpClient,
    providerID: keyof typeof defaults,
    baseURL: string,
    options: { apiKey?: string; headers?: Record<string, string> } = {},
  ) {
    const url = new URL(baseURL)
    const prefix = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")
    url.pathname =
      providerID === "vllm"
        ? `${url.pathname.replace(/\/+$/, "")}/models`
        : `${prefix}/${providerID === "lmstudio" ? "api/v1/models" : "api/tags"}`
    url.search = ""
    url.hash = ""
    const headers = { ...options.headers, ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}) }
    const response = yield* HttpClient.filterStatusOk(http).execute(
      HttpClientRequest.get(url.toString()).pipe(HttpClientRequest.acceptJson, HttpClientRequest.setHeaders(headers)),
    )
    if (providerID === "lmstudio") {
      const result = yield* HttpClientResponse.schemaBodyJson(LMStudio)(response)
      return result.models
        .filter((item) => item.type === "llm" && item.key.trim())
        .map(
          (item) =>
            ({
              ...model(item.key),
              name: item.display_name || item.key,
              tool_call: item.capabilities?.trained_for_tool_use ?? false,
              attachment: item.capabilities?.vision ?? false,
              modalities: { input: item.capabilities?.vision ? ["text", "image"] : ["text"], output: ["text"] },
              limit: {
                context: item.loaded_instances.length
                  ? Math.min(...item.loaded_instances.map((instance) => instance.config.context_length))
                  : item.max_context_length,
                output: 0,
              },
            }) satisfies ModelsDev.Model,
        )
    }
    if (providerID === "ollama") {
      const result = yield* HttpClientResponse.schemaBodyJson(Ollama)(response)
      // Tags do not report tools, vision, or context limits; configured metadata takes precedence.
      return result.models.filter((item) => item.model.trim()).map((item) => model(item.model))
    }
    const result = yield* HttpClientResponse.schemaBodyJson(VLLM)(response)
    return result.data
      .filter((item) => item.owned_by === "vllm" && item.id.trim())
      .map((item) => ({
        ...model(item.id),
        limit: { context: item.max_model_len ?? 0, output: 0 },
      }))
  },
  Effect.timeout("1 second"),
  Effect.catchCause((cause) =>
    Effect.logDebug("Local model discovery failed", { cause }).pipe(Effect.as([] as ModelsDev.Model[])),
  ),
)

function model(id: string): ModelsDev.Model {
  return {
    id,
    name: id,
    release_date: "",
    attachment: false,
    reasoning: false,
    temperature: false,
    tool_call: false,
    modalities: { input: ["text"], output: ["text"] },
    cost: { input: 0, output: 0 },
    limit: { context: 0, output: 0 },
  }
}

export * as LocalDiscovery from "./localDiscovery"
