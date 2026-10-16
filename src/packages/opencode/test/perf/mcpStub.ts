// Minimal stdio MCP server for P9: initialize plus one tool.
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

const server = new Server({ name: "p9-mcp-stub", version: "1.0.0" }, { capabilities: { tools: {} } })
server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({
    tools: [
      {
        name: "p9_ping",
        description: "Cheap P9 probe tool",
        inputSchema: { type: "object" as const, properties: {} },
      },
    ],
  }),
)
server.setRequestHandler(CallToolRequestSchema, () =>
  Promise.resolve({ content: [{ type: "text" as const, text: "pong" }] }),
)
await server.connect(new StdioServerTransport())
