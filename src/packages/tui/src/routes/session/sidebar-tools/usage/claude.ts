import { ClaudeUsageCache } from "@opencode-ai/core/claude-usage-cache"
import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { clampUsagePercent, fetchUsageResponse, usageFailureMetadata, type UsageOptions } from "./fetch"
import { compactResetDate } from "./format"
import type { UsageProbeMetadata, UsageSnapshot, UsageWindow } from "./snapshot"

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"

export type ClaudeCodeUsage =
  | {
      ok: true
      accountID?: string
      fetchedAt: number
      source: "live" | "cache"
      fiveHour: UsageWindow
      weekly: UsageWindow
      metadata?: UsageProbeMetadata
      /** Pooled accounts: each account's own usage, in pool order, including unreadable ones. */
      accounts?: { name: string; id?: string; usage: ClaudeCodeUsage }[]
    }
  | {
      ok: false
      /** Why no usage could be read: no login in the config dir, or an expired login with no cached result. */
      reason?: "signed-out" | "expired"
      metadata?: UsageProbeMetadata
    }

/** Explicit Claude merge for partial reads: unknown windows keep the in-memory snapshot's known values. */
export function updateClaudeSnapshot(
  previous: UsageSnapshot<ClaudeCodeUsage>,
  next: UsageSnapshot<ClaudeCodeUsage>,
  nowMs: number,
): UsageSnapshot<ClaudeCodeUsage> {
  if (!next.ok && previous.ok) return { ...previous, stale: true, ...(next.metadata ? { metadata: next.metadata } : {}) }
  if (!next.ok) return next
  if (!previous.ok || previous.accountID !== next.accountID)
    return { ...next, fetchedAt: next.fetchedAt ?? nowMs, source: next.source ?? "live", stale: next.source === "cache" }
  return {
    ...withClaudeFallback(next, previous, nowMs),
    fetchedAt: next.fetchedAt ?? nowMs,
    source: next.source ?? "live",
    stale: next.source === "cache",
  }
}

/** Canonical identity for a resolved Claude config directory (stable across platforms when resolved). */
export function claudeConfigDirId(resolvedDir: string): string {
  return ClaudeUsageCache.configDirId(resolvedDir)
}

function claudeUsageCacheWritePath(homeDir: string, resolvedDir: string): string {
  return path.join(homeDir, ".cache", "opencode", ClaudeUsageCache.cacheFileName(homeDir, resolvedDir))
}

function claudeUsageCacheLegacyPath(homeDir: string, resolvedDir: string): string {
  return path.join(
    homeDir,
    ".cache",
    "opencode",
    ClaudeUsageCache.cacheLegacyFileName(resolvedDir),
  )
}

async function resolveClaudeUsageCacheReadPath(homeDir: string, resolvedDir: string, writePath: string): Promise<string> {
  if (writePath !== claudeUsageCacheWritePath(homeDir, resolvedDir)) return writePath
  try {
    await stat(writePath)
    return writePath
  } catch {
    /* primary cache missing */
  }
  const legacyPath = claudeUsageCacheLegacyPath(homeDir, resolvedDir)
  if (legacyPath === writePath) return writePath
  try {
    const raw = await readFile(legacyPath, "utf8")
    if (ClaudeUsageCache.legacyCacheProvesIdentity(JSON.parse(raw), resolvedDir)) return legacyPath
  } catch {
    /* no legacy or unreadable */
  }
  return writePath
}

