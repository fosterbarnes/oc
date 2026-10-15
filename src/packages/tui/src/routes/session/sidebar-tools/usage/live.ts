import type { ProviderUsage } from "@opencode-ai/core/provider-usage"
import { updateClaudeSnapshot, type ClaudeCodeUsage } from "./claude"
import { compactResetDate } from "./format"
import type { OpenAIUsage } from "./probes"
import { updateUsageSnapshot, usageWindowStale, type UsageSnapshot, type UsageWindow } from "./snapshot"

const unknownWindow = (): UsageWindow => ({ usedPercent: null, resetAt: null, resetMs: null, minutes: null })

/** A probe begun before an observation cannot overwrite that observation when its response arrives. */
export function mergeUsageWindow(previous: UsageWindow | undefined, next: UsageWindow, startedAt: number): UsageWindow {
  if (!previous || previous.usedPercent === null) return next
  if ((previous.fetchedAt ?? 0) > startedAt || (previous.fetchedAt ?? 0) > (next.fetchedAt ?? Infinity)) return previous
  if (next.usedPercent === null) return { ...previous, cached: true }
  return next
}

export function mergeOpenAIProbe(
  previous: UsageSnapshot<OpenAIUsage>,
  next: UsageSnapshot<OpenAIUsage>,
  startedAt: number,
  now: number,
): UsageSnapshot<OpenAIUsage> {
  if (previous.accountID !== next.accountID) return updateUsageSnapshot({ ok: false }, next, now)
  if (previous.ok && !next.ok && (previous.fetchedAt ?? 0) > startedAt)
    return { ...previous, ...(next.metadata ? { metadata: next.metadata } : {}) }
  const merged = updateUsageSnapshot(previous, next, now)
  if (!previous.ok || !merged.ok || previous.accountID !== merged.accountID) return merged
  return {
    ...merged,
    primary: mergeUsageWindow(previous.primary, merged.primary, startedAt),
    secondary: mergeUsageWindow(previous.secondary, merged.secondary, startedAt),
  }
}

export function mergeClaudeProbe(
  previous: UsageSnapshot<ClaudeCodeUsage>,
  next: UsageSnapshot<ClaudeCodeUsage>,
  startedAt: number,
  now: number,
): UsageSnapshot<ClaudeCodeUsage> {
  if (previous.ok && !next.ok && previous.fetchedAt > startedAt)
    return { ...previous, ...(next.metadata ? { metadata: next.metadata } : {}) }
  const merged = updateClaudeSnapshot(previous, next, now)
  if (!previous.ok || !merged.ok) return merged
  const accounts = merged.accounts?.map((account) => {
    const old = previous.accounts?.find((item) => (item.id ?? item.name) === (account.id ?? account.name))
    return old?.usage.ok && account.usage.ok
      ? { ...account, usage: mergeClaudeProbe(old.usage, account.usage, startedAt, now) }
      : account
  })
  if (previous.accountID !== merged.accountID && !accounts) return merged
  return {
    ...merged,
    fiveHour: mergeUsageWindow(previous.fiveHour, merged.fiveHour, startedAt),
    weekly: mergeUsageWindow(previous.weekly, merged.weekly, startedAt),
    ...(accounts ? { accounts } : {}),
  }
}

function observedWindow(window: ProviderUsage.Info["windows"][number], now: number): UsageWindow {
  const resetMs = window.resetMs ?? null
  const date = resetMs === null ? undefined : new Date(resetMs)
  return {
    usedPercent: window.usedPercent,
    resetMs,
    resetAt: date ? compactResetDate(date) : null,
    minutes: window.minutes ?? null,
    fetchedAt: window.observedAt ?? now,
  }
}

export function applyOpenAIObservation(
  previous: UsageSnapshot<OpenAIUsage>,
  observation: ProviderUsage.Info,
): UsageSnapshot<OpenAIUsage> {
  if (observation.providerID !== "openai") return previous
  if (previous.accountID && previous.accountID !== observation.accountID) return previous
  const windows = observation.windows.filter((window) => window.id === "primary" || window.id === "secondary")
  if (!windows.length) return previous
  const base = previous.ok ? previous : {
    ok: true as const,
    accountID: observation.accountID,
    primary: unknownWindow(),
    secondary: unknownWindow(),
  }
  return {
    ...base,
    accountID: observation.accountID,
    fetchedAt: Math.max(previous.fetchedAt ?? 0, observation.observedAt),
    source: "live",
    stale: false,
    primary: windows.filter((window) => window.id === "primary").reduce(
      (old, window) => mergeUsageWindow(old, observedWindow(window, observation.observedAt), Infinity), base.primary,
    ),
    secondary: windows.filter((window) => window.id === "secondary").reduce(
      (old, window) => mergeUsageWindow(old, observedWindow(window, observation.observedAt), Infinity), base.secondary,
    ),
  }
}

export function applyClaudeObservation(
  previous: UsageSnapshot<ClaudeCodeUsage>,
  observation: ProviderUsage.Info,
): UsageSnapshot<ClaudeCodeUsage> {
  if (observation.providerID !== "claude-code" || !previous.ok) return previous
  if (previous.accounts) {
    if (!previous.accounts.some((account) => account.id === observation.accountID)) return previous
    return {
      ...previous,
      accounts: previous.accounts.map((account) => account.id === observation.accountID
        ? { ...account, usage: applyClaudeObservation(account.usage.ok ? account.usage : {
          ok: true,
          accountID: account.id,
          fetchedAt: 0,
          source: "cache",
          fiveHour: unknownWindow(),
          weekly: unknownWindow(),
        }, observation) }
        : account),
    }
  }
  if (previous.accountID !== observation.accountID) return previous
  const windows = observation.windows.filter((window) => window.id === "five_hour" || window.id === "seven_day")
  if (!windows.length) return previous
  return {
    ...previous,
    fetchedAt: Math.max(previous.fetchedAt, observation.observedAt),
    source: "live",
    stale: false,
    fiveHour: windows.filter((window) => window.id === "five_hour").reduce(
      (old, window) => mergeUsageWindow(old, observedWindow(window, observation.observedAt), Infinity), previous.fiveHour,
    ),
    weekly: windows.filter((window) => window.id === "seven_day").reduce(
      (old, window) => mergeUsageWindow(old, observedWindow(window, observation.observedAt), Infinity), previous.weekly,
    ),
  }
}

export function usageReadingDetails(window: UsageWindow, snapshot: UsageSnapshot<{ ok: boolean }>, now: number) {
  if (window.expired || (window.resetMs !== null && window.resetMs <= now))
    return ["Reset passed; awaiting a current reading"]
  const at = window.fetchedAt ?? snapshot.fetchedAt
  if (at === undefined || window.usedPercent === null) return []
  const age = Math.max(0, Math.floor((now - at) / 1000))
  const elapsed = age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`
  return [`${usageWindowStale(window, snapshot, now) ? "Last known reading" : "Updated"} ${elapsed} ago`,
    ...(snapshot.metadata?.status === 429 ? ["Usage endpoint rate limited"] : [])]
}
