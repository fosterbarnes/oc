import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider"
import { generateId } from "ai"
import type { ClaudeCodeConfig } from "./types.js"
import { translateStreamForHost } from "./host-tools.js"
import { getClaudeUserMessage, visibleThreadTokens } from "./message-builder.js"
import { getRuntimeMcpStatus, fetchSessionRunState } from "./runtime-status.js"
import { getActiveProcess, getClaudeSessionId, describeSessionKey, WAKE_PROMPT_TEXT } from "./session-manager.js"
import { log } from "./logger.js"
import { detectCliVersion } from "./cli-version.js"
import { setProxyDeadlineGuard } from "./proxy-deadline.js"
import { findPendingProxyCall, getPendingProxyCalls } from "./proxy-broker.js"
import { hasNewUserContent } from "./call-options.js"
import {
  createLiveToolInfoLoader,
  resolvedProxyTools,
  stripContextRemindersEnabled,
  toolCatalogHash,
} from "./spawn-planning.js"
import { isTitleRequest, synthesizeTitle } from "./title.js"
import { resetStaleSession, resolveTurnContext } from "./turn-context.js"
import { syncClaudeSession } from "./session-sync.js"
import { streamClaudeTurn } from "./turn-stream.js"
import { toFinishReason, toUsage } from "./usage.js"

/**
 * Whether opencode is still serving a proxied call whose deadline just passed.
 * A busy session means a permission prompt is open or the tool is running.
 */
export async function isProxyCallStillServed(callId: string): Promise<boolean> {
  const pending = findPendingProxyCall(callId)
  if (!pending) return false
  const session = describeSessionKey(pending.sessionKey).session
  return (await fetchSessionRunState(session)) === "busy"
}

setProxyDeadlineGuard(({ callId }) => isProxyCallStillServed(callId))

// Claude Code's own `/compact`, sent into the live conversation.
const COMPACT_COMMAND_MESSAGE = JSON.stringify({
  type: "user",
  message: { role: "user", content: [{ type: "text", text: "/compact" }] },
})

