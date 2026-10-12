import type { Config } from "@/config/config"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import type { MessageV2 } from "./message-v2"
import { CLAUDE_CODE_PROVIDER_ID, isClaudeCodeProvider } from "@/provider/claude-code/shared"

const COMPACTION_BUFFER = 20_000

export function usable(input: { cfg: ConfigV1.Info; model: Provider.Model; outputTokenMax?: number }) {
  const context = input.model.limit.context
  if (context === 0) return 0

  const reserved =
    input.cfg.compaction?.reserved ??
    Math.min(COMPACTION_BUFFER, ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
  return input.model.limit.input
    ? Math.max(0, input.model.limit.input - reserved)
    : Math.max(0, context - ProviderTransform.maxOutputTokens(input.model, input.outputTokenMax))
}

export const DEFAULT_LIMIT_TOKENS = 200_000

export function tokenCount(tokens: SessionV1.Assistant["tokens"]) {
  return (
    tokens.total || tokens.input + tokens.output + tokens.cache.read + tokens.cache.write
  )
}

// Providers named `claude-code-*` share the claude-code limit entry.
export function limitProviderKey(providerID: string) {
  return isClaudeCodeProvider(providerID) ? CLAUDE_CODE_PROVIDER_ID : providerID
}

// Per-field precedence: provider entry, then global limit, then defaults. A limit with only
// `providers` enables just the listed providers; a global tokens/action or a bare limit covers all.
export function resolveLimit(cfg: ConfigV1.Info, providerID: string) {
  const limit = cfg.compaction?.limit
  if (!limit) return
  const entry = limit.providers?.[limitProviderKey(providerID)]
  const providerOnly = limit.providers !== undefined && limit.tokens === undefined && limit.action === undefined
  if (providerOnly && !entry) return
  return {
    action: entry?.action ?? limit.action ?? ("compact" as const),
    tokens: entry?.tokens ?? limit.tokens ?? DEFAULT_LIMIT_TOKENS,
  }
}

export function limitAction(cfg: ConfigV1.Info, providerID: string) {
  return resolveLimit(cfg, providerID)?.action
}

/** User-set threshold for every provider, including Claude Code. Hard overflow still uses `isOverflow`. */
export function overLimit(input: {
  cfg: ConfigV1.Info
  tokens: SessionV1.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
}) {
  const limit = resolveLimit(input.cfg, input.model.providerID)
  if (!limit || limit.action === "off") return false
  if (input.model.limit.context === 0) return false
  const cap = usable(input)
  if (cap === 0) return false
  const threshold = Math.min(limit.tokens, cap)
  return tokenCount(input.tokens) >= threshold
}

export function isOverflow(input: {
  cfg: ConfigV1.Info
  tokens: SessionV1.Assistant["tokens"]
  model: Provider.Model
  outputTokenMax?: number
}) {
  if (input.cfg.compaction?.auto === false) return false
  if (input.model.limit.context === 0) return false
  // Claude Code compacts its own conversation; oc only mirrors it.
  if (isClaudeCodeProvider(input.model.providerID)) return false

  return tokenCount(input.tokens) >= usable(input)
}
