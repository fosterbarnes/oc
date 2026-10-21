import { expect, test } from "bun:test"
import type { McpStatus, PluginStatus } from "@opencode-ai/sdk/v2"
import { investigatePrompt } from "../src/component/dialog-error-details"
import { createFailureAnnouncer, mcpFailures, serverPluginFailures, type ComponentFailure } from "../src/failureToasts"

test("maps failed MCP servers and server plugins only", () => {
  const mcp: Record<string, McpStatus> = {
    docs: { status: "failed", error: "spawn ENOENT" },
    ok: { status: "connected" },
  }
  expect(mcpFailures(mcp).map((item) => [item.title, item.error])).toEqual([
    ["MCP server failed: docs", "spawn ENOENT"],
  ])
  const plugins: PluginStatus[] = [
    { name: "bad", spec: "bad-plugin@1", target: "/p/bad", source: "npm", status: "failed", error: "boom" },
    { name: "good", spec: "good", target: "/p/good", source: "npm", status: "loaded" },
  ]
  const [failure] = serverPluginFailures(plugins)
  expect(serverPluginFailures(plugins)).toHaveLength(1)
  expect(failure?.title).toBe("Plugin failed: bad")
  expect(failure?.context).toContain("Source: bad-plugin@1")
})

test("announces each failure once until it clears, then again when it returns", () => {
  const shown: string[] = []
  const announce = createFailureAnnouncer((failure) => shown.push(failure.key))
  const a: ComponentFailure = { key: "a", title: "A", error: "x" }
  const b: ComponentFailure = { key: "b", title: "B", error: "y" }
  announce("mcp", [a])
  announce("mcp", [a, b])
  announce("plugin", [a])
  announce("mcp", [b])
  announce("mcp", [a, b])
  expect(shown).toEqual(["a", "b", "a", "a"])
})

test("investigate prompt carries title, context, and error", () => {
  const prompt = investigatePrompt({
    title: "MCP server failed: docs",
    error: "spawn ENOENT",
    context: "Configuration: mcp.docs",
  })
  expect(prompt).toContain("MCP server failed: docs\nConfiguration: mcp.docs\nError: spawn ENOENT")
  expect(prompt).toContain("root cause")
})
