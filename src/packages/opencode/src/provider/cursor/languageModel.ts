import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamResult,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  LanguageModelV3FinishReason,
} from "@ai-sdk/provider"
import type { CreateCursorOptions } from "./index.js"
import { bidiRunStream, normalizeAgentRunOrigin } from "./transport/connect.js"
import { trace } from "./debug.js"
import { buildRunRequest, buildHeartbeat } from "./protocol/request.js"
import { encodeMessage } from "./protocol/messages.js"
import { buildCustomWebToolAliases } from "./protocol/descriptors.js"
import { extractHostSubagentCatalog } from "./protocol/subagents.js"
import { setActiveCursorMode, takeActiveCursorModeReminder } from "./protocol/switchMode.js"
import {
  flushPlanExecutionKickoff,
  planExecutionKickoffState,
  takePlanExecutionKickoffWarning,
} from "./planExecutionKickoff.js"
import { clearCheckpoint, getCheckpoint } from "./protocol/checkpoint.js"
import { decodeConversationTokenDetails } from "./protocol/tokenDetails.js"
import {
  clearConversationBlobs,
  inspectConversationBlobGraph,
  type ConversationBlobGraphStats,
} from "./protocol/blobStore.js"
import {
  bindConversationId,
  isActiveConversationBinding,
  resolveConversationGroupId,
} from "./protocol/conversationBind.js"
import { clearPersistedConversationState, hydrateConversationState } from "./protocol/conversationState.js"
import { initializeConversationPersistence } from "./protocol/conversationPersistence.js"
import { resolveContinuationPolicy, sessionManager, type CursorSession } from "./session.js"
import {
  CursorProtocolError,
  CursorProviderError,
  CursorRetryExhaustedError,
  retrySuppressedError,
  toCursorProviderError,
} from "./errors.js"
import {
  readCache,
  cacheFilePath,
  resolveVariantParameters,
  resolveVariantMaxMode,
  extractCursorVariantParameters,
  resolveCursorWireModelId,
  CURSOR_MAX_MODE_KEY,
  type ModelInfo,
} from "./models.js"
import { getOrBuildRequestContext } from "./context/frozen.js"
import { opencodeGlobalCacheDir, setHostCacheDirOverride } from "./context/paths.js"
import { invalidateAgentUrl, resolveAgentUrl } from "./agentUrl.js"
import { COMPACTION_BOUNDARY_OPTION, CURSOR_API_HOST } from "./shared.js"
import { getSessionDirectory } from "./sessionDirectory.js"
import { assertCursorUserImageSupport, extractCursorPromptImages } from "./imageInput.js"
import { resolveCursorModelSupportsImages } from "./modelMetadata.js"
import { ensureCursorProxy } from "./runtime.js"
import { estimateTokens } from "./usage.js"
import { deliverContinuationResults, findContinuationSession } from "./continuation.js"
import {
  buildOpenCodeInteractionGuidance,
  extractPromptHistory,
  extractSystemPrompt,
  extractToolResults,
  extractTools,
  extractTrailingToolResults,
  extractUserText,
  opencodeSessionKey,
} from "./prompt.js"
import {
  DEFAULT_RETRY_POLICY,
  resolveRetryPolicy,
  retryDelayMs,
  sleepForRetry,
  type CursorRetryPolicy,
} from "./retry.js"
import { writeWithBackpressure } from "./streamWrite.js"
import { pump } from "./pump.js"
import {
  hasPostCompactionRebase,
  isCursorCompactionTurn,
  rememberPostCompactionRebase,
  rememberSentHistoryImageHashes,
  resolveTurnConversationReset,
  resolveTurnToolState,
  restoreTurnToolCatalog,
  sentHistoryImageHashes,
  snapshotToolCatalog,
} from "./turnState.js"

let _availableModels: ModelInfo[] | undefined
// mtime of the cache file the last time we loaded it. Compared on each call
// so discoverModels' background refresh is picked up without a process restart.
let _availableModelsMtimeMs = -1

/** Cursor's own conversation export path treats state above 100 MiB as large. */
export const MAX_CHECKPOINT_BLOB_GRAPH_BYTES = 100 * 1024 * 1024

export function checkpointBlobGraphRequiresRebase(
  stats: ConversationBlobGraphStats,
  maxBytes = MAX_CHECKPOINT_BLOB_GRAPH_BYTES,
): boolean {
  return !stats.complete || stats.bytes > maxBytes
}

type V3Part = LanguageModelV3StreamPart

