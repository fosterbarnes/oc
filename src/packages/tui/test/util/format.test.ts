import { describe, expect, test } from "bun:test"
import { formatDuration, formatResumeAt } from "../../src/util/format"

describe("util.format", () => {
  describe("formatDuration", () => {
    test("returns empty string for zero or negative values", () => {
      expect(formatDuration(0)).toBe("")
      expect(formatDuration(-1)).toBe("")
      expect(formatDuration(-100)).toBe("")
    })

    test("formats seconds under a minute", () => {
      expect(formatDuration(1)).toBe("1s")
      expect(formatDuration(30)).toBe("30s")
      expect(formatDuration(59)).toBe("59s")
    })

    test("formats minutes under an hour", () => {
      expect(formatDuration(60)).toBe("1m")
      expect(formatDuration(61)).toBe("1m 1s")
      expect(formatDuration(90)).toBe("1m 30s")
      expect(formatDuration(120)).toBe("2m")
      expect(formatDuration(330)).toBe("5m 30s")
      expect(formatDuration(3599)).toBe("59m 59s")
    })

    test("formats hours under a day", () => {
      expect(formatDuration(3600)).toBe("1h")
      expect(formatDuration(3660)).toBe("1h 1m")
      expect(formatDuration(7200)).toBe("2h")
      expect(formatDuration(8100)).toBe("2h 15m")
      expect(formatDuration(86399)).toBe("23h 59m")
    })

    test("formats days under a week", () => {
      expect(formatDuration(86400)).toBe("~1 day")
      expect(formatDuration(172800)).toBe("~2 days")
      expect(formatDuration(259200)).toBe("~3 days")
      expect(formatDuration(604799)).toBe("~6 days")
    })

    test("formats weeks", () => {
      expect(formatDuration(604800)).toBe("~1 week")
      expect(formatDuration(1209600)).toBe("~2 weeks")
      expect(formatDuration(1609200)).toBe("~2 weeks")
    })

    test("handles boundary values correctly", () => {
      expect(formatDuration(59)).toBe("59s")
      expect(formatDuration(60)).toBe("1m")
      expect(formatDuration(3599)).toBe("59m 59s")
      expect(formatDuration(3600)).toBe("1h")
      expect(formatDuration(86399)).toBe("23h 59m")
      expect(formatDuration(86400)).toBe("~1 day")
      expect(formatDuration(604799)).toBe("~6 days")
      expect(formatDuration(604800)).toBe("~1 week")
    })
  })

  describe("formatResumeAt", () => {
    test("formats the local clock time with zero-padded hours and minutes", () => {
      expect(formatResumeAt(new Date(2026, 9, 13, 9, 5).getTime())).toBe("resumes at 09:05")
      expect(formatResumeAt(new Date(2026, 9, 13, 0, 0).getTime())).toBe("resumes at 00:00")
      expect(formatResumeAt(new Date(2026, 9, 13, 23, 59).getTime())).toBe("resumes at 23:59")
    })
  })
})
