import { expect, test } from "bun:test"
import {
  createScheduleClock,
  editScheduleClock,
  nextScheduleOccurrence,
  pasteScheduleClock,
  selectScheduleSection,
  type ScheduleClock,
} from "../../src/component/scheduleClock"

const now = new Date(2026, 9, 15, 14, 0, 30, 500).getTime()
const type = (clock: ScheduleClock, digits: string) =>
  [...digits].reduce((value, digit) => editScheduleClock(value, digit), clock)

test("starts at the next minute with zero seconds, including across midnight", () => {
  expect(createScheduleClock(now, false).fields).toEqual(["14", "01", "00"])
  expect(createScheduleClock(new Date(2026, 9, 15, 23, 59, 50).getTime(), true)).toMatchObject({
    fields: ["12", "00", "00"], pm: false, section: 0,
  })
})

test("044530 fills consecutive sections and two digits advance automatically", () => {
  const clock = createScheduleClock(now, false)
  expect(type(clock, "04")).toMatchObject({ fields: ["04", "01", "00"], section: 1, pending: "" })
  expect(type(clock, "044530")).toMatchObject({ fields: ["04", "45", "30"], section: 2 })
  expect(type(createScheduleClock(now, true), "044530")).toMatchObject({
    fields: ["04", "45", "30"], section: 3, pm: true,
  })
})

test("selection wraps and direct typing replaces the selected segment", () => {
  const clock = type(createScheduleClock(now, false), "044530")
  expect(editScheduleClock(clock, "right").section).toBe(0)
  expect(editScheduleClock(createScheduleClock(now, false), "left").section).toBe(2)
  expect(editScheduleClock(createScheduleClock(now, true), "left").section).toBe(3)
  expect(type(selectScheduleSection(clock, 1), "12").fields).toEqual(["04", "12", "30"])
  const partial = type(selectScheduleSection(clock, 0), "1")
  expect(type(editScheduleClock(partial, "right"), "20").fields).toEqual(["01", "20", "30"])
})

test("hour arrows wrap clock time and cross AM/PM at noon and midnight", () => {
  const clock = type(createScheduleClock(now, false), "234530")
  expect(editScheduleClock(selectScheduleSection(clock, 0), "up").fields).toEqual(["00", "45", "30"])
  const zeroHour = selectScheduleSection(type(createScheduleClock(now, false), "004530"), 0)
  expect(editScheduleClock(zeroHour, "down").fields).toEqual(["23", "45", "30"])
  const midnight = pasteScheduleClock(createScheduleClock(now, true), "12:00:00 AM")!
  expect(editScheduleClock(midnight, "down")).toMatchObject({ fields: ["11", "00", "00"], pm: true })
  const morning = pasteScheduleClock(midnight, "11:00:00 AM")!
  expect(editScheduleClock(morning, "up")).toMatchObject({ fields: ["12", "00", "00"], pm: true })
  expect(editScheduleClock(pasteScheduleClock(midnight, "11:00:00 PM")!, "up")).toMatchObject({
    fields: ["12", "00", "00"], pm: false,
  })
})

test("minute and second arrows use ten, Shift uses one, carrying and borrowing across fields", () => {
  const clock = pasteScheduleClock(createScheduleClock(now, false), "23:59:55")!
  expect(editScheduleClock(selectScheduleSection(clock, 2), "up").fields).toEqual(["00", "00", "05"])
  expect(editScheduleClock(selectScheduleSection(clock, 2), "up", true).fields).toEqual(["23", "59", "56"])
  expect(editScheduleClock(selectScheduleSection(clock, 1), "up").fields).toEqual(["00", "09", "55"])
  expect(editScheduleClock(selectScheduleSection(clock, 1), "up", true).fields).toEqual(["00", "00", "55"])
  const zero = pasteScheduleClock(clock, "00:00:00")!
  expect(editScheduleClock(selectScheduleSection(zero, 1), "down").fields).toEqual(["23", "50", "00"])
  expect(editScheduleClock(selectScheduleSection(zero, 2), "down", true).fields).toEqual(["23", "59", "59"])
  expect(editScheduleClock(selectScheduleSection(zero, 0), "down", true).fields).toEqual(["23", "00", "00"])
})

test("meridiem arrows and space toggle, A/P select explicitly, noon and midnight schedule correctly", () => {
  const clock = selectScheduleSection(pasteScheduleClock(createScheduleClock(now, true), "12:00:00 AM")!, 3)
  expect(nextScheduleOccurrence(clock, now)).toBe(new Date(2026, 9, 16, 0).getTime())
  for (const key of ["up", "down", "space", "p"]) {
    const noon = editScheduleClock(clock, key)
    expect(noon.pm).toBe(true)
    expect(nextScheduleOccurrence(noon, now)).toBe(new Date(2026, 9, 16, 12).getTime())
    expect(editScheduleClock(noon, "a").pm).toBe(false)
  }
  expect(editScheduleClock(clock, "4")).toEqual(clock)
})

test("invalid typed values remain visible and cannot schedule; replacing the field repairs it", () => {
  for (const digits of ["240000", "126000", "120060", "999999"]) {
    const clock = type(createScheduleClock(now, false), digits)
    expect(nextScheduleOccurrence(clock, now)).toBeUndefined()
  }
  for (const digits of ["000000", "130000"]) {
    expect(nextScheduleOccurrence(type(createScheduleClock(now, true), digits), now)).toBeUndefined()
  }
  const invalid = type(createScheduleClock(now, false), "246030")
  expect(invalid.fields).toEqual(["24", "60", "30"])
  const hours = type(selectScheduleSection(invalid, 0), "04")
  const repaired = type(selectScheduleSection(hours, 1), "45")
  expect(nextScheduleOccurrence(repaired, now)).toBe(new Date(2026, 9, 16, 4, 45, 30).getTime())
})

test("paste accepts a full clock atomically and rejects malformed or out-of-range times", () => {
  const clock = createScheduleClock(now, false)
  expect(pasteScheduleClock(clock, "044530")?.fields).toEqual(["04", "45", "30"])
  expect(pasteScheduleClock(clock, " 04:45:30 ")?.fields).toEqual(["04", "45", "30"])
  for (const input of [
    "", "24:00:00", "12:60:00", "12:00:60", "4:45:30", "04:45", "04:4530", "0445:30",
    "+30m", "0445300", "04:45:30 PM",
  ]) {
    expect(pasteScheduleClock(clock, input)).toBeUndefined()
  }
  expect(pasteScheduleClock(createScheduleClock(now, true), "04:45:30 am")?.pm).toBe(false)
  expect(pasteScheduleClock(createScheduleClock(now, true), "00:45:30 AM")).toBeUndefined()
})

test("next occurrence includes seconds and schedules equal or past times tomorrow", () => {
  const clock = createScheduleClock(now, false)
  expect(nextScheduleOccurrence(pasteScheduleClock(clock, "14:00:31")!, now))
    .toBe(new Date(2026, 9, 15, 14, 0, 31).getTime())
  expect(nextScheduleOccurrence(pasteScheduleClock(clock, "14:00:30")!, now))
    .toBe(new Date(2026, 9, 16, 14, 0, 30).getTime())
  expect(nextScheduleOccurrence(pasteScheduleClock(clock, "14:00:30")!, now - 500))
    .toBe(new Date(2026, 9, 16, 14, 0, 30).getTime())
  const last = new Date(2026, 11, 31, 23, 59, 59).getTime()
  expect(nextScheduleOccurrence(pasteScheduleClock(clock, "00:00:01")!, last))
    .toBe(new Date(2027, 0, 1, 0, 0, 1).getTime())
})
