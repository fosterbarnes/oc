// A subagent reference: `<entry>` or `<entry>:<level>`, where level is one of the entry's `reasoning` keys.

export type LevelState = "on" | "off" | "manual"
export type Reasoning = Record<string, LevelState>

/** One line telling callers how to name a level; shown wherever the agent list is. */
export const FORMAT_HINT =
  'For an agent that lists reasoning levels, pass subagent_type as "<agent>:<level>" (e.g. "reviewer:high"); a level is required.'

export interface Ref {
  name: string
  level?: string
}

export function parse(ref: string): Ref {
  const colon = ref.indexOf(":")
  if (colon < 0) return { name: ref }
  return { name: ref.slice(0, colon), level: ref.slice(colon + 1) }
}

/** Levels advertised to agents. */
export function listed(reasoning: Reasoning | undefined) {
  return Object.entries(reasoning ?? {})
    .filter(([, state]) => state === "on")
    .map(([level]) => level)
}

/** Levels a call may name: on and manual. */
export function enabled(reasoning: Reasoning | undefined) {
  return Object.entries(reasoning ?? {})
    .filter(([, state]) => state !== "off")
    .map(([level]) => level)
}

/**
 * The variant a call runs with, or an Error explaining the valid refs. `variants` are the model's
 * own variant ids when known; a level the model lacks is refused even if the entry lists it.
 */
export function levelFor(
  agent: { name: string; reasoning?: Reasoning },
  level: string | undefined,
  variants?: string[],
): string | undefined | Error {
  const allowed = enabled(agent.reasoning)
  if (!agent.reasoning) {
    if (level === undefined) return undefined
    return new Error(`${agent.name} takes no reasoning level; call it as ${agent.name}`)
  }
  const offered = listed(agent.reasoning)
  if (!level) {
    const refs = (offered.length ? offered : allowed).map((item) => `${agent.name}:${item}`)
    return new Error(`${agent.name} needs a reasoning level: ${refs.join(", ") || "none enabled"}`)
  }
  if (!allowed.includes(level) || (variants && !variants.includes(level))) {
    return new Error(
      `reasoning "${level}" is not enabled for ${agent.name}. Enabled: ${(offered.length ? offered : allowed).join(", ") || "none"}`,
    )
  }
  return level
}

/** For an unknown `<stem>-<level>` name (the old per-level naming), the matching `<entry>:<level>`, if any. */
export function suggest(name: string, agents: { name: string; reasoning?: Reasoning }[]) {
  const dash = name.lastIndexOf("-")
  if (dash <= 0) return undefined
  const stem = name.slice(0, dash)
  const level = name.slice(dash + 1)
  // `.` and `-` count as the same separator, so an old `model.2-high` still finds `model-2:high`.
  const loose = (text: string) => text.replaceAll(".", "-")
  const agent = agents.find((item) => item.name === stem) ?? agents.find((item) => loose(item.name) === loose(stem))
  return agent && enabled(agent.reasoning).includes(level) ? `${agent.name}:${level}` : undefined
}

export * as SubagentRef from "./subagentRef"
