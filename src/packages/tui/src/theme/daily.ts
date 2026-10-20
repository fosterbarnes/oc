import { DEFAULT_THEMES } from "./index"

// Beta `daily_theme`: every oc install on the same version shows the same built-in theme on the same
// local date. Each run of N days is a seeded shuffle of the N built-in themes, so none repeats within
// a run. Plain code-unit sort keeps the order identical across locales.
const NAMES = Object.keys(DEFAULT_THEMES).sort()
const DAY_MS = 86_400_000

export function dayNumber(date: Date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS)
}

export function msUntilNextDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - date.getTime()
}

export function dailyTheme(day: number, names: readonly string[] = NAMES) {
  const cycle = Math.floor(day / names.length)
  const order = [...names]
  const random = mulberry32(cycle)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order[day - cycle * names.length]
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
