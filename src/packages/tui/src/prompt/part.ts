import type { TextareaRenderable } from "@opentui/core"
import type { Part } from "@opencode-ai/sdk/v2"
import { displaySlice } from "./display"
import type { PromptInfo } from "./history"
import { extractSlashCommands, typedText } from "./slash"

// KV flag: long pastes collapse to a `[Pasted ~N lines]` placeholder. Off by default.
export const PASTE_SUMMARY_KEY = "paste_summary_enabled"
// KV flag: pasting an image opens its preview dialog. Off by default; clicking the chip still previews.
export const IMAGE_PASTE_PREVIEW_KEY = "image_paste_preview_enabled"
// KV value: what Tab does in the prompt when `input_tab` is bound (oc layout). Default "text".
export const PROMPT_TAB_KEY = "prompt_tab_action"
export type PromptTabAction = "text" | "agent" | "variant" | "favorite"

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

type AttachmentPart = { type: string; mime?: string; url?: string; filename?: string; source?: unknown }

function attachmentLabelOf(part: AttachmentPart) {
  const source = part.source
  if (!source || typeof source !== "object" || !("text" in source)) return undefined
  const text = source.text
  if (!text || typeof text !== "object" || !("value" in text) || typeof text.value !== "string") return undefined
  return text.value || undefined
}

function isImage(part: AttachmentPart) {
  return part.type === "file" && !!part.mime?.startsWith("image/")
}

// Pasting the same image again reuses its `[Image N]` label. New labels count up from the highest
// existing number, so removing an earlier attachment never repeats a label.
export function attachmentLabel(
  parts: readonly AttachmentPart[],
  file: { mime: string; url: string; filename?: string },
) {
  const kind = file.mime === "application/pdf" ? "PDF" : "Image"
  const existing =
    kind === "Image"
      ? parts
          .filter((part) => isImage(part) && part.url === file.url && part.filename === file.filename)
          .map(attachmentLabelOf)
          .find(Boolean)
      : undefined
  if (existing) return existing
  const pattern = new RegExp(`^\\[${kind} (\\d+)\\]$`)
  const highest = parts.reduce((max, part) => {
    const match = attachmentLabelOf(part)?.match(pattern)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `[${kind} ${highest + 1}]`
}

// One file part per pasted label keeps extmarks simple; the sent message carries each image once.
export function deduplicateImageParts<Part extends AttachmentPart>(parts: readonly Part[]) {
  const seen = new Set<string>()
  return parts.filter((part) => {
    const label = attachmentLabelOf(part)
    if (!isImage(part) || !label) return true
    const key = JSON.stringify([part.url, part.filename ?? null, label])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function isPastedChipLabel(label: string) {
  return /^\[Pasted ~\d+ lines\]$/.test(label)
}

// Swaps a `[Pasted ~N lines]` chip for its text so it can be edited in place. The prompt's content
// sync then drops the chip's part, since its extmark is gone.
export function expandPastedChip(input: TextareaRenderable, extmarkId: number, text: string) {
  const extmark = input.extmarks.get(extmarkId)
  if (!extmark) return false
  input.extmarks.delete(extmarkId)
  input.setSelection(extmark.start, extmark.end)
  input.insertText(text)
  return true
}

// Text offset under a screen cell of the textarea, or undefined past the end of that visual line.
// Clicks can't use cursorOffset: the cursor snaps out of virtual extmarks such as chips.
// `lineStartCols` holds each wrapped line's start as a global offset (newlines count as 1).
export function offsetAtCell(input: TextareaRenderable, x: number, y: number) {
  const viewport = input.editorView.getViewport()
  const row = viewport.offsetY + y - input.y
  const col = viewport.offsetX + x - input.x
  const { lineStartCols, lineWidthCols } = input.lineInfo
  if (row < 0 || row >= lineStartCols.length || col < 0 || col >= lineWidthCols[row]) return undefined
  return lineStartCols[row] + col
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
