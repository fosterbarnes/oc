import { expect, test } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  probeClaudeCodeUsage,
  shouldRefreshUsageProvider,
  updateUsageSnapshot,
  usageProviderForModel,
  type OpenAIUsage,
  type UsageSnapshot,
} from "../../../src/routes/session/sidebar-tools/usage"

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
    primary: { usedPercent: 25, resetAt: null, minutes: 300 },
    secondary: { usedPercent: 50, resetAt: null, minutes: 10_080 },
    fetchedAt: 100,
    source: "live",
  }
  const failed = updateUsageSnapshot<OpenAIUsage>(previous, { ok: false }, 200)
  expect(failed).toEqual({ ...previous, stale: true })
  const result: OpenAIUsage = {
    ok: true,
    primary: { usedPercent: 30, resetAt: null, minutes: 300 },
    secondary: { usedPercent: 50, resetAt: null, minutes: 10_080 },
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
        five_hour: { utilization: 25 }, seven_day: { utilization: 50 },
      }),
    }
    const live = await probeClaudeCodeUsage(options)
    expect(live.ok && live.source).toBe("live")
    expect(live.ok && live.fetchedAt).toBe(100)
    const cached = await probeClaudeCodeUsage({ ...options, nowMs: 2000 })
    expect(cached.ok && cached.source).toBe("cache")
    expect(cached.ok && cached.fetchedAt).toBe((await stat(cache)).mtimeMs)
    expect(cached.ok && cached.fiveHour.usedPercent).toBe(25)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
