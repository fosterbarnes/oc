import { expect, test } from "bun:test"
import { DEFAULT_THEMES } from "../src/theme"
import { dailyTheme, dayNumber, msUntilNextDay } from "../src/theme/daily"

const names = Object.keys(DEFAULT_THEMES)

test("dailyTheme is stable for a day and picks a built-in theme", () => {
  const day = dayNumber(new Date(2026, 9, 20, 9))
  expect(dailyTheme(day)).toBe(dailyTheme(day))
  expect(names).toContain(dailyTheme(day))
})

test("dailyTheme shows every built-in theme once per cycle", () => {
  const start = Math.floor(dayNumber(new Date(2026, 9, 20)) / names.length) * names.length
  const cycle = Array.from({ length: names.length }, (_, index) => dailyTheme(start + index))
  expect(new Set(cycle).size).toBe(names.length)
})

test("dayNumber follows the local calendar date", () => {
  expect(dayNumber(new Date(2026, 9, 20, 0, 1))).toBe(dayNumber(new Date(2026, 9, 20, 23, 59)))
  expect(dayNumber(new Date(2026, 9, 21, 0, 1))).toBe(dayNumber(new Date(2026, 9, 20, 23, 59)) + 1)
  expect(msUntilNextDay(new Date(2026, 9, 20, 23, 59))).toBe(60_000)
})
