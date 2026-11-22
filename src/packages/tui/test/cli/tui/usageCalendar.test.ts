import { expect, test } from "bun:test"
import {
  nextRenewal,
  normalizeUsageSubscriptions,
  parseUsageDate,
} from "../../../src/routes/session/sidebar-tools/usage/calendar"

// Thursday, October 15, 2026, noon local time.
const NOW = new Date(2026, 9, 15, 12, 0).valueOf()

test("renewal day rolls to next month and clamps to short months", () => {
  expect(nextRenewal(15, NOW)).toBe(new Date(2026, 9, 15).valueOf())
  expect(nextRenewal(14, NOW)).toBe(new Date(2026, 10, 14).valueOf())
  expect(nextRenewal(31, new Date(2026, 1, 10).valueOf())).toBe(new Date(2026, 1, 28).valueOf())
  expect(nextRenewal(3, new Date(2026, 11, 20).valueOf())).toBe(new Date(2027, 0, 3).valueOf())
})

test("subscription settings keep only valid entries", () => {
  expect(parseUsageDate("2026-02-30")).toBeUndefined()
  expect(parseUsageDate("2026-11-12")).toBe(new Date(2026, 10, 12).valueOf())
  expect(
    normalizeUsageSubscriptions([
      { label: " Max ", renewDay: 12 },
      { label: "Pro", endsOn: "2026-11-12" },
      { label: "", renewDay: 1 },
      { label: "Bad day", renewDay: 32 },
      { label: "Bad date", endsOn: "11/12/2026" },
      "nope",
    ]),
  ).toEqual([
    { label: "Max", renewDay: 12 },
    { label: "Pro", endsOn: "2026-11-12" },
  ])
  expect(normalizeUsageSubscriptions(undefined)).toEqual([])
})
