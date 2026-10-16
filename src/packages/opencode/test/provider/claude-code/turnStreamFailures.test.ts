import { expect, test } from "bun:test"
import { chmod } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { ClaudeCodeLanguageModel } from "@/provider/claude-code/claudeCodeLanguageModel"
import {
  deleteActiveProcessAndWait,
  deleteClaudeSessionId,
  getActiveProcess,
  sessionKey,
} from "@/provider/claude-code/sessionManager"
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
 * A fake `claude` that runs `script` for each user envelope. `launch` is 1 for
 * the first child in this directory and counts up; `out` writes a stream-json
 * line, `raw` writes a line as-is, and `result` is a clean terminal result.
 */
async function scriptedFakeCli(directory: string, script: string) {
  const cliPath = path.join(directory, "claude.cjs")
  const log = path.join(directory, "launches.log")
  await Bun.write(
    cliPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")
if (process.argv.includes("--version")) { console.log("2.1.283"); process.exit(0) }
const LOG = ${JSON.stringify(log)}
const launch = (fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8").split("\\n").filter(Boolean).length : 0) + 1
fs.appendFileSync(LOG, "launch\\n")
const out = (message) => console.log(JSON.stringify(message))
const raw = (text) => console.log(text)
const result = { type: "result", subtype: "success", is_error: false, session_id: "fake-session" }
const text = (body) => {
  out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: body } } })
}
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (JSON.parse(line).type === "control_request") return out(result)
  ${script}
})
`,
  )
  if (process.platform !== "win32") await chmod(cliPath, 0o755)
  return { cliPath, log }
}

function modelFor(cliPath: string, cwd: string) {
  return new ClaudeCodeLanguageModel(`turn-failures-${randomUUID()}`, {
    provider: "claude-code",
    cliPath,
    cwd,
    autoContinueIncompleteTurns: false,
  })
}

function optionsFor(session: string, text = "Go."): LanguageModelV3CallOptions {
  return {
    prompt: [{ role: "user", content: [{ type: "text", text }] }],
    providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
  }
}

// A result line cut short used to leave the turn waiting out the 60 s fallback.
test("a truncated result line ends the turn with an error well before the fallback", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const fake = await scriptedFakeCli(
    directory.path,
    `out({ type: "system", subtype: "init", session_id: "fake-session" })
  text("Partly")
  raw('{"type":"result","subtype":"success","is_error":false,"session_id":"fake-session"')`,
  )
  try {
    const started = Date.now()
    const response = await modelFor(fake.cliPath, directory.path).doStream(optionsFor(session))
    const events = await drain(response.stream)

    expect(Date.now() - started).toBeLessThan(10_000)
    const errors = events.filter((event) => event.type === "error")
    expect(errors).toHaveLength(1)
    expect(String((errors[0] as { error: unknown }).error)).toContain("could not be read")
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

test("a junk line that is not a result is ignored and the turn completes", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const fake = await scriptedFakeCli(
    directory.path,
    `out({ type: "system", subtype: "init", session_id: "fake-session" })
  raw("not json at all")
  text("Fine")
  out(result)`,
  )
  try {
    const response = await modelFor(fake.cliPath, directory.path).doStream(optionsFor(session))
    const events = await drain(response.stream)

    expect(events.filter((event) => event.type === "error")).toHaveLength(0)
    const finish = events.find((event) => event.type === "finish")
    expect(finish).toMatchObject({ finishReason: { unified: "stop" } })
    const shown = events
      .filter((event) => event.type === "text-delta")
      .map((event) => (event as { delta: string }).delta)
      .join("")
    expect(shown).toContain("Fine")
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

// Tool input that is not JSON used to run as `{}`; it must reach the SDK as the raw
// text, which the SDK rejects as invalid input.
test("a tool call whose input is not JSON is sent with its raw text, not empty arguments", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const fake = await scriptedFakeCli(
    directory.path,
    `out({ type: "system", subtype: "init", session_id: "fake-session" })
  out({ type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_bad", name: "Bash", input: {} } } })
  out({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"command": "ls' } } })
  out({ type: "stream_event", event: { type: "content_block_stop", index: 0 } })
  out(result)`,
  )
  try {
    const response = await modelFor(fake.cliPath, directory.path).doStream(optionsFor(session))
    const events = await drain(response.stream)

    const calls = events.filter((event) => event.type === "tool-call") as Array<{ toolCallId: string; input: string }>
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ toolCallId: "toolu_bad", input: '{"command": "ls' })
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

// A child whose stdout closed without exiting used to stay in the map; the next turn
// was handed it and waited out the 90 s start watchdog.
test("a turn after a child closed its stdout without exiting spawns a fresh child at once", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const fake = await scriptedFakeCli(
    directory.path,
    `if (launch === 1) {
    out({ type: "system", subtype: "init", session_id: "fake-session" })
    text("Half an answer")
    return
  }
  text("Second answer")
  out(result)`,
  )
  const model = modelFor(fake.cliPath, directory.path)
  try {
    // The child stays alive and silent; stdout reaches EOF anyway. On Windows a
    // child cannot be made to end its own stdout while it keeps running.
    const response = await model.doStream(optionsFor(session, "First."))
    const reader = response.stream.getReader()
    const first: LanguageModelV3StreamPart[] = []
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      first.push(next.value)
      if (next.value.type === "text-delta") break
    }
    getActiveProcess(key)!.proc.stdout!.push(null)
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      first.push(next.value)
    }
    expect(first.find((event) => event.type === "finish")).toMatchObject({ finishReason: { unified: "error" } })

    // oc sends the earlier exchange with the new message; without an assistant
    // message the turn counts as a new conversation and resets the child.
    const continued = {
      ...optionsFor(session),
      prompt: [
        { role: "user" as const, content: [{ type: "text" as const, text: "First." }] },
        { role: "assistant" as const, content: [{ type: "text" as const, text: "Half an answer" }] },
        { role: "user" as const, content: [{ type: "text" as const, text: "Second." }] },
      ],
    }
    const started = Date.now()
    const second = await drain((await model.doStream(continued)).stream)
    expect(Date.now() - started).toBeLessThan(10_000)
    expect(second.find((event) => event.type === "finish")).toMatchObject({ finishReason: { unified: "stop" } })

    const lines = (await Bun.file(fake.log).text()).split("\n").filter(Boolean)
    expect(lines).toEqual(["launch", "launch"])
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 30_000)
