import { displaySlice, promptOffsetWidth } from "./display"

export function slashTriggerIndex(value: string, offset: number) {
  const prefix = displaySlice(value, 0, offset)
  const match = prefix.match(/(^|\s)\/[^\s/]*$/)
  if (!match) return
  return promptOffsetWidth(prefix.slice(0, prefix.length - match[0].length + match[1].length))
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
