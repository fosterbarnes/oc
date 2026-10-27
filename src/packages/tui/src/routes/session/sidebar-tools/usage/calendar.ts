import { projectClaudeUsage, type ClaudeCodeUsage } from "./claude"
import type { CursorUsage } from "./cursor"
import { orderUsageWindows, windowName } from "./format"
import { Locale } from "../../../../util/locale"
import type { OpenAIUsage, OpenCodeGoUsage } from "./probes"
import { USAGE_PLAN_PROVIDERS, type UsagePlanProvider, type UsageProviderId } from "./providers"
import { usageWindowStale, type UsageSnapshot, type UsageWindow } from "./snapshot"

const DAY_MS = 86_400_000

/**
 * A subscription date no usage API reports: renews monthly on `renewDay`, or ends on `endsOn` (`YYYY-MM-DD`).
 * `provider` (and `account`, a Claude config dir id) makes it the override for that provider's sidebar plan line.
 */
export type UsageSubscription = { label: string; provider?: UsagePlanProvider; account?: string } & (
  | { renewDay: number }
  | { endsOn: string }
)

export type UsageCalendarEvent = {
  atMs: number
  title: string
  usedPercent: number | null
  stale: boolean
  /** Subscription dates carry a day, not a clock time. */
  allDay: boolean
}

/** Local midnight of a `YYYY-MM-DD` date; undefined when the text is not a real calendar date. */
export function parseUsageDate(text: string): number | undefined {
  const match = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return date.getDate() === Number(match[3]) && date.getMonth() === Number(match[2]) - 1 ? date.valueOf() : undefined
}

export function normalizeUsageSubscriptions(value: unknown): UsageSubscription[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): UsageSubscription[] => {
    if (!item || typeof item !== "object") return []
    const entry = item as {
      label?: unknown
      renewDay?: unknown
      endsOn?: unknown
      provider?: unknown
      account?: unknown
    }
    if (typeof entry.label !== "string" || !entry.label.trim()) return []
    const label = entry.label.trim()
    const provider = USAGE_PLAN_PROVIDERS.find((id) => id === entry.provider)
    const tag = {
      ...(provider ? { provider } : {}),
      ...(provider && typeof entry.account === "string" && entry.account ? { account: entry.account } : {}),
    }
    if (
      typeof entry.renewDay === "number" &&
      Number.isInteger(entry.renewDay) &&
      entry.renewDay >= 1 &&
      entry.renewDay <= 31
    )
      return [{ label, ...tag, renewDay: entry.renewDay }]
    if (typeof entry.endsOn === "string" && parseUsageDate(entry.endsOn) !== undefined)
      return [{ label, ...tag, endsOn: entry.endsOn.trim() }]
    return []
  })
}

/** Local midnight of the next renewal on `day`, today included; short months renew on their last day. */
export function nextRenewal(day: number, nowMs: number): number {
  const now = new Date(nowMs)
  // Month 12 rolls into January of the next year; day 0 of the following month is this month's last day.
  const on = (month: number) =>
    new Date(now.getFullYear(), month, Math.min(day, new Date(now.getFullYear(), month + 1, 0).getDate())).valueOf()
  const current = on(now.getMonth())
  return current >= startOfDay(nowMs) ? current : on(now.getMonth() + 1)
}

/**
 * Upcoming window resets of the enabled providers plus subscription dates, soonest first. Only each window's
 * next known reset is listed; idle windows without a reset and future repeats are not guessed.
 */
