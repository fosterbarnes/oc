// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
/**
 * Per-turn cost and cache stats: the pure formatter and the `turnStats` option
 * default.
 *
 * Usage: bun test test/provider/claude-code/turnStats.test.ts
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { createClaudeCode } from "@/provider/claude-code/index.js"
import {
  TURN_STATS_MARKER,
  extractTurnStats,
  formatCost,
  formatDuration,
  formatTokens,
  formatTurnStatsBlock,
  formatTurnStatsLine,
  turnStatsLogPayload,
} from "@/provider/claude-code/turnStats.js"
import type { ClaudeStreamMessage } from "@/provider/claude-code/types.js"

const fullResult: ClaudeStreamMessage = {
  type: "result",
  subtype: "success",
  total_cost_usd: 0.01234,
  duration_ms: 4234,
  duration_api_ms: 3900,
  num_turns: 2,
  usage: {
    input_tokens: 1234,
    output_tokens: 812,
    cache_read_input_tokens: 45_120,
    cache_creation_input_tokens: 2048,
  },
  modelUsage: { "claude-opus-5": { inputTokens: 1234, outputTokens: 812 } },
  permission_denials: [{ tool_name: "Bash", tool_use_id: "toolu_1" }],
}

test("extractTurnStats keeps everything the result line carries", () => {
  const stats = extractTurnStats(fullResult)
  assert.equal(stats.costUsd, 0.01234)
  assert.equal(stats.durationMs, 4234)
  assert.equal(stats.durationApiMs, 3900)
  assert.equal(stats.numTurns, 2)
  assert.equal(stats.inputTokens, 1234)
  assert.equal(stats.outputTokens, 812)
  assert.equal(stats.cacheReadTokens, 45_120)
  assert.equal(stats.cacheWriteTokens, 2048)
  assert.deepEqual(stats.modelUsage, {
    "claude-opus-5": { inputTokens: 1234, outputTokens: 812 },
  })
  assert.equal(stats.permissionDenials?.length, 1)
})

test("the footer reads as one compact line", () => {
  assert.equal(
    formatTurnStatsLine(extractTurnStats(fullResult)),
    `${TURN_STATS_MARKER} $0.0123 · 4.2 s · 2 CLI turns · in 1.2k · out 812 · cache read 45.1k · cache write 2.0k · 1 permission denial`,
  )
})

test("rounding keeps the digits that carry information", () => {
  assert.equal(formatCost(0.0001234), "$0.0001")
  assert.equal(formatCost(0), "$0.0000")
  assert.equal(formatCost(12.3456), "$12.35")
  assert.equal(formatCost(-1), "$0.00")

  assert.equal(formatDuration(430), "0.4 s")
  assert.equal(formatDuration(4234), "4.2 s")
  assert.equal(formatDuration(95_000), "1m 35s")

  assert.equal(formatTokens(0), "0")
  assert.equal(formatTokens(812), "812")
  assert.equal(formatTokens(1234), "1.2k")
  assert.equal(formatTokens(1_500_000), "1.5M")
})

test("missing and zero fields are dropped, not printed as zeroes", () => {
  const line = formatTurnStatsLine(
    extractTurnStats({
      type: "result",
      subtype: "success",
      total_cost_usd: 0.002,
      duration_ms: 900,
      num_turns: 1,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }),
  )
  assert.equal(line, `${TURN_STATS_MARKER} $0.0020 · 0.9 s · 1 CLI turn · in 10 · out 5`)
  assert.equal(line!.includes("cache"), false)
  assert.equal(line!.includes("denial"), false)
})

test("a result with no usable numbers produces no footer at all", () => {
  assert.equal(formatTurnStatsLine(extractTurnStats({ type: "result" })), null)
  assert.equal(formatTurnStatsBlock(extractTurnStats({ type: "result" })), null)
})

test("the log payload is emitted whether or not the footer is", () => {
  const payload = turnStatsLogPayload(extractTurnStats(fullResult))
  assert.equal(payload.costUsd, 0.01234)
  assert.equal(payload.durationApiMs, 3900)
  assert.equal(payload.permissionDenials, 1)
  assert.deepEqual(payload.modelUsage, {
    "claude-opus-5": { inputTokens: 1234, outputTokens: 812 },
  })
  const empty = turnStatsLogPayload(extractTurnStats({ type: "result" }))
  assert.equal(empty.costUsd, null)
  assert.equal(empty.permissionDenials, 0)
})

test("turnStats is off unless the provider option asks for it", () => {
  assert.equal((createClaudeCode({})("claude-sonnet-5") as any).config.turnStats, false)
  assert.equal((createClaudeCode({ turnStats: true })("claude-sonnet-5") as any).config.turnStats, true)
})
