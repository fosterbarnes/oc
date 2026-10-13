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
  probeClaudeCodePool,
  probeCursorUsage,
  probeOpenAIUsage,
  projectClaudeUsage,
  updateClaudeSnapshot,
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
    "0%",
    "2%",
    "9%",
    "10%",
    "96%",
    "99%",
    "100%",
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
  expect(rows).toMatchObject([
    {
      usage: "Codex : 2%h,     96%w",
      reset: "1/2/26 ~1:05AM, ~12:30PM 10/11/26",
    },
  ])
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

function claudeAccount(
  hour: number | null,
  hourReset: string | null,
  week: number | null,
  weekReset: string | null,
): Extract<ClaudeCodeUsage, { ok: true }> {
  return {
    ok: true,
    fetchedAt: 100,
    source: "live",
    fiveHour: { usedPercent: hour, resetAt: hourReset, resetMs: null, minutes: 300 },
    weekly: { usedPercent: week, resetAt: weekReset, resetMs: null, minutes: 10080 },
  }
}

const claudeAccounts = [
  claudeAccount(100, "10/11/26 ~2:30AM", 81, "1/2/26 ~1:05AM"),
  claudeAccount(96, "10/11/26 ~3:20AM", 8, "10/18/26 ~12:30PM"),
]

test("Claude pool labels each account with its own hourly and weekly resets", () => {
  const rows = formatClaudeUsageRows(
    {
      ...claudeAccounts[0],
      accounts: claudeAccounts.map((usage, index) => ({ name: String(index), usage })),
    },
    false,
  )
  expect(rows).toMatchObject([
    { label: "Claude:", spaced: false, usage: "Claude:   100%h,   81%w", reset: "10/11/26 ~2:30AM, ~1:05AM 1/2/26" },
    { label: "Claude2:", spaced: true, usage: "Claude2:  96%h,    8%w", reset: "10/11/26 ~3:20AM, ~12:30PM 10/18/26" },
  ])
  for (const row of rows) {
    expect(row.usage.search(/\d+(?:\.\d+)?%/)).toBe(row.reset.indexOf("~") + 1)
    expect(Array.from(row.usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index)).toEqual(
      Array.from(row.reset.matchAll(/~/g), (match) => match.index! + 1),
    )
  }
})

test("Claude pool marks the active account's label with «", () => {
  const rows = formatClaudeUsageRows(
    {
      ...claudeAccounts[0],
      accounts: claudeAccounts.map((usage, index) => ({ name: `acct${index}`, usage })),
    },
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    "acct1",
  )
  expect(rows.map((row) => row.label)).toEqual(["Claude:", "Claude2 «"])
  expect(rows[1].usage.startsWith("Claude2 «")).toBe(true)
  expect(rows[1].usage.search(/\d+(?:\.\d+)?%/)).toBe(rows[1].reset.indexOf("~") + 1)
})

test("one readable pooled account uses its own two windows without a slash", () => {
  const single = formatClaudeUsageRows(claudeAccounts[1], false)
  expect(single).toMatchObject([{ usage: "Claude:   96%h,    8%w", reset: "10/11/26 ~3:20AM, ~12:30PM 10/18/26" }])
  expect(
    formatClaudeUsageRows(
      {
        ...claudeAccounts[0],
        accounts: [
          { name: "signed-out", usage: { ok: false, reason: "signed-out" } },
          { name: "readable", usage: claudeAccounts[1] },
          { name: "expired", usage: { ok: false, reason: "expired" } },
        ],
      },
      false,
    ),
  ).toEqual(single)
})

