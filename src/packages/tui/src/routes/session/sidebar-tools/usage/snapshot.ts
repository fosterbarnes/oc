export type UsageSnapshot<T> = T & {
  fetchedAt?: number
  source?: "live" | "cache"
  stale?: boolean
  metadata?: UsageProbeMetadata
}

export function updateUsageSnapshot<T extends { ok: boolean }>(
  previous: UsageSnapshot<T>,
  next: UsageSnapshot<T>,
  nowMs: number,
): UsageSnapshot<T> {
  if (!next.ok && previous.ok) return { ...previous, stale: true, ...(next.metadata ? { metadata: next.metadata } : {}) }
  if (!next.ok) return next
  return { ...next, fetchedAt: next.fetchedAt ?? nowMs, source: next.source ?? "live", stale: next.source === "cache" }
}

/** HTTP failure and account labeling metadata returned by usage probes for scheduling and UI. */
export type UsageProbeMetadata = {
  status?: number
  /** Absolute epoch milliseconds; earliest time a retry may succeed (from Retry-After). */
  retryAt?: number
  accountSource?: "opencode" | "cookie" | "desktop"
}

export type UsageWindow = {
  usedPercent: number | null
  resetAt: string | null
  /** Epoch milliseconds of the reset, for the full date in the usage menu. */
  resetMs: number | null
  minutes: number | null
  /** True when 0% comes from a passed reset, not a live reading. */
  expired?: boolean
  /** True when the value is last-known from disk, not the current live response. */
  cached?: boolean
  /** Epoch milliseconds the percent was read; per-window age for merged cache writes. */
  fetchedAt?: number
}

export function usageWindowStale(window: UsageWindow, snapshot: UsageSnapshot<{ ok: boolean }>, now: number) {
  return window.expired === true || window.cached === true || snapshot.stale === true ||
    (window.resetMs !== null && window.resetMs <= now) ||
    (window.fetchedAt === undefined && snapshot.source === "cache") ||
    now - (window.fetchedAt ?? snapshot.fetchedAt ?? 0) > 300_000
}
