/**
 * Turn identity: everything about a `doStream` call that decides which
 * `claude` process serves it. Resolved once per call, before any spawn work.
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { ClaudeCodeConfig, ReasoningEffort } from "./types.js"
import { resolveAgentEffort, resolveAgentModel } from "./agentModels.js"
import {
  hasExplicitModel,
  resolveOpencodeAgent,
  resolveOpencodeAgentPrompt,
  resolveSessionAffinity,
} from "./callOptions.js"
import { resolveSpawnCwdForSession } from "./runtimeStatus.js"
import { deleteActiveProcess, deleteClaudeSessionId, sessionKey } from "./sessionManager.js"
import { requestScope, isNamingAgent } from "./title.js"

export type TurnContext = Awaited<ReturnType<typeof resolveTurnContext>>

const REASONING_EFFORTS: ReasoningEffort[] = ["minimal", "low", "medium", "high", "xhigh", "max"]

export async function resolveTurnContext(
  config: ClaudeCodeConfig,
  modelId: string,
  options: LanguageModelV3CallOptions,
) {
  const scope = requestScope(options)
  const affinity = resolveSessionAffinity(options.providerOptions, config.provider)
  const cwd = await resolveSpawnCwdForSession(config.cwd, affinity)
  const agent = resolveOpencodeAgent(options.providerOptions, config.provider)
  // An oc compaction runs Claude Code's own `/compact` inside the live conversation.
  const compactionMode = agent === "compaction"
  // A tool-less turn still continues the chat conversation unless it only
  // names text (title stubs never spawn): e.g. a context-limit handoff
  // summary runs denied under the session agent and must reach the live
  // conversation, not a fresh key that stalls waiting for operator
  // confirmation.
  const continuesChat = scope === "tools" || (agent !== undefined && !isNamingAgent(agent))
  // An agent may run on a different model than the one opencode routed here
  // (see agentModels.ts), so the spawn uses the effective model. A turn that
  // names its model explicitly (`task` with `model`) keeps it.
  const effectiveModelId = hasExplicitModel(options.providerOptions, config.provider)
    ? modelId
    : resolveAgentModel(agent, modelId)
  const reasoningEffort = compactionMode
    ? undefined
    : (resolveAgentEffort(agent, readReasoningEffort(options.providerOptions, config.provider)) as
        | ReasoningEffort
        | undefined)
  return {
    scope,
    affinity,
    cwd,
    agent,
    // oc's own model and variant names, for a wake prompt (sessionManager.ts).
    modelId,
    variant: readReasoningEffort(options.providerOptions, config.provider),
    agentPrompt: resolveOpencodeAgentPrompt(options.providerOptions, config.provider),
    compactionMode,
    effectiveModelId,
    reasoningEffort,
    // One Claude conversation per opencode session and provider (a provider
    // is an account, and a transcript cannot resume across accounts). Model,
    // agent and effort are process settings: changing them respawns the
    // process on the same conversation. oc sends compaction without tools,
    // yet it must reach the chat's own conversation, not the tool-less one.
    sessionKey: sessionKey(
      cwd,
      `${compactionMode || continuesChat ? "tools" : scope}::${affinity}::context=${JSON.stringify([config.provider])}`,
    ),
    processSettings: JSON.stringify([effectiveModelId, agent ?? null, reasoningEffort ?? null]),
  }
}

/**
 * Drop the Claude conversation when opencode starts a new one. An opencode
 * compaction never resets it: Claude Code compacts its own transcript.
 *
 * Do not drop the Claude session because the prior user text changed.
 * OpenCode rewrites earlier turns between calls; treating that as a new
 * conversation killed the process and lost `--resume`.
 */
export function resetStaleSession(turn: TurnContext, hasPriorConversation: boolean) {
  if (hasPriorConversation || turn.compactionMode) return
  deleteClaudeSessionId(turn.sessionKey)
  deleteActiveProcess(turn.sessionKey)
}

function readReasoningEffort(
  providerOptions: LanguageModelV3CallOptions["providerOptions"],
  providerKey: string,
): ReasoningEffort | undefined {
  const effort = (providerOptions?.[providerKey] ?? providerOptions?.["claude-code"])?.reasoningEffort
  return REASONING_EFFORTS.find((value) => value === effort)
}