test("three Claude accounts split whole hourly and weekly pairs in remaining mode", () => {
  const accounts = [...claudeAccounts, claudeAccount(null, null, null, null)]
  const wide = formatClaudeUsageRows(
    {
      ...claudeAccounts[0],
      accounts: accounts.map((usage, index) => ({ name: String(index), usage })),
    },
    true,
  )
  expect(wide).toHaveLength(3)
  expect(wide.map((row) => row.usage.trim().split(/\s+/))).toEqual([
    ["Claude:", "0%h,", "19%w"],
    ["Claude2:", "4%h,", "92%w"],
    ["Claude3:", "unavailable,", "unavailable"],
  ])
  const rows = formatClaudeUsageRows(
    {
      ...claudeAccounts[0],
      accounts: accounts.map((usage, index) => ({ name: String(index), usage })),
    },
    true,
    30,
  )
  expect(rows).toMatchObject([
    { usage: "Claude:   0%h", reset: "10/11/26 ~2:30AM" },
    { usage: "Claude: 19%w", reset: "       ~1:05AM 1/2/26" },
    { usage: "Claude2:  4%h", reset: "10/11/26 ~3:20AM" },
    { usage: "Claude2: 92%w", reset: "        ~12:30PM 10/18/26" },
    { usage: "Claude3: unavailable", reset: "         reset unavailable" },
    { usage: "Claude3: unavailable", reset: "         reset unavailable" },
  ])
  for (const row of rows) {
    expect(Math.max(row.usage.length, row.reset.length)).toBeLessThanOrEqual(30)
    if (row.reset.includes("~")) expect(row.usage.search(/\d+(?:\.\d+)?%/)).toBe(row.reset.indexOf("~") + 1)
  }
  expect(rows.map((row) => row.spaced)).toEqual([false, false, true, false, true, false])
})

test("Claude pooled missing reset still preserves the weekly value and account slot", () => {
  const rows = formatClaudeUsageRows(
    {
      ...claudeAccounts[0],
      accounts: [
        { name: "first", usage: claudeAccount(null, null, 8, null) },
        { name: "second", usage: claudeAccounts[1] },
      ],
    },
    true,
    25,
  )
  // Unknown hourly stays unavailable; the known weekly keeps a blank reset slot.
  expect(rows).toMatchObject([
    { usage: "Claude: unavailable", reset: "        reset unavailable" },
    { usage: "Claude: 92%w", reset: "" },
    { usage: "Claude2:  4%h", reset: "10/11/26 ~3:20AM" },
    { usage: "Claude2: 92%w", reset: "        ~12:30PM 10/18/26" },
  ])
})

test("missing resets and percentages keep their own slot", () => {
  const rows = formatUsageRows({
    label: "Claude:",
    remaining: false,
    width: 30,
    windows: [
      { usedPercent: null, resetAt: null, suffix: "h" },
      { usedPercent: 9, resetAt: "10/11/26 ~12:30PM", suffix: "w" },
    ],
  })
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ usage: "Claude: unavailable", reset: "        reset unavailable" })
  expect(rows[1].usage.indexOf("9%")).toBe(rows[1].reset.indexOf("~") + 1)
  expect(rows[0].usage).not.toContain("null%")
})

