import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

let input = ""
for await (const chunk of process.stdin) input += chunk

try {
  const data = JSON.parse(input)
  const window = (value) =>
    typeof value?.used_percentage === "number" &&
    Number.isFinite(value.used_percentage) &&
    typeof value.resets_at === "number" &&
    Number.isFinite(value.resets_at)
      ? { usedPercentage: value.used_percentage, resetsAt: value.resets_at }
      : undefined
  const fiveHour = window(data.rate_limits?.five_hour)
  const weekly = window(data.rate_limits?.seven_day)
  const model = typeof data.model?.display_name === "string" ? data.model.display_name : "Claude"
  const line = [
    fiveHour && `5h ${Math.round(fiveHour.usedPercentage)}%`,
    weekly && `week ${Math.round(weekly.usedPercentage)}%`,
  ].filter(Boolean)

  if (fiveHour && weekly) {
    const directory = path.join(os.homedir(), ".claude")
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const file = path.join(directory, "opencode-usage.json")
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify({ capturedAt: Date.now(), fiveHour, weekly }), { mode: 0o600 })
    renameSync(temp, file)
  }

  console.log([model, ...line].join(" . "))
} catch {
  console.log("Claude")
}
