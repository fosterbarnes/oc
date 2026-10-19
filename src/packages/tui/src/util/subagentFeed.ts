import type { Message, Part } from "@opencode-ai/sdk/v2"
import { titlecase } from "./locale"

export type FeedEntry = { kind: "tool" | "reasoning" | "text"; text: string; error?: boolean }

// Enough characters to fill a few wrapped rows; slicing keeps per-delta work small on long replies.
const _TAIL_CHARS = 400

// Newest `max` entries of a subagent's assistant output, oldest first: one line per tool call and
// the whitespace-collapsed tail of each reasoning or text part.
export function subagentFeed(messages: readonly Message[], parts: Record<string, readonly Part[]>, max: number) {
  const entries: FeedEntry[] = []
  for (let i = messages.length - 1; i >= 0 && entries.length < max; i--) {
    if (messages[i].role !== "assistant") continue
    const list = parts[messages[i].id] ?? []
    for (let j = list.length - 1; j >= 0 && entries.length < max; j--) {
      const entry = feedEntry(list[j])
      if (entry) entries.push(entry)
    }
  }
  return entries.reverse()
}

function feedEntry(part: Part): FeedEntry | undefined {
  if (part.type === "tool") {
    const title = part.state.status === "running" || part.state.status === "completed" ? part.state.title : undefined
    const text = `› ${titlecase(part.tool)}${title ? ` ${title}` : ""}`
    return { kind: "tool", text, error: part.state.status === "error" }
  }
  if (part.type !== "reasoning" && part.type !== "text") return
  // OpenRouter encrypts some reasoning blocks; drop the placeholder like ReasoningPart does.
  const text = part.text.slice(-_TAIL_CHARS).replace("[REDACTED]", "").replace(/\s+/g, " ").trim()
  if (!text) return
  return { kind: part.type, text }
}