// Reads Claude Code's own OAuth login but never refreshes it; refreshing would rotate the token out from under Claude Code.
// The token expires between Claude Code runs and the endpoint rate-limits hard, so the last good response is cached on
// disk and shown whenever a live read fails. With no cache, a missing or expired login reports why.
export async function probeClaudeCodeUsage(options: UsageOptions = {}): Promise<ClaudeCodeUsage> {
  const homeDir = options.homeDir ?? os.homedir()
  const nowMs = options.nowMs ?? Date.now()
  const credentialsPath = options.claudeCredentialsPath ?? path.join(
    options.env?.CLAUDE_CONFIG_DIR ?? (options.homeDir ? undefined : process.env.CLAUDE_CONFIG_DIR) ??
      path.join(homeDir, ".claude"), ".credentials.json",
  )
  const configDir = path.resolve(path.dirname(credentialsPath))
  const cacheWritePath =
    options.claudeUsageCachePath ?? claudeUsageCacheWritePath(homeDir, configDir)
  const cacheReadPath = await resolveClaudeUsageCacheReadPath(homeDir, configDir, cacheWritePath)
  const oauth = await readFile(credentialsPath, "utf8")
    .then(
      (raw) => (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown } }).claudeAiOauth,
    )
    .catch(() => undefined)
  if (typeof oauth?.accessToken !== "string" || !oauth.accessToken) return { ok: false, reason: "signed-out" }
  const expired = typeof oauth.expiresAt === "number" && oauth.expiresAt <= nowMs
  let liveFailure: UsageProbeMetadata | undefined
  const liveFetched = expired
    ? undefined
    : await fetchUsageResponse(options, CLAUDE_USAGE_URL, {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        accept: "application/json",
      }).catch((error) => {
        liveFailure = usageFailureMetadata(error)
        return undefined
      })
  const liveUsage = parseClaudeUsage(liveFetched?.body, nowMs, liveFetched?.receiptMs)
  const cachedRaw = await readFile(cacheReadPath, "utf8")
    .then((raw) => JSON.parse(raw) as unknown)
    .catch(() => undefined)
  const prevStat = await stat(cacheReadPath).catch(() => undefined)
  const prevMtime = prevStat?.mtimeMs ?? nowMs
  const cachedUsage = parseClaudeUsage(cachedRaw, nowMs, prevMtime)
  const cachedTimed = cachedUsage.ok
    ? attachClaudeTimes(cachedUsage, claudeCacheTimes(cachedRaw), prevMtime)
    : cachedUsage
  if (liveUsage.ok) {
    const merged = withClaudeFallback(liveUsage, cachedTimed.ok ? cachedTimed : undefined, nowMs)
    await mkdir(path.dirname(cacheWritePath), { recursive: true })
      .then(() =>
        writeFile(
          cacheWritePath,
          JSON.stringify(mergeClaudeCache(liveFetched?.body, cachedRaw, merged, nowMs, configDir)),
        ),
      )
      .catch(() => undefined)
    return { ...merged, accountID: claudeConfigDirId(configDir) }
  }
  if (!cachedTimed.ok) {
    return expired
      ? { ok: false, reason: "expired", ...(liveFailure ? { metadata: liveFailure } : {}) }
      : liveFailure
        ? { ...cachedTimed, metadata: liveFailure }
        : cachedTimed
  }
  return {
    ...cachedTimed,
    accountID: claudeConfigDirId(configDir),
    source: "cache",
    fetchedAt: prevMtime,
    ...(liveFailure ? { metadata: liveFailure } : {}),
  }
}

/**
 * Usage of the pooled Claude accounts (the claude-code provider's `accounts`
 * option, a list of config dirs) as one meter: the used percentages are
 * averaged, so the pool reads as one 100% bar. Each account's own usage is
 * kept in `accounts`. Each reset
 * shown is the soonest among the accounts. Accounts whose usage cannot be read
 * are left out, never counted as unused.
 */
export async function probeClaudeCodePool(configDirs: string[], options: UsageOptions = {}): Promise<ClaudeCodeUsage> {
  const homeDir = options.homeDir ?? os.homedir()
  const dirs = configDirs.map((dir) => path.resolve(dir.replace(/^~(?=$|[\\/])/, homeDir)))
  const results = await Promise.all(
    dirs.map((dir) =>
      probeClaudeCodeUsage({
        ...options,
        claudeCredentialsPath: path.join(dir, ".credentials.json"),
        claudeUsageCachePath: claudeUsageCacheWritePath(homeDir, dir),
      }),
    ),
  )
  const known = results.filter((result) => result.ok)
  const metadata = results.map((result) => result.metadata).find((item) => item?.status === 429) ??
    results.find((result) => result.metadata)?.metadata
  const retryAt = Math.max(0, ...results.map((result) => result.metadata?.retryAt ?? 0))
  if (!known.length) return { ok: false, ...(metadata ? { metadata: { ...metadata, ...(retryAt ? { retryAt } : {}) } } : {}) }
  return {
    ok: true,
    // The pool reads as fresh while any account is live; an idle account's cached usage does not dim it.
    fetchedAt: Math.max(...known.map((result) => result.fetchedAt)),
    source: known.some((result) => result.source === "live") ? "live" : "cache",
    ...(metadata ? { metadata: { ...metadata, ...(retryAt ? { retryAt } : {}) } } : {}),
    fiveHour: averageClaudeWindows(known.map((result) => result.fiveHour)),
    weekly: averageClaudeWindows(known.map((result) => result.weekly)),
    accounts: dirs.map((dir, index) => ({
      name: path.basename(dir).replace(/^\./, ""),
      id: claudeConfigDirId(dir),
      usage: results[index],
    })),
  }
}

