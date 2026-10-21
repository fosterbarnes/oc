import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { FIRECRAWL_URL, parseResponse } from "../../src/tool/mcp-websearch"
import {
  callProvider,
  selectWebSearchProvider,
  TAVILY_URL,
  webSearchApiKey,
  webSearchModelName,
  webSearchProviderLabel,
} from "../../src/tool/websearch"
import { SessionID } from "../../src/session/schema"

import { webSearchEnabled } from "../../src/tool/registry"
import { it } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"

const SESSION_ID = "ses_0196aabbccddeeff001122334455"

describe("websearch provider", () => {
  test("selects a stable provider per session", () => {
    expect(selectWebSearchProvider(SESSION_ID)).toBe(selectWebSearchProvider(SESSION_ID))
  })

  test("supports an operational override", () => {
    const original = process.env.OPENCODE_WEBSEARCH_PROVIDER

    try {
      process.env.OPENCODE_WEBSEARCH_PROVIDER = "parallel"
      expect(selectWebSearchProvider(SESSION_ID)).toBe("parallel")

      process.env.OPENCODE_WEBSEARCH_PROVIDER = "exa"
      expect(selectWebSearchProvider(SESSION_ID)).toBe("exa")
    } finally {
      if (original === undefined) delete process.env.OPENCODE_WEBSEARCH_PROVIDER
      else process.env.OPENCODE_WEBSEARCH_PROVIDER = original
    }
  })

  test("routes to Exa when the Exa flag is enabled", () => {
    expect(selectWebSearchProvider(SESSION_ID, { exa: true, parallel: false })).toBe("exa")
  })

  test("routes to Parallel when the Parallel flag is enabled", () => {
    expect(selectWebSearchProvider(SESSION_ID, { exa: false, parallel: true })).toBe("parallel")
  })

  test("uses the configured provider over flags; random keeps the session pick", () => {
    expect(selectWebSearchProvider(SESSION_ID, { exa: true, parallel: false }, { provider: "tavily" })).toBe("tavily")
    expect(selectWebSearchProvider(SESSION_ID, undefined, { provider: "firecrawl" })).toBe("firecrawl")
    expect(selectWebSearchProvider(SESSION_ID, undefined, { provider: "random" })).toBe(
      selectWebSearchProvider(SESSION_ID),
    )
    expect(selectWebSearchProvider(SESSION_ID, { exa: true, parallel: false }, {})).toBe("exa")
  })

  test("uses a config API key only for its own provider", () => {
    const original = process.env.TAVILY_API_KEY
    try {
      process.env.TAVILY_API_KEY = "env-key"
      expect(webSearchApiKey("tavily", { provider: "tavily", apiKey: "config-key" })).toBe("config-key")
      expect(webSearchApiKey("tavily", { provider: "firecrawl", apiKey: "config-key" })).toBe("env-key")
      expect(webSearchApiKey("tavily", false)).toBe("env-key")
    } finally {
      if (original === undefined) delete process.env.TAVILY_API_KEY
      else process.env.TAVILY_API_KEY = original
    }
  })

  test("config enables or disables the tool for any model provider", () => {
    expect(webSearchEnabled(ProviderV2.ID.openai, undefined, { provider: "tavily" })).toBe(true)
    expect(webSearchEnabled(ProviderV2.ID.openai, undefined, { provider: "random" })).toBe(true)
    expect(webSearchEnabled(ProviderV2.ID.opencode, { exa: true, parallel: false }, false)).toBe(false)
    expect(webSearchEnabled(ProviderV2.ID.openai, undefined, {})).toBe(false)
  })

  test("is enabled for OpenCode providers or explicit websearch provider flags", () => {
    expect(webSearchEnabled(ProviderV2.ID.opencode, { exa: false, parallel: false })).toBe(true)
    expect(webSearchEnabled(ProviderV2.ID.make("opencode-go"), { exa: false, parallel: false })).toBe(true)
    expect(webSearchEnabled(ProviderV2.ID.openai, { exa: false, parallel: false })).toBe(false)
    expect(webSearchEnabled(ProviderV2.ID.openai, { exa: true, parallel: false })).toBe(true)
    expect(webSearchEnabled(ProviderV2.ID.openai, { exa: false, parallel: true })).toBe(true)
  })

  test("uses branded labels", () => {
    expect(webSearchProviderLabel("parallel")).toBe("Parallel Web Search")
    expect(webSearchProviderLabel("exa")).toBe("Exa Web Search")
    expect(webSearchProviderLabel("firecrawl")).toBe("Firecrawl Web Search")
    expect(webSearchProviderLabel("tavily")).toBe("Tavily Web Search")
    expect(webSearchProviderLabel(undefined)).toBe("Web Search")
  })

  test("uses the provider API model id for Parallel analytics", () => {
    expect(
      webSearchModelName({
        model: {
          id: "claude-opus-4-7",
          api: { id: "claude-opus-4.7" },
        },
      }),
    ).toBe("claude-opus-4.7")
  })
})

