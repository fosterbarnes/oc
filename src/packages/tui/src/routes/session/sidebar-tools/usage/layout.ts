import { formatUsagePercent } from "./format"

// Sidebar Usage block layouts: `grouped` (account header, then one line per window with a bar) and
// `table` (one line per Claude account and Codex under shared column labels). Pure: lines of colored
// segments that the sidebar renders as-is, so tests need no renderer.

export type UsageLayout = "grouped" | "table"
export type UsageTone = "text" | "muted" | "accent" | "primary" | "warning" | "error" | "track"
/** `key` marks a clickable segment: a renewal (`plan:<provider>:<account>`) or a note. */
export type UsageSegment = { text: string; tone: UsageTone; key?: string }
export type UsageEntry = {
  name: string
  /** Pooled Claude account this session runs on, marked `«`. */
  active?: boolean
  /** `reset` is right-aligned text: a short reset date, `idle`, `-`, or a dollar amount. */
  windows: { tag: string; usedPercent: number | null; reset: string; stale: boolean }[]
  /** `text` for the grouped header, `short` for the table column; `warn` within 3 days or ended. */
  plan?: { text: string; short: string; warn: boolean; key: string }
  /** Replaces the windows when there is no reading, such as `unavailable`. */
  note?: string
  /** Makes the note clickable (`cursor:sign-in`). */
  noteKey?: string
  /** Claude and Codex: candidates for the table's shared window columns. */
  table?: boolean
}
type Line = UsageSegment[]

const BLANK: Line = [{ text: " ", tone: "text" }]
const lineWidth = (line: Line) => line.reduce((sum, item) => sum + item.text.length, 0)
// The right side ends at column `width`, at least one space after the left side; a narrow sidebar clips it.
const rightAlign = (left: Line, right: UsageSegment, width: number): Line => [
  ...left,
  { text: " ".repeat(Math.max(1, width - lineWidth(left) - right.text.length)), tone: "text" },
  right,
]
// Colored by used percent whichever way the number reads; stale and 0% readings are dimmed.
const tone = (window: UsageEntry["windows"][number]): UsageTone =>
  window.usedPercent === null
    ? "muted"
    : window.usedPercent >= 95
      ? "error"
      : window.usedPercent >= 80
        ? "warning"
        : window.stale || window.usedPercent === 0
          ? "muted"
          : "text"
const percent = (window: UsageEntry["windows"][number], pad: number): UsageSegment => ({
  text: (window.usedPercent === null ? "-" : formatUsagePercent(window.usedPercent, false, true)).padStart(pad),
  tone: tone(window),
})
const planSegment = (plan: NonNullable<UsageEntry["plan"]>, text: string): UsageSegment => ({
  text,
  tone: plan.warn ? "warning" : "muted",
  key: plan.key,
})

function grouped(entries: UsageEntry[], width: number, options: { spacing: boolean }) {
  const longest = Math.max(0, ...entries.flatMap((entry) => entry.windows.map((window) => window.reset.length)))
  // `  5h  42%` is 9 columns, the bar 1 + cells, then at least 1 space and the reset. Too narrow: no bar.
  const cells = Math.min(12, width - 11 - longest)
  return entries.flatMap((entry, index): Line[] => {
    const head: Line = [
      { text: entry.name, tone: "text" },
      ...(entry.active ? [{ text: " «", tone: "warning" as const }] : []),
    ]
    const right =
      entry.note !== undefined
        ? { text: entry.note, tone: "muted" as const, key: entry.noteKey }
        : entry.plan && planSegment(entry.plan, entry.plan.text)
    return [
      ...(options.spacing && index > 0 ? [BLANK] : []),
      right ? rightAlign(head, right, width) : head,
      ...(entry.note !== undefined
        ? []
        : entry.windows.map((window) => {
            const filled =
              window.usedPercent === null
                ? 0
                : Math.min(cells, Math.max(0, Math.round((window.usedPercent / 100) * cells)))
            const fill = tone(window)
            const bar: Line =
              cells < 3
                ? []
                : [
                    { text: " " + "━".repeat(filled), tone: fill === "text" ? "primary" : fill },
                    { text: "━".repeat(cells - filled), tone: "track" },
                  ]
            return rightAlign(
              [{ text: `  ${window.tag.padEnd(3)}`, tone: "muted" }, percent(window, 4), ...bar],
              { text: window.reset, tone: "muted" },
              width,
            )
          })),
    ]
  })
}

