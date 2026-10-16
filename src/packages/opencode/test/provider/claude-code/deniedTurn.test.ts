import { expect, test } from "bun:test"
import { chmod } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { ClaudeCodeLanguageModel } from "@/provider/claude-code/claudeCodeLanguageModel"
import { hostToolExecutors } from "@/provider/claude-code/shared"
import { deleteActiveProcessAndWait, deleteClaudeSessionId, sessionKey } from "@/provider/claude-code/sessionManager"
import { tmpdir } from "../../fixture/fixture"

async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const reader = stream.getReader()
  const events: LanguageModelV3StreamPart[] = []
  for (;;) {
    const next = await reader.read()
    if (next.done) return events
    events.push(next.value)
  }
}

/**
 * Calls the proxied `session_tail` tool over its MCP endpoint, then echoes the
 * result the way Claude does. A denied call is followed by stray text and no
 * `result` until the interrupt arrives; later envelopes get a normal answer.
 */
async function denyingFakeCli(directory: string) {
  const cliPath = path.join(directory, "claude.cjs")
  await Bun.write(
    cliPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")
if (process.argv.includes("--version")) { console.log("2.1.283"); process.exit(0) }
const args = process.argv.slice(2)
const config = JSON.parse(fs.readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8"))
const proxy = config.mcpServers.opencode_proxy
const emit = (message) => console.log(JSON.stringify({ session_id: "fake-session", ...message }))
const event = (message) => emit({ type: "stream_event", event: message })
const text = (body) => {
  event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
  event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: body } })
  event({ type: "content_block_stop", index: 0 })
}
const result = () => emit({ type: "result", subtype: "success", is_error: false })
let denied = false
readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  const input = JSON.parse(line)
  if (input.type === "control_request") return result()
  emit({ type: "system", subtype: "init" })
  if (denied) {
    text("fresh answer")
    return result()
  }
  denied = true
  const response = await fetch(proxy.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...proxy.headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "session_tail", arguments: {} } }),
  })
  const id = "toolu_denied"
  event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "mcp__opencode_proxy__session_tail", id } })
  event({ type: "content_block_stop", index: 0 })
  emit({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "mcp__opencode_proxy__session_tail", id, input: {} }] } })
  emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: (await response.json()).result?.content ?? "", is_error: true }] } })
  text("stray text after the denial")
})
`,
  )
  if (process.platform !== "win32") await chmod(cliPath, 0o755)
  return cliPath
}

// A denied tool used to finish the turn as `stop`, and the CLI's stray text and
// late result could show up in the next turn.
test("a denied tool ends its turn as an error and leaves no CLI output for the next turn", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  hostToolExecutors.set(session, async (name) => ({
    output: "tail",
    title: name,
    metadata: {},
    denied: new Error("Denied by user"),
  }))
  const model = new ClaudeCodeLanguageModel(`denied-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await denyingFakeCli(directory.path),
    cwd: directory.path,
    proxyTools: ["session_tail"],
    strictMcpConfig: true,
    autoContinueIncompleteTurns: false,
  })
  const options: LanguageModelV3CallOptions = {
    prompt: [{ role: "user", content: [{ type: "text", text: "Read the tail." }] }],
    tools: [
      {
        type: "function",
        name: "session_tail",
        description: "session_tail",
        inputSchema: { type: "object", properties: {} },
      },
    ],
    providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
  }
  try {
    const denied = await drain((await model.doStream(options)).stream)
    expect(denied.find((event) => event.type === "finish")).toMatchObject({ finishReason: { unified: "error" } })

    // The second turn continues the conversation the way oc sends it, with the first exchange in history.
    const continued = {
      ...options,
      prompt: [
        ...options.prompt,
        { role: "assistant" as const, content: [{ type: "text" as const, text: "Denied." }] },
        ...options.prompt,
      ],
    }
    const next = await drain((await model.doStream(continued)).stream)
    const shown = next
      .filter((event) => event.type === "text-delta")
      .map((event) => (event as { delta: string }).delta)
      .join("")
    expect(shown).toContain("fresh answer")
    expect(shown).not.toContain("stray text after the denial")
    expect(next.find((event) => event.type === "finish")).toMatchObject({ finishReason: { unified: "stop" } })
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 30_000)
