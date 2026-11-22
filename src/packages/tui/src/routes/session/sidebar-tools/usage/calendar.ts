import { USAGE_PLAN_PROVIDERS, type UsagePlanProvider } from "./providers"

/**
 * A manual plan date from sidebar.json `usageSubscriptions`: renews monthly on `renewDay`, or ends on `endsOn`
 * (`YYYY-MM-DD`). `provider` (and `account`, a Claude config dir id) makes it that provider's plan line override.
 */
export type UsageSubscription = { label: string; provider?: UsagePlanProvider; account?: string } & (
  | { renewDay: number }
  | { endsOn: string }
)

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

export function startOfDay(ms: number): number {
  const date = new Date(ms)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf()
}
