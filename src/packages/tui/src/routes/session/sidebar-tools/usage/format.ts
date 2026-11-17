import type { UsageWindow } from "./snapshot"
import { Locale } from "../../../../util/locale"

export function formatUsagePercent(used: number | null | undefined, remaining = false, compact = false): string {
  if (used === null || used === undefined || !Number.isFinite(used)) return "unavailable"
  const value = remaining ? 100 - used : used
  return `${compact ? Math.round(value) : Number(value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0))}%`
}

/** Sidebar tag for a window of this length: `5h`, `1d`, `wk`, `mo`, `Nd`; `fallback` when the length is unknown. */
export function windowTag(minutes: number | null | undefined, fallback: string): string {
  if (!minutes || minutes <= 0) return fallback
  const days = minutes / 1440
  if (days < 1) return `${Math.round(minutes / 60)}h`
  if (days === 7) return "wk"
  return days >= 28 && days <= 31 ? "mo" : `${Math.round(days)}d`
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Sidebar reset: the clock today (`7:40PM`), weekday and clock within 6 days (`Wed 3AM`), else `M/D`. */
export function shortResetDate(ms: number, nowMs: number): string {
  const date = new Date(ms)
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const clock =
    Locale.clock() === "12h"
      ? `${hours % 12 || 12}${minutes === "00" ? "" : `:${minutes}`}${hours >= 12 ? "PM" : "AM"}`
      : `${String(hours).padStart(2, "0")}:${minutes}`
  // Rounded: a daylight-saving change makes one day 23 or 25 hours long.
  const days = Math.round((new Date(ms).setHours(0, 0, 0, 0) - new Date(nowMs).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days <= 0) return clock
  return days < 7 ? `${WEEKDAYS[date.getDay()]} ${clock}` : `${date.getMonth() + 1}/${date.getDate()}`
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

/** Full reset date in local time with the time left, e.g. `Sunday, October 11, 2026 at 2:58 AM (in 1 day, 4 hours)`. */
export function fullResetDate(ms: number, nowMs: number): string {
  const date = Locale.format(ms, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
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
  const clock =
    Locale.clock() === "12h"
      ? `${hours % 12 || 12}:${minutes}${hours >= 12 ? "PM" : "AM"}`
      : `${String(hours).padStart(2, "0")}:${minutes}`
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)} ~${clock}`
}
