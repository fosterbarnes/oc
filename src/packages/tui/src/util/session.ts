import { Locale } from "./locale"

// Child sessions are titled "... (@<agent> subagent)" by the task tool.
export function subagentLabel(title: string) {
  const match = title.match(/@(\w+) subagent/)
  return match ? Locale.titlecase(match[1]) : "Subagent"
}

// Every session below `sessionID`, depth first. Guards against parent cycles.
export function sessionDescendants<T extends { id: string; parentID?: string }>(
  sessions: readonly T[],
  sessionID: string,
) {
  const children = new Map<string, T[]>()
  sessions.forEach((session) => {
    if (!session.parentID) return
    const group = children.get(session.parentID)
    if (group) group.push(session)
    else children.set(session.parentID, [session])
  })

  const visited = new Set([sessionID])
  function walk(parentID: string): T[] {
    return (children.get(parentID) ?? []).flatMap((session) => {
      if (visited.has(session.id)) return []
      visited.add(session.id)
      return [session, ...walk(session.id)]
    })
  }

  return walk(sessionID)
}

// A root session's cost includes the spend of every loaded descendant (subagents); a child keeps
// its own cost. Sessions outside the loaded list (older than the sync window) are not counted.
export function sessionCost<T extends { id: string; parentID?: string; cost?: number }>(
  session: T | undefined,
  children: (sessionID: string) => readonly T[],
) {
  if (!session) return 0
  if (session.parentID) return session.cost ?? 0
  const visited = new Set([session.id])
  const walk = (parentID: string): number =>
    children(parentID).reduce((total, child) => {
      if (visited.has(child.id)) return total
      visited.add(child.id)
      return total + (child.cost ?? 0) + walk(child.id)
    }, 0)
  return (session.cost ?? 0) + walk(session.id)
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
