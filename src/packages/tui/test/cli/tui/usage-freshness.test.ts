import { expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  fullResetDate,
  formatUsagePercent,
  formatUsageRows,
  formatClaudeUsageRows,
  usageColumns,
  probeClaudeCodeUsage,
  shouldRefreshUsageProvider,
  updateUsageSnapshot,
  usageProviderForModel,
  windowLabel,
  windowName,
  type OpenAIUsage,
  type ClaudeCodeUsage,
  type UsageSnapshot,
} from "../../../src/routes/session/sidebar-tools/usage"

test("sidebar precision follows the displayed used or remaining value", () => {
  expect([0, 2, 9, 10, 96, 99, 100].map((value) => formatUsagePercent(value))).toEqual([
    "0%", "2%", "9%", "10%", "96%", "99%", "100%",
  ])
  expect(formatUsagePercent(98, true)).toBe("2%")
  expect(formatUsagePercent(2.5)).toBe("2.5%")
  expect(formatUsagePercent(18.5)).toBe("18.5%")
  expect(formatUsagePercent(96.1, true)).toBe("3.9%")
  expect(formatUsagePercent(2.567)).toBe("2.57%")
  expect(formatUsagePercent(18.567)).toBe("18.6%")
  expect(formatUsagePercent(18.5, false, true)).toBe("19%")
  expect(formatUsagePercent(null)).toBe("unavailable")
})

test("Codex and Cursor align values to clock hours, with no Codex slash", () => {
  const windows = [
    { usedPercent: 2, resetAt: "1/2/26 ~1:05AM", suffix: "h" },
    { usedPercent: 96, resetAt: "10/11/26 ~12:30PM", suffix: "w" },
  ]
  const rows = formatUsageRows({ label: "Codex :", windows, remaining: false })
  expect(rows).toMatchObject([{
    usage: "Codex : 2%h,     96%w",
    reset: "1/2/26 ~1:05AM, ~12:30PM 10/11/26",
  }])
  const cursor = formatUsageRows({
    label: "Cursor:",
    windows: [windows[1], { usedPercent: 100, resetAt: "", suffix: " api", compact: true }],
    remaining: false,
  })[0]
  expect(cursor).toMatchObject({ usage: "Cursor:   96%w,     100% api", reset: "10/11/26 ~12:30PM" })
  expect(cursor.usage.indexOf("96%")).toBe(cursor.reset.indexOf("~") + 1)
  expect(cursor.usage.endsWith("100% api")).toBe(true)
})

test("Cursor appends the api percent as a dateless second window", () => {
  const rows = formatUsageRows({
    label: "Cursor:",
    remaining: false,
    windows: [
      { usedPercent: 20, resetAt: "10/29/26 ~7:31PM", suffix: "m" },
      { usedPercent: 100, resetAt: "", suffix: " api", compact: true },
    ],
  })
  expect(rows).toMatchObject([{ usage: "Cursor:   20%m,    100% api", reset: "10/29/26 ~7:31PM" }])
  const [row] = rows
  expect(row.usage.indexOf("20%")).toBe(row.reset.indexOf("~") + 1)
})

function claudeAccount(hour: number | null, hourReset: string | null, week: number | null, weekReset: string | null): Extract<ClaudeCodeUsage, { ok: true }> {
  return {
    ok: true, fetchedAt: 100, source: "live",
    fiveHour: { usedPercent: hour, resetAt: hourReset, resetMs: null, minutes: 300 },
    weekly: { usedPercent: week, resetAt: weekReset, resetMs: null, minutes: 10080 },
  }
}

const claudeAccounts = [
  claudeAccount(100, "10/11/26 ~2:30AM", 81, "1/2/26 ~1:05AM"),
  claudeAccount(96, "10/11/26 ~3:20AM", 8, "10/18/26 ~12:30PM"),
]

