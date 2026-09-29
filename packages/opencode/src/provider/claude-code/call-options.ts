/**
 * Reading a single LLM call: which opencode session and agent it belongs
 * to, which model handles /compact, whether the prompt has anything new in
 * it, and how to describe an abort.
 *
 * Split out of `claude-code-language-model.ts` verbatim. Everything here is
 * pure and free-standing, which is why it was already exported and unit
 * tested from the class's outside.
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import {
  CLAUDE_CODE_AGENT_OPTION,
  CLAUDE_CODE_PROVIDER_ID,
  CLAUDE_CODE_SESSION_OPTION,
  COMPACTION_BOUNDARY_OPTION,
} from "./shared.js"

/**
 * Default model used for opencode `/compact`. Haiku 4.5 is fast
 * (~150 tok/s), has a hard 8k output cap that bounds latency, and is a
 * strong structured summarizer. Override per-project via the
 * `compactionModel` provider setting in opencode.json / opencode.jsonc,
 * or per-run via the `CLAUDE_CODE_COMPACTION_MODEL` env var (env wins).
 */
export const DEFAULT_COMPACTION_MODEL = "claude-haiku-4-5"

/**
 * Pick the model used to handle /compact. Precedence:
 *   1. `CLAUDE_CODE_COMPACTION_MODEL` env var (per-process override)
 *   2. `configured` argument (the `compactionModel` provider setting)
 *   3. `DEFAULT_COMPACTION_MODEL`
 *
 * Exported as a free function so it can be unit-tested without
 * instantiating the language model class.
 */
export function resolveCompactionModel(configured?: string): string {
  const env = process.env.CLAUDE_CODE_COMPACTION_MODEL?.trim()
  if (env) return env
  const trimmed = configured?.trim()
  if (trimmed) return trimmed
  return DEFAULT_COMPACTION_MODEL
}

type ProviderOptions = LanguageModelV3CallOptions["providerOptions"]

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

const compactionBoundaryBySession = new Map<string, string>()

/**
 * True the first time `key` sees a new host compaction boundary (the summary
 * message id opencode sends on every turn after a compaction). Another model
 * may have written the summary, so this id is the only sign the CLI transcript
 * is stale.
 * ponytail: in-memory, so a restart starts one extra fresh conversation per compacted session.
 */
export function compactionBoundaryChanged(key: string, providerOptions: ProviderOptions, providerKey: string): boolean {
  const boundary = hostOption(providerOptions, providerKey, COMPACTION_BOUNDARY_OPTION)
  if (!boundary || compactionBoundaryBySession.get(key) === boundary) return false
  compactionBoundaryBySession.delete(key)
  compactionBoundaryBySession.set(key, boundary)
  if (compactionBoundaryBySession.size > 256) {
    compactionBoundaryBySession.delete(compactionBoundaryBySession.keys().next().value!)
  }
  return true
}

/** An `AbortSignal.reason` as loggable text: its name and message, or its type. */
export function describeAbortReason(reason: unknown): string {
  if (reason === undefined) return "undefined"
  if (reason instanceof Error) return `${reason.name}: ${reason.message}`
  if (typeof reason === "string") return reason
  try {
    return JSON.stringify(reason) ?? typeof reason
  } catch {
    return typeof reason
  }
}

/**
 * True if the prompt has any user-side content after the last assistant
 * message (text, tool_result, or any user role entry). False when the
 * prompt ends with an assistant message and there is nothing for Claude
 * to respond to — opencode sometimes iterates the agent loop one more
 * time after a turn naturally completed; without short-circuiting we'd
 * spawn Claude CLI on an empty turn and the model would reply with a
 * stub like "Did you mean to send a message?".
 */
export function hasNewUserContent(
  prompt: LanguageModelV3CallOptions["prompt"],
): boolean {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const msg = prompt[i]
    if (msg.role === "assistant") return false
    // Tool-result turns from opencode's outer loop arrive in `tool`-role
    // messages (AI SDK V3 shape). Treat any tool-result part as new
    // content so the short-circuit doesn't drop turns where opencode is
    // delivering the result for a still-pending proxy MCP call — letting
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
        // Image/file-only user turns count as new input — without this the
        // short-circuit drops them as if the turn were empty.
        if (part.type === "image" || part.type === "file") return true
      }
    }
  }
  return false
}