export function usageCalendarEvents(
  input: {
    providers: UsageProviderId[]
    openai: UsageSnapshot<OpenAIUsage>
    cursor: UsageSnapshot<CursorUsage>
    go: UsageSnapshot<OpenCodeGoUsage>
    claude: UsageSnapshot<ClaudeCodeUsage>
    subscriptions: UsageSubscription[]
    /** Automatic plan renewals (`usagePlanEvents`); manual ones already come from `subscriptions`. */
    planEvents?: UsageCalendarEvent[]
  },
  nowMs: number,
): UsageCalendarEvent[] {
  const reset = (title: string, window: UsageWindow | null, snapshot: UsageSnapshot<{ ok: boolean }>) =>
    window && window.resetMs !== null && window.resetMs > nowMs
      ? [
          {
            atMs: window.resetMs,
            title,
            usedPercent: window.usedPercent,
            stale: usageWindowStale(window, snapshot, nowMs),
            allDay: false,
          },
        ]
      : []
  const providerEvents = (id: UsageProviderId): UsageCalendarEvent[] => {
    if (id === "openai") {
      const snapshot = input.openai
      if (!snapshot.ok) return []
      return orderUsageWindows([snapshot.primary, snapshot.secondary]).flatMap((window) =>
        reset(`Codex ${windowName(window.minutes).toLowerCase() || "usage"} reset`, window, snapshot),
      )
    }
    if (id === "cursor") {
      const snapshot = input.cursor
      return snapshot.ok ? reset("Cursor billing cycle renews", snapshot.monthly, snapshot) : []
    }
    if (id === "opencode-go") {
      const snapshot = input.go
      if (!snapshot.ok) return []
      return [snapshot.weekly, snapshot.monthly].flatMap((window) =>
        window ? reset(`OpenCode Go ${windowName(window.minutes).toLowerCase()} reset`, window, snapshot) : [],
      )
    }
    if (id !== "claude-code") return []
    const snapshot = input.claude.ok ? projectClaudeUsage(input.claude, nowMs) : input.claude
    if (!snapshot.ok) return []
    const accounts = snapshot.accounts
      ? snapshot.accounts.flatMap((account) =>
          account.usage.ok ? [{ title: `Claude (${account.name})`, usage: account.usage }] : [],
        )
      : [{ title: "Claude", usage: snapshot }]
    return accounts.flatMap((account) => [
      ...reset(`${account.title} 5-hour reset`, account.usage.fiveHour, account.usage),
      ...reset(`${account.title} weekly reset`, account.usage.weekly, account.usage),
    ])
  }
  const subscriptionEvents = (subscription: UsageSubscription): UsageCalendarEvent[] => {
    const event = { usedPercent: null, stale: false, allDay: true }
    if ("renewDay" in subscription)
      return [{ ...event, atMs: nextRenewal(subscription.renewDay, nowMs), title: `${subscription.label} renews` }]
    const atMs = parseUsageDate(subscription.endsOn) as number
    // An ended subscription stays listed for a week so the lapse is noticed.
    if (atMs + 8 * DAY_MS <= nowMs) return []
    return [{ ...event, atMs, title: `${subscription.label} ${atMs + DAY_MS <= nowMs ? "ended" : "ends"}` }]
  }
  return [
    ...input.providers.flatMap(providerEvents),
    ...input.subscriptions.flatMap(subscriptionEvents),
    ...(input.planEvents ?? []),
  ].sort((first, second) => first.atMs - second.atMs || first.title.localeCompare(second.title))
}

/** Agenda group for an event: `Ended`, `Today`, `Tomorrow`, or a short date such as `Fri, Oct 17`. */
export function usageCalendarDay(atMs: number, nowMs: number): string {
  const today = startOfDay(nowMs)
  if (atMs < today) return "Ended"
  // Rounded: a daylight-saving change makes one day 23 or 25 hours long.
  const days = Math.round((startOfDay(atMs) - today) / DAY_MS)
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  const date = new Date(atMs)
  const year = date.getFullYear() === new Date(nowMs).getFullYear() ? "" : ` ${date.getFullYear()}`
  return `${Locale.format(atMs, { weekday: "short", month: "short", day: "numeric" })}${year}`
}

/** Event count for today and the six days after it, for the strip above the agenda. */
export function usageCalendarStrip(events: UsageCalendarEvent[], nowMs: number) {
  const today = startOfDay(nowMs)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(date.getDate() + index)
    const start = date.valueOf()
    return {
      label: `${Locale.format(date.valueOf(), { weekday: "short" })} ${date.getDate()}`,
      count: events.filter((event) => startOfDay(event.atMs) === start).length,
    }
  })
}

export function startOfDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf()
}
