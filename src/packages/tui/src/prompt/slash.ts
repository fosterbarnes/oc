import { displaySlice, promptOffsetWidth } from "./display"

export function slashTriggerIndex(value: string, offset: number) {
  const prefix = displaySlice(value, 0, offset)
  const match = prefix.match(/(^|\s)\/[^\s/]*$/)
  if (!match) return
  return promptOffsetWidth(prefix.slice(0, prefix.length - match[0].length + match[1].length))
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

export function extractSlashCommands(text: string, available: readonly { name: string }[]) {
  const known = new Set(available.map((command) => command.name))
  const names = new Set<string>()
  const argumentsText = text
    .replace(/(^|\s)\/(\S+)(?=\s|$)/g, (match, lead: string, name: string) => {
      if (!known.has(name)) return match
      names.add(name)
      return lead
    })
    .trim()
  return { names: [...names], arguments: argumentsText }
}
