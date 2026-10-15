import { isRecord } from "@/util/record"

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export type WarmupSchedule = { mode: "daily"; times: string[] } | { mode: "weekly"; days: Record<DayKey, string[]> }
export interface DueOccurrence {
  key: string
  at: number
  time: string
}

export const MAX_TIMES_PER_DAY = 4
export const CLAIM_RETENTION_DAYS = 8

const TIME_RE = /^(\d{2}):(\d{2})$/
const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

export function parseTimeList(input: string): { times: string[] } | { error: string } {
  const seen = new Set<string>()
  const times: string[] = []
  for (const token of input.split(",")) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const match = TIME_RE.exec(trimmed)
    if (!match) return { error: `invalid time ${JSON.stringify(trimmed)}: expected HH:mm` }
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour > 23 || minute > 59) return { error: `invalid time ${JSON.stringify(trimmed)}: expected HH:mm` }
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    times.push(trimmed)
  }
  times.sort()
  if (times.length > MAX_TIMES_PER_DAY) return { error: `too many times: at most ${MAX_TIMES_PER_DAY} per day` }
  return { times }
}

function parseDayValue(value: unknown, what: string): { times: string[] } | { error: string } {
  if (typeof value === "string") return parseTimeList(value)
  if (Array.isArray(value)) {
    // At the trust boundary every array entry is its own exact HH:mm value:
    // joined strings like ["07:00,12:00"] or [""] are rejected, not parsed.
    const seen = new Set<string>()
    const times: string[] = []
    for (const entry of value) {
      if (typeof entry !== "string") return { error: `invalid ${what}: expected HH:mm strings` }
      const trimmed = entry.trim()
      const match = TIME_RE.exec(trimmed)
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
        return { error: `invalid time ${JSON.stringify(entry)}: expected HH:mm` }
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      times.push(trimmed)
    }
    times.sort()
    if (times.length > MAX_TIMES_PER_DAY) return { error: `too many times: at most ${MAX_TIMES_PER_DAY} per day` }
    return { times }
  }
  return { error: `invalid ${what}: expected a comma-separated HH:mm list` }
}

export function normalizeSchedule(input: unknown): { schedule: WarmupSchedule } | { error: string } {
  if (!isRecord(input)) return { error: "invalid schedule: expected an object" }
  if (input.mode === "daily") {
    const parsed = parseDayValue(input.times, "times")
    if ("error" in parsed) return parsed
    return { schedule: { mode: "daily", times: parsed.times } }
  }
  if (input.mode === "weekly") {
    if (!isRecord(input.days)) return { error: "invalid schedule: weekly mode needs a days object" }
    const days = {} as Record<DayKey, string[]>
    for (const day of DAY_KEYS) {
      const parsed = parseDayValue(input.days[day], day)
      if ("error" in parsed) return { error: `${day}: ${parsed.error}` }
      days[day] = parsed.times
    }
    return { schedule: { mode: "weekly", days } }
  }
  return { error: 'invalid schedule: mode must be "daily" or "weekly"' }
}

export function isScheduleEmpty(schedule: WarmupSchedule): boolean {
  if (schedule.mode === "daily") return schedule.times.length === 0
  return DAY_KEYS.every((day) => schedule.days[day].length === 0)
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function localDateStr(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function weekdayKey(ms: number): DayKey {
  return WEEKDAY_NAMES[new Date(ms).getDay()]!
}

export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local"
}

export function serverUtcOffset(): string {
  const minutes = -new Date().getTimezoneOffset()
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// A spring-forward gap rolls forward when constructed, so the round-trip
// check skips nonexistent local times. A fall-back repeat maps to one
// local date + HH:mm key, so it fires once per day.
export function occurrenceMs(year: number, month: number, day: number, time: string): number | undefined {
  const match = TIME_RE.exec(time)
  if (!match) return undefined
  const date = new Date(year, month, day, Number(match[1]), Number(match[2]), 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== Number(match[1]) ||
    date.getMinutes() !== Number(match[2])
  )
    return undefined
  return date.getTime()
}

function timesForDate(schedule: WarmupSchedule, ms: number): string[] {
  if (schedule.mode === "daily") return schedule.times
  return schedule.days[weekdayKey(ms)]
}

export function occurrencesInWindow(
  schedule: WarmupSchedule,
  fromExclusiveMs: number,
  toInclusiveMs: number,
): DueOccurrence[] {
  if (toInclusiveMs <= fromExclusiveMs) return []
  const out: DueOccurrence[] = []
  const seen = new Set<string>()
  // Walk local calendar days by date parts, never by fixed milliseconds: a
  // +24h step across a fall-back boundary can land inside the repeated hour
  // and revisit (or skip) a date. Noon always exists exactly once per date,
  // so it is the day representative; occurrenceMs round-trips each HH:mm.
  const from = new Date(fromExclusiveMs)
  const lastStr = localDateStr(toInclusiveMs)
  let year = from.getFullYear()
  let month = from.getMonth()
  let day = from.getDate()
  for (let i = 0; i < 16; i++) {
    const dayMs = new Date(year, month, day, 12, 0, 0, 0).getTime()
    for (const time of timesForDate(schedule, dayMs)) {
      const at = occurrenceMs(year, month, day, time)
      if (at === undefined || at <= fromExclusiveMs || at > toInclusiveMs) continue
      const key = `${localDateStr(at)}|${time}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, at, time })
    }
    if (`${year}-${pad(month + 1)}-${pad(day)}` === lastStr) break
    const next = new Date(year, month, day + 1, 12, 0, 0, 0)
    year = next.getFullYear()
    month = next.getMonth()
    day = next.getDate()
  }
  return out.sort((a, b) => a.at - b.at)
}

export function nextOccurrence(schedule: WarmupSchedule, enabled: boolean, nowMs: number): number | undefined {
  if (!enabled || isScheduleEmpty(schedule)) return undefined
  const horizon = nowMs + CLAIM_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const upcoming = occurrencesInWindow(schedule, nowMs, horizon)
  return upcoming.length ? upcoming[0]!.at : undefined
}
