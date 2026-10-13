import { mkdir, readFile, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/key"
const CURSOR_USAGE_URL = "https://cursor.com/api/usage-summary"
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
const REQUEST_TIMEOUT_MS = 15_000

export const USAGE_PROVIDER_IDS = ["openai", "cursor", "opencode-go", "openrouter", "claude-code"] as const
export type UsageProviderId = (typeof USAGE_PROVIDER_IDS)[number]

// Extra Claude Code accounts are separate providers named "claude-code-<account>".
export function usageProviderForModel(providerID: string): UsageProviderId | undefined {
  if (providerID.startsWith("claude-code-")) return "claude-code"
  return USAGE_PROVIDER_IDS.find((id) => id === providerID)
}

export function shouldRefreshUsageProvider(lastRequestedAt: number | undefined, nowMs: number): boolean {
  return lastRequestedAt === undefined || nowMs - lastRequestedAt >= 45_000
}

export type UsageSnapshot<T> = T & {
  fetchedAt?: number
  source?: "live" | "cache"
  stale?: boolean
}

export function updateUsageSnapshot<T extends { ok: boolean }>(
  previous: UsageSnapshot<T>,
  next: UsageSnapshot<T>,
  nowMs: number,
): UsageSnapshot<T> {
  if (!next.ok && previous.ok) return { ...previous, stale: true }
  if (!next.ok) return next
  return { ...next, fetchedAt: next.fetchedAt ?? nowMs, source: next.source ?? "live", stale: false }
}

/** Explicit Claude merge for partial reads: unknown windows keep the in-memory snapshot's known values. */
export function updateClaudeSnapshot(
  previous: UsageSnapshot<ClaudeCodeUsage>,
  next: UsageSnapshot<ClaudeCodeUsage>,
  nowMs: number,
): UsageSnapshot<ClaudeCodeUsage> {
  if (!next.ok && previous.ok) return { ...previous, stale: true }
  if (!next.ok) return next
  if (!previous.ok) return { ...next, fetchedAt: next.fetchedAt ?? nowMs, source: next.source ?? "live", stale: false }
  return {
    ...withClaudeFallback(next, previous, nowMs),
    fetchedAt: next.fetchedAt ?? nowMs,
    source: next.source ?? "live",
    stale: false,
  }
}

export const DEFAULT_USAGE_PROVIDERS: UsageProviderId[] = ["openai", "cursor", "opencode-go", "openrouter"]

export const USAGE_PROVIDER_OPTIONS: { id: UsageProviderId; title: string }[] = [
  { id: "openai", title: "Codex / OpenAI" },
  { id: "cursor", title: "Cursor" },
  { id: "opencode-go", title: "OpenCode Go" },
  { id: "openrouter", title: "OpenRouter" },
  { id: "claude-code", title: "Claude Code" },
]

export function isUsageProviderId(value: string): value is UsageProviderId {
  return (USAGE_PROVIDER_IDS as readonly string[]).includes(value)
}

export function normalizeUsageProviders(value: unknown, fallback = DEFAULT_USAGE_PROVIDERS): UsageProviderId[] {
  if (!Array.isArray(value)) return [...fallback]
  const providers: UsageProviderId[] = []
  for (const item of value) {
    if (typeof item !== "string" || !isUsageProviderId(item) || providers.includes(item)) continue
    providers.push(item)
  }
  return providers
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

export function formatUsagePercent(used: number | null | undefined, remaining = false, compact = false): string {
  if (used === null || used === undefined || !Number.isFinite(used)) return "unavailable"
  const value = remaining ? 100 - used : used
  return `${compact ? Math.round(value) : Number(value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0))}%`
}

/**
 * Both rows share an origin; each value starts at its reset's first clock digit. `columns[i]` is the minimum date
 * start of the i-th window in a row; `starts` reports each row's actual date starts so callers can share columns.
 * `clocks`/`days` report each row's flipped clock/day widths so callers can share those too; the shared maxima
 * come back in as options to right-align later-slot dates.
 */
export function formatUsageRows(options: {
  label: string
  windows: { usedPercent: number | null; resetAt: string | null; suffix: string; compact?: boolean }[]
  remaining: boolean
  width?: number
  columns?: number[]
  clocks?: number[]
  days?: number[]
}) {
  const rows: { usage: string; reset: string; starts: number[]; clocks: number[]; days: number[] }[] = []
  // Later windows flip `M/D/YY ~time` to `~time M/D/YY` so the value sits under the clock digit.
  const dates = options.windows.map((window, index) => {
    const raw = window.resetAt ?? "reset unavailable"
    if (index > 0 && window.resetAt) {
      const flipped = raw.match(/^(\S+) (~\S+)$/)
      if (flipped) return `${flipped[2]} ${flipped[1]}`
    }
    return raw
  })
  // Clock/day parts of each flipped date, by window index; only row positions past the first are ever padded.
  const parts = dates.map((date, index) => {
    if (index === 0) return undefined
    const part = date.match(/^~(\S+) (\S+)$/)
    return part ? { clock: part[1], day: part[2] } : undefined
  })
  let usage = options.label
  let reset = ""
  let starts: number[] = []
  let clocks: number[] = []
  let days: number[] = []
  options.windows.forEach((window, index) => {
    const date = dates[index]
    const emptyDate = date === ""
    const clock = date.indexOf("~") + 1
    // An empty date carries no clock; offset 1 keeps it in the shared column.
    const offset = window.resetAt === "" ? 1 : window.resetAt && clock > 0 ? clock : 0
    const value = `${formatUsagePercent(window.usedPercent, options.remaining, window.compact)}${window.usedPercent === null ? "" : window.suffix}`
    const position = starts.length
    const part = position > 0 ? parts[index] : undefined
    // Pad the clock to the shared width and right-align the day, so later-slot dates end in one column.
    const display = part
      ? `~${part.clock.padEnd(Math.max(part.clock.length, options.clocks?.[position] ?? 0))} ${part.day.padStart(Math.max(part.day.length, options.days?.[position] ?? 0))}`
      : date
    // A comma ends the previous value when another window shares the row.
    const base = position ? `${usage},` : usage
    const start = Math.max(
      position ? reset.length + 2 : 0,
      base.length + 1 - offset,
      position ? (options.columns?.[position] ?? 0) : 0,
    )
    const column = start + offset
    const gap = column - base.length
    const candidate = base + " ".repeat(gap) + value
    const prefix = position && reset.length ? `${reset}, ` : reset
    const nextReset = emptyDate ? reset : prefix.padEnd(start) + display
    if (position && Math.max(candidate.length, nextReset.length) > (options.width || Infinity)) {
      rows.push({ usage, reset, starts, clocks, days })
      const localStart = Math.max(0, options.label.length + 1 - offset)
      usage = options.label + " ".repeat(localStart + offset - options.label.length) + value
      reset = emptyDate ? "" : " ".repeat(localStart) + date
      starts = [localStart]
      clocks = [0]
      days = [0]
      return
    }
    usage = candidate
    reset = nextReset
    starts = [...starts, start]
    clocks = [...clocks, part ? part.clock.length : 0]
    days = [...days, part ? part.day.length : 0]
  })
  if (usage) rows.push({ usage, reset, starts, clocks, days })
  return rows
}

/** Shared per-slot widths: the widest date start, flipped clock, and flipped day of each window slot across rows. */
export function usageColumns(rows: { starts: number[]; clocks?: number[]; days?: number[] }[]) {
  const widest = (pick: (row: (typeof rows)[number]) => number[] | undefined) =>
    rows.reduce<number[]>((shared, row) => {
      const widths = pick(row) ?? []
      return widths.map((width, index) => Math.max(width, shared[index] ?? 0)).concat(shared.slice(widths.length))
    }, [])
  return { starts: widest((row) => row.starts), clocks: widest((row) => row.clocks), days: widest((row) => row.days) }
}

export function formatClaudeUsageRows(
  usage: Extract<ClaudeCodeUsage, { ok: true }>,
  remaining: boolean,
  width?: number,
  columns?: number[],
  clocks?: number[],
  days?: number[],
  /** Pool account name (config dir basename, no leading dot) whose row gets a `«` after its name. */
  active?: string,
) {
  const accounts = usage.accounts?.flatMap((account) =>
    account.usage.ok ? [{ name: account.name, usage: account.usage }] : [],
  )
  const known = accounts?.length ? accounts : [{ name: undefined, usage }]
  const cell = (window: UsageWindow, suffix: string) => {
    const idle = suffix === "h" && window.usedPercent === 0 ? "-" : ""
    // Unknown percent -> null ("reset unavailable"); hourly 0% with no reset ->
    // shows `-` (no 5-hour window running yet); other known percents without a reset leave a blank slot.
    const resetAt = window.resetAt ?? (window.usedPercent === null ? null : idle)
    return { usedPercent: window.usedPercent, resetAt, suffix }
  }
  return known.flatMap(({ name, usage: account }, index) => {
    const base = index === 0 ? "Claude" : `Claude${index + 1}`
    const label = active && name === active ? `${base} «` : `${base}:`
    return formatUsageRows({
      label,
      remaining,
      width,
      columns,
      clocks,
      days,
      windows: [cell(account.fiveHour, "h"), cell(account.weekly, "w")],
    }).map((row, rowIndex) => ({ ...row, label, spaced: index > 0 && rowIndex === 0 }))
  })
}

/** Sidebar suffix for a window of this length: `h`, `d`, `w`, `m`; empty when the length is unknown or unusual. */
export function windowLabel(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ""
  const days = minutes / 1440
  if (days < 1) return "h"
  if (days === 1) return "d"
  if (days === 7) return "w"
  return days >= 28 && days <= 31 ? "m" : ""
}

/** Spelled-out window name for the usage menu: `5-hour`, `Weekly`, `Monthly`, or `N-day`; empty when unknown. */
export function windowName(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return ""
  if (minutes === 10_080) return "Weekly"
  const days = minutes / 1440
  if (days >= 28 && days <= 31) return "Monthly"
  if (days < 1) return `${Math.round(minutes / 60)}-hour`
  return `${Math.round(days)}-day`
}

const RESET_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

/** Full reset date in local time with the time left, e.g. `Sunday, October 11, 2026 at 2:58 AM (in 1 day, 4 hours)`. */
export function fullResetDate(ms: number, nowMs: number): string {
  const date = RESET_DATE_FORMAT.format(new Date(ms))
  const remaining = ms - nowMs
  if (remaining <= 0) return `${date} (reset passed)`
  const totalMinutes = Math.floor(remaining / 60_000)
  if (totalMinutes === 0) return `${date} (in less than a minute)`
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts = (
    [
      [days, "day"],
      [hours, "hour"],
      [minutes, "minute"],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, unit]) => `${count} ${unit}${count === 1 ? "" : "s"}`)
  return `${date} (in ${parts.join(", ")})`
}

export function orderUsageWindows(windows: [UsageWindow, UsageWindow]): [UsageWindow, UsageWindow] {
  return [...windows].sort(
    (first, second) => (first.minutes ?? Number.POSITIVE_INFINITY) - (second.minutes ?? Number.POSITIVE_INFINITY),
  ) as [UsageWindow, UsageWindow]
}

export type OpenAIUsage =
  | {
      ok: true
      primary: UsageWindow
      secondary: UsageWindow
    }
  | {
      ok: false
      reason?: "reauthenticate"
    }

class UsageRequestError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Usage request failed with status ${status}.`)
    this.status = status
  }
}

export type OpenCodeGoUsage =
  | {
      ok: true
      weekly: UsageWindow
      monthly: UsageWindow | null
    }
  | {
      ok: false
    }

export type OpenRouterUsage =
  | {
      ok: true
      usedPercent: number
      remainingPercent: number
      usedUsd: number
      limitUsd: number
    }
  | {
      ok: false
    }

export type CursorUsage =
  | {
      ok: true
      monthly: UsageWindow & { apiUsedPercent: number | null }
    }
  | {
      ok: false
      reason?: "need-token" | "reauthenticate"
    }

export type ClaudeCodeUsage =
  | {
      ok: true
      fetchedAt: number
      source: "live" | "cache"
      fiveHour: UsageWindow
      weekly: UsageWindow
      /** Pooled accounts: each account's own usage, in pool order, including unreadable ones. */
      accounts?: { name: string; usage: ClaudeCodeUsage }[]
    }
  | {
      ok: false
      /** Why no usage could be read: no login in the config dir, or an expired login with no cached result. */
      reason?: "signed-out" | "expired"
    }

type UsageOptions = {
  authPath?: string
  cursorSessionToken?: string
  cursorDbPath?: string
  claudeCredentialsPath?: string
  claudeUsageCachePath?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
  fetchImpl?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
  nowMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export type UsageRefreshScheduler = {
  request(): void
  dispose(): void
}

export function shouldRefreshUsageAfterIdle(
  event: { sessionID: string; status: { type: string } },
  activeSessionID: string,
): boolean {
  return event.sessionID === activeSessionID && event.status.type === "idle"
}

export function createUsageRefreshScheduler(options: {
  refresh: () => Promise<void>
  fallbackIntervalMs: number
  schedule?: (callback: () => void, delay: number) => unknown
  cancel?: (handle: unknown) => void
}): UsageRefreshScheduler {
  const schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let running = false
  let queued = false
  let disposed = false
  let timer: unknown

  const scheduleFallback = () => {
    if (disposed) return
    if (timer !== undefined) cancel(timer)
    timer = schedule(() => {
      timer = undefined
      request()
    }, options.fallbackIntervalMs)
  }

  function request() {
    if (disposed) return
    if (running) {
      queued = true
      return
    }
    if (timer !== undefined) {
      cancel(timer)
      timer = undefined
    }
    running = true
    void options
      .refresh()
      .catch(() => undefined)
      .finally(() => {
        running = false
        scheduleFallback()
        if (queued) {
          queued = false
          queueMicrotask(request)
        }
      })
  }

  return {
    request,
    dispose() {
      disposed = true
      queued = false
      if (timer !== undefined) {
        cancel(timer)
        timer = undefined
      }
    },
  }
}

export function resolveAuthPath({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
}: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): string {
  if (env.OPENCODE_AUTH_PATH) return env.OPENCODE_AUTH_PATH
  if (platform === "win32")
    return path.join(env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local"), "opencode", "auth.json")
  if (platform === "darwin") return path.join(homeDir, "Library", "Application Support", "opencode", "auth.json")
  return path.join(env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share"), "opencode", "auth.json")
}

function compactResetDate(date: Date): string {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)} ~${hours % 12 || 12}:${minutes}${hours >= 12 ? "PM" : "AM"}`
}

