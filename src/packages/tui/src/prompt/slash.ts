import type { ReviveResume } from "@opencode-ai/core/util/reviveResume"
import { displaySlice, promptOffsetWidth } from "./display"

export function slashTriggerIndex(value: string, offset: number) {
  const prefix = displaySlice(value, 0, offset)
  const match = prefix.match(/(^|\s)\/[^\s/]*$/)
  if (!match) return
  return promptOffsetWidth(prefix.slice(0, prefix.length - match[0].length + match[1].length))
}

// End of the slash token being edited: runs through the rest of the word (`/com|mand`) but stops
// at the next `/command`, so picking in `/x|/next` keeps `/next`.
export function slashTokenEnd(value: string, offset: number) {
  return offset + promptOffsetWidth(displaySlice(value, offset).match(/^[^\s/]*/)![0])
}

type CommandText = { text: string; metadata?: Record<string, unknown> }

// Stamped on command template text by SessionPrompt.command (opencode session/prompt.ts).
export function commandUse(part: CommandText) {
  const names = part.metadata?.ocCommands
  if (!Array.isArray(names) || !names.length || !names.every((name) => typeof name === "string")) return
  const request = part.metadata?.ocCommandArguments
  return { names: names as string[], request: typeof request === "string" ? request.trim() : "" }
}

// What the user typed: re-submits the same commands instead of their expanded templates.
export function typedText(part: CommandText) {
  const use = commandUse(part)
  if (!use) return part.text
  return [...use.names.map((name) => `/${name}`), use.request].filter(Boolean).join(" ")
}

// Built-in TUI revives that split a typed draft into ordered steps: `/pass /revive /agent-push` runs
// /pass, revives once that turn ends, then sends /agent-push from the reopened oc (`reviveChain.tsx`).
export const REVIVE_MODES = {
  revive: "install",
  "revive-no-install": "no-install",
  "revive-single": "single",
} as const satisfies Record<string, ReviveResume.Mode>

// With slash commands, all free text is one request every command step gets (the user types it
// stream-of-consciousness around the commands). Without any, each text segment is its own prompt.
export function extractChain(text: string, available: readonly { name: string }[]) {
  const ranges = quotedRanges(text)
  const revives = [...text.matchAll(/(?<=^|\s)\/(revive|revive-no-install|revive-single)(?=\s|$)/g)].filter(
    (match) => !quoted(ranges, match.index),
  )
  if (!revives.length) return
  // Same shape `split` with a capture group gives: segment, mode name, segment, ...
  const ends = revives.map((match) => match.index + match[0].length)
  const pieces = [
    ...revives.flatMap((match, index) => [text.slice(ends[index - 1] ?? 0, match.index), match[1]]),
    text.slice(ends.at(-1)),
  ]
  const segments = pieces.map((piece, index) =>
    index % 2 ? { mode: REVIVE_MODES[piece as keyof typeof REVIVE_MODES] } : extractSlashCommands(piece, available),
  )
  const commands = segments.some((segment) => "names" in segment && segment.names.length > 0)
  const steps = segments.flatMap((segment): ReviveResume.Step[] => {
    if ("mode" in segment) return [{ type: "revive", mode: segment.mode }]
    if (segment.names.length) return [{ type: "send", names: segment.names }]
    return !commands && segment.arguments ? [{ type: "send", names: [], text: segment.arguments }] : []
  })
  const request = commands
    ? segments.flatMap((segment) => ("arguments" in segment && segment.arguments ? [segment.arguments] : [])).join("\n")
    : ""
  return { steps, request }
}

export function extractSlashCommands(text: string, available: readonly { name: string }[]) {
  const known = new Set(available.map((command) => command.name))
  const ranges = quotedRanges(text)
  const names = new Set<string>()
  const argumentsText = text
    .replace(/(^|\s)\/(\S+)(?=\s|$)/g, (match, lead: string, name: string, offset: number) => {
      if (!known.has(name) || quoted(ranges, offset + lead.length)) return match
      names.add(name)
      return lead
    })
    .trim()
  return { names: [...names], arguments: argumentsText }
}

// Quoted examples and code fences cite commands; they never run them. A quote opens only after the
// start, whitespace, or a bracket and closes only before the end, whitespace, or punctuation, so
// apostrophes (don't, it's) never pair up. An unclosed quote hides nothing.
const QUOTED =
  /```[\s\S]*?```|(?<=^|[\s([{])(?:'[\s\S]*?'|"[\s\S]*?"|`[\s\S]*?`|‘[\s\S]*?’|“[\s\S]*?”)(?=$|[\s.,;:!?)\]}])/g

function quotedRanges(text: string) {
  return [...text.matchAll(QUOTED)].map((match) => [match.index, match.index + match[0].length] as const)
}

function quoted(ranges: ReturnType<typeof quotedRanges>, index: number) {
  return ranges.some(([start, end]) => index >= start && index < end)
}
