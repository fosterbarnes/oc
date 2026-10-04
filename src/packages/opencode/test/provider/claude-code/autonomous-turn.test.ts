// @ts-nocheck
/**
 * A background task that finishes after Claude's turn ended makes the CLI start
 * a turn on its own. oc must post a hidden wake prompt for the session, and the
 * turn that prompt opens must stream the CLI's turn live without writing
 * anything to the CLI.
 */
import assert from "node:assert/strict"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { createClaudeCode } from "@/provider/claude-code/index.js"
import { setOpencodeClient } from "@/provider/claude-code/runtime-status.js"
import { deleteActiveProcessAndWait, sessionKey, WAKE_PROMPT_TEXT } from "@/provider/claude-code/session-manager.js"

const SESSION = "ses_wake_test"

function createFixture() {
  const cwd = mkdtempSync(join(tmpdir(), "opencode-autonomous-turn-"))
  const cliPath = join(cwd, "fake-claude.cjs")
  writeFileSync(
    cliPath,
    `#!/usr/bin/env node
const readline = require("node:readline")
if (process.argv.includes("--version")) {
  process.stdout.write("2.1.258\\n")
  process.exit(0)
}
const say = (text) => {
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id: "fake-session" }) + "\\n")
  process.stdout.write(JSON.stringify({
    type: "assistant",
    session_id: "fake-session",
    message: { role: "assistant", content: [{ type: "text", text }] },
  }) + "\\n")
  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", session_id: "fake-session" }) + "\\n")
}
let turn = 0
readline.createInterface({ input: process.stdin }).on("line", () => {
  turn++
  if (turn > 1) return say("UNEXPECTED: oc wrote to the CLI")
  say("Started.")
  // The background task finishes after the turn ended; Claude wakes on its own.
  setTimeout(() => say("Woke."), 200)
})
`,
  )
  chmodSync(cliPath, 0o755)
  return { cwd, cliPath }
}

async function runTurn(model: any, prompt: any[]) {
  const response = await model.doStream({
    prompt,
    providerOptions: { "claude-code": { opencodeSessionID: SESSION } },
    tools: [{ type: "function", name: "bash", description: "Run a command", inputSchema: { type: "object", properties: {} } }],
  } as any)
  const parts: any[] = []
  for await (const part of response.stream) parts.push(part)
  return parts.filter((part) => part.type === "text-delta").map((part) => part.delta).join("")
}

test("a turn the CLI starts on its own wakes the oc session and streams live", { timeout: 10_000 }, async () => {
  const fixture = createFixture()
  const posts: any[] = []
  setOpencodeClient({
    _client: {
      get: async () => ({ data: [] }),
      post: async (request) => {
        posts.push(request)
        return { data: undefined }
      },
    },
  })
  try {
    const model = createClaudeCode({ cliPath: fixture.cliPath, cwd: fixture.cwd, proxyTools: [] }).languageModel(
      "claude-test-autonomous",
    )
    const first = [{ role: "user", content: [{ type: "text", text: "Start the task." }] }]
    assert.match(await runTurn(model, first), /Started\./)
    await new Promise((resolve) => setTimeout(resolve, 500))

    const wake = posts.find((request) => String(request.url).startsWith(`/session/${SESSION}/prompt_async`))
    assert.ok(wake, "expected a wake prompt for the session")
    assert.deepEqual(wake.body.parts, [{ type: "text", text: WAKE_PROMPT_TEXT, synthetic: true }])

    const text = await runTurn(model, [
      ...first,
      { role: "assistant", content: [{ type: "text", text: "Started." }] },
      { role: "user", content: [{ type: "text", text: WAKE_PROMPT_TEXT }] },
    ])
    assert.match(text, /Woke\./)
    assert.doesNotMatch(text, /UNEXPECTED/)
  } finally {
    setOpencodeClient({})
    await deleteActiveProcessAndWait(sessionKey(fixture.cwd, `tools::${SESSION}::context=["claude-code"]`))
    rmSync(fixture.cwd, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
})