describe("websearch MCP response parser", () => {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [
        {
          type: "text",
          text: "search results",
        },
      ],
    },
  })

  it.effect("parses plain JSON-RPC responses", () =>
    Effect.gen(function* () {
      const result = yield* parseResponse(payload)
      expect(result).toBe("search results")
    }),
  )

  it.effect("parses SSE JSON-RPC responses", () =>
    Effect.gen(function* () {
      const result = yield* parseResponse(`event: message\ndata: ${payload}\n\n`)
      expect(result).toBe("search results")
    }),
  )

  it.effect("ignores non-JSON SSE data frames", () =>
    Effect.gen(function* () {
      const result = yield* parseResponse(`data: [DONE]\ndata: ${payload}\n\n`)
      expect(result).toBe("search results")
    }),
  )
})

describe("websearch backends", () => {
  const ctx = { sessionID: SessionID.make("ses_websearch_backend"), extra: undefined }

  const fakeHttp = (respond: (req: HttpClientRequest.HttpClientRequest, body: unknown) => Response) => {
    const seen: { url: string; headers: Record<string, string>; body: unknown }[] = []
    const client = HttpClient.make((req) => {
      const body = req.body._tag === "Uint8Array" ? JSON.parse(new TextDecoder().decode(req.body.body)) : undefined
      seen.push({ url: req.url, headers: req.headers, body })
      return Effect.succeed(HttpClientResponse.fromWeb(req, respond(req, body)))
    })
    return { client, seen }
  }

  it.effect("queries Tavily with the API key and formats results", () =>
    Effect.gen(function* () {
      const http = fakeHttp(() =>
        Response.json({ results: [{ title: "Bun", url: "https://bun.sh", content: "Fast runtime" }] }),
      )
      const output = yield* callProvider(http.client, "tavily", { query: "bun", numResults: 3 }, ctx, "tvly-key")

      expect(output).toBe("## Bun\nhttps://bun.sh\nFast runtime")
      expect(http.seen[0].url).toBe(TAVILY_URL)
      expect(http.seen[0].headers.authorization).toBe("Bearer tvly-key")
      expect(http.seen[0].body).toEqual({ query: "bun", search_depth: "basic", chunks_per_source: 3, max_results: 3 })
    }),
  )

  it.effect("uses Tavily keyless mode without an API key", () =>
    Effect.gen(function* () {
      const http = fakeHttp(() => Response.json({ results: [] }))
      const output = yield* callProvider(http.client, "tavily", { query: "bun" }, ctx)

      expect(output).toBeUndefined()
      expect(http.seen[0].headers.authorization).toBeUndefined()
      expect(http.seen[0].headers["x-tavily-access-mode"]).toBe("keyless")
      expect(http.seen[0].body).toMatchObject({ max_results: 8 })
    }),
  )

  it.effect("calls the Firecrawl MCP search tool and formats its JSON text", () =>
    Effect.gen(function* () {
      const text = JSON.stringify({
        success: true,
        data: { web: [{ url: "https://bun.sh", title: "Bun", description: "Fast runtime" }, { url: "https://x.dev" }] },
      })
      const http = fakeHttp(
        () =>
          new Response(
            `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text }] } })}\n\n`,
          ),
      )
      const output = yield* callProvider(http.client, "firecrawl", { query: "bun" }, ctx, "fc-key")

      expect(output).toBe("## Bun\nhttps://bun.sh\nFast runtime\n\nhttps://x.dev")
      expect(http.seen[0].url).toBe(FIRECRAWL_URL)
      expect(http.seen[0].headers.authorization).toBe("Bearer fc-key")
      expect(http.seen[0].body).toMatchObject({
        method: "tools/call",
        params: { name: "firecrawl_search", arguments: { query: "bun", limit: 8 } },
      })
    }),
  )

  it.effect("keeps Firecrawl text that is not its JSON document", () =>
    Effect.gen(function* () {
      const http = fakeHttp(() =>
        Response.json({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "plain results" }] } }),
      )
      expect(yield* callProvider(http.client, "firecrawl", { query: "bun" }, ctx)).toBe("plain results")
    }),
  )
})
