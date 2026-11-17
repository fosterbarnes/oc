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

type MessagePart = { type: string; synthetic?: boolean; metadata?: Record<string, unknown> }

// `ocActive`: the active command after a message, stamped by opencode session/activeCommand.ts.
export function activeCommand(
  messages: readonly { id: string; role: string }[],
  parts: Record<string, readonly MessagePart[] | undefined>,
) {
  const stamped = (part: MessagePart) => part.type === "text" && !!part.metadata && "ocActive" in part.metadata
  const message = messages.findLast(
    (message) =>
      message.role === "user" &&
      parts[message.id]?.some((part) => (part.type === "text" && !part.synthetic) || stamped(part)),
  )
  const value = message && parts[message.id]?.find(stamped)?.metadata?.ocActive
  return typeof value === "string" ? value : undefined
}

// What the user typed: re-submits the same commands instead of their expanded templates.
export function typedText(part: CommandText) {
  const use = commandUse(part)
  if (!use) return part.text
  return [...use.names.map((name) => `/${name}`), use.request].filter(Boolean).join(" ")
}

// Built-in TUI revives that split a typed draft into ordered steps: `/test /revive /ship` runs
// /test, revives once that turn ends, then sends /ship from the reopened oc (`reviveChain.tsx`).
export const REVIVE_MODES = {
  revive: "install",
  "revive-no-install": "no-install",
  "revive-single": "single",
} as const satisfies Record<string, ReviveResume.Mode>

// Revives never take text: a stack's text goes to its first other command, else to a plain step.
export function extractChain(text: string, available: readonly { name: string }[]) {
  const revives = Object.keys(REVIVE_MODES)
  const steps = splitSlashSteps(text, [...available, ...revives.map((name) => ({ name }))], revives)
  if (!steps.some((step) => step.command && step.command in REVIVE_MODES)) return
  return {
    steps: steps.map((step): ReviveResume.Step => {
      if (step.command && step.command in REVIVE_MODES)
        return { type: "revive", mode: REVIVE_MODES[step.command as keyof typeof REVIVE_MODES] }
      return { type: "send", names: step.command ? [step.command] : [], ...(step.text && { text: step.text }) }
    }),
  }
}

export type SlashStep = { command?: string; text: string }

// A message with 2+ commands runs as ordered steps. Text before the first command is a plain step;
// each command gets the text up to the next command, and in a stack (`/spit /think text`) the first
// command takes the text while the rest stay blank. `textless` commands are skipped as takers.
export function splitSlashSteps(text: string, available: readonly { name: string }[], textless: string[] = []) {
  const known = new Set(available.map((command) => command.name))
  const ranges = quotedRanges(text)
  const found = [...text.matchAll(/(?<=^|\s)\/(\S+)(?=\s|$)/g)].filter(
    (match) => known.has(match[1]) && !quoted(ranges, match.index),
  )
  const lead = text.slice(0, found[0]?.index).trim()
  return found.reduce<{ steps: SlashStep[]; taker?: number }>(
    (acc, match, index) => {
      const after = text.slice(match.index + match[0].length, found[index + 1]?.index).trim()
      const steps = [...acc.steps, { command: match[1], text: "" }]
      const taker = acc.taker ?? (textless.includes(match[1]) ? undefined : steps.length - 1)
      if (!after) return { steps, taker }
      if (taker === undefined) return { steps: [...steps, { text: after }] }
      steps[taker] = { ...steps[taker], text: after }
      return { steps }
    },
    { steps: lead ? [{ text: lead }] : [] },
  ).steps
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