export class ClaudeCodeLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3"
  readonly supportedUrls: Record<string, RegExp[]> = {}

  constructor(
    readonly modelId: string,
    private readonly config: ClaudeCodeConfig,
  ) {}

  get provider(): string {
    return this.config.provider
  }

  /**
   * Aggregates `doStream`, so every call takes the one path that wires up
   * proxied tools, compaction, and process reuse.
   */
  async doGenerate(options: LanguageModelV3CallOptions): Promise<Awaited<ReturnType<LanguageModelV3["doGenerate"]>>> {
    const result = await this.doStream(options)
    const reader = result.stream.getReader()
    let text = ""
    let reasoning = ""
    const toolCalls: LanguageModelV3Content[] = []
    let finish: Extract<LanguageModelV3StreamPart, { type: "finish" }> | undefined

    while (true) {
      const next = await reader.read()
      if (next.done) break
      const part = next.value
      if (part.type === "text-delta") text += part.delta
      if (part.type === "reasoning-delta") reasoning += part.delta
      if (part.type === "tool-call") toolCalls.push(part)
      if (part.type === "finish") finish = part
    }

    const providerMetadata = finish?.providerMetadata
    return {
      content: [
        ...(reasoning ? [{ type: "reasoning" as const, text: reasoning }] : []),
        ...(text ? [{ type: "text" as const, text, providerMetadata }] : []),
        ...toolCalls,
      ],
      finishReason: finish?.finishReason ?? toFinishReason("stop"),
      usage: finish?.usage ?? toUsage(),
      request: result.request,
      response: { id: generateId(), timestamp: new Date(), modelId: this.modelId },
      providerMetadata,
      warnings: [],
    }
  }

  /**
   * Tool parts leave in opencode 1.x's vocabulary; on opencode 2.x they are
   * renamed at this one edge (host-tools.ts). On V1 the stream is untouched.
   */
  async doStream(options: LanguageModelV3CallOptions): Promise<Awaited<ReturnType<LanguageModelV3["doStream"]>>> {
    const result = await this.streamForHost(options)
    return {
      ...result,
      stream: translateStreamForHost(result.stream as any, this.config.hostApi ?? "v1") as any,
    }
  }

  private async streamForHost(options: LanguageModelV3CallOptions) {
    const turn = await resolveTurnContext(this.config, this.modelId, options)

    if (isTitleRequest(this.config, turn.scope, options) && !turn.compactionMode) {
      log.info("doStream no-tools title stub", {
        opencodeAgent: turn.agent,
        providerOptionsKeys: Object.keys(options.providerOptions ?? {}),
      })
      return syntheticStream("no-tools", synthesizeTitle(options.prompt))
    }
    // opencode iterates the agent loop once more after a finished turn. With
    // no fresh user input, a spawn would only produce "Standing by".
    if (!hasNewUserContent(options.prompt)) {
      log.info("doStream short-circuit: no new user content")
      return syntheticStream("no-new-user-content")
    }

    // An earlier reply is the evidence of a conversation. Counting messages is not: `opencode
    // session` and plugins add user messages that never get one ("Working directory initialized").
    const hasPriorConversation = options.prompt.some((m) => m.role === "assistant")
    resetStaleSession(turn, hasPriorConversation)
    const hasActiveProcess = !!getActiveProcess(turn.sessionKey)
    // oc's compaction prompt is never sent: Claude Code compacts its own
    // conversation, which needs one to exist.
    if (turn.compactionMode && !hasActiveProcess && !getClaudeSessionId(turn.sessionKey)) {
      return syntheticStream("no-conversation-to-compact", "There is no Claude Code conversation to compact yet.")
    }
    const notice = turn.compactionMode
      ? undefined
      : await syncClaudeSession({
          turn,
          prompt: options.prompt,
          hasPriorConversation,
          abortSignal: options.abortSignal,
        })
    const includeHistoryContext = !getClaudeSessionId(turn.sessionKey) && !hasActiveProcess && hasPriorConversation
    // The catch-up may point at `session_read` only when it is proxied and there is a session to read.
    const canReadSession = turn.affinity !== "default" && !!this.config.proxyOpencodeTools?.includes("session_read")

    // Only ids this CLI process issued may go back as `tool_result` blocks
    // (issue #29), so read them before building the envelope.
    const previousPendingProxyCalls = turn.compactionMode ? [] : getPendingProxyCalls(turn.sessionKey)
    const userMsg = turn.compactionMode
      ? COMPACT_COMMAND_MESSAGE
      : getClaudeUserMessage(
          options.prompt,
          includeHistoryContext ? { sessionID: canReadSession ? turn.affinity : undefined } : undefined,
          {
            cliToolCallIds: new Set(previousPendingProxyCalls.map((c) => c.toolCallId)),
            stripContextReminders: stripContextRemindersEnabled(this.config),
          },
        )
    // A wake prompt whose CLI turn was already taken over by a user message
    // has nothing to attach to; sending it would hand Claude the marker text.
    if (userMsg.includes(WAKE_PROMPT_TEXT) && !getActiveProcess(turn.sessionKey)?.autonomousTurn) {
      log.info("doStream short-circuit: stale wake prompt")
      return syntheticStream("stale-wake")
    }
    const proxyTools = turn.compactionMode || !options.tools?.length ? null : resolvedProxyTools(this.config)

    // One MCP status snapshot per turn, so the hot-reload check and the spawn
    // agree. The CLI version decides which optional flags the spawn may pass.
    const [runtimeStatus, cliVersion] = await Promise.all([
      turn.compactionMode ? undefined : getRuntimeMcpStatus(),
      detectCliVersion(this.config.cliPath),
    ])

    log.info("doStream starting", {
      cwd: turn.cwd,
      model: turn.effectiveModelId,
      textLength: userMsg.length,
      includeHistoryContext,
      hasActiveProcess,
      reasoningEffort: turn.reasoningEffort,
      proxyTools: proxyTools?.map((t) => t.name) ?? null,
      compactionMode: turn.compactionMode,
      scope: turn.scope,
      opencodeAgent: turn.agent,
      providerOptionsKeys: Object.keys(options.providerOptions ?? {}),
    })

    const stream = streamClaudeTurn({
      config: this.config,
      turn,
      options,
      userMsg,
      visibleTokens: visibleThreadTokens(options.prompt),
      previousPendingProxyCalls,
      catalogHash: toolCatalogHash(this.config, options.tools),
      runtimeStatus,
      cliVersion,
      proxyTools,
      loadLiveToolInfo: createLiveToolInfoLoader(this.config, this.modelId),
      notice,
    })
    return { stream, request: { body: { text: userMsg } }, response: { headers: {} } }
  }
}

/** A finished turn that never reached `claude`: the title stub, or an idle loop iteration. */
function syntheticStream(path: string, text?: string) {
  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] })
      if (text !== undefined) {
        const id = generateId()
        controller.enqueue({ type: "text-start", id })
        controller.enqueue({ type: "text-delta", id, delta: text })
        controller.enqueue({ type: "text-end", id })
      }
      controller.enqueue({
        type: "finish",
        finishReason: toFinishReason("stop"),
        usage: toUsage({ input_tokens: 0, output_tokens: 0 }) satisfies LanguageModelV3Usage,
        providerMetadata: { "claude-code": { synthetic: true, path } },
      })
      controller.close()
    },
  })
  return { stream, request: { body: { text: "" } } }
}
