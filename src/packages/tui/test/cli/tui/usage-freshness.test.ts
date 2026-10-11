import { expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  fullResetDate,
  probeClaudeCodeUsage,
  shouldRefreshUsageProvider,
  updateUsageSnapshot,
  usageProviderForModel,
  windowLabel,
  windowName,
  type OpenAIUsage,
  type UsageSnapshot,
} from "../../../src/routes/session/sidebar-tools/usage"

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
