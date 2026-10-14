// Host-set call options. oc writes them in session/llm/request.ts; the language model reads them in callOptions.ts.
import type { SessionV1 } from "@opencode-ai/core/v1/session"

export const CLAUDE_CODE_PROVIDER_ID = "claude-code"
export const CLAUDE_CODE_SESSION_OPTION = "opencodeSessionID"
export const CLAUDE_CODE_AGENT_OPTION = "opencodeAgent"
export const CLAUDE_CODE_COMMAND_PERMISSION_OPTION = "opencodeCommandPermission"
// Set when the turn's user message names its model explicitly; agent model overrides then keep it.
export const CLAUDE_CODE_EXPLICIT_MODEL_OPTION = "opencodeExplicitModel"
// The agent's own prompt (custom agent prompt, or the `instructionsByModel` base). The only oc
// system text Claude Code gets; its own prompt, CLAUDE.md and AGENTS.md cover the rest.
export const CLAUDE_CODE_AGENT_PROMPT_OPTION = "opencodeAgentPrompt"

// `denied` holds oc's permission or question rejection: the provider ends the turn and passes it on as
// the tool error, so the processor marks the turn blocked.
export type HostToolResult = {
  output: string
  title?: string
  metadata?: Record<string, unknown>
  attachments?: SessionV1.FilePart[]
  denied?: unknown
}
export type HostToolExecutor = (
  name: string,
  input: Record<string, unknown>,
  callID: string,
  signal?: AbortSignal,
) => Promise<HostToolResult>

// oc session id -> its current turn's bound tools. Set by session/llm.ts per stream, so the provider
// runs proxied calls in-stream with full oc tool context. One active turn per session, so overwrite is safe.
export const hostToolExecutors = new Map<string, HostToolExecutor>()

// A user message sent while a Claude turn runs. A failed receipt save ends the turn.
export type ClaudeSteer = {
  messageID: string
  text: string
  modelID: string
  agent: string
  delivered: () => Promise<void>
}
export type ClaudeSteerSink = {
  // False when the turn cannot take it; the message then waits for oc's next step as usual.
  steer: (steer: ClaudeSteer) => boolean
  // Takes back an admitted, held steer only. Unknown or written IDs return false.
  retract: (messageID: string, remove: () => Promise<void>) => Promise<boolean>
}
// oc session id -> its running Claude turn's intake for such messages. Set by turnStream.ts, used by
// session/prompt.ts (steer) and the delete-message route (retract).
export const claudeSteerSinks = new Map<string, ClaudeSteerSink>()

// Text-part metadata key set once Claude read a steered message; oc's loop then counts it as answered.
export const STEERED_METADATA_KEY = "steered"

// The `claude-code-*` arm matches nothing this plugin creates anymore (the
// per-account providers are gone; the pool selects CLAUDE_CONFIG_DIR at spawn).
// It stays so a stray suffixed id still routes to the Claude path instead of
// falling through to generic handling.
export function isClaudeCodeProvider(providerID: string) {
  return providerID === CLAUDE_CODE_PROVIDER_ID || providerID.startsWith(`${CLAUDE_CODE_PROVIDER_ID}-`)
}
