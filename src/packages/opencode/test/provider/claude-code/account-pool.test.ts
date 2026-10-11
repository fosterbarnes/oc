/**
 * The Claude account pool: selection rules (accounts.ts) and the in-turn
 * switch (turn-stream.ts), driven by a fake `claude` that answers by the
 * `CLAUDE_CONFIG_DIR` it was spawned with.
 */
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  _resetAccountPool,
  DEFAULT_ACCOUNT,
  markAccountLimited,
  nextUsableAccount,
  poolAccount,
  poolAccountIds,
} from "@/provider/claude-code/accounts.js"
import { _resetRateLimitReports } from "@/provider/claude-code/cli-events.js"
import { createClaudeCode } from "@/provider/claude-code/index.js"
import { deleteActiveProcessAndWait, sessionKey } from "@/provider/claude-code/session-manager.js"

afterEach(() => _resetAccountPool())

test("pool ids: the default dir inherits the environment, no option means one default account", () => {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ""
  expect(poolAccountIds(undefined)).toEqual([DEFAULT_ACCOUNT])
  expect(poolAccountIds(["~/.claude", "~/.claudeSecond", "~/.claudeSecond"])).toEqual([
    DEFAULT_ACCOUNT,
    path.resolve(home, ".claudeSecond"),
  ])
})

test("selection is sticky, skips limited accounts until their reset, and stays put when all are limited", () => {
  const ids = ["a", "b", "c"]
  expect(poolAccount(ids, 0)).toBe("a")
  markAccountLimited("a", 1000, 0)
  expect(poolAccount(ids, 10)).toBe("b")
  // a reset, but the pool stays on b until b is limited.
  expect(poolAccount(ids, 2000)).toBe("b")
  markAccountLimited("b", 5000, 2000)
  markAccountLimited("c", 5000, 2000)
  expect(poolAccount(ids, 2001)).toBe("a")
  markAccountLimited("a", 5000, 2001)
  expect(nextUsableAccount(ids, 2002)).toBeUndefined()
  expect(poolAccount(ids, 2002)).toBe("a")
})

test("a rejection without a reset time sits the account out for an hour", () => {
  markAccountLimited("a", undefined, 0)
  expect(nextUsableAccount(["a"], 60 * 60 * 1000 - 1)).toBeUndefined()
  expect(nextUsableAccount(["a"], 60 * 60 * 1000)).toBe("a")
})

const init = { type: "system", subtype: "init", session_id: "fake-session", tools: ["Read"] }
const text = (body: string) => ({
  type: "stream_event",
  session_id: "fake-session",
  event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: body } },
})
const endTurn = {
  type: "stream_event",
  session_id: "fake-session",
  event: { type: "message_delta", delta: { stop_reason: "end_turn" } },
}
const rejected = {
  type: "rate_limit_event",
  session_id: "fake-session",
  rate_limit_info: { status: "rejected", rateLimitType: "five_hour", resetsAt: 4_000_000_000 },
}
const result = (isError: boolean) => ({
  type: "result",
  subtype: "success",
  session_id: "fake-session",
  is_error: isError,
  result: isError ? "You've hit your limit" : "done",
})
const limited = [init, rejected, text("You've hit your limit"), endTurn, result(true)]
const readTool = [
  {
    type: "stream_event",
    session_id: "fake-session",
    event: { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_read", name: "Read" } },
  },
  { type: "stream_event", session_id: "fake-session", event: { type: "content_block_stop", index: 0 } },
  {
    type: "user",
    session_id: "fake-session",
    message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_read", content: "file text" }] },
  },
]
// Replaced by the fake with what it received, so a test can see the catch-up.
const ECHO = "@echo"
const served = [init, ECHO, endTurn, result(false)]

/** Runs one turn on a two-account pool; `lines` maps each account dir's name to what it emits. */
async function poolTurn(lines: Record<string, unknown[]>) {
  _resetRateLimitReports()
  const root = mkdtempSync(path.join(tmpdir(), "oc-account-pool-"))
  const cwd = path.join(root, "project")
  mkdirSync(cwd)
  const dirs = Object.keys(lines).map((name) => path.join(root, name))
  const cliPath = path.join(root, "fake-claude.cjs")
  writeFileSync(
    cliPath,
    `#!/usr/bin/env node
if (process.argv.includes("--version")) {
  process.stdout.write("2.1.263\\n")
  process.exit(0)
}
const path = require("node:path")
const LINES = ${JSON.stringify(lines)}[path.basename(process.env.CLAUDE_CONFIG_DIR ?? "")] ?? []
let answered = false
require("node:readline").createInterface({ input: process.stdin }).on("line", (input) => {
  if (answered) return
  answered = true
  const echo = "resumed=" + input.includes("session_resume") + " tools=" + input.includes("Tool calls you made:\\\\nRead")
  for (const line of LINES) {
    const out = line === ${JSON.stringify(ECHO)}
      ? { type: "stream_event", session_id: "fake-session", event: { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: echo } } }
      : line
    process.stdout.write(JSON.stringify(out) + "\\n")
  }
})
`,
  )
  chmodSync(cliPath, 0o755)
  const sk = sessionKey(cwd, `tools::default::context=["claude-code"]`)
  try {
    const model = createClaudeCode({ cliPath, cwd, proxyTools: [], accounts: dirs }).languageModel("claude-test-pool")
    const options: Parameters<typeof model.doStream>[0] = {
      prompt: [{ role: "user", content: [{ type: "text", text: "go" }] }],
      tools: [{ type: "function", name: "read", description: "Read a file", inputSchema: { type: "object", properties: {} } }],
    }
    const response = await model.doStream(options)
    const parts: LanguageModelV3StreamPart[] = []
    const reader = response.stream.getReader()
    for (let next = await reader.read(); !next.done; next = await reader.read()) parts.push(next.value)
    const body = parts.flatMap((part) => (part.type === "text-delta" ? [part.delta] : [])).join("")
    return { parts, body }
  } finally {
    await deleteActiveProcessAndWait(sk)
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

test("a usage rejection moves the turn to the next account with the catch-up, hiding the limit reply", async () => {
  const turn = await poolTurn({ first: limited, second: served })
  expect(turn.body).toContain("**Claude account switched:** first hit its usage limit; continuing on second.")
  expect(turn.body).toContain("resumed=false tools=false")
  expect(turn.body).not.toContain("You've hit your limit")
  expect(turn.parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } })
})

test("a rejection after tool work continues on the next account without running the tool again", async () => {
  const turn = await poolTurn({ first: [init, ...readTool, rejected, endTurn, result(true)], second: served })
  expect(turn.body).toContain("resumed=true tools=true")
  expect(turn.parts.filter((part) => part.type === "tool-call")).toHaveLength(1)
})

test("with every account limited the turn ends on the limit after one switch", async () => {
  const turn = await poolTurn({ first: limited, second: limited })
  expect(turn.body.match(/Claude account switched/g)).toHaveLength(1)
  expect(turn.body).toContain("**rate limit:**")
})
