import { afterEach, describe, expect, test } from "bun:test"
import { Locale } from "../../src/util/locale"

afterEach(() => Locale.setTimeSettings(undefined))

describe("Locale time settings", () => {
  test("24-hour clock pads hours", () => {
    expect(Locale.time(new Date(2026, 9, 13, 0, 5).getTime())).toBe("00:05")
    expect(Locale.time(new Date(2026, 9, 13, 23, 59).getTime())).toBe("23:59")
  })

  test("12-hour clock marks midnight and noon", () => {
    Locale.setTimeSettings({ clock: "12h" })
    expect(Locale.time(new Date(2026, 9, 13, 0, 5).getTime())).toBe("12:05 AM")
    expect(Locale.time(new Date(2026, 9, 13, 12, 0).getTime())).toBe("12:00 PM")
    expect(Locale.time(new Date(2026, 9, 13, 13, 1).getTime())).toBe("1:01 PM")
  })

  test("time zone moves formatted times and local Date getters", () => {
    const at = Date.UTC(2026, 9, 13, 0, 5)
    Locale.setTimeSettings({ timezone: "Asia/Tokyo" })
    expect(Locale.time(at)).toBe("09:05")
    expect(new Date(at).getHours()).toBe(9)
    Locale.setTimeSettings({ clock: "12h", timezone: "UTC" })
    expect(Locale.time(at)).toBe("12:05 AM")
  })

  test("auto and unknown zones restore the system zone", () => {
    const at = Date.UTC(2026, 9, 13, 0, 5)
    const system = new Date(at).getHours()
    Locale.setTimeSettings({ timezone: "Asia/Tokyo" })
    Locale.setTimeSettings({ timezone: "auto" })
    expect(new Date(at).getHours()).toBe(system)
    Locale.setTimeSettings({ timezone: "Asia/Tokyo" })
    Locale.setTimeSettings({ timezone: "Not/AZone" })
    expect(new Date(at).getHours()).toBe(system)
  })
})