function parseClaudeUsage(value: unknown, nowMs: number, receiptMs?: number): ClaudeCodeUsage {
  const body = value as { five_hour?: unknown; seven_day?: unknown } | undefined
  if (!body || typeof body !== "object") return { ok: false }
  const readMs = receiptMs ?? nowMs
  const fiveHour = claudeWindow(body?.five_hour, nowMs, readMs)
  const weekly = claudeWindow(body?.seven_day, nowMs, readMs)
  // Windows read independently: a valid weekly survives a missing hourly and vice versa.
  // A malformed window stays unknown (null), never zero, unless its known reset proves expiry.
  if (fiveHour.usedPercent === null && weekly.usedPercent === null) return { ok: false }
  const fetchedAt = Math.max(
    fiveHour.fetchedAt ?? readMs,
    weekly.fetchedAt ?? readMs,
  )
  return { ok: true, fiveHour, weekly, fetchedAt, source: "live" }
}

function claudeWindow(value: unknown, nowMs: number, receiptMs: number): UsageWindow {
  const item = value as { utilization?: unknown; resets_at?: unknown } | null
  if (typeof item?.utilization !== "number" || !Number.isFinite(item.utilization))
    return { usedPercent: null, resetAt: null, resetMs: null, minutes: null }
  const date = typeof item.resets_at === "string" ? new Date(item.resets_at) : undefined
  const valid = date && !Number.isNaN(date.valueOf())
  // A cached window whose reset has passed is known to be back at zero.
  if (valid && date.valueOf() <= nowMs)
    return { usedPercent: 0, resetAt: null, resetMs: null, minutes: null, expired: true, fetchedAt: receiptMs }
  return {
    // OAuth usage utilization is already a percentage; only stream events use fractions.
    usedPercent: clampUsagePercent(item.utilization),
    resetAt: valid ? compactResetDate(date) : null,
    resetMs: valid ? date.valueOf() : null,
    minutes: null,
    fetchedAt: receiptMs,
  }
}

function isClaudeWindowRawValid(value: unknown): boolean {
  const item = value as { utilization?: unknown } | null
  return typeof item?.utilization === "number" && Number.isFinite(item.utilization)
}

/** Per-window reading times stored alongside the cached raw response. */
function claudeCacheTimes(value: unknown): { five_hour?: number; seven_day?: number } {
  const body = value as { _fetchedAt?: unknown } | null
  const times = body && typeof body === "object" ? (body._fetchedAt as Record<string, unknown> | undefined) : undefined
  const pick = (item: unknown) => (typeof item === "number" && Number.isFinite(item) ? item : undefined)
  return { five_hour: pick(times?.five_hour), seven_day: pick(times?.seven_day) }
}

/** Mark a disk read as last-known, keeping each window's original reading time. */
function attachClaudeTimes(
  usage: Extract<ClaudeCodeUsage, { ok: true }>,
  times: { five_hour?: number; seven_day?: number },
  fallbackMs: number,
): Extract<ClaudeCodeUsage, { ok: true }> {
  const at = (item: number | undefined) => item ?? fallbackMs
  return {
    ...usage,
    fiveHour:
      usage.fiveHour.usedPercent === null
        ? usage.fiveHour
        : { ...usage.fiveHour, cached: true, fetchedAt: at(times.five_hour) },
    weekly:
      usage.weekly.usedPercent === null
        ? usage.weekly
        : { ...usage.weekly, cached: true, fetchedAt: at(times.seven_day) },
  }
}

/** Merge raw responses so a partial live read never drops a good cached sibling from disk. */
function mergeClaudeCache(
  liveRaw: unknown,
  cachedRaw: unknown,
  merged: Extract<ClaudeCodeUsage, { ok: true }>,
  nowMs: number,
  configDir: string,
): unknown {
  if (!liveRaw || typeof liveRaw !== "object") return liveRaw
  const live = liveRaw as Record<string, unknown>
  const cached = (cachedRaw && typeof cachedRaw === "object" ? cachedRaw : {}) as Record<string, unknown>
  const out: Record<string, unknown> = { ...live }
  for (const key of ["five_hour", "seven_day"] as const) {
    if (!isClaudeWindowRawValid(live[key]) && isClaudeWindowRawValid(cached[key])) out[key] = cached[key]
  }
  // Per-window ages travel with the file so the old sibling is not laundered as fresh after restart.
  out._fetchedAt = {
    five_hour: merged.fiveHour.fetchedAt ?? nowMs,
    seven_day: merged.weekly.fetchedAt ?? nowMs,
  }
  out._configDir = claudeConfigDirId(configDir)
  return out
}

