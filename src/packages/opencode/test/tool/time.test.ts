import { expect, test } from "bun:test"
import { formatTime } from "@/tool/time"

test("formatTime prints local date, weekday, time, and UTC offset on one line", () => {
  const date = new Date(2026, 9, 8, 4, 7)
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? "-" : "+"
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0")
  expect(formatTime(date)).toBe(`2026-10-08 Thu 04:07 ${sign}${hours}:${minutes}`)
})
