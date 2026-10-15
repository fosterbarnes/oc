import { expect, test } from "bun:test"
import {
  nextRenewal,
  normalizeUsageSubscriptions,
  parseUsageDate,
  usageCalendarDay,
  usageCalendarEvents,
  usageCalendarStrip,
  type ClaudeCodeUsage,
  type UsageWindow,
} from "../../../src/routes/session/sidebar-tools/usage"

// Thursday, October 15, 2026, noon local time.
const NOW = new Date(2026, 9, 15, 12, 0).valueOf()
const HOUR = 3_600_000

const window = (resetMs: number | null, usedPercent: number | null = 40, minutes: number | null = null): UsageWindow => ({
  usedPercent,
  resetAt: null,
  resetMs,
  minutes,
  fetchedAt: NOW,
})

const claudeAccount = (fiveHour: UsageWindow, weekly: UsageWindow): ClaudeCodeUsage => ({
  ok: true,
  fetchedAt: NOW,
  source: "live",
  fiveHour,
  weekly,
})

const empty = { openai: { ok: false }, cursor: { ok: false }, go: { ok: false }, claude: { ok: false } } as const

test("calendar lists every pooled account's resets and provider resets, soonest first", () => {
  const events = usageCalendarEvents({
    ...empty,
    providers: ["openai", "cursor", "claude-code", "openrouter"],
    openai: { ok: true, primary: window(NOW + 3 * HOUR, 20, 300), secondary: window(NOW + 50 * HOUR, 60, 10_080),
      fetchedAt: NOW },
    cursor: { ok: true, fetchedAt: NOW, monthly: { ...window(NOW + 20 * 24 * HOUR), apiUsedPercent: null } },
    claude: {
      ...(claudeAccount(window(NOW + HOUR), window(NOW + 30 * HOUR)) as Extract<ClaudeCodeUsage, { ok: true }>),
      accounts: [
        { name: "claude", usage: claudeAccount(window(NOW + HOUR, 71), window(NOW + 30 * HOUR, 88)) },
        // An idle 5-hour window has no reset and stays off the calendar.
        { name: "claude2", usage: claudeAccount(window(null, 0), window(NOW + 40 * HOUR, 10)) },
        { name: "claude3", usage: { ok: false, reason: "signed-out" } as const },
      ],
    },
    subscriptions: [],
  }, NOW)
  expect(events.map((event) => [event.title, event.atMs - NOW, event.usedPercent])).toEqual([
    ["Claude (claude) 5-hour reset", HOUR, 71],
    ["Codex 5-hour reset", 3 * HOUR, 20],
    ["Claude (claude) weekly reset", 30 * HOUR, 88],
    ["Claude (claude2) weekly reset", 40 * HOUR, 10],
    ["Codex weekly reset", 50 * HOUR, 60],
    ["Cursor billing cycle renews", 20 * 24 * HOUR, 40],
  ])
})

test("calendar drops passed resets and disabled providers", () => {
  const events = usageCalendarEvents({
    ...empty,
    providers: ["claude-code"],
    openai: { ok: true, primary: window(NOW + HOUR), secondary: window(NOW + 2 * HOUR) },
    claude: claudeAccount(window(NOW - HOUR, 90), window(NOW + 5 * HOUR, 30)),
    subscriptions: [],
  }, NOW)
  expect(events.map((event) => event.title)).toEqual(["Claude weekly reset"])
})

test("renewal day rolls to next month and clamps to short months", () => {
  expect(nextRenewal(15, NOW)).toBe(new Date(2026, 9, 15).valueOf())
  expect(nextRenewal(14, NOW)).toBe(new Date(2026, 10, 14).valueOf())
  expect(nextRenewal(31, new Date(2026, 1, 10).valueOf())).toBe(new Date(2026, 1, 28).valueOf())
  expect(nextRenewal(3, new Date(2026, 11, 20).valueOf())).toBe(new Date(2027, 0, 3).valueOf())
})

test("ended subscriptions stay listed for a week after their end day", () => {
  const titles = (endsOn: string) =>
    usageCalendarEvents({ ...empty, providers: [], subscriptions: [{ label: "Max", endsOn }] }, NOW)
      .map((event) => event.title)
  expect(titles("2026-10-15")).toEqual(["Max ends"])
  expect(titles("2026-10-14")).toEqual(["Max ended"])
  expect(titles("2026-10-08")).toEqual(["Max ended"])
  expect(titles("2026-10-07")).toEqual([])
})

test("agenda days and the 7-day strip count events per local day", () => {
  expect(usageCalendarDay(new Date(2026, 9, 14).valueOf(), NOW)).toBe("Ended")
  expect(usageCalendarDay(NOW + HOUR, NOW)).toBe("Today")
  expect(usageCalendarDay(new Date(2026, 9, 16, 1).valueOf(), NOW)).toBe("Tomorrow")
  expect(usageCalendarDay(new Date(2026, 9, 17, 9).valueOf(), NOW)).toBe("Sat, Oct 17")
  expect(usageCalendarDay(new Date(2027, 0, 2).valueOf(), NOW)).toBe("Sat, Jan 2 2027")
  const events = usageCalendarEvents({
    ...empty,
    providers: [],
    subscriptions: [{ label: "A", renewDay: 15 }, { label: "B", renewDay: 17 }, { label: "C", renewDay: 17 }],
  }, NOW)
  expect(usageCalendarStrip(events, NOW).map((day) => `${day.label}=${day.count}`)).toEqual([
    "Thu 15=1", "Fri 16=0", "Sat 17=2", "Sun 18=0", "Mon 19=0", "Tue 20=0", "Wed 21=0",
  ])
})

test("subscription settings keep only valid entries", () => {
  expect(parseUsageDate("2026-02-30")).toBeUndefined()
  expect(parseUsageDate("2026-11-12")).toBe(new Date(2026, 10, 12).valueOf())
  expect(normalizeUsageSubscriptions([
    { label: " Max ", renewDay: 12 },
    { label: "Pro", endsOn: "2026-11-12" },
    { label: "", renewDay: 1 },
    { label: "Bad day", renewDay: 32 },
    { label: "Bad date", endsOn: "11/12/2026" },
    "nope",
  ])).toEqual([{ label: "Max", renewDay: 12 }, { label: "Pro", endsOn: "2026-11-12" }])
  expect(normalizeUsageSubscriptions(undefined)).toEqual([])
})