function table(entries: UsageEntry[], width: number, options: { spacing: boolean }) {
  // The first two-window Claude/Codex entry sets the columns; other window pairs would be mislabeled there.
  const tags = entries.find((entry) => entry.table && entry.windows.length === 2)?.windows.map((window) => window.tag)
  const rows = entries.filter(
    (entry) =>
      entry.table &&
      (entry.note !== undefined || (tags && entry.windows.map((window) => window.tag).join() === tags.join())),
  )
  const rest = entries.filter((entry) => !rows.includes(entry))
  const nameWidth = Math.max(0, ...rows.map((entry) => entry.name.length))
  const resetWidth = [0, 1].map((slot) => Math.max(0, ...rows.map((entry) => entry.windows[slot]?.reset.length ?? 0)))
  const renewWidth = Math.max(0, ...rows.map((entry) => entry.plan?.short.length ?? 0))
  // Name, marker, and ` 42%` per window always; ` 7:40PM` resets, then ` 26d` renewals, while they fit.
  const base = nameWidth + 2 + 10
  const times = base + resetWidth[0] + resetWidth[1] + 2 <= width
  const renew = renewWidth > 0 && times && base + resetWidth[0] + resetWidth[1] + 3 + renewWidth <= width
  const lines = rows.map((entry): Line => {
    const head: Line = [
      { text: entry.name.padEnd(nameWidth), tone: "text" },
      entry.active ? { text: " «", tone: "warning" } : { text: "  ", tone: "text" },
    ]
    if (entry.note !== undefined) return [...head, { text: ` ${entry.note}`, tone: "muted", key: entry.noteKey }]
    return [
      ...head,
      ...entry.windows.flatMap(
        (window, slot): Line => [
          percent(window, 5),
          ...(times ? [{ text: ` ${window.reset.padEnd(resetWidth[slot])}`, tone: "muted" as const }] : []),
        ],
      ),
      ...(renew && entry.plan ? [planSegment(entry.plan, ` ${entry.plan.short.padStart(renewWidth)}`)] : []),
    ]
  })
  // Labels sit on the `- Usage:` line (8 columns), each ending where its column ends.
  const ends = [
    nameWidth + 7,
    nameWidth + 12 + (times ? resetWidth[0] + 1 : 0),
    base + resetWidth[0] + resetWidth[1] + 3 + renewWidth,
  ]
  const labels = [...(tags ?? []).map((tag) => (tag === "wk" ? "week" : tag)), ...(renew ? ["renew"] : [])]
  const header =
    rows.length && tags
      ? labels
          .reduce(
            (text, label, index) => text.padEnd(Math.max(text.length + 1, ends[index] - label.length)) + label,
            "- Usage:",
          )
          .slice(8)
      : ""
  return {
    header,
    lines: [
      ...lines,
      ...(options.spacing && lines.length && rest.length ? [BLANK] : []),
      ...grouped(rest, width, options),
    ],
  }
}

/** Lines for the open Usage block; `header` continues the `- Usage:` line (table column labels). */
export function usageLines(
  layout: UsageLayout,
  entries: UsageEntry[],
  width: number,
  options: { spacing: boolean },
): { header: string; lines: Line[] } {
  return layout === "table" ? table(entries, width, options) : { header: "", lines: grouped(entries, width, options) }
}
