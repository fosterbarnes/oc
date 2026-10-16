import { createSignal } from "solid-js"
import { applyTimeZone } from "@opencode-ai/core/util/timeZone"

export type Clock = "24h" | "12h"

const [_clock, _setClock] = createSignal<Clock>("24h")
const [_zone, _setZone] = createSignal("auto")

export function titlecase(str: string) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase())
}

// App mirrors config `time` here. The zone is applied process-wide, so local `Date` getters follow it too.
export function setTimeSettings(input: { clock?: Clock; timezone?: string } | undefined) {
  applyTimeZone(input?.timezone)
  _setZone(input?.timezone ?? "auto")
  _setClock(input?.clock ?? "24h")
}

export function clock() {
  return _clock()
}

export function zone() {
  return _zone()
}

// Every displayed date or time goes through here. Reading the zone signal re-runs reactive callers after a
// zone change; `toLocale*String` would keep the startup zone (see `applyTimeZone`).
export function format(input: number, options: Intl.DateTimeFormatOptions) {
  _zone()
  return new Intl.DateTimeFormat(undefined, { ...options, hourCycle: _clock() === "12h" ? "h12" : "h23" }).format(
    input,
  )
}

export function time(input: number): string {
  return format(input, { timeStyle: "short" })
}

export function shortDateTime(input: number): string {
  return `${format(input, { year: "2-digit", month: "numeric", day: "numeric" })} ${time(input)}`
}

export function datetime(input: number): string {
  return `${time(input)} · ${format(input, { year: "numeric", month: "numeric", day: "numeric" })}`
}

export function todayTimeOrDateTime(input: number): string {
  const date = new Date(input)
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()

  if (isToday) {
    return time(input)
  } else {
    return datetime(input)
  }
}

export function number(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M"
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K"
  }
  return num.toString()
}

export function duration(input: number) {
  if (input < 1000) {
    return `${input}ms`
  }
  if (input < 60000) {
    return `${(input / 1000).toFixed(1)}s`
  }
  if (input < 3600000) {
    const minutes = Math.floor(input / 60000)
    const seconds = Math.floor((input % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }
  if (input < 86400000) {
    const hours = Math.floor(input / 3600000)
    const minutes = Math.floor((input % 3600000) / 60000)
    return `${hours}h ${minutes}m`
  }
  const days = Math.floor(input / 86400000)
  const hours = Math.floor((input % 86400000) / 3600000)
  return `${days}d ${hours}h`
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len - 1) + "…"
}

export function truncateLeft(str: string, len: number): string {
  if (str.length <= len) return str
  return "…" + str.slice(-(len - 1))
}

export function truncateMiddle(str: string, maxLength: number = 35): string {
  if (str.length <= maxLength) return str

  const ellipsis = "…"
  const keepStart = Math.ceil((maxLength - ellipsis.length) / 2)
  const keepEnd = Math.floor((maxLength - ellipsis.length) / 2)

  return str.slice(0, keepStart) + ellipsis + str.slice(-keepEnd)
}

export function pluralize(count: number, singular: string, plural: string): string {
  const template = count === 1 ? singular : plural
  return template.replace("{}", count.toString())
}

export * as Locale from "./locale"
