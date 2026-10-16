import { expect, test } from "bun:test"
import { fireTime } from "@/tool/schedule"
import { formatTime } from "@/tool/time"

const now = new Date(2026, 9, 15, 21, 30)

test("fireTime takes a delay or a local time, including the time tool's own format", () => {
  expect(fireTime({ delaySeconds: 90 }, now)).toEqual(new Date(2026, 9, 15, 21, 31, 30))
  expect(fireTime({ at: "2026-10-16 08:05" }, now)).toEqual(new Date(2026, 9, 16, 8, 5))
  expect(fireTime({ at: formatTime(new Date(2026, 9, 16, 8, 5)) }, now)).toEqual(new Date(2026, 9, 16, 8, 5))
})

test("fireTime explains every input it refuses", () => {
  expect(fireTime({}, now)).toContain("exactly one")
  expect(fireTime({ at: "2026-10-16 08:05", delaySeconds: 5 }, now)).toContain("exactly one")
  expect(fireTime({ at: "tomorrow 8am" }, now)).toContain("YYYY-MM-DD HH:MM")
  expect(fireTime({ at: "2026-02-30 08:00" }, now)).toContain("YYYY-MM-DD HH:MM")
  expect(fireTime({ delaySeconds: Number.NaN }, now)).toContain("YYYY-MM-DD HH:MM")
  expect(fireTime({ at: "2026-10-15 21:00" }, now)).toContain("not in the future")
  expect(fireTime({ delaySeconds: -5 }, now)).toContain("not in the future")
})
