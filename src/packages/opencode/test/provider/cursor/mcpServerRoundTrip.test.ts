import { expect, test } from "bun:test"
import { toolsToDescriptors } from "@/provider/cursor/protocol/descriptors.js"
import { mcpRealToolName } from "@/provider/cursor/protocol/execParse.js"

// Advertise tools, then map Cursor's echoed McpArgs back: every tool must come home.
test("MCP server ids like my-server and opencode round-trip to the OpenCode tool id", () => {
  const names = ["read", "my-server_do", "my-server_get-item", "opencode_read", "opencode_search"]
  const descriptors = toolsToDescriptors(
    names.map((name) => ({ name })),
    "opencode",
    ["my-server", "opencode"],
  )
  for (const d of descriptors) {
    const echoed = { name: d.name, provider_identifier: d.provider_identifier, tool_name: d.tool_name }
    const back = mcpRealToolName(echoed)
    expect(names).toContain(back)
    expect(mcpRealToolName({ ...echoed, tool_name: "" })).toBe(back)
  }
  expect(new Set(descriptors.map((d) => mcpRealToolName(d))).size).toBe(names.length)
})
