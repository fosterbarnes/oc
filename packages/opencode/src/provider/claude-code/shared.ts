// Host-set call options. oc writes them in session/llm/request.ts; the language model reads them in call-options.ts.
export { COMPACTION_BOUNDARY_OPTION } from "../cursor/shared.js"

export const CLAUDE_CODE_PROVIDER_ID = "claude-code"
export const CLAUDE_CODE_SESSION_OPTION = "opencodeSessionID"
export const CLAUDE_CODE_AGENT_OPTION = "opencodeAgent"

// `denied` holds oc's permission or question rejection: the provider ends the turn and passes it on as
// the tool error, so the processor marks the turn blocked.
export type HostToolResult = { output: string; title?: string; metadata?: Record<string, unknown>; denied?: unknown }
export type HostToolExecutor = (name: string, input: Record<string, unknown>, callID: string) => Promise<HostToolResult>

// oc session id -> its current turn's bound tools. Set by session/llm.ts per stream, so the provider
// runs proxied calls in-stream with full oc tool context. One active turn per session, so overwrite is safe.
// ponytail: entries outlive their session until reused; add eviction if session churn ever matters.
export const hostToolExecutors = new Map<string, HostToolExecutor>()

// Account providers expand to `claude-code-<account>`.
export function isClaudeCodeProvider(providerID: string) {
  return providerID === CLAUDE_CODE_PROVIDER_ID || providerID.startsWith(`${CLAUDE_CODE_PROVIDER_ID}-`)
}