test("Claude pool shows four rows with each weekly value over its own reset", () => {
  const rows = formatClaudeUsageRows({
    ...claudeAccounts[0], accounts: claudeAccounts.map((usage, index) => ({ name: String(index), usage })),
  }, false)
  expect(rows).toMatchObject([
    { usage: "Claude:   100%h,   96%h", reset: "10/11/26 ~2:30AM, ~3:20AM 10/11/26" },
    { usage: "        81%w,    8%w", reset: "1/2/26 ~1:05AM, ~12:30PM 10/18/26" },
  ])
  for (const row of rows) {
    expect(row.usage.search(/\d/)).toBe(row.reset.indexOf("~") + 1)
    expect(Array.from(row.usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index))
      .toEqual(Array.from(row.reset.matchAll(/~/g), (match) => match.index! + 1))
  }
})

test("one readable pooled account uses its own two windows without a slash", () => {
  const single = formatClaudeUsageRows(claudeAccounts[1], false)
  expect(single).toMatchObject([{ usage: "Claude:   96%h,    8%w", reset: "10/11/26 ~3:20AM, ~12:30PM 10/18/26" }])
  expect(formatClaudeUsageRows({
    ...claudeAccounts[0], accounts: [
      { name: "signed-out", usage: { ok: false, reason: "signed-out" } },
      { name: "readable", usage: claudeAccounts[1] },
      { name: "expired", usage: { ok: false, reason: "expired" } },
    ],
  }, false)).toEqual(single)
})

test("three Claude accounts split whole hourly and weekly pairs in remaining mode", () => {
  const accounts = [...claudeAccounts, claudeAccount(null, null, null, null)]
  const wide = formatClaudeUsageRows({
    ...claudeAccounts[0], accounts: accounts.map((usage, index) => ({ name: String(index), usage })),
  }, true)
  expect(wide).toHaveLength(2)
  expect(wide.map((row) => row.usage.trim().split(/\s+/))).toEqual([
    ["Claude:", "0%h,", "4%h,", "unavailable"],
    ["19%w,", "92%w,", "unavailable"],
  ])
  const rows = formatClaudeUsageRows({
    ...claudeAccounts[0], accounts: accounts.map((usage, index) => ({ name: String(index), usage })),
  }, true, 25)
  expect(rows).toMatchObject([
    { usage: "Claude:   0%h", reset: "10/11/26 ~2:30AM" },
    { usage: "        4%h", reset: "       ~3:20AM 10/11/26" },
    { usage: "        unavailable", reset: "        reset unavailable" },
    { usage: "        19%w", reset: "1/2/26 ~1:05AM" },
    { usage: " 92%w", reset: "~12:30PM 10/18/26" },
    { usage: " unavailable", reset: " reset unavailable" },
  ])
  for (const row of rows) {
    expect(Math.max(row.usage.length, row.reset.length)).toBeLessThanOrEqual(25)
    if (row.reset.includes("~")) expect(row.usage.search(/\d/)).toBe(row.reset.indexOf("~") + 1)
  }
})

test("Claude pooled missing reset still preserves the weekly value and account slot", () => {
  const rows = formatClaudeUsageRows({
    ...claudeAccounts[0], accounts: [
      { name: "first", usage: claudeAccount(null, null, 8, null) },
      { name: "second", usage: claudeAccounts[1] },
    ],
  }, true, 25)
  expect(rows).toMatchObject([
    { usage: "Claude: unavailable", reset: "        reset unavailable" },
    { usage: "        4%h", reset: "       ~3:20AM 10/11/26" },
    { usage: " 92%w", reset: " reset unavailable" },
    { usage: " 92%w", reset: "~12:30PM 10/18/26" },
  ])
})

test("missing resets and percentages keep their own slot", () => {
  const rows = formatUsageRows({ label: "Claude:", remaining: false, width: 30, windows: [
    { usedPercent: null, resetAt: null, suffix: "h" },
    { usedPercent: 9, resetAt: "10/11/26 ~12:30PM", suffix: "w" },
  ] })
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ usage: "Claude: unavailable", reset: "        reset unavailable" })
  expect(rows[1].usage.indexOf("9%")).toBe(rows[1].reset.indexOf("~") + 1)
  expect(rows[0].usage).not.toContain("null%")
})

