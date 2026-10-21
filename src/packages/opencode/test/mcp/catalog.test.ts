import { describe, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { McpCatalog } from "@/mcp/catalog"
import { Effect } from "effect"

const options = { toolCallId: "call_mcp", abortSignal: new AbortController().signal } as any

function clientReturning(result: unknown) {
  return {
    callTool: async () => result,
  } as unknown as Client
}

function mcpTool() {
  return {
    name: "screenshot",
    description: "Take a screenshot",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  } as any
}

describe("McpCatalog.convertTool", () => {
  test("runs the pre-call hook before the MCP request", async () => {
    const events: string[] = []
    const client = {
      callTool: async () => {
        events.push("call")
        return { content: [] }
      },
    } as unknown as Client
    const converted = McpCatalog.convertTool(mcpTool(), client, undefined, () =>
      Effect.sync(() => void events.push("before")),
    )

    await converted.execute?.({}, options)

    expect(events).toEqual(["before", "call"])
  })

  test("preserves content when structuredContent is also present", async () => {
    const content = [{ type: "image" as const, mimeType: "image/png", data: "AAAA" }]
    const structuredContent = { image: { mimeType: "image/png", data: "AAAA" } }
    const converted = McpCatalog.convertTool(mcpTool(), clientReturning({ content, structuredContent }))

    const output = await converted.execute?.({}, options)

    expect(output).toMatchObject({ content, structuredContent })
  })

  test("falls back to structuredContent only when content is absent", async () => {
    const structuredContent = { results: [{ title: "one" }] }
    const converted = McpCatalog.convertTool(mcpTool(), clientReturning({ content: [], structuredContent }))

    const output = await converted.execute?.({}, options)

    expect(output).toMatchObject({
      structuredContent,
      content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    })
  })

  test("uses the execution budget instead of the SDK default when no timeout is configured", async () => {
    const calls: any[] = []
    const client = {
      callTool: async (_params: unknown, _schema: unknown, requestOptions: unknown) => {
        calls.push(requestOptions)
        return { content: [] }
      },
    } as unknown as Client

    await McpCatalog.convertTool(mcpTool(), client).execute?.({}, options)

    expect(calls[0].timeout).toBe(McpCatalog.DEFAULT_EXECUTION_TIMEOUT)
    expect(calls[0].resetTimeoutOnProgress).toBeUndefined()
  })

  test("applies the configured MCP execution timeout", async () => {
    const server = new Server({ name: "timeout", version: "1.0.0" }, { capabilities: { tools: {} } })
    server.setRequestHandler(CallToolRequestSchema, async () => {
      await Bun.sleep(100)
      return { content: [] }
    })
    const client = new Client({ name: "timeout-test", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])

    try {
      await expect(McpCatalog.convertTool(mcpTool(), client, 10).execute?.({}, options)).rejects.toThrow(
        "Request timed out",
      )
    } finally {
      await Promise.all([client.close(), server.close()])
    }
  })

  test("sends the session id in request _meta, not as an argument", async () => {
    const seen: unknown[] = []
    const server = new Server({ name: "meta", version: "1.0.0" }, { capabilities: { tools: {} } })
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      seen.push(request.params)
      return { content: [] }
    })
    const client = new Client({ name: "meta-test", version: "1.0.0" })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])

    try {
      await McpCatalog.convertTool(mcpTool(), client, undefined, undefined, "ses_meta").execute?.({ a: 1 }, options)
      await McpCatalog.convertTool(mcpTool(), client).execute?.({}, options)
      expect(seen[0]).toMatchObject({ name: "screenshot", arguments: { a: 1 }, _meta: { sessionID: "ses_meta" } })
      expect(seen[1]).not.toHaveProperty("_meta.sessionID")
    } finally {
      await Promise.all([client.close(), server.close()])
    }
  })
})

test("preserves output schema validation across paginated tool discovery", async () => {
  const server = new Server({ name: "pagination", version: "1.0.0" }, { capabilities: { tools: {} } })
  server.setRequestHandler(ListToolsRequestSchema, ({ params }) =>
    Promise.resolve(
      params?.cursor === "page-2"
        ? {
            tools: [
              {
                name: "second",
                inputSchema: { type: "object" },
                outputSchema: {
                  type: "object",
                  properties: { value: { type: "number" } },
                  required: ["value"],
                },
              },
            ],
          }
        : {
            tools: [
              {
                name: "first",
                inputSchema: { type: "object" },
                outputSchema: {
                  type: "object",
                  properties: { value: { type: "string" } },
                  required: ["value"],
                },
              },
            ],
            nextCursor: "page-2",
          },
    ),
  )
  server.setRequestHandler(CallToolRequestSchema, ({ params }) =>
    Promise.resolve({
      content: [],
      structuredContent: { value: params.name === "first" ? 42 : 1 },
    }),
  )

  const client = new Client({ name: "pagination-test", version: "1.0.0" })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])

  try {
    const tools = await Effect.runPromise(McpCatalog.defs(client))
    expect(tools?.map((tool) => tool.name)).toEqual(["first", "second"])
    await expect(client.callTool({ name: "first", arguments: {} })).rejects.toThrow(
      "Structured content does not match the tool's output schema",
    )
  } finally {
    await Promise.all([client.close(), server.close()])
  }
})
