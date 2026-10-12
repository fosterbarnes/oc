/**
 * Mapping the Claude CLI's own counters onto the AI SDK's usage and finish
 * shapes.
 */
import type { LanguageModelV3FinishReason, LanguageModelV3Usage } from "@ai-sdk/provider"
import type { ClaudeStreamMessage } from "./types.js"

type CallUsage = NonNullable<ClaudeStreamMessage["usage"]>

/**
 * Context occupancy for one API call. `result.usage` sums every tool-loop
 * call in the turn; pass the last assistant `message.usage` here instead.
 * Output is that call only, not the sum of earlier calls in the turn.
 */
export function contextUsage(lastCall?: CallUsage | null): CallUsage {
  return {
    input_tokens: lastCall?.input_tokens ?? 0,
    output_tokens: lastCall?.output_tokens ?? 0,
    cache_read_input_tokens: lastCall?.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: lastCall?.cache_creation_input_tokens ?? 0,
  }
}

/** Same sum `isOverflow` uses once `getUsage` has split cache out of input. */
export function claudePromptTokens(lastCall?: CallUsage | null): number {
  const usage = contextUsage(lastCall)
  return (
    (usage.input_tokens ?? 0) +
    (usage.output_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  )
}

export function toUsage(rawUsage?: ClaudeStreamMessage["usage"]): LanguageModelV3Usage {
  // Prefer the last iteration's counters over cumulative totals.
  // CLI usage is the sum across all internal tool-use iterations;
  // using it directly inflates context size and triggers premature compaction.
  const iter = rawUsage?.iterations
  const effective = iter?.length ? iter[iter.length - 1] : rawUsage
  // Claude CLI reports input_tokens as non-cached input only.
  // OpenCode expects total = noCache + cacheRead + cacheWrite.
  const noCache = effective?.input_tokens ?? 0
  const cacheRead = effective?.cache_read_input_tokens ?? 0
  const cacheWrite = effective?.cache_creation_input_tokens ?? 0
  return {
    inputTokens: {
      total: noCache + cacheRead + cacheWrite,
      noCache,
      cacheRead: cacheRead || undefined,
      cacheWrite: cacheWrite || undefined,
    },
    outputTokens: {
      total: effective?.output_tokens,
      text: effective?.output_tokens,
      reasoning: undefined,
    },
    raw: rawUsage as any,
  }
}

export function toFinishReason(reason: "stop" | "tool-calls" | "error" = "stop"): LanguageModelV3FinishReason {
  return {
    unified: reason,
    raw: reason,
  }
}
