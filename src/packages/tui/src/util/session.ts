import { Locale } from "./locale"

// Child sessions are titled "... (@<agent> subagent)" by the task tool.
export function subagentLabel(title: string) {
  const match = title.match(/@(\w+) subagent/)
  return match ? Locale.titlecase(match[1]) : "Subagent"
}

// Prompt-bar line for a lone subagent: `↳General-gpt-5.6-sol-Low 10.3K (10%)`.
// Trailing version pairs become dotted (claude-opus-5-5 -> claude-opus-5.5).
export function formatSubagentUsage(input: {
  label: string
  modelID: string
  variant?: string
  tokens: number
  percent?: number
}) {
  const model = input.modelID.replace(/-(\d+)-(\d+)$/, "-$1.$2")
  const name = [input.label, model, input.variant && Locale.titlecase(input.variant)].filter(Boolean).join("-")
  const percent = input.percent === undefined ? "" : ` (${input.percent}%)`
  return `↳${name} ${Locale.number(input.tokens)}${percent}`
}

export function isDefaultTitle(title: string) {
  return /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(title)
}
