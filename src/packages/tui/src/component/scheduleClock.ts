export type ScheduleClock = {
  fields: [string, string, string]
  hour12: boolean
  pm: boolean
  section: number
  pending: string
}

export function createScheduleClock(now: number, hour12: boolean): ScheduleClock {
  const at = new Date(now + 60_000)
  return {
    fields: [hour12 ? at.getHours() % 12 || 12 : at.getHours(), at.getMinutes(), 0].map((value) =>
      String(value).padStart(2, "0"),
    ) as ScheduleClock["fields"],
    hour12,
    pm: at.getHours() >= 12,
    section: 0,
    pending: "",
  }
}

export function selectScheduleSection(clock: ScheduleClock, section: number): ScheduleClock {
  return { ...clock, section: (section + (clock.hour12 ? 4 : 3)) % (clock.hour12 ? 4 : 3), pending: "" }
}

export function editScheduleClock(clock: ScheduleClock, key: string, shift = false): ScheduleClock {
  if (key === "left" || key === "right") {
    return selectScheduleSection(clock, clock.section + (key === "right" ? 1 : -1))
  }
  if (clock.section === 3) {
    if (key === "a" || key === "p") return { ...clock, pm: key === "p", pending: "" }
    if (key === "up" || key === "down" || key === "space") return { ...clock, pm: !clock.pm, pending: "" }
    return clock
  }
  if (/^\d$/.test(key)) {
    const digits = clock.pending + key
    const fields = [...clock.fields] as ScheduleClock["fields"]
    fields[clock.section] = digits.padStart(2, "0")
    return {
      ...clock,
      fields,
      section: digits.length === 2 ? Math.min(clock.section + 1, clock.hour12 ? 3 : 2) : clock.section,
      pending: digits.length === 2 ? "" : digits,
    }
  }
  if (key !== "up" && key !== "down") return clock
  const hours = scheduleHours(clock)
  if (hours === undefined) return clock
  const step = clock.section === 0 ? 3600 : (clock.section === 1 ? 60 : 1) * (shift ? 1 : 10)
  const seconds = (
    hours * 3600 + Number(clock.fields[1]) * 60 + Number(clock.fields[2]) +
    (key === "up" ? step : -step) + 86_400
  ) % 86_400
  const hour = Math.floor(seconds / 3600)
  return {
    ...clock,
    fields: [clock.hour12 ? hour % 12 || 12 : hour, Math.floor(seconds / 60) % 60, seconds % 60].map((value) =>
      String(value).padStart(2, "0"),
    ) as ScheduleClock["fields"],
    pm: hour >= 12,
    pending: "",
  }
}

export function pasteScheduleClock(clock: ScheduleClock, input: string): ScheduleClock | undefined {
  const match = /^(\d{2})(:?)(\d{2})\2(\d{2})(?:\s*(AM|PM))?$/i.exec(input.trim())
  if (!match || (!clock.hour12 && match[5])) return
  const next: ScheduleClock = {
    ...clock,
    fields: [match[1]!, match[3]!, match[4]!],
    pm: match[5] ? match[5].toUpperCase() === "PM" : clock.pm,
    pending: "",
  }
  if (scheduleHours(next) === undefined) return
  return next
}

export function nextScheduleOccurrence(clock: ScheduleClock, now: number) {
  const hours = scheduleHours(clock)
  if (hours === undefined) return
  const at = new Date(now)
  at.setHours(hours, Number(clock.fields[1]), Number(clock.fields[2]), 0)
  if (at.getTime() <= now) {
    at.setDate(at.getDate() + 1)
    at.setHours(hours, Number(clock.fields[1]), Number(clock.fields[2]), 0)
  }
  // A skipped local time during a daylight-saving change must not silently become another time.
  if (
    at.getHours() !== hours ||
    at.getMinutes() !== Number(clock.fields[1]) ||
    at.getSeconds() !== Number(clock.fields[2])
  ) return
  return at.getTime()
}

function scheduleHours(clock: ScheduleClock) {
  if (!clock.fields.every((field) => /^\d{2}$/.test(field))) return
  const hours = Number(clock.fields[0])
  if (Number(clock.fields[1]) > 59 || Number(clock.fields[2]) > 59) return
  if (hours > (clock.hour12 ? 12 : 23) || (clock.hour12 && hours === 0)) return
  return clock.hour12 ? hours % 12 + (clock.pm ? 12 : 0) : hours
}
