import type { Message, Part, ReasoningPart, ToolPart } from "@opencode-ai/sdk/v2"

// full: every row as configured by tool details and thinking mode (the default).
// grouped: each run of thinking and tool rows collapses into one row that expands on click.
// summary: each run is one count row that does not expand.
export type TranscriptView = "full" | "grouped" | "summary"

const VIEWS: readonly TranscriptView[] = ["full", "grouped", "summary"]

export function isTranscriptView(value: unknown): value is TranscriptView {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value)
}

export function nextTranscriptView(current: TranscriptView): TranscriptView {
  return VIEWS[(VIEWS.indexOf(current) + 1) % VIEWS.length] ?? "full"
}

export type ActivityItem = ReasoningPart | ToolPart
// `settled`: thinking ids from completed messages, finished even when an interrupted stream left no end time.
export type ActivityRun = { id: string; items: ActivityItem[]; settled: ReadonlySet<string> }

// Subagents and questions are interactive or long-lived, so they keep their own rows and end a run.
const STANDALONE = new Set(["task", "question"])

/**
 * Runs of two or more consecutive thinking and tool parts, keyed by each member's part id. A run spans the
 * step messages of one turn (one assistant message per step). Visible text, subagent and question calls,
 * user messages and message errors end a run; parts that render nothing are skipped.
 */
export function activityRuns(messages: readonly Message[], parts: (messageID: string) => readonly Part[]) {
  const runs = new Map<string, ActivityRun>()
  let current: ActivityItem[] = []
  let settled = new Set<string>()
  const close = () => {
    if (current.length >= 2) {
      const run = { id: current[0]!.id, items: current, settled }
      current.forEach((item) => runs.set(item.id, run))
    }
    current = []
    settled = new Set()
  }
  for (const message of messages) {
    if (message.role === "user") {
      close()
      continue
    }
    for (const part of parts(message.id)) {
      if (part.type === "reasoning") {
        if (!reasoningRenders(part)) continue
        current.push(part)
        if (message.time.completed !== undefined) settled.add(part.id)
        continue
      }
      if (part.type === "tool") {
        if (STANDALONE.has(part.tool)) close()
        else current.push(part)
        continue
      }
      if (part.type === "text" && part.text.trim()) close()
    }
    if (message.error) close()
  }
  close()
  return runs
}

const NOUNS = ["command", "edit", "read", "search", "fetch", "thought", "tool"] as const

/** One row for a run, e.g. "3 commands, 1 edit, 2 thoughts"; counts finished items, running ones set `active`. */
export function activitySummary(run: ActivityRun) {
  const isActive = (item: ActivityItem) => {
    if (item.type === "reasoning") return item.time.end === undefined && !run.settled.has(item.id)
    return item.state.status === "pending" || item.state.status === "running"
  }
  const items = run.items
  const counts = new Map<string, number>()
  items
    .filter((item) => !isActive(item))
    .forEach((item) => {
      const noun = activityNoun(item)
      counts.set(noun, (counts.get(noun) ?? 0) + 1)
    })
  const label = NOUNS.flatMap((noun) => {
    const count = counts.get(noun)
    if (!count) return []
    return [`${count} ${count === 1 ? noun : noun === "search" || noun === "fetch" ? `${noun}es` : `${noun}s`}`]
  }).join(", ")
  const current = items.find(isActive)
  return {
    label: label || (current ? busyLabel(current) : ""),
    active: current !== undefined,
    failed: items.some((item) => item.type === "tool" && item.state.status === "error"),
  }
}

function busyLabel(item: ActivityItem) {
  if (item.type === "reasoning") return "Thinking…"
  return `${item.state.status === "pending" ? "Preparing" : "Running"} ${activityNoun(item)}…`
}

function activityNoun(item: ActivityItem): (typeof NOUNS)[number] {
  if (item.type === "reasoning") return "thought"
  if (item.tool === "bash") return "command"
  if (item.tool === "read") return "read"
  if (item.tool === "edit" || item.tool === "write" || item.tool === "apply_patch") return "edit"
  if (item.tool === "grep" || item.tool === "glob" || item.tool === "websearch") return "search"
  if (item.tool === "webfetch") return "fetch"
  return "tool"
}

// Matches ReasoningPart: empty thinking renders nothing; encrypted thinking still shows its header.
function reasoningRenders(part: ReasoningPart) {
  return Boolean(part.text.replace("[REDACTED]", "").trim() || part.metadata)
}
