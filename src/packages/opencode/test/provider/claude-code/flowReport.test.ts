import { expect, test } from "bun:test"
import { formatTurnStatsBlock, TURN_STATS_MARKER } from "../../../src/provider/claude-code/turnStats"
import { cliCost, type Entry, flowReport, refusalReason, texts, toolSummary, turnUsage, usage } from "./flowReport"

test("report costs distinguish known zero, rounded estimates, and missing footers", () => {
  for (const cost of [0, 0.01234, 1.234]) {
    const footer = formatTurnStatsBlock({ costUsd: cost })
    expect(footer).not.toBeNull()
    expect(cliCost(entry("a", footer ?? ""))).toBe(Number(cost.toFixed(cost >= 1 ? 2 : 4)))
  }
  for (const text of [
    "this costs $0.25",
    `${TURN_STATS_MARKER} 1 CLI turn`,
    `${TURN_STATS_MARKER} $NaN`,
    `${TURN_STATS_MARKER} $-0.25`,
    `${TURN_STATS_MARKER} $0.2.5`,
    `${TURN_STATS_MARKER} $1e999`,
  ])
    expect(cliCost(entry("a", text))).toBeUndefined()
  expect(texts([entry("a", formatTurnStatsBlock({ costUsd: 0 }) ?? "")])).toBe("")
  const continued = entry("a", formatTurnStatsBlock({ costUsd: 0.1 }) ?? "")
  continued.parts.push(...entry("a", formatTurnStatsBlock({ costUsd: 0.2 }) ?? "").parts)
  expect(cliCost(continued)).toBe(0.2)
})

test("report deduplicates captured messages using the latest version", () => {
  const before = entry("a", "unfinished", 1)
  const after = entry("a", formatTurnStatsBlock({ costUsd: 0.025 }) ?? "", 42)
  expect(usage([before, after])).toMatchObject({ input: 6, output: 42, cliCost: 0.025 })
})

test("report renders partial costs and the strict expensive threshold", () => {
  const report = flowReport({ modelID: "sonnet", switchModelID: "haiku" })
  report.current = "4 compact"
  report.usage(
    usage([entry("summary", "compacted"), entry("followup", formatTurnStatsBlock({ costUsd: 0.25 }) ?? "")]),
    2,
  )
  expect(report.render()).toContain("CLI cost total: $0.2500 (partial, 1/2 turns)")
  expect(report.render()).not.toContain("expensive:")
  report.current = "5 revert"
  report.usage(usage([entry("a", formatTurnStatsBlock({ costUsd: 0.2501 }) ?? "")]), 1)
  expect(report.render()).toContain("5 revert: expensive:")
  report.current = "6 restart"
  report.usage(usage([entry("b", "no footer")]), 1)
  expect(report.render()).toContain("| unavailable | 1 |")
  expect(report.render()).not.toMatch(/NaN|Infinity/)
})

test("report cost deltas recover honestly after missing or decreased counters", () => {
  const ledger = new Map<string, number | undefined>()
  const first = entry("a", formatTurnStatsBlock({ costUsd: 0.1 }) ?? "")
  expect(turnUsage([first, first], ledger)).toMatchObject({ cliCost: 0.1, cliKnown: 1 })
  expect(turnUsage([entry("b", "missing")], ledger)).toMatchObject({ cliCost: 0, cliMissing: 1 })
  expect(turnUsage([entry("c", formatTurnStatsBlock({ costUsd: 0.3 }) ?? "")], ledger)).toMatchObject({
    cliCost: 0,
    cliMissing: 1,
  })
  expect(turnUsage([entry("d", formatTurnStatsBlock({ costUsd: 0.4 }) ?? "")], ledger)).toMatchObject({
    cliCost: 0.1,
    cliKnown: 1,
  })
  expect(turnUsage([entry("e", formatTurnStatsBlock({ costUsd: 0.01 }) ?? "")], ledger)).toMatchObject({
    cliCost: 0,
    cliMissing: 1,
  })
  expect(turnUsage([entry("f", formatTurnStatsBlock({ costUsd: 0.03 }) ?? "")], ledger)).toMatchObject({
    cliCost: 0.02,
    cliKnown: 1,
  })
})

test("report recognizes account refusals without matching ordinary refusals or warnings", () => {
  for (const text of [
    "Failed to authenticate. API Error: 401 Invalid bearer token",
    "api error: 403 forbidden",
    "Claude Code rejected this request: you are out of usage in the 5-hour window.",
    "▌ **rate limit:** Claude Code rejected this request: you are out of usage in the 5-hour window.",
    "Error during compaction: Failed to authenticate. API Error: 401 Invalid bearer token",
    "You've hit your session limit . resets 11:20pm",
    "You've hit your usage limit",
  ])
    expect(refusalReason(text)).toBeDefined()
  for (const text of [
    "I cannot help with that request.",
    "Approaching the usage limit for the 5-hour window",
    "This tutorial explains what to do when you are out of usage.",
  ])
    expect(refusalReason(text)).toBeUndefined()
})

test("tool summary shows each call's command and outcome, shortened", () => {
  const message = entry("a", "deleted")
  const time = { start: 1, end: 2 }
  message.parts.push(
    {
      id: "t1",
      sessionID: "session",
      messageID: "a",
      type: "tool",
      callID: "c1",
      tool: "bash",
      state: {
        status: "completed",
        input: { command: "rm ocToolCheck.txt" },
        output: "",
        title: "",
        metadata: {},
        time,
      },
    },
    {
      id: "t2",
      sessionID: "session",
      messageID: "a",
      type: "tool",
      callID: "c2",
      tool: "powershell",
      state: {
        status: "error",
        input: { command: "Remove-Item ocToolCheck.txt" },
        error: `denied ${"x".repeat(200)}`,
        time,
      },
    },
    {
      id: "t3",
      sessionID: "session",
      messageID: "a",
      type: "tool",
      callID: "c3",
      tool: "read",
      state: {
        status: "completed",
        input: { file_path: "ocToolCheck.txt" },
        output: "hello\n",
        title: "",
        metadata: {},
        time,
      },
    },
  )
  expect(toolSummary([message])).toBe(
    `bash completed rm ocToolCheck.txt; powershell error Remove-Item ocToolCheck.txt -> denied ${"x".repeat(73)}; read completed ocToolCheck.txt -> hello`,
  )
})

function entry(id: string, text: string, output = 2): Entry {
  return {
    info: {
      id,
      sessionID: "session",
      role: "assistant",
      time: { created: 1, completed: 2 },
      parentID: "user",
      modelID: "claude-sonnet-4-5",
      providerID: "claude-code",
      mode: "build",
      agent: "build",
      path: { cwd: "project", root: "project" },
      cost: 0.001,
      tokens: { input: 6, output, reasoning: 0, cache: { read: 1000, write: 20 } },
    },
    parts: [{ id: `part-${id}`, sessionID: "session", messageID: id, type: "text", text }],
  }
}
