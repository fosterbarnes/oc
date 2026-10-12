/**
 * Title requests: telling one apart from a real turn, and the synthetic
 * title the plugin answers it with instead of spawning `claude`.
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { ClaudeCodeConfig } from "./types.js"
import { resolveOpencodeAgent } from "./callOptions.js"

/**
 * Whether this call only names the session, which gets the synthetic stub
 * rather than a `claude` spawn. opencode 1.x sends a title request with no
 * tools, and that is the whole test there. opencode 2 sends its tool set
 * along with it (measured on 2.0.11: `scope: "tools"`, agent `title`), so
 * every new V2 session paid for a second `claude` process just to title
 * itself; for a V2 model the request kind, carried as the `title` agent,
 * decides instead.
 *
 * A tool-less turn is not automatically a title: a context-limit handoff
 * summary runs under the session agent with tools denied, and must reach
 * the model. Only the naming agents (title, rename, and the project-copy
 * name generator in server/routes/instance/httpapi/handlers/project-copy.ts)
 * synthesize; an unknown agent keeps the legacy stub.
 */
const NAMING_AGENTS = new Set(["title", "rename", "project-copy-name"])

/** Whether this agent only ever names text (see NAMING_AGENTS). */
export function isNamingAgent(agent: string | undefined): boolean {
  return agent !== undefined && NAMING_AGENTS.has(agent)
}

export function isTitleRequest(
  config: ClaudeCodeConfig,
  scope: "tools" | "no-tools",
  options: LanguageModelV3CallOptions,
): boolean {
  if (scope !== "no-tools") {
    return config.hostApi === "v2" && resolveOpencodeAgent(options.providerOptions, config.provider) === "title"
  }
  const agent = resolveOpencodeAgent(options.providerOptions, config.provider)
  if (agent === undefined) return true
  return isNamingAgent(agent)
}

export function requestScope(options: { tools?: unknown }): "tools" | "no-tools" {
  const tools = options?.tools
  if (Array.isArray(tools)) return "tools"
  if (tools && typeof tools === "object") {
    return Object.keys(tools as Record<string, unknown>).length > 0 ? "tools" : "no-tools"
  }
  return "no-tools"
}

export function latestUserText(prompt: LanguageModelV3CallOptions["prompt"]): string {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i]
    if (msg.role !== "user") continue

    if (typeof msg.content === "string") {
      return String(msg.content).trim()
    }

    if (Array.isArray(msg.content)) {
      const text = (msg.content as any[])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part: any) => String(part.text).trim())
        .filter(Boolean)
        .join(" ")
      if (text) return text
    }
  }

  return ""
}

export function synthesizeTitle(prompt: LanguageModelV3CallOptions["prompt"]): string {
  const source = latestUserText(prompt)
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .trim()

  if (!source) return "New Session"

  const stop = new Set([
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "to",
    "for",
    "of",
    "in",
    "on",
    "at",
    "with",
    "can",
    "could",
    "would",
    "should",
    "please",
    "hi",
    "hello",
    "hey",
    "there",
    "you",
    "your",
    "this",
    "that",
    "is",
    "are",
    "was",
    "were",
    "be",
    "do",
    "does",
    "did",
    "summarize",
    "summary",
    "project",
  ])

  const words = source
    .split(" ")
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !stop.has(word.toLowerCase()))

  const picked = (words.length > 0 ? words : source.split(" ").filter(Boolean))
    .slice(0, 6)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")

  return picked || "New Session"
}