test("Go uses comma-separated windows like the other providers", () => {
  expect(formatUsageRows({ label: "OpenCode Go:", remaining: false, windows: [
    { usedPercent: 81, resetAt: "1/2/26 ~1:05AM", suffix: "w" },
    { usedPercent: 8, resetAt: "10/18/26 ~12:30PM", suffix: "m" },
  ] })).toMatchObject([{
    usage: "OpenCode Go: 81%w,    8%m",
    reset: "     1/2/26 ~1:05AM, ~12:30PM 10/18/26",
  }])
})

test("single Claude hourly and weekly values wrap as complete pairs", () => {
  const windows = [
    { usedPercent: 18, resetAt: "1/2/26 ~1:05AM", suffix: "h" },
    { usedPercent: 8, resetAt: "10/11/26 ~12:30PM", suffix: "w" },
  ]
  const wide = formatUsageRows({ label: "Claude:", windows, remaining: false })[0]
  expect(wide.usage).toBe("Claude: 18%h,    8%w")
  expect(wide.usage.indexOf("18%")).toBe(wide.reset.indexOf("~") + 1)
  expect(wide.usage.lastIndexOf("8%")).toBe(wide.reset.lastIndexOf("~") + 1)
  const narrow = formatUsageRows({ label: "Claude:", windows, remaining: false, width: 25 })
  expect(narrow).toMatchObject([
    { usage: "Claude: 18%h", reset: "1/2/26 ~1:05AM" },
    { usage: "Claude: 8%w", reset: "       ~12:30PM 10/11/26" },
  ])
})

test("user October examples have exact usage and comma-separated reset rows", () => {
  expect(formatUsageRows({
    label: "Codex :",
    remaining: false,
    windows: [
      { usedPercent: 2, resetAt: "10/11/26 ~6:17AM", suffix: "h" },
      { usedPercent: 0, resetAt: "10/18/26 ~1:17AM", suffix: "w" },
    ],
  })).toMatchObject([{
    usage: "Codex :   2%h,     0%w",
    reset: "10/11/26 ~6:17AM, ~1:17AM 10/18/26",
  }])
  expect(formatUsageRows({
    label: "Cursor:",
    remaining: false,
    windows: [
      { usedPercent: 18, resetAt: "10/29/26 ~7:31PM", suffix: "m" },
      { usedPercent: 100, resetAt: "", suffix: " api", compact: true },
    ],
  })).toMatchObject([{
    usage: "Cursor:   18%m,    100% api",
    reset: "10/29/26 ~7:31PM",
  }])
})