export function createCursorLanguageModel(
  modelId: string,
  providerId: string,
  options: CreateCursorOptions,
): LanguageModelV3 {
  // Host Path.cache / explicit override wins over XDG heuristics for this process.
  if (options.cacheDir) setHostCacheDirOverride(options.cacheDir)
  // Start loading and pruning restart state as soon as the provider is built.
  // startSession awaits this same per-cache-root initialization before binding.
  void initializeConversationPersistence(opencodeGlobalCacheDir()).catch((error) => {
    trace(`conversation persistence: startup load failed: ${String(error)}`)
  })
  return {
    specificationVersion: "v3",
    provider: providerId,
    modelId,
    supportedUrls: {},

    async doStream(callOptions: LanguageModelV3CallOptions): Promise<LanguageModelV3StreamResult> {
      return doStreamImpl(modelId, options, callOptions)
    },

    async doGenerate(callOptions: LanguageModelV3CallOptions): Promise<LanguageModelV3GenerateResult> {
      const result = await doStreamImpl(modelId, options, callOptions)
      const parts: V3Part[] = []
      const reader = result.stream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parts.push(value)
      }
      return foldStreamParts(parts)
    },
  }
}

async function doStreamImpl(
  modelId: string,
  options: CreateCursorOptions,
  callOptions: LanguageModelV3CallOptions,
): Promise<LanguageModelV3StreamResult> {
  // A raw `crsr_...` API key must be exchanged for a JWT before it can be used
  // as a Bearer token (the plugin path does this in auth.ts). The accessToken
  // path is already a JWT from OAuth/key-exchange, so we use it as-is.
  // resolveBearerToken caches apiKey exchanges so we don't hit /auth/exchange
  // on every turn.
  const { resolveBearerToken } = await import("./auth.js")
  const token = await resolveBearerToken({
    accessToken: options.accessToken,
    apiKey: options.apiKey,
    baseUrl: resolveApiBaseURL(options),
  })

  const prompt = callOptions.prompt
  const retryPolicy = resolveRetryPolicy(options.retry)
  // pumpWithRecovery owns the complete per-turn attempt budget.  Opening a
  // replacement session here must be a single attempt; otherwise setup retry
  // loops nest inside recovery and `maxAttempts` no longer caps total Runs.
  const openSession = (startOptions?: { recovery?: CursorRunRecovery }) =>
    startSession(modelId, token, callOptions, options, startOptions)

  // -- Continuation vs fresh turn --
  // OpenCode embeds *all* historical tool results in every prompt. Only the
  // trailing tool-message suffix (after the last assistant/user message) is a
  // live continuation. Treating mid-prompt history as continuation caused
  // false "orphaned tool results" errors after Cursor turn_ended and OpenCode
  // started the next step with old tools still in the prompt body.
  const trailingToolResults = extractTrailingToolResults(prompt)
  let session = findContinuationSession(trailingToolResults)

  if (session) {
    // Write pending results onto the held-open Run. A dead stream closes the
    // session and returns undefined so we fall through to history rebase
    // instead of pumping a connection that can no longer accept writes.
    session = deliverContinuationResults(session, trailingToolResults)
  }

  if (!session) {
    if (trailingToolResults.length > 0) {
      // True continuation (prompt ends with tool results) but the held-open Run
      // is gone (or its write path just failed). Rebase the complete OpenCode
      // prompt onto a fresh conversation: its seed history includes the
      // completed tool result, so no result or advertised tool is lost and
      // Cursor can continue instead of deadlocking.
      const ids = trailingToolResults.map((r) => `${r.sessionId}:${r.execId}`).join(",")
      trace(
        `continuation: ${trailingToolResults.length} interrupted trailing tool result(s) [${ids}] - rebasing fresh Run`,
      )
      session = await openSession({ recovery: { kind: "rebase" } })
    } else {
      // Fresh turn (prompt ends with user/assistant text). Historical tool
      // results may exist mid-prompt; they are not live exec replies.
      const historical = extractToolResults(prompt).length
      if (historical > 0) {
        trace(`fresh turn: ignoring ${historical} historical tool result(s) (not trailing)`)
      }
      session = await openSession()
    }
  }

  let activeSession = session

  return {
    stream: new ReadableStream<V3Part>({
      async pull(controller) {
        // The outer try is a safety net for any throw that escapes pump()  - 
        // e.g. an unhandled decode/gunzip error or a frames-iterator throw on
        // a non-200 HTTP/2 response. Without it the pull promise rejects, the
        // ReadableStream errors, and the session is never cleaned up.
        try {
          try {
            controller.enqueue({ type: "stream-start", warnings: [] } as V3Part)
          } catch (e) {
            // Controller already cancelled by the consumer - stop pumping.
            trace(`pull: stream-start enqueue failed (cancelled) err=${(e as Error).message}`)
            sessionManager.closeUnlessPending(activeSession)
            return
          }
          activeSession = await pumpWithRecovery({
            initialSession: activeSession,
            controller,
            abortSignal: callOptions.abortSignal,
            retryPolicy,
            recover: (recovery) => openSession({ recovery }),
            onSession: (next) => {
              activeSession = next
            },
            onRetryableFailure: () => {
              invalidateAgentUrl(token, {
                apiBaseURL: resolveApiBaseURL(options),
                telemetryEnabled: resolveTelemetryEnabled(options),
              })
            },
          })
          try {
            controller.close()
          } catch (e) {
            trace(`pull: close failed (already closed/cancelled) err=${(e as Error).message}`)
          }
          // pumpWithRecovery has returned only after the Run reached terminal
          // turn_ended and endPump cleared ownership. This is the first safe
          // point to start a second OpenCode generation. A failed prior handoff
          // is retried only because this explicit new provider turn reached its
          // own terminal boundary - never from a timer or tight loop.
          const kickoff = await flushPlanExecutionKickoff(activeSession.openCodeSessionId, {
            cursorSessionID: activeSession.sessionId,
            terminal: activeSession.closed,
            pumpActive: activeSession.pumpActive || activeSession.pumpOwner != null,
            pendingExecs: activeSession.pending.size,
          })
          if (!kickoff) {
            const state = planExecutionKickoffState(activeSession.openCodeSessionId)
            if (state?.status === "failed") {
              setActiveCursorMode(activeSession.openCodeSessionId, "plan")
            }
          }
        } catch (e) {
          activeSession.pumpActive = false
          trace(`pull: pump threw (cleaning up): ${(e as Error).message}`)
          sessionManager.close(activeSession)
          try {
            controller.error(e instanceof Error ? e : new Error(String(e)))
          } catch {
            /* controller already errored/closed */
          }
        }
      },
      cancel() {
        // OpenCode cancels the ReadableStream after "tool-calls"; keep the
        // Cursor Run stream alive so the next doStream can write results.
        trace("ReadableStream cancel() -> closeUnlessPending")
        sessionManager.closeUnlessPending(activeSession)
      },
    }),
  }
}

