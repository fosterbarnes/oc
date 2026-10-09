// Host-set call options. oc writes them in session/llm/request.ts; the language model reads them in call-options.ts.
import type { SessionV1 } from "@opencode-ai/core/v1/session"

export const CLAUDE_CODE_PROVIDER_ID = "claude-code"
export const CLAUDE_CODE_SESSION_OPTION = "opencodeSessionID"
export const CLAUDE_CODE_AGENT_OPTION = "opencodeAgent"
export const CLAUDE_CODE_COMMAND_PERMISSION_OPTION = "opencodeCommandPermission"
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

// Account providers expand to `claude-code-<account>`.
export function isClaudeCodeProvider(providerID: string) {
  return providerID === CLAUDE_CODE_PROVIDER_ID || providerID.startsWith(`${CLAUDE_CODE_PROVIDER_ID}-`)
}