test("shared clocks right-align second-slot dates across providers", () => {
  const windowsFor = (hour: number, hourReset: string, week: number, weekReset: string, suffix: [string, string]) => [
    { usedPercent: hour, resetAt: hourReset, suffix: suffix[0] },
    { usedPercent: week, resetAt: weekReset, suffix: suffix[1] },
  ]
  const codexWindows = windowsFor(100, "10/11/26 ~6:17AM", 16, "10/18/26 ~1:17AM", ["h", "w"])
  const hourlyWindows = windowsFor(100, "10/11/26 ~7:29AM", 39, "10/11/26 ~9:29AM", ["h", "h"])
  const weeklyWindows = [
    { usedPercent: 89, resetAt: "10/12/26 ~11:59AM", suffix: "w", compact: true },
    { usedPercent: 12, resetAt: "10/12/26 ~12:59PM", suffix: "w", compact: true },
  ]
  const shared = usageColumns([
    ...formatUsageRows({ label: "Codex :", remaining: false, windows: codexWindows }),
    ...formatUsageRows({ label: "Claude:", remaining: false, windows: hourlyWindows }),
    ...formatUsageRows({ label: "", remaining: false, windows: weeklyWindows }),
  ])
  const withShared = (
    label: string,
    windows: { usedPercent: number | null; resetAt: string | null; suffix: string; compact?: boolean }[],
  ) =>
    formatUsageRows({ label, remaining: false, windows, columns: shared.starts, clocks: shared.clocks, days: shared.days })[0]
  const codex = withShared("Codex :", codexWindows)
  const hourly = withShared("Claude:", hourlyWindows)
  const weekly = withShared("", weeklyWindows)
  expect(codex).toMatchObject({
    usage: "Codex :   100%h,    16%w",
    reset: "10/11/26 ~6:17AM,  ~1:17AM  10/18/26",
  })
  expect(hourly).toMatchObject({
    usage: "Claude:   100%h,    39%h",
    reset: "10/11/26 ~7:29AM,  ~9:29AM  10/11/26",
  })
  expect(weekly).toMatchObject({
    usage: "          89%w,     12%w",
    reset: "10/12/26 ~11:59AM, ~12:59PM 10/12/26",
  })
  // Every second-slot date starts (and ends) in the same column...
  const dayStart = (reset: string) => reset.match(/(\d+\/\d+\/\d+)$/)?.index
  for (const row of [hourly, weekly]) {
    expect(dayStart(row.reset)).toBe(dayStart(codex.reset))
    expect(row.reset.length).toBe(codex.reset.length)
  }
  // ...and values stay under the first digit after `~`.
  for (const row of [codex, hourly, weekly]) {
    expect(Array.from(row.usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index))
      .toEqual(Array.from(row.reset.matchAll(/~/g), (match) => match.index! + 1))
  }
})

test("shared days right-align short second-slot dates", () => {
  const wideWindows = [
    { usedPercent: 2, resetAt: "1/2/26 ~1:05AM", suffix: "h" },
    { usedPercent: 96, resetAt: "10/11/26 ~12:30PM", suffix: "w" },
  ]
  const shortWindows = [
    { usedPercent: 18, resetAt: "1/2/26 ~1:05AM", suffix: "h" },
    { usedPercent: 8, resetAt: "1/2/26 ~1:05AM", suffix: "w" },
  ]
  const shared = usageColumns([
    ...formatUsageRows({ label: "Codex :", remaining: false, windows: wideWindows }),
    ...formatUsageRows({ label: "Claude:", remaining: false, windows: shortWindows }),
  ])
  const withShared = (
    label: string,
    windows: { usedPercent: number | null; resetAt: string | null; suffix: string; compact?: boolean }[],
  ) =>
    formatUsageRows({ label, remaining: false, windows, columns: shared.starts, clocks: shared.clocks, days: shared.days })[0]
  const wide = withShared("Codex :", wideWindows)
  const short = withShared("Claude:", shortWindows)
  expect(wide.reset).toBe("1/2/26 ~1:05AM, ~12:30PM 10/11/26")
  expect(short.reset).toBe("1/2/26 ~1:05AM, ~1:05AM    1/2/26")
  // Right-aligned: the short date is left-padded to the widest day, so both end in the same column.
  expect(short.reset.length).toBe(wide.reset.length)
  // Values stay under the first digit after `~`.
  for (const row of [wide, short]) {
    expect(Array.from(row.usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index))
      .toEqual(Array.from(row.reset.matchAll(/~/g), (match) => match.index! + 1))
  }
})

test("window labels follow the window length and stay empty when it is unknown or unusual", () => {
  expect([300, 60, 1440, 10080, 30 * 1440, 43200].map(windowLabel)).toEqual(["h", "h", "d", "w", "m", "m"])
  expect([null, undefined, 0, 3 * 1440, 90 * 1440].map(windowLabel)).toEqual(["", "", "", "", ""])
})

test("window names are spelled out for the usage menu", () => {
  expect([300, 60, 10080, 30 * 1440, 3 * 1440, 90 * 1440, null, 0].map(windowName)).toEqual([
    "5-hour",
    "1-hour",
    "Weekly",
    "Monthly",
    "3-day",
    "90-day",
    "",
    "",
  ])
})