export async function pumpWithRecovery(input: {
  initialSession: CursorSession
  controller: ReadableStreamDefaultController<V3Part>
  abortSignal?: AbortSignal
  retryPolicy?: CursorRetryPolicy
  recover: (recovery: CursorRunRecovery) => Promise<CursorSession>
  onSession?: (session: CursorSession) => void
  maxRecoveries?: number
  onRetryableFailure?: (failure: CursorProviderError) => void
}): Promise<CursorSession> {
  let session = input.initialSession
  const retryPolicy = input.retryPolicy ?? {
    ...DEFAULT_RETRY_POLICY,
    maxAttempts: (input.maxRecoveries ?? 1) + 1,
  }
  const maxRecoveries = retryPolicy.maxAttempts - 1
  input.onSession?.(session)

  for (let attempt = 0; ; attempt++) {
    const pumpedSession = session
    const pumpOwner = Symbol("cursor-pump")
    sessionManager.beginPump(pumpedSession, pumpOwner)
    try {
      await pump(
        pumpedSession,
        input.controller,
        {
          textId: crypto.randomUUID(),
          reasoningId: crypto.randomUUID(),
        },
        input.abortSignal,
      )
      return session
    } catch (error) {
      const failure = toCursorProviderError(error, {
        replaySafe: error instanceof CursorProviderError ? error.replaySafe : false,
        fallback: "Cursor Run interrupted",
      })
      if (!failure.transient) throw failure
      const checkpoint = pumpedSession.resumeCheckpoint
      if (!failure.replaySafe && !checkpoint) {
        throw retrySuppressedError(
          failure,
          "after visible output or stateful server activity",
          attempt + 1,
          maxRecoveries + 1,
        )
      }
      if (attempt >= maxRecoveries) {
        throw new CursorRetryExhaustedError(attempt + 1, failure)
      }
      trace(
        `Run interrupted: sessionId=${pumpedSession.sessionId} attempt=${attempt + 1}/${maxRecoveries} ` +
          `err=${failure.message} - ${checkpoint ? `resuming ${checkpoint.length}B checkpoint` : "rebasing fresh Run"}`,
      )
      sessionManager.close(pumpedSession, "remote-error", failure)
      if (failure.transient && (failure.origin === "transport" || failure.origin === "server")) {
        try {
          input.onRetryableFailure?.(failure)
        } catch {
          /* observer must not break retry */
        }
      }
      const delayMs = retryDelayMs(failure, attempt + 1, retryPolicy)
      trace(`Run retry backoff: attempt=${attempt + 1}/${maxRecoveries} delayMs=${delayMs}`)
      await sleepForRetry(delayMs, input.abortSignal)
      const recovery: CursorRunRecovery = checkpoint
        ? {
            kind: "resume",
            conversationId: pumpedSession.conversationId,
            checkpoint: Uint8Array.from(checkpoint),
          }
        : { kind: "rebase" }
      session = await input.recover(recovery)
      if (recovery.kind === "resume") {
        session.usageEstimate = { ...pumpedSession.usageEstimate }
        session.editToolCalls = new Map(pumpedSession.editToolCalls)
      }
      input.onSession?.(session)
    } finally {
      sessionManager.endPump(pumpedSession, pumpOwner)
    }
  }
}

