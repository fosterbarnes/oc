import { DateTime, Effect, Schema } from "effect"
import { Tool } from "./tool"

export const Parameters = Schema.Struct({})

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

// One short line, e.g. `2026-10-08 Thu 14:32 -05:00`. Read live so it is always current.
export function formatTime(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? "-" : "+"
  const abs = Math.abs(offset)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${DAYS[date.getDay()]} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())} ${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

export const TimeTool = Tool.define(
  "time",
  Effect.succeed({
    description: "Returns the user's current local date, time, and UTC offset.",
    parameters: Parameters,
    execute: () =>
      DateTime.nowAsDate.pipe(
        Effect.map((date) => {
          const output = formatTime(date)
          return { title: output, output, metadata: {} }
        }),
      ),
  }),
)
