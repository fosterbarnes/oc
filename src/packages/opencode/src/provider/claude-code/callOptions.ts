/**
 * Reading a single LLM call: which opencode session and agent it belongs
 * to, the agent prompt, whether the prompt has anything new in it, and how to
 * describe an abort.
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import {
  CLAUDE_CODE_ACCOUNT_OPTION,
  CLAUDE_CODE_AGENT_OPTION,
  CLAUDE_CODE_AGENT_PROMPT_OPTION,
  CLAUDE_CODE_COMMAND_PERMISSION_OPTION,
  CLAUDE_CODE_EXPLICIT_MODEL_OPTION,
  CLAUDE_CODE_HARNESS_DENIED_OPTION,
  CLAUDE_CODE_PROVIDER_ID,
  CLAUDE_CODE_SESSION_OPTION,
  type CommandToolPlan,
} from "./shared.js"

type ProviderOptions = LanguageModelV3CallOptions["providerOptions"]

/** The command turn's tool plan, or undefined on an ordinary turn. */
export function commandToolPlan(providerOptions: ProviderOptions, providerKey: string): CommandToolPlan | undefined {
  const raw = hostOption(providerOptions, providerKey, CLAUDE_CODE_COMMAND_PERMISSION_OPTION)
  if (raw === undefined) return undefined
  const plan: unknown = JSON.parse(raw)
  if (!isPlan(plan)) throw new Error(`invalid ${CLAUDE_CODE_COMMAND_PERMISSION_OPTION}: ${raw}`)
  return plan
}

function isPlan(value: unknown): value is CommandToolPlan {
  if (typeof value !== "object" || value === null) return false
  const plan = value as Record<string, unknown>
  return (
    Array.isArray(plan.native) && plan.native.every((id) => typeof id === "string") && typeof plan.closed === "boolean"
  )
}

/** Claude built-ins with no oc proxy that the agent or session permissions deny. */
export function harnessToolsDenied(providerOptions: ProviderOptions, providerKey: string): string[] {
  return hostOption(providerOptions, providerKey, CLAUDE_CODE_HARNESS_DENIED_OPTION)?.split(",") ?? []
}

export function hasExplicitModel(providerOptions: ProviderOptions, providerKey: string) {
  return hostOption(providerOptions, providerKey, CLAUDE_CODE_EXPLICIT_MODEL_OPTION) === "true"
}

// oc nests call options under the provider key; account providers use their own key.
function hostOption(providerOptions: ProviderOptions, providerKey: string, key: string) {
  const value = (providerOptions?.[providerKey] ?? providerOptions?.[CLAUDE_CODE_PROVIDER_ID])?.[key]
  return typeof value === "string" && value.length > 0 ? value : undefined
}

/**
 * The oc session this call belongs to. Part of the session key, so two sessions
 * sharing cwd+model still get separate Claude CLI processes. `"default"` only
 * outside oc (direct `createClaudeCode` use).
 */
export function resolveSessionAffinity(providerOptions: ProviderOptions, providerKey: string): string {
  return hostOption(providerOptions, providerKey, CLAUDE_CODE_SESSION_OPTION) ?? "default"
}

/** The oc agent this call runs for; tells compaction and title calls apart from ordinary turns. */
export function resolveOpencodeAgent(providerOptions: ProviderOptions, providerKey: string): string | undefined {
  return hostOption(providerOptions, providerKey, CLAUDE_CODE_AGENT_OPTION)
}

/** The config dir the agent's `claudeAccount` key prefers, as written in the agent config. */
export function resolveAgentAccount(providerOptions: ProviderOptions, providerKey: string): string | undefined {
  return hostOption(providerOptions, providerKey, CLAUDE_CODE_ACCOUNT_OPTION)
}

/** The active oc agent's own prompt, appended to Claude Code's system prompt at spawn. */
export function resolveOpencodeAgentPrompt(providerOptions: ProviderOptions, providerKey: string): string | undefined {
  return hostOption(providerOptions, providerKey, CLAUDE_CODE_AGENT_PROMPT_OPTION)
}

/**
 * True if the prompt has any user-side content after the last assistant
 * message (text, tool_result, or any user role entry). False when the
 * prompt ends with an assistant message and there is nothing for Claude
 * to respond to - opencode sometimes iterates the agent loop one more
 * time after a turn naturally completed; without short-circuiting we'd
 * spawn Claude CLI on an empty turn and the model would reply with a
 * stub like "Did you mean to send a message?".
 */
export function hasNewUserContent(prompt: LanguageModelV3CallOptions["prompt"]): boolean {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i]
    if (msg.role === "assistant") return false
    // Tool-result turns from opencode's outer loop arrive in `tool`-role
    // messages (AI SDK V3 shape). Treat any tool-result part as new
    // content so the short-circuit doesn't drop turns where opencode is
    // delivering the result for a still-pending proxy MCP call - letting
    // that fire `stop` is what was forcing the user to press "continue".
    if (msg.role === "tool") {
      const content: any = msg.content
      if (Array.isArray(content)) {
        for (const part of content as any[]) {
          if (part?.type === "tool-result") return true
        }
      }
      continue
    }
    if (msg.role !== "user") continue
    const content: any = msg.content
    if (typeof content === "string") {
      if (content.trim()) return true
      continue
    }
    if (Array.isArray(content)) {
      for (const part of content as any[]) {
        if (part.type === "text" && part.text && part.text.trim()) return true
        if (part.type === "tool-result") return true
        // Image/file-only user turns count as new input - without this the
        // short-circuit drops them as if the turn were empty.
        if (part.type === "image" || part.type === "file") return true
      }
    }
  }
  return false
}
