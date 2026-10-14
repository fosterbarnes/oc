/**
 * The Claude account pool: selection rules (accounts.ts) and the in-turn
 * switch (turnStream.ts), driven by a fake `claude` that answers by the
 * `CLAUDE_CONFIG_DIR` it was spawned with.
 */
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { afterEach, beforeEach, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  _resetAccountPool,
  _setAccountPoolFile,
  _setUsageCacheDir,
  DEFAULT_ACCOUNT,
  earliestLimitedUntil,
  expandHome,
  failoverAccount,
  forgetSessionPin,
  markAccountLimited,
  nextUsableAccount,
  pinSessionAccount,
  poolAccount,
  poolAccountIds,
  poolState,
  sessionPin,
  setCurrentAccount,
} from "@/provider/claude-code/accounts.js"
import { _resetRateLimitReports } from "@/provider/claude-code/cliEvents.js"
import { createClaudeCode } from "@/provider/claude-code/index.js"
import { deleteActiveProcessAndWait, sessionKey } from "@/provider/claude-code/sessionManager.js"
import { ClaudeUsageCache } from "@opencode-ai/core/claude-usage-cache"

beforeEach(() => _resetAccountPool())
afterEach(() => _resetAccountPool())

test("pool ids: the default dir inherits the environment, no option means one default account", () => {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? ""
  expect(poolAccountIds(undefined)).toEqual([DEFAULT_ACCOUNT])
  expect(poolAccountIds(["~/.claude", "~/.claudeSecond", "~/.claudeSecond"])).toEqual([
    DEFAULT_ACCOUNT,
    path.resolve(home, ".claudeSecond"),
  ])
})

