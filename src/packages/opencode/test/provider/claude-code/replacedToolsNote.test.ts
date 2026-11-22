import { expect, test } from "bun:test"
import { chmod } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { ClaudeCodeLanguageModel } from "@/provider/claude-code/claudeCodeLanguageModel"
import { CLAUDE_CODE_COMMAND_PERMISSION_OPTION } from "@/provider/claude-code/shared"
import { deleteActiveProcessAndWait, deleteClaudeSessionId, sessionKey } from "@/provider/claude-code/sessionManager"
import { tmpdir } from "../../fixture/fixture"

async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const reader = stream.getReader()
  for (;;) if ((await reader.read()).done) return
}

/** Records every stdin envelope to `stdin.jsonl`, then answers each with text and a result. */
async function recordingFakeCli(directory: string) {
  const cliPath = path.join(directory, "claude.cjs")
  await Bun.write(
    cliPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")
if (process.argv.includes("--version")) { console.log("2.1.283"); process.exit(0) }
const emit = (message) => console.log(JSON.stringify({ session_id: "fake-session", ...message }))
const event = (message) => emit({ type: "stream_event", event: message })
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const input = JSON.parse(line)
  if (input.type === "control_request") return
  fs.appendFileSync(${JSON.stringify(path.join(directory, "stdin.jsonl"))}, line + "\\n")
  emit({ type: "system", subtype: "init" })
  event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
  event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } })
  event({ type: "content_block_stop", index: 0 })
  emit({ type: "result", subtype: "success", is_error: false })
})
`,
  )
  if (process.platform !== "win32") await chmod(cliPath, 0o755)
  return cliPath
}

// 2026-11-17: after a switch from /debug to /spit the model called Claude's own Write from earlier in
// the chat, the CLI refused it ("Continue without it") and the plan was never written. The first
// message to a process whose command replaces built-ins now names the replacements; later ones don't.
test("the first message to a process whose command replaces Write and Edit names the proxy tools once", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const model = new ClaudeCodeLanguageModel(`note-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await recordingFakeCli(directory.path),
    cwd: directory.path,
    proxyTools: [],
    strictMcpConfig: true,
    autoContinueIncompleteTurns: false,
  })
  const tool = (name: string) => ({
    type: "function" as const,
    name,
    description: name,
    inputSchema: { type: "object" as const, properties: {} },
  })
  // What `commandToolPlan` (session/llm/request.ts) sends for /spit: edit and write stay with oc.
  const options: LanguageModelV3CallOptions = {
    prompt: [{ role: "user", content: [{ type: "text", text: "Write the plan." }] }],
    tools: [tool("read"), tool("edit"), tool("write")],
    providerOptions: {
      "claude-code": {
        opencodeSessionID: session,
        opencodeAgent: "build",
        [CLAUDE_CODE_COMMAND_PERMISSION_OPTION]: JSON.stringify({ native: ["read"], closed: true }),
      },
    },
  }
  try {
    await drain((await model.doStream(options)).stream)
    await drain(
      (
        await model.doStream({
          ...options,
          prompt: [
            ...options.prompt,
            { role: "assistant", content: [{ type: "text", text: "ok" }] },
            { role: "user", content: [{ type: "text", text: "Again." }] },
          ],
        })
      ).stream,
    )
    const sent = (await Bun.file(path.join(directory.path, "stdin.jsonl")).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).message.content as { type: string; text?: string }[])
    expect(sent).toHaveLength(2)
    const note = sent[0].at(-1)?.text ?? ""
    expect(note).toContain("`mcp__opencode_proxy__edit`, `mcp__opencode_proxy__write`")
    expect(note).toContain("select:mcp__opencode_proxy__edit,mcp__opencode_proxy__write")
    expect(note).toContain("Edit, Write used earlier")
    // The separator keeps the appended note from gluing onto the user's last word.
    expect(sent[0][0]).toMatchObject({ type: "text", text: "Write the plan.\n\n" })
    expect(sent[1].some((block) => block.text?.includes("mcp__opencode_proxy__"))).toBe(false)
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 30_000)
