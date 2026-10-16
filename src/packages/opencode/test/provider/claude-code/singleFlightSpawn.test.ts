import { expect, test } from "bun:test"
import { chmod, readFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { ClaudeCodeLanguageModel } from "@/provider/claude-code/claudeCodeLanguageModel"
import { deleteActiveProcessAndWait, deleteClaudeSessionId, getActiveProcess, sessionKey } from "@/provider/claude-code/sessionManager"
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

/** Logs each launch and each user envelope it reads, then answers every envelope with a `result`. */
async function loggingFakeCli(directory: string) {
  const cliPath = path.join(directory, "claude.cjs")
  const log = path.join(directory, "launches.log")
  await Bun.write(
    cliPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")
if (process.argv.includes("--version")) { console.log("2.1.283"); process.exit(0) }
const LOG = ${JSON.stringify(log)}
fs.appendFileSync(LOG, "launch\\n")
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (JSON.parse(line).type === "control_request") return
  fs.appendFileSync(LOG, "envelope\\n")
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "fake-session" }))
})
`,
  )
  if (process.platform !== "win32") await chmod(cliPath, 0o755)
  return { cliPath, log }
}

// Two turn setups for one session that overlap while planning used to each
// spawn a child; the second `set` then replaced the first, untracked.
test("overlapping setups for one session share one spawned child", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const fake = await loggingFakeCli(directory.path)
  const model = new ClaudeCodeLanguageModel(`single-flight-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: fake.cliPath,
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
  })
  const options: LanguageModelV3CallOptions = {
    prompt: [{ role: "user", content: [{ type: "text", text: "Hello." }] }],
    providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
  }
  try {
    const responses = await Promise.all([model.doStream(options), model.doStream(options)])
    const streams = await Promise.all(responses.map((response) => drain(response.stream)))

    for (const events of streams) {
      expect(events.find((event) => event.type === "finish")).toMatchObject({ finishReason: { unified: "stop" } })
    }
    const lines = (await readFile(fake.log, "utf8")).split("\n").filter(Boolean)
    expect(lines.filter((line) => line === "launch")).toHaveLength(1)
    expect(lines.filter((line) => line === "envelope")).toHaveLength(2)
    expect(getActiveProcess(key)).toBeDefined()
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)