// Reads Claude Code's own OAuth login but never refreshes it; refreshing would rotate the token out from under Claude Code.
// The token expires between Claude Code runs and the endpoint rate-limits hard, so the last good response is cached on
// disk and shown whenever a live read fails. With no cache, a missing or expired login reports why.
export async function probeClaudeCodeUsage(options: UsageOptions = {}): Promise<ClaudeCodeUsage> {
  const homeDir = options.homeDir ?? os.homedir()
  const nowMs = options.nowMs ?? Date.now()
  const cachePath = options.claudeUsageCachePath ?? path.join(homeDir, ".cache", "opencode", "claude-usage.json")
  const oauth = await readFile(
    options.claudeCredentialsPath ?? path.join(homeDir, ".claude", ".credentials.json"),
    "utf8",
  )
    .then(
      (raw) => (JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown } }).claudeAiOauth,
    )
    .catch(() => undefined)
  if (typeof oauth?.accessToken !== "string" || !oauth.accessToken) return { ok: false, reason: "signed-out" }
  const expired = typeof oauth.expiresAt === "number" && oauth.expiresAt <= nowMs
  const liveRaw = expired
    ? undefined
    : await fetchUsageResponse(options, CLAUDE_USAGE_URL, {
        Authorization: `Bearer ${oauth.accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
        accept: "application/json",
      }).catch(() => undefined)
  const liveUsage = parseClaudeUsage(liveRaw, nowMs)
  const cachedRaw = await readFile(cachePath, "utf8")
    .then((raw) => JSON.parse(raw) as unknown)
    .catch(() => undefined)
  const prevStat = await stat(cachePath).catch(() => undefined)
  const prevMtime = prevStat?.mtimeMs ?? nowMs
  const cachedUsage = parseClaudeUsage(cachedRaw, nowMs)
  const cachedTimed = cachedUsage.ok
    ? attachClaudeTimes(cachedUsage, claudeCacheTimes(cachedRaw), prevMtime)
    : cachedUsage
  if (liveUsage.ok) {
    const merged = withClaudeFallback(liveUsage, cachedTimed.ok ? cachedTimed : undefined, nowMs)
    await mkdir(path.dirname(cachePath), { recursive: true })
      .then(() => writeFile(cachePath, JSON.stringify(mergeClaudeCache(liveRaw, cachedRaw, merged, nowMs))))
      .catch(() => undefined)
    return merged
  }
  if (!cachedTimed.ok) return expired ? { ok: false, reason: "expired" } : cachedTimed
  return { ...cachedTimed, source: "cache", fetchedAt: prevMtime }
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
  const defaultDir = path.join(homeDir, ".claude")
  const dirs = configDirs.map((dir) => path.resolve(dir.replace(/^~(?=$|[\\/])/, homeDir)))
  const results = await Promise.all(
    dirs.map((dir) =>
      probeClaudeCodeUsage({
        ...options,
        claudeCredentialsPath: path.join(dir, ".credentials.json"),
        // The default account keeps the cache it always had.
        claudeUsageCachePath:
          dir === defaultDir
            ? undefined
            : path.join(homeDir, ".cache", "opencode", `claude-usage-${path.basename(dir).replace(/^\./, "")}.json`),
      }),
    ),
  )
  const known = results.filter((result) => result.ok)
  if (!known.length) return { ok: false }
  return {
    ok: true,
    // The pool reads as fresh while any account is live; an idle account's cached usage does not dim it.
    fetchedAt: Math.max(...known.map((result) => result.fetchedAt)),
    source: known.some((result) => result.source === "live") ? "live" : "cache",
    fiveHour: averageClaudeWindows(known.map((result) => result.fiveHour)),
    weekly: averageClaudeWindows(known.map((result) => result.weekly)),
    accounts: dirs.map((dir, index) => ({ name: path.basename(dir).replace(/^\./, ""), usage: results[index] })),
  }
}

function parseClaudeUsage(value: unknown, nowMs: number): ClaudeCodeUsage {
  const body = value as { five_hour?: unknown; seven_day?: unknown } | undefined
  if (!body || typeof body !== "object") return { ok: false }
  const fiveHour = claudeWindow(body?.five_hour, nowMs)
  const weekly = claudeWindow(body?.seven_day, nowMs)
  // Windows read independently: a valid weekly survives a missing hourly and vice versa.
  // A malformed window stays unknown (null), never zero, unless its known reset proves expiry.
  if (fiveHour.usedPercent === null && weekly.usedPercent === null) return { ok: false }
  return { ok: true, fiveHour, weekly, fetchedAt: nowMs, source: "live" }
}

function claudeWindow(value: unknown, nowMs: number): UsageWindow {
  const item = value as { utilization?: unknown; resets_at?: unknown } | null
  if (typeof item?.utilization !== "number" || !Number.isFinite(item.utilization))
    return { usedPercent: null, resetAt: null, resetMs: null, minutes: null }
  const date = typeof item.resets_at === "string" ? new Date(item.resets_at) : undefined
  const valid = date && !Number.isNaN(date.valueOf())
  // A cached window whose reset has passed is known to be back at zero.
  if (valid && date.valueOf() <= nowMs)
    return { usedPercent: 0, resetAt: null, resetMs: null, minutes: null, expired: true, fetchedAt: nowMs }
  return {
    usedPercent: Math.round(Math.max(0, Math.min(100, item.utilization))),
    resetAt: valid ? compactResetDate(date) : null,
    resetMs: valid ? date.valueOf() : null,
    minutes: null,
    fetchedAt: nowMs,
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
      account.usage.ok ? [[account.name, account.usage] as const] : [],
    ),
  )
  const accounts = primary.accounts?.map((account) => {
    const previous = byName.get(account.name)
    if (account.usage.ok && previous?.ok)
      return { name: account.name, usage: withClaudeFallback(account.usage, previous, nowMs) }
    if (!account.usage.ok && previous?.ok) return { name: account.name, usage: markClaudeCached(previous) }
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
    usedPercent: Math.round(known.reduce((total, window) => total + (window.usedPercent as number), 0) / known.length),
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
      name: account.name,
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

function resetTimestamp(resetAt: unknown, resetAfterSeconds: unknown, nowMs: number): number | null {
  const timestamp =
    typeof resetAt === "number" && Number.isFinite(resetAt)
      ? resetAt
      : typeof resetAfterSeconds === "number" && Number.isFinite(resetAfterSeconds) && resetAfterSeconds >= 0
        ? nowMs / 1000 + resetAfterSeconds
        : null
  if (timestamp === null) return null
  const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
  return Number.isNaN(new Date(ms).valueOf()) ? null : ms
}

function windowFromUsage(value: unknown, nowMs: number): UsageWindow | null {
  if (!value || typeof value !== "object") return null
  const window = value as {
    used_percent?: unknown
    reset_at?: unknown
    reset_after_seconds?: unknown
    limit_window_seconds?: unknown
  }
  if (typeof window.used_percent !== "number" || !Number.isFinite(window.used_percent)) return null
  const usedPercent = Math.round(Math.max(0, Math.min(100, window.used_percent)))
  const minutes = typeof window.limit_window_seconds === "number" ? Math.round(window.limit_window_seconds / 60) : null
  const resetMs = resetTimestamp(window.reset_at, window.reset_after_seconds, nowMs)
  return {
    usedPercent,
    resetAt: resetMs === null ? null : compactResetDate(new Date(resetMs)),
    resetMs,
    minutes,
  }
}

function parseUsageResponse(value: unknown, nowMs: number): OpenAIUsage {
  if (!value || typeof value !== "object") return errorResult()
  const body = value as { rate_limit?: { primary_window?: unknown; secondary_window?: unknown } }
  const primary = windowFromUsage(body.rate_limit?.primary_window, nowMs)
  const secondary = windowFromUsage(body.rate_limit?.secondary_window, nowMs) ?? {
    usedPercent: null,
    resetAt: null,
    resetMs: null,
    minutes: null,
  }
  if (!primary) return errorResult()
  return {
    ok: true,
    primary,
    secondary,
  }
}

function usageHeaders(credentials: { access: string; accountId?: string }) {
  return {
    Authorization: `Bearer ${credentials.access}`,
    accept: "application/json",
    ...(credentials.accountId ? { "chatgpt-account-id": credentials.accountId } : {}),
  }
}

function errorResult(): OpenAIUsage {
  return { ok: false }
}

function goErrorResult(): OpenCodeGoUsage {
  return { ok: false }
}

function openRouterErrorResult(): OpenRouterUsage {
  return { ok: false }
}

async function fetchUsageResponse(
  options: UsageOptions,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) throw new UsageRequestError(response.status)
  return response.json()
}

async function readAuthContent(options: UsageOptions): Promise<string> {
  if (options.env?.OPENCODE_AUTH_CONTENT) return options.env.OPENCODE_AUTH_CONTENT
  const authPaths = options.authPath
    ? [options.authPath]
    : [
        resolveAuthPath({ env: options.env, homeDir: options.homeDir }),
        path.join(options.homeDir ?? os.homedir(), ".local", "share", "opencode", "auth.json"),
      ]
  for (const authPath of [...new Set(authPaths)]) {
    try {
      return await readFile(authPath, "utf8")
    } catch {
      continue
    }
  }
  throw new Error("auth file not found")
}

export async function probeOpenAIUsage(options: UsageOptions = {}): Promise<OpenAIUsage> {
  const nowMs = options.nowMs ?? Date.now()
  let credentials: { access: string; accountId?: string }
  try {
    const raw = await readAuthContent(options)
    const openai = (JSON.parse(raw) as { openai?: { access?: unknown; accountId?: unknown; expires?: unknown } }).openai
    if (typeof openai?.expires === "number" && Number.isFinite(openai.expires) && openai.expires <= nowMs) {
      return { ok: false, reason: "reauthenticate" }
    }
    if (typeof openai?.access !== "string" || openai.access.trim() === "") return errorResult()
    credentials = {
      access: openai.access,
      accountId: typeof openai.accountId === "string" ? openai.accountId : undefined,
    }
  } catch {
    return errorResult()
  }

  try {
    return parseUsageResponse(await fetchUsageResponse(options, USAGE_URL, usageHeaders(credentials)), nowMs)
  } catch (error) {
    if (error instanceof UsageRequestError && error.status === 401) {
      return { ok: false, reason: "reauthenticate" }
    }
    return errorResult()
  }
}

function goWindow(value: unknown, minutes: number): UsageWindow | null {
  if (!value || typeof value !== "object") return null
  const window = value as { percent?: unknown; resetsAt?: unknown }
  if (typeof window.percent !== "number" || !Number.isFinite(window.percent)) return null
  if (typeof window.resetsAt !== "string") return null
  const reset = new Date(window.resetsAt)
  if (Number.isNaN(reset.valueOf())) return null
  return {
    usedPercent: Math.round(Math.max(0, Math.min(100, window.percent))),
    resetAt: compactResetDate(reset),
    resetMs: reset.valueOf(),
    minutes,
  }
}

function parseGoUsageResponse(value: unknown): OpenCodeGoUsage {
  if (!value || typeof value !== "object") return goErrorResult()
  const usage = (value as { usage?: unknown }).usage
  if (!usage || typeof usage !== "object") return goErrorResult()
  const windows = usage as { weekly?: unknown; monthly?: unknown }
  const weekly = goWindow(windows.weekly, 7 * 24 * 60)
  if (!weekly) return goErrorResult()
  return {
    ok: true,
    weekly,
    monthly: goWindow(windows.monthly, 30 * 24 * 60),
  }
}

export async function probeOpenCodeGoUsage(options: UsageOptions = {}): Promise<OpenCodeGoUsage> {
  let key: string
  try {
    const raw = await readAuthContent(options)
    const credential = (JSON.parse(raw) as { "opencode-go"?: { key?: unknown } })["opencode-go"]
    if (typeof credential?.key !== "string" || credential.key.trim() === "") return goErrorResult()
    key = credential.key
  } catch {
    return goErrorResult()
  }

  try {
    return parseGoUsageResponse(
      await fetchUsageResponse(options, GO_USAGE_URL, { Authorization: `Bearer ${key}`, accept: "application/json" }),
    )
  } catch {
    return goErrorResult()
  }
}

function parseOpenRouterResponse(value: unknown): OpenRouterUsage {
  if (!value || typeof value !== "object") return openRouterErrorResult()
  const data = (value as { data?: { limit?: unknown; limit_remaining?: unknown } }).data
  if (!data || typeof data !== "object") return openRouterErrorResult()
  const { limit, limit_remaining } = data
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return openRouterErrorResult()
  if (typeof limit_remaining !== "number" || !Number.isFinite(limit_remaining)) return openRouterErrorResult()
  const remaining = Math.max(0, Math.min(limit, limit_remaining))
  const usedUsd = limit - remaining
  return {
    ok: true,
    usedPercent: Math.round((usedUsd / limit) * 100),
    remainingPercent: Math.round((remaining / limit) * 100),
    usedUsd,
    limitUsd: limit,
  }
}

export async function probeOpenRouterUsage(options: UsageOptions = {}): Promise<OpenRouterUsage> {
  let key: string | undefined
  if (typeof options.env?.OPENROUTER_API_KEY === "string" && options.env.OPENROUTER_API_KEY.trim() !== "") {
    key = options.env.OPENROUTER_API_KEY.trim()
  } else {
    try {
      const raw = await readAuthContent(options)
      const credential = (JSON.parse(raw) as { openrouter?: { key?: unknown } }).openrouter
      if (typeof credential?.key === "string" && credential.key.trim() !== "") key = credential.key.trim()
    } catch {
      key = undefined
    }
  }
  if (!key) return openRouterErrorResult()

  try {
    return parseOpenRouterResponse(
      await fetchUsageResponse(options, OPENROUTER_URL, { Authorization: `Bearer ${key}`, accept: "application/json" }),
    )
  } catch {
    return openRouterErrorResult()
  }
}

export function cursorDbPath({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
}: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): string {
  const database = path.join("User", "globalStorage", "state.vscdb")
  if (platform === "win32")
    return path.join(env.APPDATA ?? path.join(homeDir, "AppData", "Roaming"), "Cursor", database)
  if (platform === "darwin") return path.join(homeDir, "Library", "Application Support", "Cursor", database)
  return path.join(env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"), "Cursor", database)
}

async function readCursorAccessToken(dbPath: string): Promise<string | undefined> {
  try {
    const sqlite = await import("node:sqlite")
    const db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get() as
        | { value?: unknown }
        | undefined
      const value = row?.value
      if (typeof value === "string") return value
      if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8")
      return undefined
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export function cursorSessionCookie(value: string): string | undefined {
  const token = value.trim()
  if (!token) return undefined
  const decoded = token.includes("%3A%3A") ? token.replaceAll("%3A%3A", "::") : token
  const separator = decoded.indexOf("::")
  const jwt = separator === -1 ? decoded : decoded.slice(separator + 2)
  const parts = jwt.split(".")
  if (parts.length !== 3) return undefined
  const payload = parts[1]
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=")
  let sub: unknown
  try {
    sub = (JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { sub?: unknown }).sub
  } catch {
    return undefined
  }
  if (typeof sub !== "string" || sub.trim() === "") return undefined
  return `${encodeURIComponent(sub)}%3A%3A${jwt}`
}

function parseCursorUsageResponse(value: unknown, nowMs: number): CursorUsage {
  if (!value || typeof value !== "object") return { ok: false }
  const body = value as {
    billingCycleEnd?: unknown
    isUnlimited?: unknown
    individualUsage?: unknown
  }
  // billingCycleStart is the start of the current cycle, not its reset, so it never stands in for the reset.
  const resetAt = typeof body.billingCycleEnd === "string" ? new Date(body.billingCycleEnd) : undefined
  if (!resetAt || Number.isNaN(resetAt.valueOf())) return { ok: false }
  const plan =
    body.individualUsage && typeof body.individualUsage === "object"
      ? (body.individualUsage as { plan?: unknown }).plan
      : undefined
  if (!plan || typeof plan !== "object") return { ok: false }
  const window = plan as {
    used?: unknown
    limit?: unknown
    autoPercentUsed?: unknown
    apiPercentUsed?: unknown
    totalPercentUsed?: unknown
  }
  const clampPercent = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : null
  const usedPercent =
    body.isUnlimited === true
      ? null
      : (clampPercent(window.autoPercentUsed) ??
        (typeof window.used === "number" &&
        Number.isFinite(window.used) &&
        typeof window.limit === "number" &&
        Number.isFinite(window.limit) &&
        window.limit > 0
          ? Math.round(Math.max(0, Math.min(100, (window.used / window.limit) * 100)))
          : typeof window.totalPercentUsed === "number" && Number.isFinite(window.totalPercentUsed)
            ? Math.round(
                Math.max(
                  0,
                  Math.min(100, window.totalPercentUsed <= 1 ? window.totalPercentUsed * 100 : window.totalPercentUsed),
                ),
              )
            : null))
  if (usedPercent === null && body.isUnlimited !== true) return { ok: false }
  return {
    ok: true,
    monthly: {
      usedPercent,
      apiUsedPercent: clampPercent(window.apiPercentUsed),
      resetAt: compactResetDate(resetAt),
      resetMs: resetAt.valueOf(),
      minutes: null,
    },
  }
}

export async function probeCursorUsage(options: UsageOptions = {}): Promise<CursorUsage> {
  let token = await readCursorAccessToken(
    options.cursorDbPath ?? cursorDbPath({ env: options.env, homeDir: options.homeDir }),
  )
  if (!token) token = options.cursorSessionToken?.trim()
  if (!token) return { ok: false, reason: "need-token" }
  const cookie = cursorSessionCookie(token)
  if (!cookie) return { ok: false, reason: "need-token" }

  try {
    return parseCursorUsageResponse(
      await fetchUsageResponse(options, CURSOR_USAGE_URL, {
        Cookie: `WorkosCursorSessionToken=${cookie}`,
        accept: "application/json",
      }),
      options.nowMs ?? Date.now(),
    )
  } catch (error) {
    if (error instanceof UsageRequestError && (error.status === 401 || error.status === 403)) {
      return { ok: false, reason: "reauthenticate" }
    }
    return { ok: false }
  }
}