test("Go uses comma-separated windows like the other providers", () => {
  expect(
    formatUsageRows({
      label: "OpenCode Go:",
      remaining: false,
      windows: [
        { usedPercent: 81, resetAt: "1/2/26 ~1:05AM", suffix: "w" },
        { usedPercent: 8, resetAt: "10/18/26 ~12:30PM", suffix: "m" },
      ],
    }),
  ).toMatchObject([
    {
      usage: "OpenCode Go: 81%w,    8%m",
      reset: "     1/2/26 ~1:05AM, ~12:30PM 10/18/26",
    },
  ])
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
  expect(
    formatUsageRows({
      label: "Codex :",
      remaining: false,
      windows: [
        { usedPercent: 2, resetAt: "10/11/26 ~6:17AM", suffix: "h" },
        { usedPercent: 0, resetAt: "10/18/26 ~1:17AM", suffix: "w" },
      ],
    }),
  ).toMatchObject([
    {
      usage: "Codex :   2%h,     0%w",
      reset: "10/11/26 ~6:17AM, ~1:17AM 10/18/26",
    },
  ])
  expect(
    formatUsageRows({
      label: "Cursor:",
      remaining: false,
      windows: [
        { usedPercent: 18, resetAt: "10/29/26 ~7:31PM", suffix: "m" },
        { usedPercent: 100, resetAt: "", suffix: " api", compact: true },
      ],
    }),
  ).toMatchObject([
    {
      usage: "Cursor:   18%m,    100% api",
      reset: "10/29/26 ~7:31PM",
    },
  ])
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
    formatUsageRows({
      label,
      remaining: false,
      windows,
      columns: shared.starts,
      clocks: shared.clocks,
      days: shared.days,
    })[0]
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
    expect(Array.from(row.usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index)).toEqual(
      Array.from(row.reset.matchAll(/~/g), (match) => match.index! + 1),
    )
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
    formatUsageRows({
      label,
      remaining: false,
      windows,
      columns: shared.starts,
      clocks: shared.clocks,
      days: shared.days,
    })[0]
  const wide = withShared("Codex :", wideWindows)
  const short = withShared("Claude:", shortWindows)
  expect(wide.reset).toBe("1/2/26 ~1:05AM, ~12:30PM 10/11/26")
  expect(short.reset).toBe("1/2/26 ~1:05AM, ~1:05AM    1/2/26")
  // Right-aligned: the short date is left-padded to the widest day, so both end in the same column.
  expect(short.reset.length).toBe(wide.reset.length)
  // Values stay under the first digit after `~`.
  for (const row of [wide, short]) {
    expect(Array.from(row.usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index)).toEqual(
      Array.from(row.reset.matchAll(/~/g), (match) => match.index! + 1),
    )
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
  expect(fullResetDate(reset, reset - (24 + 3) * 60 * 60_000 - 5 * 60_000)).toBe(
    `${date} (in 1 day, 3 hours, 5 minutes)`,
  )
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
    ...result,
    fetchedAt: 300,
    source: "live",
    stale: false,
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
      fetchImpl: async () =>
        Response.json({
          five_hour: { utilization: 25, resets_at: new Date(60_000).toISOString() },
          seven_day: { utilization: 50 },
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
    // A full cache read is last-known, never live: windows carry the original reading time.
    if (cached.ok && live.ok) {
      expect(cached.fiveHour.cached).toBe(true)
      expect(cached.weekly.cached).toBe(true)
      expect(cached.fiveHour.fetchedAt).toBe(live.fetchedAt)
      expect(cached.weekly.fetchedAt).toBe(live.fetchedAt)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Claude partial body keeps the valid sibling and the cached missing reading", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-partial-"))
  try {
    const credentials = path.join(directory, "credentials.json")
    const cache = path.join(directory, "usage.json")
    await Bun.write(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "test", expiresAt: 10_000 } }))
    // Seed disk with both windows so the partial live read has a sibling to keep.
    await Bun.write(
      cache,
      JSON.stringify({
        five_hour: { utilization: 20, resets_at: new Date(60_000).toISOString() },
        seven_day: { utilization: 40, resets_at: new Date(90_000).toISOString() },
      }),
    )
    const merged = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 100,
      fetchImpl: async () => Response.json({ five_hour: { utilization: "bad" }, seven_day: { utilization: 70 } }),
    })
    expect(merged.ok).toBe(true)
    if (merged.ok) {
      // Live weekly wins; missing hourly falls back to disk and is marked last-known.
      expect(merged.weekly.usedPercent).toBe(70)
      expect(merged.weekly.cached).toBeUndefined()
      expect(merged.fiveHour.usedPercent).toBe(20)
      expect(merged.fiveHour.cached).toBe(true)
      expect(merged.source).toBe("live")
      expect(merged.fetchedAt).toBe(100)
    }
    // Disk still holds both windows after the partial write, so a restart keeps the sibling.
    const reread = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 100,
      fetchImpl: async () => {
        throw new Error("offline")
      },
    })
    expect(reread.ok).toBe(true)
    if (reread.ok) {
      expect(reread.fiveHour.usedPercent).toBe(20)
      expect(reread.weekly.usedPercent).toBe(70)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Claude partial write keeps the old sibling's age instead of laundering it fresh", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-age-"))
  try {
    const credentials = path.join(directory, "credentials.json")
    const cache = path.join(directory, "usage.json")
    await Bun.write(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "test", expiresAt: 10_000 } }))
    await Bun.write(
      cache,
      JSON.stringify({
        five_hour: { utilization: 20, resets_at: new Date(60_000).toISOString() },
        seven_day: { utilization: 40, resets_at: new Date(90_000).toISOString() },
      }),
    )
    const seededMs = (await stat(cache)).mtimeMs
    const merged = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 100,
      fetchImpl: async () => Response.json({ five_hour: { utilization: "bad" }, seven_day: { utilization: 70 } }),
    })
    expect(merged.ok).toBe(true)
    if (merged.ok) {
      expect(merged.fiveHour.cached).toBe(true)
      expect(merged.fiveHour.fetchedAt).toBe(seededMs)
      expect(merged.weekly.usedPercent).toBe(70)
      expect(merged.weekly.cached).toBeUndefined()
    }
    // After restart the cached sibling still reports its original reading time, not the live write's.
    const reread = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 100,
      fetchImpl: async () => {
        throw new Error("offline")
      },
    })
    expect(reread.ok && reread.source).toBe("cache")
    if (reread.ok) {
      expect(reread.fiveHour.usedPercent).toBe(20)
      expect(reread.fiveHour.cached).toBe(true)
      expect(reread.fiveHour.fetchedAt).toBe(seededMs)
      expect(reread.weekly.usedPercent).toBe(70)
      expect(reread.weekly.cached).toBe(true)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Claude snapshot update keeps the live sibling and the known memory sibling", () => {
  const previous: UsageSnapshot<ClaudeCodeUsage> = {
    ok: true,
    fetchedAt: 50,
    source: "live",
    fiveHour: { usedPercent: 20, resetAt: "d", resetMs: 60_000, minutes: null, fetchedAt: 50 },
    weekly: { usedPercent: 40, resetAt: "d", resetMs: 90_000, minutes: null, fetchedAt: 50 },
  }
  const next: UsageSnapshot<ClaudeCodeUsage> = {
    ok: true,
    fetchedAt: 100,
    source: "live",
    fiveHour: { usedPercent: null, resetAt: null, resetMs: null, minutes: null },
    weekly: { usedPercent: 70, resetAt: null, resetMs: null, minutes: null, fetchedAt: 100 },
  }
  // Same explicit helper the sidebar calls for the Claude provider.
  const merged = updateClaudeSnapshot(previous, next, 100)
  expect(merged.ok).toBe(true)
  if (merged.ok) {
    expect(merged.weekly.usedPercent).toBe(70)
    expect(merged.weekly.cached).toBeUndefined()
    expect(merged.fiveHour.usedPercent).toBe(20)
    expect(merged.fiveHour.cached).toBe(true)
    expect(merged.fiveHour.fetchedAt).toBe(50)
    expect(merged.fetchedAt).toBe(100)
    expect(merged.source).toBe("live")
    expect(merged.stale).toBe(false)
  }
  expect(updateClaudeSnapshot(previous, { ok: false }, 200)).toEqual({ ...previous, stale: true })
})

