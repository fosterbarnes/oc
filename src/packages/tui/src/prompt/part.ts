import type { Part } from "@opencode-ai/sdk/v2"
import { displaySlice } from "./display"
import type { PromptInfo } from "./history"
import { extractSlashCommands, typedText } from "./slash"

// KV flag: long pastes collapse to a `[Pasted ~N lines]` placeholder. Off by default.
export const PASTE_SUMMARY_KEY = "paste_summary_enabled"

export function stripPromptPartIDs<Part extends { id: string; messageID: string; sessionID: string }>(part: Part) {
  const { id: _id, messageID: _messageID, sessionID: _sessionID, ...rest } = part
  return rest
}

// Rebuilds the prompt a sent message came from, for edit, revert, undo, and fork.
export function promptFromParts(parts: readonly Part[]): PromptInfo {
  return parts.reduce<PromptInfo>(
    (agg, part) => {
      if (part.type === "text" && !part.synthetic) agg.input += typedText(part)
      if (part.type === "file") agg.parts.push(stripPromptPartIDs(part))
      return agg
    },
    { input: "", parts: [] },
  )
}

export function expandPastedTextPlaceholders(text: string, parts: readonly unknown[]) {
  return parts.reduce<string>((result, part) => {
    if (!isPastedTextPart(part)) return result
    return result.replace(part.source.text.value, part.text)
  }, text)
}

function isPastedTextPart(part: unknown): part is { type: "text"; text: string; source: { text: { value: string } } } {
  if (!part || typeof part !== "object" || !("type" in part) || part.type !== "text") return false
  if (!("text" in part) || typeof part.text !== "string" || !("source" in part)) return false
  const source = part.source
  if (!source || typeof source !== "object" || !("text" in source)) return false
  const text = source.text
  return Boolean(text && typeof text === "object" && "value" in text && typeof text.value === "string")
}

export function expandTrackedPastedText(text: string, ranges: { start: number; end: number; text: string }[]) {
  return ranges
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((result, part) => displaySlice(result, 0, part.start) + part.text + displaySlice(result, part.end), text)
}

// Commands come only from typed text: a pasted block that mentions `/imp` must not run it. Pastes stay
// opaque private-use markers while commands are stripped, then expand back into the request.
export function typedSlashCommands(
  text: string,
  pastes: { start: number; end: number; text: string }[],
  available: readonly { name: string }[],
) {
  const marked = expandTrackedPastedText(
    text,
    pastes.map((paste, index) => ({ ...paste, text: `${index}` })),
  )
  const commands = extractSlashCommands(marked, available)
  return {
    names: commands.names,
    arguments: commands.arguments.replace(/(\d+)/g, (_, index: string) => pastes[Number(index)].text),
  }
}