function mergeClaudeWindow(live: UsageWindow, fallback: UsageWindow | undefined, nowMs: number): UsageWindow {
  if (live.usedPercent !== null) return live
  if (!fallback) return live
  if (fallback.usedPercent !== null && fallback.resetMs !== null && fallback.resetMs <= nowMs)
    return { ...fallback, usedPercent: 0, resetAt: null, resetMs: null, minutes: null, expired: true, cached: true }
  if (fallback.usedPercent !== null) return { ...fallback, cached: true }
  return live
}

/** Fill unknown windows in `primary` from `fallback` (disk cache or in-memory snapshot). */
export function withClaudeFallback(
  primary: Extract<ClaudeCodeUsage, { ok: true }>,
  fallback: ClaudeCodeUsage | undefined,
  nowMs: number,
): Extract<ClaudeCodeUsage, { ok: true }> {
  const fallbackOk = fallback?.ok ? fallback : undefined
  const byName = new Map(
    (fallbackOk?.accounts ?? []).flatMap((account) =>
      account.usage.ok ? [[account.id ?? account.name, account.usage] as const] : [],
    ),
  )
  const accounts = primary.accounts?.map((account) => {
    const previous = byName.get(account.id ?? account.name)
    if (account.usage.ok && previous?.ok)
      return { ...account, usage: withClaudeFallback(account.usage, previous, nowMs) }
    if (!account.usage.ok && previous?.ok) return { ...account, usage: markClaudeCached(previous) }
    return account
  })
  const merged: Extract<ClaudeCodeUsage, { ok: true }> = {
    ...primary,
    fiveHour: mergeClaudeWindow(primary.fiveHour, fallbackOk?.fiveHour, nowMs),
    weekly: mergeClaudeWindow(primary.weekly, fallbackOk?.weekly, nowMs),
    ...(accounts ? { accounts } : {}),
  }
  return merged
}

function markClaudeCached(usage: Extract<ClaudeCodeUsage, { ok: true }>): Extract<ClaudeCodeUsage, { ok: true }> {
  return {
    ...usage,
    source: "cache",
    fiveHour: usage.fiveHour.usedPercent === null ? usage.fiveHour : { ...usage.fiveHour, cached: true },
    weekly: usage.weekly.usedPercent === null ? usage.weekly : { ...usage.weekly, cached: true },
  }
}

/** Pool average over known windows only; unknown windows are left out, never zero. */
function averageClaudeWindows(windows: UsageWindow[]): UsageWindow {
  const known = windows.filter((window) => window.usedPercent !== null)
  if (!known.length) return { usedPercent: null, resetAt: null, resetMs: null, minutes: null }
  const next = known
    .filter((window) => window.resetMs !== null)
    .sort((a, b) => (a.resetMs as number) - (b.resetMs as number))[0]
  const expired = known.every((window) => window.expired) ? ({ expired: true } as const) : {}
  const cached = known.every((window) => window.cached) ? ({ cached: true } as const) : {}
  const timed = known.every((window) => window.fetchedAt !== undefined)
    ? ({ fetchedAt: Math.max(...known.map((window) => window.fetchedAt as number)) } as const)
    : {}
  return {
    usedPercent: clampUsagePercent(
      known.reduce((total, window) => total + (window.usedPercent as number), 0) / known.length,
    ),
    resetAt: next?.resetAt ?? null,
    resetMs: next?.resetMs ?? null,
    minutes: null,
    ...expired,
    ...cached,
    ...timed,
  }
}

/** Expire known windows against the local clock; pooled accounts expire individually then re-aggregate. */
export function projectClaudeUsage(snapshot: ClaudeCodeUsage, nowMs: number): ClaudeCodeUsage {
  if (!snapshot.ok) return snapshot
  if (snapshot.accounts) {
    const accounts = snapshot.accounts.map((account) => ({
      ...account,
      usage: projectClaudeUsage(account.usage, nowMs),
    }))
    const known = accounts.map((account) => account.usage).filter((usage) => usage.ok)
    return {
      ...snapshot,
      fiveHour: averageClaudeWindows(known.map((usage) => usage.fiveHour)),
      weekly: averageClaudeWindows(known.map((usage) => usage.weekly)),
      accounts,
    }
  }
  return {
    ...snapshot,
    fiveHour: projectClaudeWindow(snapshot.fiveHour, nowMs),
    weekly: projectClaudeWindow(snapshot.weekly, nowMs),
  }
}

function projectClaudeWindow(window: UsageWindow, nowMs: number): UsageWindow {
  // Only a known reading can expire; a genuinely unknown window stays unknown.
  if (window.usedPercent !== null && window.resetMs !== null && window.resetMs <= nowMs)
    return { ...window, usedPercent: 0, resetAt: null, resetMs: null, minutes: null, expired: true }
  return window
}
