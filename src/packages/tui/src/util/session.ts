import { Locale } from "./locale"

// Child sessions are titled "... (@<agent> subagent)" by the task tool.
export function subagentLabel(title: string) {
  const match = title.match(/@(\w+) subagent/)
  return match ? Locale.titlecase(match[1]) : "Subagent"
}

export function isDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}