test("Claude snapshot update falls back a failed pooled account as cache", () => {
  const remembered: Extract<ClaudeCodeUsage, { ok: true }> = {
    ok: true,
    fetchedAt: 50,
    source: "live",
    fiveHour: { usedPercent: 10, resetAt: null, resetMs: null, minutes: null, fetchedAt: 50 },
    weekly: { usedPercent: 20, resetAt: null, resetMs: null, minutes: null, fetchedAt: 50 },
  }
  const previous: UsageSnapshot<ClaudeCodeUsage> = {
    ok: true,
    fetchedAt: 50,
    source: "live",
    fiveHour: { usedPercent: 10, resetAt: null, resetMs: null, minutes: null },
    weekly: { usedPercent: 20, resetAt: null, resetMs: null, minutes: null },
    accounts: [{ name: "work", usage: remembered }],
  }
  const failed: UsageSnapshot<ClaudeCodeUsage> = {
    ok: true,
    fetchedAt: 100,
    source: "live",
    fiveHour: { usedPercent: null, resetAt: null, resetMs: null, minutes: null },
    weekly: { usedPercent: null, resetAt: null, resetMs: null, minutes: null },
    accounts: [{ name: "work", usage: { ok: false, reason: "expired" } }],
  }
  const merged = updateClaudeSnapshot(previous, failed, 100)
  expect(merged.ok).toBe(true)
  if (merged.ok) {
    const account = merged.accounts?.[0]?.usage
    expect(account?.ok).toBe(true)
    if (account?.ok) {
      expect(account.source).toBe("cache")
      expect(account.fetchedAt).toBe(50)
      expect(account.fiveHour.usedPercent).toBe(10)
      expect(account.fiveHour.cached).toBe(true)
    }
  }
})

