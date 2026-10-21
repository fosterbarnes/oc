import { Effect, Option, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { Config } from "@/config/config"
import * as Tool from "./tool"
import * as McpWebSearch from "./mcp-websearch"
import DESCRIPTION from "./websearch.txt"
import { checksum } from "@opencode-ai/core/util/encode"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { RuntimeFlags } from "@/effect/runtime-flags"

export const Parameters = Schema.Struct({
  query: Schema.String.annotate({ description: "Websearch query" }),
  numResults: Schema.optional(Schema.Number).annotate({
    description: "Number of search results to return (default: 8)",
  }),
  livecrawl: Schema.optional(Schema.Literals(["fallback", "preferred"])).annotate({
    description:
      "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
  }),
  type: Schema.optional(Schema.Literals(["auto", "fast", "deep"])).annotate({
    description: "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
  }),
  contextMaxCharacters: Schema.optional(Schema.Number).annotate({
    description: "Maximum characters for context string optimized for LLMs (default: 10000)",
  }),
})

export type WebSearchProvider = ConfigV1.WebSearchProvider
type WebSearchConfig = ConfigV1.Info["websearch"]

const isProvider = Schema.is(ConfigV1.WebSearchProvider)

const API_KEY_ENV: Record<WebSearchProvider, string> = {
  exa: "EXA_API_KEY",
  parallel: "PARALLEL_API_KEY",
  firecrawl: "FIRECRAWL_API_KEY",
  tavily: "TAVILY_API_KEY",
}

const LABELS: Record<WebSearchProvider, string> = {
  exa: "Exa Web Search",
  parallel: "Parallel Web Search",
  firecrawl: "Firecrawl Web Search",
  tavily: "Tavily Web Search",
}

// Env override, then config, then flags; otherwise the session ID checksum keeps one of exa/parallel per session.
export function selectWebSearchProvider(
  sessionID: string,
  flags = { exa: false, parallel: false },
  configured?: WebSearchConfig,
): WebSearchProvider {
  const override = process.env.OPENCODE_WEBSEARCH_PROVIDER
  if (isProvider(override)) return override
  const provider = configured ? configured.provider : undefined
  if (provider && provider !== "random") return provider
  if (flags.parallel) return "parallel"
  if (flags.exa) return "exa"

  return Number.parseInt(checksum(sessionID) ?? "0", 36) % 2 === 0 ? "exa" : "parallel"
}

export function webSearchProviderLabel(provider: unknown) {
  return isProvider(provider) ? LABELS[provider] : "Web Search"
}

// A config apiKey only belongs to the provider it was configured with.
export function webSearchApiKey(provider: WebSearchProvider, configured?: WebSearchConfig) {
  if (configured && configured.provider === provider && configured.apiKey) return configured.apiKey
  return process.env[API_KEY_ENV[provider]] || undefined
}

export function webSearchModelName(extra: Tool.Context["extra"]) {
  const model = extra?.model
  if (!model || typeof model !== "object") return undefined
  const api = "api" in model && model.api && typeof model.api === "object" ? model.api : undefined
  const apiID = api && "id" in api && typeof api.id === "string" ? api.id : undefined
  const id = "id" in model && typeof model.id === "string" ? model.id : undefined
  return (apiID ?? id)?.slice(0, 100)
}

export const TAVILY_URL = "https://api.tavily.com/search"

const userAgent = () => ({ "User-Agent": `opencode/${InstallationVersion}` })
const bearer = (apiKey?: string): Record<string, string> => (apiKey ? { Authorization: `Bearer ${apiKey}` } : {})

const TavilyRequest = Schema.Struct({
  query: Schema.String,
  search_depth: Schema.Literal("basic"),
  chunks_per_source: Schema.Number,
  max_results: Schema.Number,
})

const TavilyResponse = Schema.Struct({
  results: Schema.Array(Schema.Struct({ title: Schema.String, url: Schema.String, content: Schema.String })),
})

const FirecrawlResponse = Schema.fromJsonString(
  Schema.Struct({
    data: Schema.Struct({
      web: Schema.Array(
        Schema.Struct({
          url: Schema.String,
          title: Schema.optional(Schema.NullOr(Schema.String)),
          description: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      ),
    }),
  }),
)
const decodeFirecrawl = Schema.decodeUnknownOption(FirecrawlResponse)

function formatResults(results: readonly { url: string; title?: string | null; content?: string | null }[]) {
  if (results.length === 0) return undefined
  return results
    .map((item) => [item.title ? `## ${item.title}` : undefined, item.url, item.content].filter(Boolean).join("\n"))
    .join("\n\n")
}

export function callProvider(
  http: HttpClient.HttpClient,
  provider: WebSearchProvider,
  params: Schema.Schema.Type<typeof Parameters>,
  ctx: Pick<Tool.Context, "sessionID" | "extra">,
  apiKey?: string,
) {
  const limit = params.numResults || 8
  if (provider === "parallel") {
    return McpWebSearch.call(
      http,
      McpWebSearch.PARALLEL_URL,
      "web_search",
      McpWebSearch.ParallelSearchArgs,
      {
        objective: params.query,
        search_queries: [params.query],
        session_id: ctx.sessionID,
        model_name: webSearchModelName(ctx.extra),
      },
      "25 seconds",
      { ...userAgent(), ...bearer(apiKey) },
    )
  }

  if (provider === "firecrawl") {
    return McpWebSearch.call(
      http,
      McpWebSearch.FIRECRAWL_URL,
      "firecrawl_search",
      McpWebSearch.FirecrawlSearchArgs,
      { query: params.query, limit },
      "25 seconds",
      { ...userAgent(), ...bearer(apiKey) },
    ).pipe(
      // Firecrawl answers with a JSON document; keep the raw text if its shape changes.
      Effect.map((text) =>
        text === undefined
          ? undefined
          : Option.match(decodeFirecrawl(text), {
              onNone: () => text,
              onSome: (response) =>
                formatResults(response.data.web.map((item) => ({ ...item, content: item.description }))),
            }),
      ),
    )
  }

  if (provider === "tavily") {
    return Effect.gen(function* () {
      const request = yield* HttpClientRequest.post(TAVILY_URL).pipe(
        HttpClientRequest.acceptJson,
        HttpClientRequest.setHeaders({
          ...userAgent(),
          "X-Client-Name": "opencode",
          ...(apiKey ? bearer(apiKey) : { "X-Tavily-Access-Mode": "keyless" }),
        }),
        HttpClientRequest.schemaBodyJson(TavilyRequest)({
          query: params.query,
          search_depth: "basic",
          chunks_per_source: 3,
          max_results: limit,
        }),
      )
      const response = yield* HttpClient.filterStatusOk(http)
        .execute(request)
        .pipe(
          Effect.flatMap(HttpClientResponse.schemaBodyJson(TavilyResponse)),
          Effect.timeoutOrElse({
            duration: "25 seconds",
            orElse: () => Effect.die(new Error("tavily search request timed out")),
          }),
        )
      return formatResults(response.results)
    })
  }

  return McpWebSearch.call(
    http,
    McpWebSearch.exaUrl(apiKey),
    "web_search_exa",
    McpWebSearch.SearchArgs,
    {
      query: params.query,
      type: params.type || "auto",
      numResults: limit,
      livecrawl: params.livecrawl || "fallback",
      contextMaxCharacters: params.contextMaxCharacters,
    },
    "25 seconds",
  )
}

export const WebSearchTool = Tool.define(
  "websearch",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const flags = yield* RuntimeFlags.Service
    const config = yield* Config.Service

    return {
      get description() {
        return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString())
      },
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const configured = (yield* config.get()).websearch
          const provider = selectWebSearchProvider(
            ctx.sessionID,
            { exa: flags.enableExa, parallel: flags.enableParallel },
            configured,
          )
          const title = webSearchProviderLabel(provider)
          yield* ctx.metadata({ title: `${title} "${params.query}"`, metadata: { provider } })

          yield* ctx.ask({
            permission: "websearch",
            patterns: [params.query],
            always: ["*"],
            metadata: {
              query: params.query,
              numResults: params.numResults,
              livecrawl: params.livecrawl,
              type: params.type,
              contextMaxCharacters: params.contextMaxCharacters,
              provider,
            },
          })

          const result = yield* callProvider(http, provider, params, ctx, webSearchApiKey(provider, configured))

          return {
            output: result ?? "No search results found. Please try a different query.",
            title: `${title}: ${params.query}`,
            metadata: { provider },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