test("pool ids: an explicit entry for the inherited config dir collapses to default", () => {
  const custom = path.join("home", "me", ".claudeCustom")
  const previous = process.env.CLAUDE_CONFIG_DIR
  process.env.CLAUDE_CONFIG_DIR = custom
  try {
    expect(poolAccountIds(["~/.claude", custom])).toEqual([DEFAULT_ACCOUNT])
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
  }
  // The default dir matches however it is cased on Windows, exactly elsewhere.
  const cased = path.resolve(expandHome("~/.claude")).toUpperCase()
  expect(poolAccountIds([cased])).toEqual(process.platform === "win32" ? [DEFAULT_ACCOUNT] : [cased])
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

test("a manual pick sticks, clears that account's limit, and rejects ids outside the pool", () => {
  const ids = ["a", "b"]
  const now = Date.now()
  markAccountLimited("b", now + 60_000, now)
  expect(poolState(ids, now).find((account) => account.id === "b")?.limitedUntil).toBe(now + 60_000)
  expect(setCurrentAccount("zzz", ids, now)).toBe(false)
  expect(setCurrentAccount("b", ids, now)).toBe(true)
  expect(poolState(ids, now)).toEqual([
    { id: "a", label: "a", current: false },
    { id: "b", label: "b", current: true },
  ])
  expect(poolAccount(ids, now + 10)).toBe("b")
})

test("a session pin beats the global account, survives a reload, and unpins cleanly", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-account-pool-pin-"))
  const file = path.join(root, "account-pool.json")
  const ids = ["a", "b"]
  const now = Date.now()
  try {
    _setAccountPoolFile(file)
    expect(pinSessionAccount("ses_1", "zzz", ids, now)).toBe(false)
    expect(pinSessionAccount("ses_1", "b", ids, now)).toBe(true)
    expect(sessionPin("ses_1", ids, now)).toBe("b")
    expect(sessionPin("ses_2", ids, now)).toBeUndefined()
    expect(sessionPin("default", ids, now)).toBeUndefined()
    // The global pick is untouched and a global switch does not move the pinned session.
    expect(poolAccount(ids, now)).toBe("a")
    expect(setCurrentAccount("a", ids, now)).toBe(true)
    expect(sessionPin("ses_1", ids, now)).toBe("b")
    expect(poolState(ids, now, "ses_1")).toEqual([
      { id: "a", label: "a", current: false },
      { id: "b", label: "b", current: true, pinned: true },
    ])

    _resetAccountPool()
    _setAccountPoolFile(file)
    expect(sessionPin("ses_1", ids, now)).toBe("b")
    // A pin to an account that left the pool is ignored.
    expect(sessionPin("ses_1", ["a"], now)).toBeUndefined()

    expect(pinSessionAccount("ses_1", undefined, ids, now)).toBe(true)
    expect(sessionPin("ses_1", ids, now)).toBeUndefined()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("failover moves a pinned chat's pin to the next usable account without touching the global pick", () => {
  const ids = ["a", "b", "c"]
  const now = Date.now()
  pinSessionAccount("ses_1", "b", ids, now)
  markAccountLimited("b", now + 60_000, now)
  markAccountLimited("c", now + 60_000, now)
  expect(failoverAccount("ses_1", ids, now)).toBe("a")
  expect(sessionPin("ses_1", ids, now)).toBe("a")
  markAccountLimited("a", now + 60_000, now)
  expect(failoverAccount("ses_1", ids, now)).toBeUndefined()
  expect(sessionPin("ses_1", ids, now)).toBe("a")
  // An unpinned chat moves the global pick as before.
  setCurrentAccount("c", ids, now)
  expect(failoverAccount("ses_2", ids, now)).toBe("c")
  expect(sessionPin("ses_2", ids, now)).toBeUndefined()
})

test("a rejection without a reset time sits the account out for an hour", () => {
  markAccountLimited("a", undefined, 0)
  expect(nextUsableAccount(["a"], 60 * 60 * 1000 - 1)).toBeUndefined()
  expect(nextUsableAccount(["a"], 60 * 60 * 1000)).toBe("a")
})

test("pool pointer round-trips through the persist file and ignores expired limits", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-account-pool-file-"))
  const file = path.join(root, "account-pool.json")
  const now = Date.now()
  try {
    _setAccountPoolFile(file)
    expect(poolAccount(["a", "b"], now)).toBe("a")
    markAccountLimited("a", now + 60_000, now)
    expect(poolAccount(["a", "b"], now + 10)).toBe("b")
    const saved = JSON.parse(readFileSync(file, "utf8")) as {
      currentAccount?: string
      limitedUntil?: Record<string, number>
    }
    expect(saved.currentAccount).toBe("b")
    expect(saved.limitedUntil?.["a"]).toBe(now + 60_000)

    _resetAccountPool()
    _setAccountPoolFile(file)
    expect(poolAccount(["a", "b"], now + 10)).toBe("b")
    expect(poolAccount(["a", "b"], now + 120_000)).toBe("b")

    writeFileSync(file, JSON.stringify({ limitedUntil: { a: now - 1000 } }))
    _resetAccountPool()
    _setAccountPoolFile(file)
    expect(poolAccount(["a", "b"], now)).toBe("a")
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
})

test("a 100% usage cache with a future reset skips that account; 99.9% and missing files do not", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-account-pool-cache-"))
  const cache = path.join(root, "cache")
  mkdirSync(cache)
  const second = path.join(root, ".claudeSecond")
  const now = Date.now()
  const future = new Date(now + 60_000).toISOString()
  const usage = (utilization: number, resetsAt: string | null) =>
    JSON.stringify({
      five_hour: { utilization, resets_at: resetsAt },
      seven_day: { utilization: 9, resets_at: new Date(now + 86_400_000).toISOString() },
    })
  // Pin the default identity: an inherited CLAUDE_CONFIG_DIR elsewhere would
  // hash the default account to a different cache file.
  const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR
  try {
    writeFileSync(path.join(cache, "claude-usage.json"), usage(100, future))
    writeFileSync(path.join(cache, "claude-usage-claudeSecond.json"), usage(0, null))
    _setUsageCacheDir(cache)
    expect(poolAccount([DEFAULT_ACCOUNT, second], now)).toBe(second)

    _resetAccountPool()
    writeFileSync(path.join(cache, "claude-usage.json"), usage(99.9, future))
    _setUsageCacheDir(cache)
    expect(poolAccount([DEFAULT_ACCOUNT, second], now)).toBe(DEFAULT_ACCOUNT)

    _resetAccountPool()
    rmSync(path.join(cache, "claude-usage.json"))
    _setUsageCacheDir(cache)
    expect(poolAccount([DEFAULT_ACCOUNT, second], now)).toBe(DEFAULT_ACCOUNT)
  } finally {
    if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
})

test("nondefault accounts seed from the hashed cache; legacy basename files need _configDir proof", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-account-pool-hash-"))
  const cache = path.join(root, "cache")
  mkdirSync(cache)
  const second = path.join(root, ".claudeSecond")
  const resolvedSecond = path.resolve(second)
  const hashed = path.join(cache, ClaudeUsageCache.cacheFileName(expandHome("~"), resolvedSecond))
  expect(path.basename(hashed)).toMatch(/^claude-usage-[0-9a-f]{16}\.json$/)
  const legacy = path.join(cache, "claude-usage-claudeSecond.json")
  const now = Date.now()
  const future = new Date(now + 60_000).toISOString()
  const usage = (extra: Record<string, unknown>) =>
    JSON.stringify({
      five_hour: { utilization: 100, resets_at: future },
      seven_day: { utilization: 9, resets_at: new Date(now + 86_400_000).toISOString() },
      ...extra,
    })
  const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR
  try {
    writeFileSync(hashed, usage({}))
    _setUsageCacheDir(cache)
    expect(earliestLimitedUntil([second], now)).toBeGreaterThan(now)

    _resetAccountPool()
    rmSync(hashed)
    writeFileSync(legacy, usage({}))
    _setUsageCacheDir(cache)
    expect(earliestLimitedUntil([second], now)).toBeUndefined()

    _resetAccountPool()
    writeFileSync(legacy, usage({ _configDir: ClaudeUsageCache.configDirId(resolvedSecond) }))
    _setUsageCacheDir(cache)
    expect(earliestLimitedUntil([second], now)).toBeGreaterThan(now)
  } finally {
    if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
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
    event: {
      type: "content_block_start",
      index: 0,
      content_block: { type: "tool_use", id: "toolu_read", name: "Read" },
    },
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
// The fake exits here without a `result`, as a child that dies right after its limit reply.
const EXIT = "@exit"
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
    if (line === ${JSON.stringify(EXIT)}) process.exit(0)
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
      tools: [
        { type: "function", name: "read", description: "Read a file", inputSchema: { type: "object", properties: {} } },
      ],
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

test("session-limit result text without a rate_limit_event still switches and hides the limit reply", async () => {
  const turn = await poolTurn({
    first: [
      init,
      endTurn,
      {
        type: "result",
        subtype: "success",
        session_id: "fake-session",
        is_error: true,
        result: "You've hit your session limit . resets 11:20pm",
      },
    ],
    second: served,
  })
  expect(turn.body).toContain("**Claude account switched:** first hit its usage limit; continuing on second.")
  expect(turn.body).toContain("resumed=false tools=false")
  expect(turn.body).not.toContain("You've hit your session limit")
  expect(turn.parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } })
})

test("an allowed_warning rate limit event does not switch accounts", async () => {
  const turn = await poolTurn({
    first: [
      init,
      {
        type: "rate_limit_event",
        session_id: "fake-session",
        rate_limit_info: {
          status: "allowed_warning",
          rateLimitType: "five_hour",
          utilization: 0.99,
          overageStatus: "rejected",
          overageDisabledReason: "org_level_disabled",
        },
      },
      text("still served"),
      endTurn,
      result(false),
    ],
    second: served,
  })
  expect(turn.body).toContain("still served")
  expect(turn.body).not.toContain("Claude account switched")
})

test("a successful reply that quotes limit text neither switches accounts nor marks the account limited", async () => {
  const quoted = "The CLI says: You've hit your limit"
  const turn = await poolTurn({
    first: [init, text(quoted), endTurn, { ...result(false), result: quoted }],
    second: served,
  })
  expect(turn.body).toContain(quoted)
  expect(turn.body).not.toContain("Claude account switched")
  expect(earliestLimitedUntil()).toBeUndefined()
})

test("an error result without limit text does not fail over on quoted limit text", async () => {
  const turn = await poolTurn({
    first: [
      init,
      text("Someone quoted: You've hit your limit"),
      endTurn,
      { ...result(true), result: "boom: exploded" },
    ],
    second: served,
  })
  expect(turn.body).toContain("Someone quoted: You've hit your limit")
  expect(turn.body).not.toContain("Claude account switched")
  expect(earliestLimitedUntil()).toBeUndefined()
  expect(turn.parts.at(-1)).toMatchObject({ type: "finish" })
})

test("a child that exits after its limit rejection without a result still switches accounts", async () => {
  const turn = await poolTurn({ first: [init, rejected, text("You've hit your limit"), EXIT], second: served })
  expect(turn.body).toContain("**Claude account switched:** first hit its usage limit; continuing on second.")
  expect(turn.parts.at(-1)).toMatchObject({ type: "finish", finishReason: { unified: "stop" } })
})

test("deleting a session drops its pin from memory and the pool file", () => {
  const root = mkdtempSync(path.join(tmpdir(), "oc-account-pool-forget-"))
  const file = path.join(root, "account-pool.json")
  const ids = ["a", "b"]
  try {
    _setAccountPoolFile(file)
    pinSessionAccount("ses_1", "b", ids)
    forgetSessionPin("ses_1")
    expect(sessionPin("ses_1", ids)).toBeUndefined()
    expect(JSON.parse(readFileSync(file, "utf8")).sessionAccounts).toBeUndefined()
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
})