test("Claude malformed body with no history stays unknown without fabricated values", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-unknown-"))
  try {
    const credentials = path.join(directory, "credentials.json")
    const cache = path.join(directory, "usage.json")
    await Bun.write(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "test", expiresAt: 10_000 } }))
    const result = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 100,
      fetchImpl: async () => Response.json({ five_hour: { utilization: "bad" }, seven_day: null }),
    })
    expect(result).toEqual({ ok: false })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Claude expired deadlines reset to zero with metadata and no invented date", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-expired-"))
  try {
    const credentials = path.join(directory, "credentials.json")
    const cache = path.join(directory, "usage.json")
    await Bun.write(credentials, JSON.stringify({ claudeAiOauth: { accessToken: "test", expiresAt: 10_000_000 } }))
    const live = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 200_000,
      fetchImpl: async () =>
        Response.json({
          five_hour: { utilization: 25, resets_at: new Date(60_000).toISOString() },
          seven_day: { utilization: 50, resets_at: new Date(300_000).toISOString() },
        }),
    })
    expect(live.ok).toBe(true)
    if (live.ok) {
      expect(live.fiveHour).toMatchObject({ usedPercent: 0, resetAt: null, resetMs: null, expired: true })
      expect(live.weekly.usedPercent).toBe(50)
      expect(live.weekly.expired).toBeUndefined()
    }
    // Cached read past the hourly deadline expires the same way without a new request body.
    const cached = await probeClaudeCodeUsage({
      claudeCredentialsPath: credentials,
      claudeUsageCachePath: cache,
      nowMs: 400_000,
      fetchImpl: async () => {
        throw new Error("offline")
      },
    })
    expect(cached.ok).toBe(true)
    if (cached.ok) {
      expect(cached.fiveHour.usedPercent).toBe(0)
      expect(cached.fiveHour.expired).toBe(true)
      expect(cached.weekly.usedPercent).toBe(0)
      expect(cached.weekly.expired).toBe(true)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("Claude hourly 0% without a reset shows a dash", () => {
  const rows = formatClaudeUsageRows(claudeAccount(0, null, 8, "10/18/26 ~12:30PM"), false)
  expect(rows).toHaveLength(1)
  expect(rows).toMatchObject([{ usage: "Claude: 0%h, 8%w", reset: "        -,  ~12:30PM 10/18/26" }])
  // Genuine unknown percentage still reads unavailable.
  const unknown = formatClaudeUsageRows(
    {
      ok: true,
      fetchedAt: 100,
      source: "live",
      fiveHour: { usedPercent: null, resetAt: null, resetMs: null, minutes: null },
      weekly: { usedPercent: 8, resetAt: null, resetMs: null, minutes: null },
    },
    false,
  )
  expect(unknown.map((row) => row.usage).join("\n")).toContain("unavailable")
})

test("Claude pooled hourly dash and mixed reset slots", () => {
  const bothIdle = formatClaudeUsageRows(
    {
      ...claudeAccount(0, null, 81, "1/2/26 ~1:05AM"),
      accounts: [claudeAccount(0, null, 81, "1/2/26 ~1:05AM"), claudeAccount(0, null, 8, "10/18/26 ~12:30PM")].map(
        (usage, index) => ({ name: String(index), usage }),
      ),
    },
    false,
  )
  expect(bothIdle.map((row) => row.usage)).toEqual(["Claude: 0%h, 81%w", "Claude2: 0%h, 8%w"])
  expect(bothIdle[0].reset.trim()).toBe("-,  ~1:05AM 1/2/26")
  expect(bothIdle[1].reset.trim()).toBe("-,  ~12:30PM 10/18/26")

  const mixedAccounts = [claudeAccounts[0], claudeAccount(0, null, 8, "10/18/26 ~12:30PM")].map((usage, index) => ({
    name: String(index),
    usage,
  }))
  const mixedRow = { usage: "Claude:   100%h,   81%w", reset: "10/11/26 ~2:30AM, ~1:05AM 1/2/26" }
  for (const width of [undefined, 40] as const) {
    const mixed = formatClaudeUsageRows({ ...claudeAccounts[0], accounts: mixedAccounts }, false, width)
    expect(mixed).toHaveLength(2)
    expect(mixed[0]).toMatchObject(mixedRow)
    const { usage, reset } = mixed[1]
    const percents = Array.from(usage.matchAll(/\d+(?:\.\d+)?%/g), (match) => match.index!)
    expect(percents[0]).toBe(reset.indexOf("-"))
    expect(percents[1]).toBe(reset.indexOf("~") + 1)
  }

  const nonzeroHour = formatClaudeUsageRows(claudeAccount(5, null, 8, "10/18/26 ~12:30PM"), false)
  expect(nonzeroHour).toMatchObject([{ usage: "Claude: 5%h, 8%w", reset: "            ~12:30PM 10/18/26" }])
  expect(nonzeroHour[0].reset).not.toContain("-")
})

test("local clock projection expires hourly, keeps weekly, metadata, and used/remaining", () => {
  const resetMs = 10_000
  const snapshot: Extract<ClaudeCodeUsage, { ok: true }> = {
    ok: true,
    fetchedAt: 100,
    source: "live",
    fiveHour: { usedPercent: 25, resetAt: "date", resetMs, minutes: null },
    weekly: { usedPercent: 40, resetAt: "date", resetMs: 90_000, minutes: null },
  }
  // Same helper the sidebar uses with its minute clock: no request, timestamps untouched.
  const projected = projectClaudeUsage(snapshot, resetMs)
  expect(projected.ok).toBe(true)
  if (projected.ok) {
    expect(projected.fiveHour).toMatchObject({ usedPercent: 0, resetMs: null, expired: true })
    expect(projected.weekly.usedPercent).toBe(40)
    expect(projected.weekly.expired).toBeUndefined()
    expect(projected.fetchedAt).toBe(100)
    expect(projected.source).toBe("live")
    const used = formatClaudeUsageRows(projected, false)
    const remaining = formatClaudeUsageRows(projected, true)
    expect(used.map((row) => row.usage).join("\n")).toContain("0%h")
    expect(used.map((row) => row.usage).join("\n")).toContain("40%w")
    expect(remaining.map((row) => row.usage).join("\n")).toContain("100%h")
    expect(remaining.map((row) => row.usage).join("\n")).toContain("60%w")
  }
  const before = projectClaudeUsage(snapshot, resetMs - 1)
  expect(before.ok && before.fiveHour.usedPercent).toBe(25)
  expect(before.ok && before.fiveHour.expired).toBeUndefined()
})

test("pooled projection expires per account and never averages unknown as zero", () => {
  const pooled: Extract<ClaudeCodeUsage, { ok: true }> = {
    ok: true,
    fetchedAt: 100,
    source: "live",
    fiveHour: { usedPercent: 50, resetAt: null, resetMs: 20_000, minutes: null },
    weekly: { usedPercent: 50, resetAt: null, resetMs: 20_000, minutes: null },
    accounts: [
      {
        name: "first",
        usage: {
          ok: true,
          fetchedAt: 100,
          source: "live",
          fiveHour: { usedPercent: 100, resetAt: "d", resetMs: 10_000, minutes: null },
          weekly: { usedPercent: 80, resetAt: "d", resetMs: 90_000, minutes: null },
        },
      },
      {
        name: "second",
        usage: {
          ok: true,
          fetchedAt: 100,
          source: "live",
          fiveHour: { usedPercent: null, resetAt: null, resetMs: null, minutes: null },
          weekly: { usedPercent: null, resetAt: null, resetMs: null, minutes: null },
        },
      },
    ],
  }
  const projected = projectClaudeUsage(pooled, 10_000)
  expect(projected.ok).toBe(true)
  if (projected.ok) {
    // Unknowns are left out of the average, not counted as unused:
    // weekly averages [80] to 80, not (80 + 0) / 2 = 40.
    expect(projected.fiveHour.usedPercent).toBe(0)
    expect(projected.fiveHour.expired).toBe(true)
    expect(projected.weekly.usedPercent).toBe(80)
    const first = projected.accounts?.[0]?.usage
    expect(first?.ok && first.fiveHour.expired).toBe(true)
  }
})

test("pool average of all-unknown windows stay unknown", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-pool-unknown-"))
  try {
    const home = directory
    for (const dir of [".claude", ".claudeSecond"]) {
      await Bun.write(
        path.join(home, dir, ".credentials.json"),
        JSON.stringify({ claudeAiOauth: { accessToken: "test", expiresAt: 10_000 } }),
      )
    }
    const result = await probeClaudeCodePool(["~/.claude", "~/.claudeSecond"], {
      homeDir: home,
      nowMs: 100,
      fetchImpl: async () => Response.json({ five_hour: null, seven_day: null }),
    })
    expect(result).toEqual({ ok: false })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("fractional OAuth utilization stays percent and equal Claude basenames have separate caches", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "oc-usage-identity-"))
  try {
    const dirs = [path.join(directory, "first", "account"), path.join(directory, "second", "account")]
    await Promise.all(dirs.map((dir, index) => Bun.write(path.join(dir, ".credentials.json"), JSON.stringify({
      claudeAiOauth: { accessToken: String(index), expiresAt: 10_000 },
    }))))
    const first = await probeClaudeCodePool(dirs, {
      homeDir: directory, nowMs: 100,
      fetchImpl: async (_url, init) => Response.json({
        five_hour: { utilization: new Headers(init?.headers).get("Authorization") === "Bearer 0" ? 0.5 : 0.25 },
        seven_day: { utilization: 1 },
      }),
    })
    expect(first.ok && first.accounts?.map((account) => account.usage.ok && account.usage.fiveHour.usedPercent))
      .toEqual([0.5, 0.25])
    const cached = await probeClaudeCodePool(dirs, {
      homeDir: directory, nowMs: 200,
      fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "60" } }),
    })
    expect(cached.ok && cached.accounts?.map((account) => account.usage.ok && account.usage.fiveHour.usedPercent))
      .toEqual([0.5, 0.25])
    expect(cached.metadata?.retryAt).toBe(60_200)
    if (cached.ok && first.ok) {
      expect(cached.accounts?.[0].id).not.toBe(cached.accounts?.[1].id)
      expect(updateClaudeSnapshot(first, cached, 200).stale).toBe(true)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("fractional Cursor percentages below one are not mistaken for fractions of a quota", async () => {
  const jwt = [Buffer.from('{"alg":"none"}').toString("base64url"),
    Buffer.from('{"sub":"usage-test"}').toString("base64url"), "signature"].join(".")
  const result = await probeCursorUsage({
    env: { OPENCODE_AUTH_CONTENT: "{}" }, cursorSessionToken: jwt, nowMs: 100,
    fetchImpl: async () => Response.json({ billingCycleEnd: "2026-11-01T00:00:00Z", individualUsage: {
      plan: { autoPercentUsed: 0.5, apiPercentUsed: 0.25 },
    } }),
  })
  expect(result.ok && result.monthly.usedPercent).toBe(0.5)
  expect(result.ok && result.monthly.apiUsedPercent).toBe(0.25)
})

test("usage Retry-After accepts dates and rejects malformed values without inventing a deadline", async () => {
  const options = { env: { OPENCODE_AUTH_CONTENT: JSON.stringify({ openai: { access: "test" } }) }, nowMs: 100 }
  const date = await probeOpenAIUsage({ ...options,
    fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "Thu, 01 Jan 1970 00:01:00 GMT" } }),
  })
  expect(date.metadata?.retryAt).toBe(60_000)
  const invalid = await probeOpenAIUsage({ ...options,
    fetchImpl: async () => new Response("", { status: 429, headers: { "Retry-After": "unknown" } }),
  })
  expect(invalid.metadata).toEqual({ status: 429 })
})