export type CursorRunRecovery = { kind: "rebase" } | { kind: "resume"; conversationId: string; checkpoint: Uint8Array }

async function startSession(
  modelId: string,
  token: string,
  callOptions: LanguageModelV3CallOptions,
  options: CreateCursorOptions,
  startOptions?: { recovery?: CursorRunRecovery },
): Promise<CursorSession> {
  const continuationPolicy = resolveContinuationPolicy(options.continuation)
  const prompt = callOptions.prompt
  const incomingTools = extractTools(callOptions)
  const sessionKey = opencodeSessionKey(callOptions)
  const cacheDir = opencodeGlobalCacheDir()
  if (sessionKey) {
    const restored = await hydrateConversationState(cacheDir, sessionKey).catch((error) => {
      trace(`conversation persistence: restore failed sessionKey=${sessionKey}: ${String(error)}`)
      return undefined
    })
    if (restored?.postCompactionRebase) rememberPostCompactionRebase(sessionKey)
    if (restored?.toolCatalog.length) restoreTurnToolCatalog(sessionKey, restored.toolCatalog)
  }
  const providerOptions = callOptions.providerOptions?.cursor as Record<string, unknown> | undefined
  // Host LLMRequestPrep sets opencodeCompaction for cursor agent="compaction".
  // Classic chat.params writes the same key. Do not infer from tools/toolChoice:
  // title and other lifecycle Runs are valid no-tool calls.
  const isCompaction = isCursorCompactionTurn(callOptions.providerOptions)
  const toolState = await resolveTurnToolState({
    sessionKey,
    incomingTools,
    toolChoice: callOptions.toolChoice,
    isCompaction,
    abortSignal: callOptions.abortSignal,
  })
  const tools = toolState.advertisedTools
  const webToolAliases = buildCustomWebToolAliases(tools)
  const cursorTools = webToolAliases.advertisedTools
  for (const [alias, candidates] of webToolAliases.ambiguous) {
    trace(`web tool alias skipped: alias=${alias} ambiguous=[${candidates.join(",")}]`)
  }
  for (const [alias, original] of webToolAliases.aliases) {
    trace(`web tool alias: ${alias} -> ${original}`)
  }
  const allowTools = toolState.allowTools
  const discoveredSubagentCatalog = extractHostSubagentCatalog(cursorTools)
  const boundary =
    callOptions.providerOptions?.[COMPACTION_BOUNDARY_OPTION] ?? providerOptions?.[COMPACTION_BOUNDARY_OPTION]
  const resetState = resolveTurnConversationReset({
    sessionKey,
    isCompaction,
    allowTools,
    boundary: typeof boundary === "string" ? boundary : undefined,
  })
  let recovery = startOptions?.recovery
  let resumeRecovery = recovery?.kind === "resume" ? recovery : undefined
  let resuming = !!resumeRecovery
  // Compaction must not reuse the prior conversation; its first normal turn
  // must also rebase so the summary-agent checkpoint cannot replace the normal
  // system prompt and OpenCode's newly compacted history.
  const lifecycle = !allowTools && !isCompaction && !recovery
  let bound = resuming
    ? { conversationId: resumeRecovery!.conversationId, reset: false, previousId: undefined }
    : bindConversationId(sessionKey, {
        reset: resetState.reset || recovery?.kind === "rebase",
        ephemeral: lifecycle,
      })
  let conversationState = lifecycle
    ? undefined
    : resuming
      ? resumeRecovery!.checkpoint
      : bound.reset
        ? undefined
        : getCheckpoint(bound.conversationId)
  let checkpointGraph: ConversationBlobGraphStats = conversationState
    ? inspectConversationBlobGraph(bound.conversationId, conversationState)
    : { count: 0, bytes: 0, complete: true }
  let forcedResetReason: string | undefined
  if (conversationState && checkpointBlobGraphRequiresRebase(checkpointGraph)) {
    const previousConversationId = bound.conversationId
    forcedResetReason = checkpointGraph.complete ? "oversized-checkpoint-graph" : "incomplete-checkpoint-graph"
    trace(
      `checkpoint state rejected: reason=${forcedResetReason} ` +
        `conversationId=${previousConversationId} checkpointBytes=${conversationState.length} ` +
        `blobCount=${checkpointGraph.count} blobBytes=${checkpointGraph.bytes} ` +
        `limitBytes=${MAX_CHECKPOINT_BLOB_GRAPH_BYTES} ` +
        `detail=${checkpointGraph.fallbackReason ?? "-"} action=rebase`,
    )
    // A recovery resume must become a history rebase so the interrupted user
    // request remains in the seed. An ordinary turn keeps its normal user text.
    if (recovery?.kind === "resume") recovery = { kind: "rebase" }
    resumeRecovery = undefined
    resuming = false
    if (!sessionKey) {
      clearCheckpoint(previousConversationId)
      clearConversationBlobs(previousConversationId)
    }
    bound = bindConversationId(sessionKey, { reset: true })
    conversationState = undefined
    checkpointGraph = { count: 0, bytes: 0, complete: true }
  }
  const conversationId = bound.conversationId
  const conversationGroupId = resolveConversationGroupId(sessionKey, conversationId)
  if (bound.reset) {
    if (sessionKey) {
      await clearPersistedConversationState(cacheDir, sessionKey, bound.previousId).catch((error) => {
        trace(`conversation persistence: reset cleanup failed sessionKey=${sessionKey}: ${String(error)}`)
      })
    }
    trace(
      `conversation reset: reason=${forcedResetReason ?? (recovery?.kind === "rebase" ? "interrupted-run" : (resetState.reason ?? "unknown"))} ` +
        `sessionKey=${sessionKey ?? "(none)"} ` +
        `previousId=${bound.previousId ?? "-"} -> conversationId=${conversationId}`,
    )
  }

  const lastUser = [...prompt].reverse().find((message) => message.role === "user")
  const userText =
    recovery?.kind === "rebase"
      ? "Continue the interrupted turn from the conversation history above. Do not repeat completed work."
      : extractUserText(lastUser) || "."
  // v1 sets `options.workspaceRoot` correctly per invocation (`input.directory`,
  // one plugin instance per project). OpenCode 2.0 runs one daemon across many
  // projects, so its static `options.workspaceRoot` is only a last-resort
  // fallback; `getSessionDirectory` carries the real per-session directory
  // recorded from `session.hook("context")` in `plugin-opencode2.ts`.
  const workspaceRoot = path.resolve(getSessionDirectory(sessionKey) ?? (options.workspaceRoot || process.cwd()))
  const baseSystemPrompt = extractSystemPrompt(prompt)
  const interactionGuidance = buildOpenCodeInteractionGuidance(cursorTools, isCompaction, workspaceRoot)
  // After an approved SwitchMode, inject the Cursor CLI-shaped mode reminder
  // (same <system_reminder> contract the CLI uses after flipping unifiedMode).
  const startedWithCheckpoint = !!conversationState
  const modeReminder =
    isCompaction || startedWithCheckpoint || lifecycle
      ? undefined
      : takeActiveCursorModeReminder(sessionKey, {
          advertisedTools: cursorTools.map((tool) => tool.name),
        })
  const kickoffWarning =
    isCompaction || startedWithCheckpoint || lifecycle ? undefined : takePlanExecutionKickoffWarning(sessionKey)
  const systemPrompt = [
    baseSystemPrompt,
    interactionGuidance,
    modeReminder,
    kickoffWarning ? `<system_reminder>${kickoffWarning}</system_reminder>` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
  const history = extractPromptHistory(prompt, {
    preserveTrailingUser: recovery?.kind === "rebase",
    toolResults: isCompaction ? "all" : recovery?.kind === "rebase" ? "trailing" : "omit",
  })

  await loadAvailableModels()

  // Resolve the region-specific Run stream origin once per process (memoized
  // in agentUrl.ts). Explicit agent host overrides skip GetServerConfig but
  // still go through the Cursor agent-host allowlist.
  const agentBaseUrl =
    resolveExplicitAgentBaseURL(options) ??
    (await resolveAgentUrl(token, {
      apiBaseURL: resolveApiBaseURL(options),
      telemetryEnabled: resolveTelemetryEnabled(options),
    }))

  // OpenCode merges model, agent, and selected-variant options before placing
  // them under providerOptions.cursor. Read only the plugin's dedicated nested
  // payload so unrelated options never become requested_model.parameters.
  const picked = extractCursorVariantParameters(providerOptions)
  const cursorModelId = resolveCursorWireModelId(providerOptions, modelId)
  const reasoningEffort =
    typeof providerOptions?.reasoningEffort === "string" ? providerOptions.reasoningEffort : undefined
  const hintMaxMode = !!(providerOptions?.maxMode ?? false)

  const modelInfo = _availableModels?.find((m) => m.id === cursorModelId)
  const supportsImages = resolveCursorModelSupportsImages(cursorModelId, modelInfo?.supportsImages)
  if (!resuming) {
    assertCursorUserImageSupport(
      lastUser as unknown as Record<string, unknown> | undefined,
      supportsImages,
      cursorModelId,
    )
  }
  const imageExtraction = resuming
    ? { images: [], hashes: [], candidateCount: 0, duplicateCount: 0, userImageCount: 0 }
    : await extractCursorPromptImages(
        prompt as readonly unknown[],
        lastUser as unknown as Record<string, unknown> | undefined,
        {
          supportsImages,
          // Content hashes are retained for the OpenCode session so growing
          // history does not re-upload old screenshots. A recovery rebase opens
          // a new Cursor conversation, so it must resend the same payload.
          seenHistoryHashes: recovery?.kind === "rebase" ? undefined : sentHistoryImageHashes(sessionKey),
          signal: callOptions.abortSignal,
        },
      )
  if (!supportsImages && imageExtraction.candidateCount > 0) {
    trace(
      `image input: dropped ${imageExtraction.candidateCount} tool/assistant history image(s); ` +
        `model=${cursorModelId} does not support images`,
    )
  }
  if (imageExtraction.duplicateCount > 0) {
    trace(`image input: skipped ${imageExtraction.duplicateCount} previously sent history image(s)`)
  }
  const images = imageExtraction.images
  const parameterValues = resolveVariantParameters(modelInfo, {
    reasoningEffort,
    maxMode: hintMaxMode,
    picked,
  })
  // Wire max_mode from the selected Cursor variant, else the menu entry's own flag.
  const entryMaxMode = providerOptions?.[CURSOR_MAX_MODE_KEY]
  const maxMode = resolveVariantMaxMode(parameterValues, {
    model: modelInfo,
    picked,
    entryMaxMode: typeof entryMaxMode === "boolean" ? entryMaxMode : undefined,
    maxMode: hintMaxMode,
  })

  // Do NOT pass callOptions.abortSignal into the h2 Run stream. OpenCode aborts
  // that signal when a turn ends with tool-calls; the Cursor stream must stay
  // open until we write the exec results on the next doStream.
  await ensureCursorProxy()
  let stream: Awaited<ReturnType<typeof bidiRunStream>>
  try {
    stream = await bidiRunStream(token, {
      baseURL: agentBaseUrl,
      headers: options.headers,
    })
  } catch (cause) {
    const failure = toCursorProviderError(cause, {
      replaySafe: false,
      fallback: "Cursor Run stream failed",
    })
    if (failure.transient && (failure.origin === "transport" || failure.origin === "server")) {
      invalidateAgentUrl(token, {
        apiBaseURL: resolveApiBaseURL(options),
        telemetryEnabled: resolveTelemetryEnabled(options),
      })
    }
    throw cause
  }
  // Freeze RequestContext per conversation_id (CLI parity). Rebuilding every
  // Run mutates volatile slices (git porcelain, layout) and breaks prompt cache.
  const { context: requestContext, reused: requestContextReused } = await getOrBuildRequestContext(conversationId, {
    workspaceRoot,
    tools: cursorTools,
  })
  const contextSubagents = Array.isArray(requestContext.custom_subagents)
    ? requestContext.custom_subagents
        .map((agent) =>
          agent && typeof agent === "object" && typeof (agent as Record<string, unknown>).name === "string"
            ? {
                name: (agent as Record<string, unknown>).name as string,
                description:
                  typeof (agent as Record<string, unknown>).description === "string"
                    ? ((agent as Record<string, unknown>).description as string)
                    : undefined,
              }
            : undefined,
        )
        .filter((agent): agent is { name: string; description: string | undefined } => !!agent)
    : []
  const subagentCatalog = {
    ...discoveredSubagentCatalog,
    agents: [
      ...new Map(
        [...discoveredSubagentCatalog.agents, ...contextSubagents].map((agent) => [agent.name, agent]),
      ).values(),
    ],
  }
  // Resolve descriptors once from the merged OpenCode config so MCP identity is
  // consistent across AgentRunRequest and both request_context reply paths.
  const toolDescriptors = Array.isArray(requestContext.tools)
    ? (requestContext.tools as Array<Record<string, unknown>>)
    : []
  // CLI parity: echo the last conversation_checkpoint_update as conversation_state.
  // After compaction or an unsafe checkpoint reset there is no checkpoint  - 
  // seed a new Cursor conversation from OpenCode's authoritative history.
  const reqBytes = buildRunRequest({
    text: userText,
    images,
    modelId: cursorModelId,
    conversationId,
    conversationGroupId,
    systemPrompt: conversationState ? undefined : systemPrompt,
    history: conversationState ? undefined : history,
    conversationState,
    parameterValues,
    maxMode,
    tools: cursorTools,
    toolDescriptors,
    requestContext,
    action: resuming ? "resume" : "user",
  })
  // Content hashes - Cursor content-addresses large payloads; logging these lets
  // us match a server get_blob_args.blob_id to what it wants served.
  const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex")
  const skillsCount = Array.isArray(requestContext.agent_skills) ? requestContext.agent_skills.length : 0
  const hooksCtx =
    typeof requestContext.hooks_additional_context === "string" ? requestContext.hooks_additional_context : ""
  const historyChars = history.reduce((n, m) => n + m.content.length, 0)
  const seedChars = conversationState ? 0 : (systemPrompt?.length ?? 0) + userText.length + historyChars
  const seedEstimateIn = estimateTokens(seedChars)
  const checkpointEnvelopeEstimateIn = conversationState
    ? estimateTokens(userText.length + conversationState.length)
    : 0
  const runRequestWireEstimateIn = estimateTokens(reqBytes.length)
  const encodedRequestContext = encodeMessage("RequestContext", requestContext)
  const priorTokenDetails = decodeConversationTokenDetails(conversationState)
  const requestContextHash = sha(encodedRequestContext)
  const systemPromptHash = systemPrompt ? sha(systemPrompt) : undefined
  const usageEstimate = {
    // This is used only before Cursor supplies authoritative TurnEnded usage.
    // Estimate the actual protobuf request, not history/system text omitted by
    // checkpoint Runs. The opaque remote interpretation of KV blobs is logged
    // separately and deliberately is not mislabeled as a token count.
    inputTokens: runRequestWireEstimateIn,
    outputTokens: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoningTokens: 0,
  }
  trace(
    `outbound Run: model=${cursorModelId} opencodeModel=${modelId} ` +
      `conversationId=${conversationId} conversationGroupId=${conversationGroupId} ` +
      `params=${JSON.stringify(parameterValues ?? [])} ` +
      `maxMode=${maxMode} systemPromptLen=${systemPrompt?.length ?? 0} ` +
      `tools=${tools.length} incomingTools=${incomingTools.length} compaction=${isCompaction} ` +
      `skills=${skillsCount} hooks=${hooksCtx ? hooksCtx.split("\n").length : 0} ` +
      `availableModels=${_availableModels?.length ?? 0} userTextLen=${userText.length} ` +
      `images=${images.length} imageBytes=${images.reduce((total, image) => total + image.data.length, 0)} ` +
      `historyMsgs=${history.length} historyChars=${historyChars} ` +
      `checkpointLen=${conversationState?.length ?? 0} checkpointBlobCount=${checkpointGraph.count} ` +
      `checkpointBlobBytes=${checkpointGraph.bytes} checkpointGraphComplete=${checkpointGraph.complete} ` +
      `seedChars=${seedChars} seedEstimateIn=${seedEstimateIn} ` +
      `checkpointEnvelopeEstimateIn=${checkpointEnvelopeEstimateIn} ` +
      `reset=${bound.reset} ` +
      `resume=${resuming} requestContextReused=${requestContextReused} ` +
      `usageEstimateMode=run-request-wire usageEstimateIn=${usageEstimate.inputTokens} ` +
      `runRequestBytes=${reqBytes.length} requestContextBytes=${encodedRequestContext.length}`,
  )
  if (hooksCtx) trace(`outbound Run hooks_additional_context: ${hooksCtx}`)
  trace(`hash run_request sha256=${sha(reqBytes)}`)
  if (systemPrompt) trace(`hash systemPrompt sha256=${sha(systemPrompt)}`)
  trace(`hash requestContext sha256=${requestContextHash}`)
  if (conversationState) trace(`hash checkpoint sha256=${sha(conversationState)}`)

  try {
    await writeWithBackpressure(stream, reqBytes, "initial Run request")
    rememberSentHistoryImageHashes(sessionKey, imageExtraction.hashes)
  } catch (error) {
    stream.destroy()
    throw error
  }

  const session: CursorSession = {
    sessionId: crypto.randomUUID(),
    conversationId,
    cacheDir,
    resumeCheckpoint: undefined,
    tokenDetails: priorTokenDetails,
    tokenDetailsFresh: false,
    cacheDiagnostics: {
      sessionKey,
      conversationId,
      conversationGroupId,
      modelId: cursorModelId,
      priorTokenDetails,
      startedWithCheckpoint: !!conversationState,
      requestContextReused,
      requestContextHash,
      systemPromptHash,
      checkpointUpdates: 0,
      tokenDetailUpdates: 0,
      pumpPasses: 0,
      stepStarts: 0,
      stepCompletes: 0,
      displayToolCalls: 0,
      execRequests: 0,
    },
    openCodeSessionId: lifecycle ? undefined : sessionKey,
    postCompactionRebase: isCompaction || hasPostCompactionRebase(sessionKey),
    toolCatalog: snapshotToolCatalog(sessionKey),
    stream,
    frames: stream.frames()[Symbol.asyncIterator](),
    pending: new Map(),
    displayToolCalls: new Map(),
    editToolCalls: new Map(),
    nextBridgedExecId: 900_000,
    blobs: new Map(),
    toolDescriptors,
    toolAliases: webToolAliases.aliases,
    subagentCatalog,
    requestContext,
    allowTools,
    usageEstimate,
    pumpActive: false,
    pumpOwner: null,
    heartbeat: null,
    heartbeatCancel: null,
    hardDeadlineTimer: null,
    semanticDeadlineCancel: null,
    terminalUnsubscribe: null,
    deferredTerminalReason: null,
    policy: continuationPolicy,
    createdAt: Date.now(),
    lastInboundAt: Date.now(),
    lastHeartbeatWriteAt: Date.now(),
    semanticDeadlineAt: Date.now() + continuationPolicy.semanticIdleMs,
    closeError: null,
    closed: false,
    progressAssistantText: "",
    progressContinuationAttempts: 0,
    progressEmittedHostTools: 0,
  }
  sessionManager.registerSession(session)
  let heartbeatWritePending = false
  session.heartbeat = setInterval(() => {
    if (session.closed) return
    if (heartbeatWritePending) {
      // The pending write has its own bounded drain wait and will close the
      // session with the actual failing operation. Do not race it with another
      // heartbeat or misattribute an existing KV backlog to the heartbeat.
      trace(`heartbeat skipped: prior heartbeat write is still pending sessionId=${session.sessionId}`)
      return
    }
    heartbeatWritePending = true
    void writeWithBackpressure(stream, buildHeartbeat(), "heartbeat")
      .then(() => sessionManager.recordHeartbeatWrite(session))
      .catch((cause) => {
        sessionManager.close(
          session,
          "heartbeat-write-failed",
          toCursorProviderError(cause, {
            replaySafe: false,
            fallback: "Cursor heartbeat write failed",
          }),
        )
      })
      .finally(() => {
        heartbeatWritePending = false
      })
  }, continuationPolicy.heartbeatMs)
  session.heartbeat.unref?.()
  session.heartbeatCancel = () => {
    if (session.heartbeat) clearInterval(session.heartbeat)
  }

  callOptions.abortSignal?.addEventListener(
    "abort",
    () => {
      // Abort after tool-calls is normal - preserve pending sessions.
      trace("abortSignal aborted -> closeUnlessPending")
      sessionManager.closeUnlessPending(session)
    },
    { once: true },
  )
  return session
}

async function loadAvailableModels(): Promise<void> {
  const cacheDir = opencodeGlobalCacheDir()
  try {
    const filePath = cacheFilePath(cacheDir)
    let mtime = 0
    try {
      const stat = await fs.promises.stat(filePath)
      mtime = stat.mtimeMs
    } catch {
      // file missing - fall through with mtime=0
    }
    // Re-read when the file changed (discoverModels background refresh).
    if (mtime !== _availableModelsMtimeMs) {
      const cached = await readCache(cacheDir)
      _availableModels = cached?.models
      _availableModelsMtimeMs = mtime
    }
  } catch {
    /* ignore */
  }
}

function resolveApiBaseURL(options: CreateCursorOptions): string {
  return options.apiBaseURL ?? process.env.CURSOR_API_BASE_URL ?? `https://${CURSOR_API_HOST}`
}

function resolveTelemetryEnabled(options: CreateCursorOptions): boolean {
  return options.telemetryEnabled ?? isTruthyEnv(process.env.CURSOR_GET_SERVER_CONFIG_TELEMETRY)
}

function resolveExplicitAgentBaseURL(options: CreateCursorOptions): string | undefined {
  const raw = options.agentBaseURL ?? options.baseURL
  if (!raw) return undefined
  const normalized = normalizeAgentRunOrigin(raw)
  if (!normalized) {
    throw new CursorProtocolError("Invalid Cursor agent base URL override: expected https://*.cursor.sh")
  }
  return normalized
}

function isTruthyEnv(value: string | undefined): boolean {
  return value === "1" || value === "true"
}

function foldStreamParts(parts: V3Part[]): LanguageModelV3GenerateResult {
  let text = ""
  let reasoning = ""
  const content: LanguageModelV3GenerateResult["content"] = []
  let finishReason: LanguageModelV3FinishReason = { unified: "stop", raw: undefined }
  let providerMetadata: LanguageModelV3GenerateResult["providerMetadata"]
  let usage: LanguageModelV3Usage = {
    inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined },
  }

  for (const part of parts) {
    if (part.type === "text-delta") text += part.delta
    else if (part.type === "reasoning-delta") reasoning += part.delta
    else if (part.type === "tool-call") {
      content.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      })
    } else if (part.type === "finish") {
      finishReason = part.finishReason
      usage = part.usage
      providerMetadata = part.providerMetadata
    }
  }

  if (reasoning) content.unshift({ type: "reasoning", text: reasoning })
  if (text) content.unshift({ type: "text", text })

  return {
    content,
    finishReason,
    usage,
    warnings: [],
    ...(providerMetadata ? { providerMetadata } : {}),
  }
}
