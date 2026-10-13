import { expect, test } from "bun:test"
import type { ProviderUsage } from "@opencode-ai/core/provider-usage"
import {
  applyClaudeObservation,
  applyOpenAIObservation,
  mergeClaudeProbe,
  mergeOpenAIProbe,
  usageReadingDetails,
} from "../../../src/routes/session/sidebar-tools/usageLive"
import {
  formatClaudeUsageRows,
  usageWindowStale,
  type ClaudeCodeUsage,
  type OpenAIUsage,
  type UsageSnapshot,
} from "../../../src/routes/session/sidebar-tools/usage"

const unknown = () => ({ usedPercent: null, resetAt: null, resetMs: null, minutes: null })
const claude = (accountID = "C:/accounts/main"): UsageSnapshot<ClaudeCodeUsage> => ({
  ok: true, accountID, fetchedAt: 1_000, source: "cache",
  fiveHour: { ...unknown(), usedPercent: 8.25, cached: true, fetchedAt: 1_000 },
  weekly: { ...unknown(), usedPercent: 15.75, cached: true, fetchedAt: 1_000 },
})
const observation = (providerID: string, accountID: string, id: string, usedPercent = 23.5): ProviderUsage.Info => ({
  providerID, accountID, observedAt: 3_000,
  windows: [{ id, usedPercent, observedAt: 3_000, resetMs: 3_600_000, minutes: 300 }],
})

test("live Claude quota replaces only the named account/window and retains cached sibling age", () => {
  const next = applyClaudeObservation(claude(), observation("claude-code", "C:/accounts/main", "five_hour"))
  expect(next.ok).toBe(true)
  if (!next.ok) return
  expect(next.fiveHour.usedPercent).toBe(23.5)
  expect(next.fiveHour.cached).toBeUndefined()
  expect(next.fiveHour.fetchedAt).toBe(3_000)
  expect(next.weekly.usedPercent).toBe(15.75)
  expect(next.weekly.fetchedAt).toBe(1_000)
  expect(usageWindowStale(next.fiveHour, next, 3_000)).toBe(false)
  expect(usageWindowStale(next.weekly, next, 3_000)).toBe(true)
  expect(formatClaudeUsageRows(next, false, undefined, undefined, undefined, undefined, undefined, 3_000)[0].usage)
    .toContain("15.8%w*")
  expect(applyClaudeObservation(next, observation("claude-code", "C:/accounts/other", "five_hour"))).toBe(next)
  expect(applyClaudeObservation(next, observation("claude-code", "C:/accounts/main", "seven_day_opus"))).toBe(next)
})

test("pooled Claude accounts with equal basenames cannot update each other", () => {
  const first = claude("C:/first/main")
  const second = claude("C:/second/main")
  if (!first.ok) throw new Error("fixture must be readable")
  const pool: UsageSnapshot<ClaudeCodeUsage> = {
    ...first, accounts: [
      { name: "main", id: "C:/first/main", usage: first },
      { name: "main", id: "C:/second/main", usage: second },
    ],
  }
  const next = applyClaudeObservation(pool, observation("claude-code", "C:/second/main", "five_hour"))
  if (!next.ok) throw new Error("pool lost known readings")
  expect(next.accounts?.[0].usage).toBe(first)
  const changed = next.accounts?.[1].usage
  expect(changed?.ok && changed.fiveHour.usedPercent).toBe(23.5)
  const rows = formatClaudeUsageRows(next, false, undefined, undefined, undefined, undefined, "C:/second/main", 3_000)
  expect(rows[0].label).toBe("Claude:")
  expect(rows[1].label).toBe("Claude2 «")
  expect(rows[0].usage).toContain("8.25%h*")
  expect(rows[1].usage).toContain("23.5%h,")
})

test("older probes and snapshots cannot replace newer Claude observations or erase known siblings", () => {
  const live = applyClaudeObservation(claude(), observation("claude-code", "C:/accounts/main", "five_hour"))
  const probe = claude()
  const merged = mergeClaudeProbe(live, probe, 2_000, 4_000)
  expect(merged.ok && merged.fiveHour.usedPercent).toBe(23.5)
  expect(merged.ok && merged.fiveHour.fetchedAt).toBe(3_000)
  const late = { ...observation("claude-code", "C:/accounts/main", "five_hour", 9), observedAt: 2_000,
    windows: [{ id: "five_hour", usedPercent: 9, observedAt: 2_000 }] }
  const older = applyClaudeObservation(merged, late)
  expect(older.ok && older.fiveHour.usedPercent).toBe(23.5)
  expect(older.ok && older.weekly.fetchedAt).toBe(1_000)
})

test("live Codex partial metadata survives a slow probe and rejects another account", () => {
  const live = applyOpenAIObservation({ ok: false }, observation("openai", "account1", "primary"))
  const probe: UsageSnapshot<OpenAIUsage> = {
    ok: true, accountID: "account1", primary: { ...unknown(), usedPercent: 10, fetchedAt: 4_000 },
    secondary: { ...unknown(), usedPercent: 20, fetchedAt: 4_000 }, fetchedAt: 4_000,
  }
  const merged = mergeOpenAIProbe(live, probe, 2_000, 4_000)
  expect(merged.ok && merged.primary.usedPercent).toBe(23.5)
  expect(merged.ok && merged.secondary.usedPercent).toBe(20)
  expect(applyOpenAIObservation(merged, observation("openai", "account2", "primary"))).toBe(merged)
  const failed = mergeOpenAIProbe(live, { ok: false, accountID: "account1", metadata: { status: 429 } }, 2_000, 4_000)
  expect(failed.stale).toBe(false)
  expect(failed.metadata?.status).toBe(429)
  expect(mergeOpenAIProbe(live, { ok: false, accountID: "account2" }, 2_000, 4_000))
    .toEqual({ ok: false, accountID: "account2" })
})

test("reset-pending readings are marked stale immediately and menu states uncertainty", () => {
  const snapshot = claude()
  const window = { ...unknown(), usedPercent: 0, fetchedAt: 1_000, resetMs: 3_000 }
  expect(usageWindowStale(window, snapshot, 3_000)).toBe(true)
  expect(usageReadingDetails(window, snapshot, 3_000)).toEqual(["Reset passed; awaiting a current reading"])
})