test("full reset dates spell out the date and the time left in local time", () => {
  // Built from local components so the expected text does not depend on the machine's time zone.
  const reset = new Date(2026, 9, 11, 2, 58).valueOf()
  const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).valueOf()
  const date = "Sunday, October 11, 2026 at 2:58 AM"
  expect(fullResetDate(reset, at(10, 2, 58))).toBe(`${date} (in 1 day)`)
  expect(fullResetDate(reset, at(10, 22, 58))).toBe(`${date} (in 4 hours)`)
  expect(fullResetDate(reset, reset - (24 + 3) * 60 * 60_000 - 5 * 60_000)).toBe(`${date} (in 1 day, 3 hours, 5 minutes)`)
  expect(fullResetDate(reset, reset - 61_000)).toBe(`${date} (in 1 minute)`)
  expect(fullResetDate(reset, reset - 30_000)).toBe(`${date} (in less than a minute)`)
  expect(fullResetDate(reset, reset)).toBe(`${date} (reset passed)`)
})

test("finished-message provider mapping ignores unknown and inherited names", () => {
  for (const provider of ["openai", "claude-code", "opencode-go", "openrouter", "cursor"] as const)
    expect(usageProviderForModel(provider)).toBe(provider)
  expect(usageProviderForModel("claude-code-work")).toBe("claude-code")
  expect(usageProviderForModel("anthropic")).toBeUndefined()
  expect(usageProviderForModel("toString")).toBeUndefined()
})

test("provider refresh throttle includes the 45 second boundary", () => {
  expect(shouldRefreshUsageProvider(undefined, 0)).toBe(true)
  expect(shouldRefreshUsageProvider(0, 44_999)).toBe(false)
  expect(shouldRefreshUsageProvider(0, 45_000)).toBe(true)
  expect(shouldRefreshUsageProvider(45_000, 45_001)).toBe(false)
})

test("failed probe preserves numbers and fetch time, and live success clears stale state", () => {
  const previous: UsageSnapshot<OpenAIUsage> = {
    ok: true,
    primary: { usedPercent: 25, resetAt: null, resetMs: null, minutes: 300 },
    secondary: { usedPercent: 50, resetAt: null, resetMs: null, minutes: 10_080 },
    fetchedAt: 100,
    source: "live",
  }
  const failed = updateUsageSnapshot<OpenAIUsage>(previous, { ok: false }, 200)
  expect(failed).toEqual({ ...previous, stale: true })
  const result: OpenAIUsage = {
    ok: true,
    primary: { usedPercent: 30, resetAt: null, resetMs: null, minutes: 300 },
    secondary: { usedPercent: 50, resetAt: null, resetMs: null, minutes: 10_080 },
  }
  expect(updateUsageSnapshot<OpenAIUsage>(failed, result, 300)).toEqual({
    ...result, fetchedAt: 300, source: "live", stale: false,
  })
})

test("Claude fallback carries disk age and cache source", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-"))
  try {
    const credentials = path.join(directory, "credentials.json")
    const cache = path.join(directory, "usage.json")
    await Bun.write(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "test", expiresAt: 1000 } }))
    const options = {
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 100,
      fetchImpl: async () => Response.json({
        five_hour: { utilization: 25, resets_at: new Date(60_000).toISOString() }, seven_day: { utilization: 50 },
      }),
    }
    const live = await probeClaudeCodeUsage(options)
    expect(live.ok && live.source).toBe("live")
    expect(live.ok && live.fetchedAt).toBe(100)
    expect(live.ok && live.fiveHour.resetMs).toBe(60_000)
    expect(live.ok && live.weekly.resetMs).toBe(null)
    const cached = await probeClaudeCodeUsage({ ...options, nowMs: 2000 })
    expect(cached.ok && cached.source).toBe("cache")
    expect(cached.ok && cached.fetchedAt).toBe((await stat(cache)).mtimeMs)
    expect(cached.ok && cached.fiveHour.usedPercent).toBe(25)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
