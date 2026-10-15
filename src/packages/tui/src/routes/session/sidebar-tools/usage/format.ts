import type { ClaudeCodeUsage } from "./claude"
import { usageWindowStale, type UsageWindow } from "./snapshot"

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
  /** Canonical account identity; old callers without account IDs can still supply the name. */
  active?: string,
  nowMs?: number,
) {
  const accounts = usage.accounts?.flatMap((account) =>
    account.usage.ok ? [{ id: account.id, name: account.name, usage: account.usage }] : [],
  )
  const known = accounts?.length ? accounts : [{ id: usage.accountID, name: undefined, usage }]
  const cell = (window: UsageWindow, suffix: string, snapshot: ClaudeCodeUsage) => {
    const idle = suffix === "h" && window.usedPercent === 0 ? "-" : ""
    // Unknown percent -> null ("reset unavailable"); hourly 0% with no reset ->
    // shows `-` (no 5-hour window running yet); other known percents without a reset leave a blank slot.
    const resetAt = window.resetAt ?? (window.usedPercent === null ? null : idle)
    return { usedPercent: window.usedPercent, resetAt,
      suffix: suffix + (nowMs !== undefined && usageWindowStale(window, snapshot, nowMs) ? "*" : "") }
  }
  return known.flatMap(({ id, name, usage: account }, index) => {
    const base = index === 0 ? "Claude" : `Claude${index + 1}`
    const label = active && (id ?? name) === active ? `${base} «` : `${base}:`
    return formatUsageRows({
      label,
      remaining,
      width,
      columns,
      clocks,
      days,
      windows: [cell(account.fiveHour, "h", account), cell(account.weekly, "w", account)],
    }).map((row, rowIndex) => ({ ...row, label, snapshot: account, spaced: index > 0 && rowIndex === 0 }))
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

export function compactResetDate(date: Date): string {
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)} ~${hours % 12 || 12}:${minutes}${hours >= 12 ? "PM" : "AM"}`
}
