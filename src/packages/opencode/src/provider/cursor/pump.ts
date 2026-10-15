/**
 * One pass of a held-open Cursor Run: read frames, emit AI SDK stream parts, answer Cursor's
 * must-reply channels, and stop at the turn boundary:
 *  - a tool call (exec_server_message) -> emit tool-call, finish "tool-calls",
 *    and KEEP the session open for the result on the next doStream call;
 *  - turn_ended -> finish "stop" and close the session;
 *  - transport EOF before turn_ended -> throw for one fresh-Run recovery.
 *
 * Frame handlers return true when the pump stops (the turn boundary was reached).
 */
import path from "node:path"
import type { LanguageModelV3StreamPart, LanguageModelV3Usage, LanguageModelV3FinishReason } from "@ai-sdk/provider"
import { CursorRunInterruptedError } from "./transport/connect.js"
import { trace, traceRequestContextPaths } from "./debug.js"
import { buildRunRequest } from "./protocol/request.js"
import { decodeFramePayload } from "./protocol/framing.js"
import { debugWalkTurnEnded, decodeMessage } from "./protocol/messages.js"
import {
  buildListMcpResourcesFallback,
  buildMcpStateResult,
  buildReadMcpResourceFallback,
  resolveCustomWebToolAlias,
} from "./protocol/descriptors.js"
import {
  rejectPartialReadMutation,
  remapCorrelatedEditWriteForCatalog,
  remapEditToolsForCatalog,
} from "./protocol/editRemap.js"
import {
  binaryWritePayload,
  buildToolCallPart,
  detectExecVariantField,
  parseExecServerMessage,
} from "./protocol/execParse.js"
import { buildExecClientMessages, buildRequestContextResult } from "./protocol/execResult.js"
import { remapNativeSubagentForCatalog } from "./protocol/subagents.js"
import { cursorExecVariantByRequestField, describeCursorExecVariant } from "./protocol/execVariants.js"
import {
  advertisedToolNamesFromDescriptors,
  extractExecDisplayCallId,
  extractProtobufSubmessage,
  listProtobufFieldNumbers,
  parseDisplayToolCall,
  resolveBridgedOpenCodeToolCall,
} from "./protocol/toolCallBridge.js"
import { handleKvServerMessage } from "./protocol/kv.js"
import { handleInteractionQuery } from "./protocol/interactions.js"
import { ASK_QUESTION_RESULT_FIELD, askQuestionToolInput } from "./protocol/askQuestion.js"
import {
  SWITCH_MODE_RESULT_FIELD,
  getActiveCursorMode,
  isBridgedCursorPlanModeActive,
  isCursorPlanModeActive,
  setActiveCursorMode,
  switchModeToolInput,
} from "./protocol/switchMode.js"
import { CREATE_PLAN_RESULT_FIELD, CURSOR_PLAN_STAGE_TOOL, createPlanStageInput } from "./protocol/createPlan.js"
import { CURSOR_IMAGE_SAVE_TOOL, imageMimeForPath, remapCursorImageWritePath } from "./protocol/generateImage.js"
import { stageCursorImage } from "./imageStaging.js"
import { setCheckpoint } from "./protocol/checkpoint.js"
import {
  cursorContextUsageMetadata,
  decodeConversationTokenDetails,
  type CursorContextUsageSource,
  type CursorConversationTokenDetails,
} from "./protocol/tokenDetails.js"
import { conversationBlobCount } from "./protocol/blobStore.js"
import { persistConversationState } from "./protocol/conversationState.js"
import { sessionManager, type CursorSession, type Frame } from "./session.js"
import { CursorProtocolError, CursorProviderError, CursorTransportError } from "./errors.js"
import { workspaceRootFromRequestContext } from "./context/env.js"
import { progressOnlyContinuationPrompt, shouldContinueProgressOnlyTurn } from "./protocol/progressContinuation.js"
import { ensureOpencodeProjectDir, opencodeGlobalCacheDir } from "./context/paths.js"
import { registerCursorShellCall } from "./shellTimeout.js"
import { analyzeReplayFrame, AttemptReplaySafety } from "./replaySafety.js"
import { readAllFieldsStrict } from "./protocol/struct.js"
import { buildGitDiffReply, executeGitDiff } from "./protocol/gitDiff.js"
import {
  buildLanguageModelV3UsageFromCounters,
  cursorUsageCountersFromTurnEnded,
  emptyLanguageModelV3Usage,
  formatCursorCacheDiagnostics,
  formatCursorTokenCategories,
  formatTurnUsageValidation,
  estimateTokens,
  turnEndedCounter,
} from "./usage.js"
import { connectFrameError } from "./retry.js"
import { writeWithBackpressure } from "./streamWrite.js"
import { recoverCorrelatedEditRead, rejectExec, rejectMissingReadTarget } from "./execRecovery.js"

const RUN_REQUEST_DECODE_FAILED = "CURSOR_RUN_REQUEST_DECODE_FAILED"
const RUN_REQUEST_UNSUPPORTED = "CURSOR_RUN_REQUEST_UNSUPPORTED"
const RUN_REPLY_FAILED = "CURSOR_RUN_REPLY_FAILED"

type ResponseRequiredChannel = "exec" | "kv" | "interaction" | "multiple"
const RESPONSE_REQUIRED_CHANNEL_BY_FIELD = new Map<number, Exclude<ResponseRequiredChannel, "multiple">>([
  [2, "exec"],
  [4, "kv"],
  [7, "interaction"],
])

function responseRequiredChannel(payload: Uint8Array): ResponseRequiredChannel | undefined {
  const fields = readAllFieldsStrict(payload)
  if (fields) {
    const channels = fields
      .map((field) => RESPONSE_REQUIRED_CHANNEL_BY_FIELD.get(field.fn))
      .filter((channel): channel is Exclude<ResponseRequiredChannel, "multiple"> => !!channel)
    if (channels.length > 1) return "multiple"
    return channels[0]
  }

  // Request tags are single-byte because all must-reply top-level fields are <16.
  const tag = payload[0]
  return tag !== undefined ? RESPONSE_REQUIRED_CHANNEL_BY_FIELD.get(tag >> 3) : undefined
}

type V3Part = LanguageModelV3StreamPart

export async function pump(
  session: CursorSession,
  controller: ReadableStreamDefaultController<V3Part>,
  ids: {
    textId: string
    reasoningId: string
  },
  abortSignal?: AbortSignal,
): Promise<void> {
  return new CursorPump(session, controller, ids, abortSignal).run()
}

export class CursorPump {
  readonly cacheDiagnostics: NonNullable<CursorSession["cacheDiagnostics"]>
  readonly advertisedToolNames: string[]
  readonly advertisedToolNameSet: Set<string>
  readonly replaySafety: AttemptReplaySafety
  private readonly textId: string
  private readonly reasoningId: string
  private textStarted = false
  private reasoningStarted = false
  // OpenCode cancels the ReadableStream between turns (see the cancel handler
  // in doStreamImpl). The frames iterator can still yield a final `done` after
  // the cancel lands - controller.enqueue on a cancelled controller throws.
  // safeEnqueue swallows that throw and tracks the close so we stop pumping.
  private streamClosed = false

  constructor(
    readonly session: CursorSession,
    private readonly controller: ReadableStreamDefaultController<V3Part>,
    ids: { textId: string; reasoningId: string },
    private readonly abortSignal?: AbortSignal,
  ) {
    sessionManager.registerSession(session)
    this.cacheDiagnostics = session.cacheDiagnostics ??= {
      sessionKey: session.openCodeSessionId,
      conversationId: session.conversationId,
      priorTokenDetails: session.tokenDetails,
      startedWithCheckpoint: !!session.tokenDetails,
      requestContextReused: false,
      requestContextHash: "unavailable",
      checkpointUpdates: 0,
      tokenDetailUpdates: 0,
      pumpPasses: 0,
      stepStarts: 0,
      stepCompletes: 0,
      displayToolCalls: 0,
      execRequests: 0,
    }
    this.cacheDiagnostics.pumpPasses++
    this.textId = ids.textId
    this.reasoningId = ids.reasoningId
    this.advertisedToolNames = advertisedToolNamesFromDescriptors(session.toolDescriptors)
    this.advertisedToolNameSet = new Set(
      this.advertisedToolNames.map((name) => resolveCustomWebToolAlias(name, session.toolAliases)),
    )
    this.replaySafety = new AttemptReplaySafety(session.sessionId)
  }

  async run(): Promise<void> {
    const session = this.session
    const onPumpAbort = () => {
      if (session.pending.size === 0) sessionManager.close(session)
      session.semanticDeadlineCancel?.()
    }
    this.abortSignal?.addEventListener("abort", onPumpAbort)
    try {
      while (true) {
        // Consumer cancelled / closed the ReadableStream. Stop reading Cursor
        // frames so a continuation doStream can resume the same iterator  - 
        // keeping the loop alive would discard frames the next pump needs.
        if (this.streamClosed) {
          trace(`pump: stream closed (consumer cancelled) pending=${session.pending.size}`)
          sessionManager.closeUnlessPending(session)
          return
        }
        if (this.abortSignal?.aborted) {
          // Stop feeding this ReadableStream, but keep the Run session if we still
          // owe Cursor an exec result (OpenCode aborts between tool-call turns).
          trace(`pump: abortSignal aborted pending=${session.pending.size}`)
          if (session.pending.size > 0) sessionManager.closeUnlessPending(session)
          else sessionManager.close(session)
          return
        }

        let next: IteratorResult<Frame>
        try {
          next = session.pending.size === 0 ? await nextFrameWithSemanticDeadline(session) : await session.frames.next()
        } catch (error) {
          this.closeOpenSpans()
          if (this.abortSignal?.aborted) {
            if (session.pending.size > 0) sessionManager.closeUnlessPending(session)
            else sessionManager.close(session)
            return
          }
          const failure =
            error instanceof CursorProviderError
              ? error
              : new CursorRunInterruptedError(`Cursor Run frame stream interrupted: ${(error as Error).message}`, {
                  cause: error,
                })
          throw this.replaySafety.applyTo(failure)
        }
        if (this.abortSignal?.aborted) {
          this.closeOpenSpans()
          if (session.pending.size > 0) sessionManager.closeUnlessPending(session)
          else sessionManager.close(session)
          return
        }
        if (next.done) {
          this.closeOpenSpans()
          trace("pump: frames iterator ended before turn_ended")
          const failure = new CursorRunInterruptedError()
          throw this.replaySafety.applyTo(failure)
        }
        const frame = next.value as Frame

        if (frame.flags & 0x02) {
          // A successful agent turn has an explicit turn_ended update before the
          // Connect envelope closes. Reaching end-stream here means the Run was
          // interrupted, even if the HTTP status itself was 200.
          let payload = ""
          if (frame.payload.length > 0) {
            try {
              payload = new TextDecoder().decode(decodeFramePayload(frame))
            } catch {
              this.replaySafety.markBarrier("unknown-or-malformed-frame")
            }
          }
          this.closeOpenSpans()
          const failure = payload ? connectFrameError(payload) : new CursorRunInterruptedError()
          throw this.replaySafety.applyTo(failure)
        }

        // decodeFramePayload can throw on a corrupt gzip payload (gunzipSync).
        // Skip the frame rather than abort the whole turn.
        let payload: Uint8Array
        try {
          payload = decodeFramePayload(frame)
        } catch (e) {
          this.replaySafety.markBarrier("unknown-or-malformed-frame")
          trace(
            `gunzip FAILED (skipping frame): flags=0x${frame.flags.toString(16)} len=${frame.payload.length} err=${(e as Error).message}`,
          )
          continue
        }
        let asm: Record<string, unknown>
        try {
          asm = decodeMessage<Record<string, unknown>>("AgentServerMessage", payload)
        } catch {
          // A single malformed/truncated frame must not abort the whole turn
          // (protobufjs throws "index out of range: ..." on length overruns). Log it
          // and keep pumping.
          this.replaySafety.markBarrier("unknown-or-malformed-frame")
          const channel = responseRequiredChannel(payload)
          if (channel) {
            this.failRunProtocol(`Cursor ${channel} request could not be decoded`, RUN_REQUEST_DECODE_FAILED)
          }
          trace(`decode FAILED (skipping non-request frame): flags=0x${frame.flags.toString(16)} len=${payload.length}`)
          continue
        }
        const iu = asm.interaction_update as Record<string, unknown> | undefined
        const esm = asm.exec_server_message as Record<string, unknown> | undefined
        const kv = asm.kv_server_message as Record<string, unknown> | undefined
        const execControl = asm.exec_server_control_message as Record<string, unknown> | undefined
        const interactionQuery = asm.interaction_query as Record<string, unknown> | undefined
        const checkpointRaw = asm.conversation_checkpoint_update
        const topField = payload.length > 0 ? payload[0] >> 3 : 0
        const checkpointProgress = normalizeCheckpointBytes(checkpointRaw)
        const requiredChannel = responseRequiredChannel(payload)
        if (
          requiredChannel === "multiple" ||
          (requiredChannel === "exec" && !esm) ||
          (requiredChannel === "kv" && !kv) ||
          (requiredChannel === "interaction" && !interactionQuery)
        ) {
          this.failRunProtocol("Cursor response-requiring request could not be decoded", RUN_REQUEST_DECODE_FAILED)
        }
        const replayFrame = analyzeReplayFrame(payload, {
          interactionUpdate: iu,
          exec: esm,
          kv,
          execControl,
          interactionQuery,
          checkpointBytes: checkpointProgress,
        })
        if (replayFrame.semanticProgress) {
          sessionManager.recordSemanticProgress(session)
        }
        if (replayFrame.barrier) this.replaySafety.markBarrier(replayFrame.barrier)

        {
          const iuKind = iu ? Object.keys(iu).find((k) => iu[k]) : undefined
          trace(
            `pump frame: topField=${topField} interaction_update=${iuKind ?? "-"} ` +
              `exec=${esm ? "yes" : "no"} kv=${kv ? "yes" : "no"} ` +
              `interaction_query=${interactionQuery ? "yes" : "no"} ` +
              `checkpoint=${checkpointRaw ? "yes" : "no"}`,
          )
        }

        try {
          this.storeCheckpoint(checkpointRaw)

          if (iu?.text_delta) {
            this.emitText(((iu.text_delta as Record<string, unknown>).text as string) ?? "")
          } else if (iu?.thinking_delta) {
            this.emitReasoning(((iu.thinking_delta as Record<string, unknown>).text as string) ?? "")
          } else if (iu?.turn_ended) {
            if (await this.onTurnEnded(payload, iu)) return
          } else if (iu?.tool_call_started) {
            this.onToolCallStarted(payload, iu)
          } else if (iu?.tool_call_completed) {
            if (this.onToolCallCompleted(payload, iu)) return
          } else if (iu?.step_started) {
            this.cacheDiagnostics.stepStarts++
          } else if (iu?.step_completed) {
            this.cacheDiagnostics.stepCompletes++
          } else if (esm) {
            if (await this.onExec(payload, esm)) return
          } else if (interactionQuery) {
            if (await this.onInteractionQuery(payload, interactionQuery)) return
          } else if (kv) {
            await this.onKv(payload, kv)
          }
        } catch (e) {
          if (e instanceof CursorProviderError) throw e
          if (requiredChannel) {
            this.failRunProtocol(`Cursor ${requiredChannel} request could not be handled`, RUN_REQUEST_UNSUPPORTED)
          }
          // Any per-frame dispatch throw (e.g. protobufjs length overrun in
          // exec/args decode) must not abort the whole turn - log and skip.
          trace(`frame dispatch FAILED (skipping): topField=${topField}`)
        }
        // heartbeat / step / partial_tool_call -> ignore (partial args are
        // display-only; the exec channel is authoritative. Checkpoints and
        // interaction queries are handled above.)
      }
    } finally {
      this.abortSignal?.removeEventListener("abort", onPumpAbort)
    }
  }

  /** CLI: conversationCheckpointUpdate -> replace agentStore conversation state. */
  private storeCheckpoint(checkpointRaw: unknown) {
    const session = this.session
    // Store opaque bytes keyed by conversation_id; next Run echoes them.
    if (checkpointRaw != null) {
      const bytes = normalizeCheckpointBytes(checkpointRaw)
      if (bytes && bytes.length > 0) {
        this.cacheDiagnostics.checkpointUpdates++
        setCheckpoint(session.conversationId, bytes)
        session.resumeCheckpoint = Uint8Array.from(bytes)
        const tokenDetails = decodeConversationTokenDetails(bytes)
        if (tokenDetails) {
          this.cacheDiagnostics.tokenDetailUpdates++
          session.tokenDetails = tokenDetails
          session.tokenDetailsFresh = true
        }
        const context = tokenDetails
          ? ` context=${tokenDetails.usedTokens}/${tokenDetails.maxTokens} ` +
            `categories=${formatCursorTokenCategories(tokenDetails)}`
          : " context=unavailable"
        trace(`checkpoint: stored ${bytes.length}B for conversationId=${session.conversationId}${context}`)
      }
    }
  }

  private failRunProtocol(message: string, code: string): never {
    this.replaySafety.markBarrier("unknown-or-malformed-frame")
    const error = new CursorProtocolError(message, { code })
    sessionManager.close(this.session, "remote-error", error)
    throw error
  }

  private safeEnqueue(part: V3Part): boolean {
    if (this.streamClosed) return false
    try {
      this.controller.enqueue(part)
      return true
    } catch (e) {
      this.streamClosed = true
      trace(`pump: enqueue on closed controller (suppressing) err=${(e as Error).message}`)
      return false
    }
  }

  safeError(err: Error): void {
    if (this.streamClosed) return
    try {
      this.controller.error(err)
    } catch (e) {
      trace(`pump: controller.error failed (suppressing) err=${(e as Error).message}`)
    }
    this.streamClosed = true
  }

  /** AI SDK V3 requires text-end / reasoning-end before finish or tool-call. */
  private closeOpenSpans() {
    for (const part of spanEndParts({
      textStarted: this.textStarted,
      reasoningStarted: this.reasoningStarted,
      textId: this.textId,
      reasoningId: this.reasoningId,
    })) {
      this.safeEnqueue(part as V3Part)
    }
    this.reasoningStarted = false
    this.textStarted = false
  }

  private emitText(text: string) {
    const session = this.session
    if (!text) return
    this.replaySafety.markBarrier("visible-text")
    session.progressAssistantText = `${session.progressAssistantText ?? ""}${text}`
    // Close reasoning before text (hosts expect reasoning-end before text-start).
    if (this.reasoningStarted && !this.textStarted) {
      this.safeEnqueue({ type: "reasoning-end", id: this.reasoningId } as V3Part)
      this.reasoningStarted = false
    }
    if (!this.textStarted) {
      this.safeEnqueue({ type: "text-start", id: this.textId } as V3Part)
      this.textStarted = true
    }
    session.usageEstimate.outputTokens += estimateTokens(text.length)
    this.safeEnqueue({ type: "text-delta", id: this.textId, delta: text } as V3Part)
  }

  private emitReasoning(text: string) {
    const session = this.session
    if (!text) return
    this.replaySafety.markBarrier("visible-reasoning")
    if (!this.reasoningStarted) {
      this.safeEnqueue({ type: "reasoning-start", id: this.reasoningId } as V3Part)
      this.reasoningStarted = true
    }
    session.usageEstimate.outputTokens += estimateTokens(text.length)
    this.safeEnqueue({ type: "reasoning-delta", id: this.reasoningId, delta: text } as V3Part)
  }

  private emitFinish(
    te: Record<string, unknown> | undefined,
    reason: LanguageModelV3FinishReason,
    settledUsage?: LanguageModelV3Usage,
    settledSource?: string,
  ) {
    const session = this.session
    this.closeOpenSpans()
    const est = session.usageEstimate
    // OpenCode persists and sums every AI SDK finish. Cursor does not expose a
    // final context total at tool boundaries, so charging the growing estimate
    // there multiplies one held Run across all of its steps. Emit zero at
    // intermediate boundaries, then prefer checkpoint tokenDetails exactly once
    // when TurnEnded closes the held Run. Cursor CLI keeps context occupancy in
    // agentStore tokenDetails; it does not reinterpret TurnEnded as occupancy.
    const tokenDetails = te ? session.tokenDetails : undefined
    const contextSource: CursorContextUsageSource | undefined = tokenDetails
      ? session.tokenDetailsFresh
        ? "checkpoint-current-run"
        : "checkpoint-previous-turn"
      : undefined
    const counters = te ? cursorUsageCountersFromTurnEnded(te) : undefined
    const usage =
      settledUsage ??
      (te
        ? tokenDetails
          ? buildLanguageModelV3UsageFromCounters(counters!, {
              contextTotalTokens: tokenDetails.usedTokens,
              priorContextTokens: session.cacheDiagnostics?.priorTokenDetails?.usedTokens,
            })
          : emptyLanguageModelV3Usage()
        : emptyLanguageModelV3Usage())
    const providerMetadata = te ? cursorTurnEndedProviderMetadata(te, tokenDetails, contextSource) : undefined
    const reasonLabel =
      typeof reason === "object" && reason && "unified" in reason
        ? String((reason as { unified?: string }).unified ?? "unknown")
        : String(reason)
    const inTotal = usage.inputTokens?.total ?? 0
    const outTotal = usage.outputTokens?.total ?? 0
    trace(
      `finish: reason=${reasonLabel} ` +
        `v3In=${inTotal} v3Out=${outTotal} ` +
        `v3CacheRead=${usage.inputTokens?.cacheRead ?? 0} v3CacheWrite=${usage.inputTokens?.cacheWrite ?? 0} ` +
        `v3Reasoning=${usage.outputTokens?.reasoning ?? 0} ` +
        `rawIn=${te ? turnEndedCounter(te, "input_tokens") : est.inputTokens} ` +
        `rawOut=${te ? turnEndedCounter(te, "output_tokens") : est.outputTokens} ` +
        `rawCacheRead=${te ? turnEndedCounter(te, "cache_read") : est.cacheRead} ` +
        `rawCacheWrite=${te ? turnEndedCounter(te, "cache_write") : est.cacheWrite} ` +
        `source=${te ? (settledSource ?? contextSource ?? "unavailable") : "intermediate-zero"}`,
    )
    if (counters) {
      trace(formatTurnUsageValidation(counters, usage, tokenDetails, contextSource))
      trace(
        formatCursorCacheDiagnostics(counters, tokenDetails, this.cacheDiagnostics.priorTokenDetails, this.cacheDiagnostics),
      )
    }
    this.safeEnqueue({
      type: "finish",
      usage,
      finishReason: reason,
      ...(providerMetadata ? { providerMetadata } : {}),
    } as V3Part)
  }

  private async onTurnEnded(payload: Uint8Array, iu: Record<string, unknown>): Promise<boolean> {
    const session = this.session
    trace(`turn_ended raw wire fields: ${debugWalkTurnEnded(payload)}`)
    const turnEnded = iu.turn_ended as Record<string, unknown>
    // Progress-only continuation: before persistence/finish/close, check predicate
    // and if true send a fresh user-action request on the same held bidi stream.
    // This keeps pending exec claims, checkpoint, replay barriers, and stream
    // ownership intact while resetting only turn-local text/counters.
    const canContinue = shouldContinueProgressOnlyTurn({
      allowTools: session.allowTools,
      advertisedToolCount: session.toolDescriptors.length,
      assistantText: session.progressAssistantText ?? "",
      emittedHostTools: session.progressEmittedHostTools ?? 0,
      continuationAttempts: session.progressContinuationAttempts ?? 0,
      pendingExecs: session.pending.size,
    })
    if (canContinue) {
      this.replaySafety.markBarrier("stateful-interaction")
      const workspaceRoot = workspaceRootFromRequestContext(session.requestContext)
      const prompt = progressOnlyContinuationPrompt(workspaceRoot)
      session.progressContinuationAttempts = (session.progressContinuationAttempts ?? 0) + 1
      // Mark stateful interaction for replay safety; attempt counted above.
      try {
        const checkpoint = session.resumeCheckpoint
        const toolDescriptors = session.toolDescriptors
        // Reconstruct request with same conversation/model/request-context descriptors
        // and checkpoint, using action "user" so the prompt is not discarded
        // (resume discards user_message).
        const continuationBytes = buildRunRequest({
          text: prompt,
          modelId: session.cacheDiagnostics?.modelId ?? "cursor-default",
          conversationId: session.conversationId,
          conversationGroupId: session.cacheDiagnostics?.conversationGroupId,
          conversationState: checkpoint,
          requestContext: session.requestContext,
          tools: session.toolCatalog ?? [],
          toolDescriptors,
          action: "user",
        })
        await writeWithBackpressure(session.stream, continuationBytes, "progress continuation")
        trace(
          `progress continuation: sent attempt=${session.progressContinuationAttempts} promptLen=${prompt.length}`,
        )
      } catch (error) {
        trace(`progress continuation: write FAILED err=${(error as Error).message}`)
        // Fall through to ordinary finish/close on write failure
        if (session.openCodeSessionId) {
          await persistConversationState(session.cacheDir ?? opencodeGlobalCacheDir(), {
            sessionKey: session.openCodeSessionId,
            conversationId: session.conversationId,
            requestContext: session.requestContext,
            toolCatalog: session.toolCatalog ?? [],
            postCompactionRebase: session.postCompactionRebase,
          }).catch((e) => {
            trace(
              `conversation persistence: TurnEnded save failed sessionKey=${session.openCodeSessionId}: ${String(e)}`,
            )
          })
        }
        // Ensure open spans are closed before finish
        this.closeOpenSpans()
        this.emitFinish(turnEnded, { unified: "stop", raw: undefined })
        sessionManager.close(session)
        return true
      }
      // Reset only turn-local text/counters attempt already incremented; retain
      // pending exec claims, checkpoint, replay barriers, stream ownership, identity.
      // Close open spans but do NOT emit finish or stream-start; continue pumping.
      this.closeOpenSpans()
      session.progressAssistantText = ""
      session.progressEmittedHostTools = 0
      // Do not reset attempt counter; keep 1-attempt limit
      // Keep replaySafety barrier already marked; continue loop without finish/close
      return false
    }
    if (session.openCodeSessionId) {
      await persistConversationState(session.cacheDir ?? opencodeGlobalCacheDir(), {
        sessionKey: session.openCodeSessionId,
        conversationId: session.conversationId,
        requestContext: session.requestContext,
        toolCatalog: session.toolCatalog ?? [],
        postCompactionRebase: session.postCompactionRebase,
      }).catch((error) => {
        trace(
          `conversation persistence: TurnEnded save failed ` +
            `sessionKey=${session.openCodeSessionId}: ${String(error)}`,
        )
      })
    }
    this.emitFinish(turnEnded, { unified: "stop", raw: undefined })
    sessionManager.close(session)
    return true
  }

  /** Stash Cursor display ToolCall until exec claims it, or completed bridges it. */
  private onToolCallStarted(payload: Uint8Array, iu: Record<string, unknown>) {
    const session = this.session
    this.cacheDiagnostics.displayToolCalls++
    const started = iu.tool_call_started as Record<string, unknown>
    const callId = typeof started.call_id === "string" ? started.call_id : ""
    const toolCall = started.tool_call as Record<string, unknown> | undefined
    if (callId && toolCall) {
      session.displayToolCalls.set(callId, toolCall)
      const variant = Object.keys(toolCall).find((k) => k.endsWith("_tool_call")) ?? "?"
      const display = parseDisplayToolCall(callId, toolCall)
      const editPath =
        display?.variant === "edit_tool_call" && typeof display.args.path === "string"
          ? display.args.path
          : undefined
      if (editPath) {
        const editToolCalls = session.editToolCalls ?? (session.editToolCalls = new Map())
        editToolCalls.set(callId, { path: editPath })
      }
      const callIdLog = callId.replace(/\r?\n/g, "\\n")
      let wireFields = ""
      if (variant === "?") {
        const toolBytes = extractProtobufSubmessage(payload, [1, 2, 2])
        if (toolBytes) {
          wireFields = ` wireFields=[${listProtobufFieldNumbers(toolBytes).join(",")}]`
        }
      }
      trace(`display tool_call_started: callId=${callIdLog} variant=${variant}${wireFields}`)
    }
  }

  private onToolCallCompleted(payload: Uint8Array, iu: Record<string, unknown>): boolean {
    const session = this.session
    const completed = iu.tool_call_completed as Record<string, unknown>
    const callId = typeof completed.call_id === "string" ? completed.call_id : ""
    if (callId) session.editToolCalls?.delete(callId)
    // If exec already claimed this call_id, display map entry is gone - skip.
    if (!callId || !session.displayToolCalls.has(callId)) {
      if (callId) {
        trace(`display tool_call_completed: ignore (exec-handled or unknown) callId=${callId}`)
      }
    } else {
      const stored = session.displayToolCalls.get(callId)!
      session.displayToolCalls.delete(callId)
      const toolCall = (completed.tool_call as Record<string, unknown> | undefined) ?? stored
      if (!session.allowTools) {
        trace(`display tool_call_completed: SKIPPED (allowTools=false) callId=${callId}`)
      } else {
        const display = parseDisplayToolCall(callId, toolCall)
        const advertised = advertisedToolNamesFromDescriptors(session.toolDescriptors)
        const bridged = display ? resolveBridgedOpenCodeToolCall(display, advertised) : undefined
        if (!display) {
          const callIdLog = callId.replace(/\r?\n/g, "\\n")
          // AgentServerMessage.interaction_update(1).tool_call_completed(3).tool_call(2)
          const toolBytes = extractProtobufSubmessage(payload, [1, 3, 2])
          const wire = toolBytes ? ` wireFields=[${listProtobufFieldNumbers(toolBytes).join(",")}]` : ""
          trace(
            `display tool_call_completed: unparsed callId=${callIdLog} ` +
              `keys=[${Object.keys(toolCall).join(",")}]${wire}`,
          )
        } else if (!bridged) {
          trace(
            `display tool_call_completed: no advertised OpenCode tool ` +
              `callId=${callId} variant=${display.variant} preferred=${display.preferredToolName} ` +
              `advertised=[${advertised.join(",")}]`,
          )
        } else {
          const execId = session.nextBridgedExecId++
          sessionManager.registerPending(execId, session, "bridged", bridged.toolName, true)
          const toolCallId = `cursor_${session.sessionId}_${execId}`
          const input = JSON.stringify(bridged.args ?? {})
          trace(
            `display BRIDGED tool-call toolCallId=${toolCallId} toolName=${bridged.toolName} ` +
              `variant=${bridged.variant} callId=${callId} inputLen=${input.length}`,
          )
          this.closeOpenSpans()
          this.safeEnqueue({
            type: "tool-call",
            toolCallId,
            toolName: bridged.toolName,
            input,
          } as V3Part)
          session.progressEmittedHostTools = (session.progressEmittedHostTools ?? 0) + 1
          this.emitFinish(undefined, { unified: "tool-calls", raw: undefined })
          return true
        }
      }
    }
    return false
  }

  private async onExec(payload: Uint8Array, esm: Record<string, unknown>): Promise<boolean> {
    const session = this.session
    this.cacheDiagnostics.execRequests++
    const esmId = (esm.id as number) ?? 0
    if (esm.request_context_args) {
      // Server turn-setup probe (#10). Reply with full OpenCode-sourced context.
      {
        const rc = session.requestContext
        const skills = Array.isArray(rc.agent_skills) ? rc.agent_skills.length : 0
        const hooks = typeof rc.hooks_additional_context === "string" ? rc.hooks_additional_context : ""
        trace(
          `exec request_context: id=${esmId} - replying context ` +
            `tools=${session.toolDescriptors.length} skills=${skills} ` +
            `hooks=${hooks ? hooks.split("\n").length : 0}`,
        )
        if (hooks) trace(`exec request_context hooks_additional_context: ${hooks}`)
      }
      try {
        traceRequestContextPaths(`exec request_context reply id=${esmId}`, session.requestContext)
        await writeWithBackpressure(
          session.stream,
          buildRequestContextResult(esmId, session.requestContext),
          `request-context reply id=${esmId}`,
        )
        trace(`exec request_context: replied`)
      } catch (error) {
        rethrowTransportWriteFailure(error)
        this.failRunProtocol("Cursor request-context reply failed", RUN_REPLY_FAILED)
      }
    } else if (esm.mcp_state_exec_args) {
      // MCP-backed writes/reads can be preceded by this control-plane probe.
      // Confirm the virtual servers from the already-advertised context, then
      // keep pumping until Cursor emits the actual mcp_args tool request.
      const stateArgs = esm.mcp_state_exec_args as Record<string, unknown>
      const requested = Array.isArray(stateArgs.server_identifiers) ? stateArgs.server_identifiers.join(",") : ""
      try {
        await writeWithBackpressure(
          session.stream,
          buildMcpStateResult(esmId, stateArgs, session.requestContext),
          `MCP-state reply id=${esmId}`,
        )
        trace(`exec mcp_state: replied id=${esmId} requested=[${requested}]`)
      } catch (error) {
        rethrowTransportWriteFailure(error)
        this.failRunProtocol("Cursor MCP-state reply failed", RUN_REPLY_FAILED)
      }
    } else if (esm.list_mcp_resources_exec_args) {
      // Native Cursor exec (agent.v1 field 17), no OpenCode route under
      // Option B - see tasks/plans/fix-cursor-mcp-resource-exec.md. Answer
      // with an explicit unsupported error and keep pumping.
      const args = esm.list_mcp_resources_exec_args as Record<string, unknown>
      const server = typeof args.server === "string" ? args.server : ""
      try {
        await writeWithBackpressure(
          session.stream,
          buildListMcpResourcesFallback(esmId),
          `list-MCP-resources reply id=${esmId}`,
        )
        trace(`exec list_mcp_resources: replied id=${esmId} server=${server || "(all)"} error{unsupported}`)
      } catch (error) {
        rethrowTransportWriteFailure(error)
        this.failRunProtocol("Cursor list_mcp_resources reply failed", RUN_REPLY_FAILED)
      }
    } else if (esm.read_mcp_resource_exec_args) {
      // Native Cursor exec (agent.v1 field 18) - same rationale as above.
      const args = esm.read_mcp_resource_exec_args as Record<string, unknown>
      const server = typeof args.server === "string" ? args.server : ""
      const uri = typeof args.uri === "string" ? args.uri : ""
      try {
        await writeWithBackpressure(
          session.stream,
          buildReadMcpResourceFallback(esmId, server, uri),
          `read-MCP-resource reply id=${esmId}`,
        )
        trace(`exec read_mcp_resource: replied id=${esmId} server=${server} uri=${uri} error{unsupported}`)
      } catch (error) {
        rethrowTransportWriteFailure(error)
        this.failRunProtocol("Cursor read_mcp_resource reply failed", RUN_REPLY_FAILED)
      }
    } else if ((esm as Record<string, unknown>).git_diff_request) {
      const request = (esm as Record<string, unknown>).git_diff_request as Record<string, unknown>
      const execId = typeof esm.exec_id === "string" ? esm.exec_id : ""
      try {
        const response = await executeGitDiff(request, workspaceRootFromRequestContext(session.requestContext))
        for (const [index, frame] of buildGitDiffReply({ id: esmId, execId, response }).entries()) {
          await writeWithBackpressure(session.stream, frame, `gitDiff reply id=${esmId} frame=${index + 1}`)
        }
        trace(`exec git_diff_request: replied id=${esmId}`)
      } catch (error) {
        rethrowTransportWriteFailure(error)
        this.failRunProtocol("Cursor git-diff reply failed", RUN_REPLY_FAILED)
      }
      return false
    } else {
      this.replaySafety.markBarrier("non-control-exec")
      const displayCallId = extractExecDisplayCallId(esm)
      const parsed = parseExecServerMessage(esm)
      if (parsed) {
        const executableToolName = resolveCustomWebToolAlias(parsed.toolName, session.toolAliases)
        if (executableToolName !== parsed.toolName) {
          trace(`web tool alias resolved: ${parsed.toolName} -> ${executableToolName}`)
          parsed.toolName = executableToolName
        }
        remapNativeSubagentForCatalog(parsed, this.advertisedToolNameSet, session.subagentCatalog)
        const editCall = displayCallId ? session.editToolCalls?.get(displayCallId) : undefined
        // A complete correlated edit read is trusted provenance: unlike an
        // ordinary capped read it cannot have appended our warning marker,
        // and the source itself may legitimately contain the marker text.
        if (!editCall?.completeRead) rejectPartialReadMutation(parsed)
        if (editCall) {
          const remapped = remapCorrelatedEditWriteForCatalog(
            parsed,
            this.advertisedToolNameSet,
            editCall.path,
            workspaceRootFromRequestContext(session.requestContext),
          )
          if (parsed.resultField === "write_result" && displayCallId) {
            session.editToolCalls?.delete(displayCallId)
          }
          if (remapped) {
            trace(
              `exec: preserved edit intent callId=${displayCallId} ` + `path=${JSON.stringify(editCall.path)}`,
            )
          }
        }
        // Hosts that advertise `apply_patch` in place of `edit`/`write` (see
        // protocol/applyPatch.ts) still receive Cursor's native write/edit
        // exec requests. Translate before the unavailable-tool check below.
        remapEditToolsForCatalog(
          parsed,
          this.advertisedToolNameSet,
          workspaceRootFromRequestContext(session.requestContext),
        )
      }
      trace(
        `exec: id=${parsed?.id} variant=${parsed ? Object.keys(parsed).join(",") : "none"} toolName=${parsed?.toolName} resultField=${parsed?.resultField}`,
      )
      if (parsed) {
        if (parsed.localError) {
          if (!rejectExec(this, parsed, parsed.localError, "invalid mapping")) return true
          return false
        }
        // OpenCode throws "Tool call not allowed while generating summary"
        // when assistantMessage.summary is set. Compaction/summary turns
        // advertise no tools - refuse on the Cursor channel and keep
        // pumping for text / turn_ended instead of emitting tool-call.
        if (!session.allowTools) {
          const reason = "Tool calls are not available during this turn (summary/compaction)."
          if (!rejectExec(this, parsed, reason, "allowTools=false")) return true
          return false
        }
        // Cursor writes a generated image with an ordinary write exec whose
        // `file_bytes` are binary (Cursor CLI's agent does exactly this, then
        // reads the client's WriteResult back). OpenCode's `write` takes a
        // string, so those bytes are staged and committed by the host tool
        // that can raise the `edit` permission before anything hits disk.
        const binaryWrite = binaryWritePayload(parsed)
        if (binaryWrite) {
          if (!this.advertisedToolNameSet.has(CURSOR_IMAGE_SAVE_TOOL)) {
            const reason =
              "This OpenCode agent cannot write binary file content. " +
              "Do not retry this write with the same bytes."
            if (!rejectExec(this, parsed, reason, "binary write unsupported")) return true
            return false
          }
          const workspaceRoot = workspaceRootFromRequestContext(session.requestContext)
          const projectDir = ensureOpencodeProjectDir(workspaceRoot)
          const target = remapCursorImageWritePath(binaryWrite.path, {
            workspaceRoot,
            projectDir,
          })
          let imageId: string
          try {
            imageId = stageCursorImage({
              path: target,
              projectDir,
              mime: imageMimeForPath(target),
              data: binaryWrite.data,
              sessionId: session.openCodeSessionId,
            })
          } catch (error) {
            if (!rejectExec(this, parsed, (error as Error).message, "binary write too large")) return true
            return false
          }
          if (displayCallId) session.displayToolCalls.delete(displayCallId)
          sessionManager.registerPending(parsed.id, session, parsed.resultField, CURSOR_IMAGE_SAVE_TOOL, false, {
            ...parsed.resultMetadata,
            path: target,
            binaryWriteBytes: undefined,
            imageByteLength: binaryWrite.data.length,
          })
          const toolCallId = `cursor_${session.sessionId}_${parsed.id}`
          trace(
            `exec: binary write STAGED toolCallId=${toolCallId} ` +
              `requested=${JSON.stringify(binaryWrite.path)} target=${JSON.stringify(target)} ` +
              `bytes=${binaryWrite.data.length}`,
          )
          this.closeOpenSpans()
          this.safeEnqueue({
            type: "tool-call",
            toolCallId,
            toolName: CURSOR_IMAGE_SAVE_TOOL,
            input: JSON.stringify({ image_id: imageId }),
          } as V3Part)
          session.progressEmittedHostTools = (session.progressEmittedHostTools ?? 0) + 1
          this.emitFinish(undefined, { unified: "tool-calls", raw: undefined })
          return true
        }
        // Cursor has native capabilities (Task, filesystem, shell, etc.) in
        // addition to the MCP descriptors sent by this provider. The model
        // can request one even when the current OpenCode agent omitted its
        // corresponding host tool. Emitting that request makes OpenCode
        // manufacture an `invalid` tool result. Refuse it on the held-open
        // Cursor exec channel instead, using the request's exact typed result.
        if (!this.advertisedToolNameSet.has(parsed.toolName)) {
          const available = this.advertisedToolNames.length > 0 ? this.advertisedToolNames.join(", ") : "none"
          const reason =
            `OpenCode tool '${parsed.toolName}' is unavailable for the current agent. ` +
            `Available tools: ${available}. Continue using only available tools; do not retry ` +
            `'${parsed.toolName}'.`
          trace(
            `exec: unavailable catalog target toolName=${parsed.toolName} ` +
              `advertised=[${this.advertisedToolNames.join(",")}]`,
          )
          if (!rejectExec(this, parsed, reason, "unavailable tool")) return true
          return false
        }
        if (recoverCorrelatedEditRead(this, parsed, displayCallId)) return false
        if (rejectMissingReadTarget(this, parsed)) {
          if (displayCallId) session.displayToolCalls.delete(displayCallId)
          return false
        }
        if (displayCallId) {
          session.displayToolCalls.delete(displayCallId)
          trace(`exec: claimed display callId=${displayCallId}`)
        }
        const tc = buildToolCallPart(parsed, session.sessionId)
        if (
          parsed.resultField === "shell_stream" ||
          parsed.resultField === "shell_result" ||
          parsed.resultField === "background_shell_spawn_result"
        ) {
          registerCursorShellCall(tc.toolCallId, parsed.resultMetadata)
        }
        // Keep the stream open; the result arrives on the next doStream call.
        sessionManager.registerPending(
          parsed.id,
          session,
          parsed.resultField,
          parsed.toolName,
          false,
          parsed.resultMetadata,
        )
        // tc.input is already a JSON string (LanguageModelV3ToolCall.input).
        trace(
          `exec: EMITTED tool-call toolCallId=${tc.toolCallId} toolName=${tc.toolName} inputLen=${tc.input.length}`,
        )
        // Close open text/reasoning spans before tool-call (required by AI SDK V3).
        this.closeOpenSpans()
        this.safeEnqueue({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          input: tc.input,
        } as V3Part)
        session.progressEmittedHostTools = (session.progressEmittedHostTools ?? 0) + 1
        this.emitFinish(undefined, { unified: "tool-calls", raw: undefined })
        return true
      }
      // Never guess a response type for an unknown exec variant. Request and
      // result field numbers are not universally identical; a structurally
      // wrong reply recreates the heartbeat-only deadlock. Fail promptly so
      // schema drift is actionable.
      const variantField = detectExecVariantField(payload)
      const variant = variantField !== undefined ? cursorExecVariantByRequestField(variantField) : undefined
      if (variant?.handling === "unsupported") {
        // A known Cursor-native capability with no AI SDK bridge (fetch,
        // diagnostics, ...): answer its exact typed result as an error so
        // the model routes around it, and keep pumping instead of
        // aborting the run like a truly unknown variant below.
        const reason =
          `OpenCode does not support Cursor '${variant.requestName}'. ` +
          `Continue without it; do not retry this request.`
        try {
          for (const frame of buildExecClientMessages({
            execId: esmId,
            resultField: variant.resultName,
            output: "",
            error: reason,
            toolName: variant.requestName,
            workspaceRoot: workspaceRootFromRequestContext(session.requestContext),
          })) {
            session.stream.write(frame)
          }
          trace(`exec UNSUPPORTED: id=${esmId} variant=${variant.requestName} error{unsupported}`)
        } catch (e) {
          const error = new Error(
            `Failed to refuse Cursor exec variant (${variant.requestName}): ${(e as Error).message}`,
          )
          trace(`exec UNSUPPORTED reply FAILED ${error.message}`)
          this.safeError(error)
          sessionManager.close(session)
          return true
        }
        return false
      }
      const variantDescription = describeCursorExecVariant(variantField)
      const hex = Array.from(payload.subarray(0, 48))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("")
      trace(
        `exec UNMAPPED: id=${esmId} variant=${variantDescription} keys=[${Object.keys(esm).join(",")}] hex=${hex}`,
      )
      this.failRunProtocol(
        `Unsupported Cursor exec variant ${variantDescription} (id=${esmId})`,
        RUN_REQUEST_UNSUPPORTED,
      )
    }
    return false
  }

  private async onInteractionQuery(payload: Uint8Array, interactionQuery: Record<string, unknown>): Promise<boolean> {
    const session = this.session
    // InteractionQuery is a must-reply channel, just like exec and KV. AI
    // SDK has no Cursor-specific UI callback, so answer immediately with the
    // policy from protocol/interactions.ts (AskQuestion bridge, CreatePlan
    // write under OpenCode defaults, GenerateImage approve when saveable).
    const handled = (() => {
      try {
        return handleInteractionQuery(interactionQuery, payload, {
          canBridgeAskQuestion: session.allowTools && this.advertisedToolNameSet.has("question"),
          allowTools: session.allowTools,
          advertisedTools: this.advertisedToolNameSet,
          canSaveGeneratedImage: session.allowTools && this.advertisedToolNameSet.has(CURSOR_IMAGE_SAVE_TOOL),
          canBridgeCreatePlan:
            session.allowTools &&
            isBridgedCursorPlanModeActive(session.openCodeSessionId) &&
            this.advertisedToolNameSet.has(CURSOR_PLAN_STAGE_TOOL) &&
            this.advertisedToolNameSet.has("write"),
          planModeActive: isCursorPlanModeActive(session.openCodeSessionId),
          ...(getActiveCursorMode(session.openCodeSessionId)
            ? { activeCursorModeId: getActiveCursorMode(session.openCodeSessionId)! }
            : {}),
          workspaceRoot: workspaceRootFromRequestContext(session.requestContext),
        })
      } catch {
        return this.failRunProtocol("Cursor interaction request could not be handled", RUN_REQUEST_UNSUPPORTED)
      }
    })()
    try {
      if (handled.outcome === "acknowledged") {
        this.replaySafety.markBarrier("stateful-interaction")
      }
      if (handled.reply) {
        await writeWithBackpressure(session.stream, handled.reply, `interaction reply id=${handled.id}`)
      }
      trace(
        `interaction_query: replied id=${handled.id} variant=${handled.variantName} ` +
          `field=${handled.variantField} outcome=${handled.outcome}` +
          (handled.reply ? "" : " (deferred to host tool result)"),
      )
      if (handled.generateImage) {
        trace(
          `interaction_query: approved generate_image target=` +
            `${JSON.stringify(handled.generateImage.filePath || "(unspecified)")} ` +
            `refs=${handled.generateImage.referenceImagePaths.length} ` +
            `cursorToolCallId=${handled.generateImage.toolCallId || "(none)"}`,
        )
      }
    } catch (error) {
      rethrowTransportWriteFailure(error)
      this.failRunProtocol("Cursor interaction reply failed", RUN_REPLY_FAILED)
    }
    if (handled.outcome === "bridged" && handled.askQuestion) {
      // Cursor raised AskQuestion; OpenCode owns the tool loop, so the prompt
      // leaves as a `question` tool call and this doStream ends. The Run stays
      // open on the pending entry, and the answer is written back on the next
      // continuation (InteractionResponse when Cursor is blocking on it,
      // ConversationAction when it was already acknowledged with `async`).
      const ask = handled.askQuestion
      const execId = session.nextBridgedExecId++
      sessionManager.registerPending(execId, session, ASK_QUESTION_RESULT_FIELD, "question", false, {
        interactionId: handled.id,
        askQuestionArgs: ask.args,
        askQuestionRawArgs: ask.rawArgs,
        askQuestionToolCallId: ask.toolCallId,
      })
      const toolCallId = `cursor_${session.sessionId}_${execId}`
      const input = JSON.stringify(askQuestionToolInput(ask.args))
      trace(
        `interaction_query: BRIDGED ask_question id=${handled.id} toolCallId=${toolCallId} ` +
          `questions=${ask.args.questions.length} runAsync=${ask.args.runAsync} ` +
          `cursorToolCallId=${ask.toolCallId || "(none)"}`,
      )
      this.closeOpenSpans()
      this.safeEnqueue({
        type: "tool-call",
        toolCallId,
        toolName: "question",
        input,
      } as V3Part)
      session.progressEmittedHostTools = (session.progressEmittedHostTools ?? 0) + 1
      this.emitFinish(undefined, { unified: "tool-calls", raw: undefined })
      return true
    }
    if (handled.outcome === "approved" && handled.switchMode) {
      // Same-mode no-op: Cursor was released with approved{}. Record the
      // active id so later Runs keep a consistent reminder. Plan/spec enter
      // is rejected before this path.
      const sw = handled.switchMode
      setActiveCursorMode(session.openCodeSessionId, sw.args.targetModeId, {
        bridgedPlanEntered: false,
      })
      trace(
        `interaction_query: APPROVED switch_mode id=${handled.id} ` +
          `target=${JSON.stringify(sw.args.targetModeId)} (same-mode no-op) ` +
          `cursorToolCallId=${sw.toolCallId || "(none)"}`,
      )
      return false
    }
    if (handled.outcome === "bridged" && handled.switchMode) {
      // Cursor raised SwitchMode; the host owns the outcome, so leave-plan
      // goes out as a tool call (native plan_exit, or the emulated `question`
      // approval prompt) and this doStream ends. The Run stays open on the
      // pending entry; approved/rejected is written back on the next
      // continuation while Cursor is still blocking on the query.
      const sw = handled.switchMode
      const bridgeKind = sw.bridge.kind
      const toolName = sw.toolName ?? "plan_exit"
      const execId = session.nextBridgedExecId++
      sessionManager.registerPending(execId, session, SWITCH_MODE_RESULT_FIELD, toolName, false, {
        interactionId: handled.id,
        switchModeTarget: sw.args.targetModeId,
        switchModeToolCallId: sw.toolCallId,
        switchModeBridgeKind: bridgeKind,
      })
      const toolCallId = `cursor_${session.sessionId}_${execId}`
      const input = JSON.stringify(sw.bridge.kind === "question" ? sw.bridge.input : switchModeToolInput())
      trace(
        `interaction_query: BRIDGED switch_mode id=${handled.id} toolCallId=${toolCallId} ` +
          `bridge=${bridgeKind} hostTool=${toolName} ` +
          `target=${JSON.stringify(sw.args.targetModeId)} ` +
          `cursorToolCallId=${sw.toolCallId || "(none)"}`,
      )
      this.closeOpenSpans()
      this.safeEnqueue({
        type: "tool-call",
        toolCallId,
        toolName,
        input,
      } as V3Part)
      session.progressEmittedHostTools = (session.progressEmittedHostTools ?? 0) + 1
      this.emitFinish(undefined, { unified: "tool-calls", raw: undefined })
      return true
    }
    if (handled.outcome === "bridged" && handled.createPlan) {
      // Either a host plan-stage tool (writes the plan and runs its own
      // approval UI) or the emulated prompt after the provider already wrote
      // the plan. Both hold Cursor's query open until the user decides.
      const plan = handled.createPlan
      const staged = plan.bridge.kind === "stage" ? createPlanStageInput(plan.args) : undefined
      const planUri = staged?.plan_uri ?? plan.planUri ?? ""
      const input = staged ?? plan.questionInput ?? {}
      const stageExecId = session.nextBridgedExecId++
      sessionManager.registerPending(stageExecId, session, CREATE_PLAN_RESULT_FIELD, plan.toolName, false, {
        interactionId: handled.id,
        createPlanToolCallId: plan.toolCallId,
        createPlanBridgeKind: plan.bridge.kind,
        // The host echoes the prompt verbatim; it anchors the answer parse.
        createPlanQuestion: plan.questionInput?.questions[0]?.question ?? "",
        planUri,
        // Absolute path for the post-Yes OpenCode kickoff (plan_exit shape).
        ...(typeof plan.planPath === "string" && plan.planPath.trim() ? { planPath: plan.planPath.trim() } : {}),
        workspaceRoot: workspaceRootFromRequestContext(session.requestContext),
      })
      const stageToolCallId = `cursor_${session.sessionId}_${stageExecId}`
      trace(
        `interaction_query: BRIDGED create_plan id=${handled.id} bridge=${plan.bridge.kind} ` +
          `hostTool=${plan.toolName} stageToolCallId=${stageToolCallId} ` +
          `planUri=${planUri || "(none)"} cursorToolCallId=${plan.toolCallId || "(none)"}`,
      )
      // Cursor sends the plan body through the interaction query, not the
      // text stream, so nothing has shown it yet. Put it in the transcript
      // before asking - approving a plan you cannot read is not approval.
      if (plan.planReview) this.emitText(plan.planReview)
      this.closeOpenSpans()
      this.safeEnqueue({
        type: "tool-call",
        toolCallId: stageToolCallId,
        toolName: plan.toolName,
        input: JSON.stringify(input),
      } as V3Part)
      session.progressEmittedHostTools = (session.progressEmittedHostTools ?? 0) + 1
      this.emitFinish(undefined, { unified: "tool-calls", raw: undefined })
      return true
    }
    return false
  }

  private async onKv(payload: Uint8Array, kv: Record<string, unknown>) {
    const session = this.session
    // KV blob channel: ack set_blob / answer get_blob, then keep pumping.
    // Not replying hangs the turn - see protocol/kv.ts.
    trace(
      `kv frame raw: gunzippedLen=${payload.length} id=${kv.id ?? "?"} ` +
        `get=${!!kv.get_blob_args} set=${!!kv.set_blob_args} ` +
        `getBlobIdLen=${(kv.get_blob_args as any)?.blob_id?.length ?? "-"} ` +
        `setBlobIdLen=${(kv.set_blob_args as any)?.blob_id?.length ?? "-"} ` +
        `setDataLen=${(kv.set_blob_args as any)?.blob_data?.length ?? "-"}`,
    )
    const handled = handleKvServerMessage(kv, session)
    if (handled) {
      try {
        await writeWithBackpressure(
          session.stream,
          handled.reply,
          `KV ${handled.kind}_blob reply id=${handled.id}`,
        )
        trace(
          `kv replied: kind=${handled.kind} id=${handled.id} blobId=${handled.blobIdHex.slice(0, 16)}... ` +
            `found=${handled.found} echoed=${!!handled.echoed} ` +
            `replyBytes=${handled.reply.length} replyBlobBytes=${handled.replyBlobBytes} ` +
            `sessionBlobs=${session.blobs.size} convBlobs=${conversationBlobCount(session.conversationId)}`,
        )
      } catch (error) {
        rethrowTransportWriteFailure(error)
        this.failRunProtocol("Cursor KV reply failed", RUN_REPLY_FAILED)
      }
    } else {
      this.failRunProtocol("Cursor KV request could not be handled", RUN_REQUEST_UNSUPPORTED)
    }
  }
}

function rethrowTransportWriteFailure(error: unknown): void {
  if (error instanceof CursorProviderError && error.origin !== "protocol") throw error
}

async function nextFrameWithSemanticDeadline(session: CursorSession): Promise<IteratorResult<Frame>> {
  const remainingMs = session.semanticDeadlineAt - Date.now()
  if (remainingMs <= 0) {
    throw new CursorTransportError(`Cursor semantic-progress timeout after ${session.policy.semanticIdleMs}ms`, {
      transient: true,
      replaySafe: true,
      code: "CURSOR_SEMANTIC_IDLE_TIMEOUT",
    })
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  let rejectCancelled: ((error: CursorProviderError) => void) | undefined
  const deadline = new Promise<never>((_, reject) => {
    rejectCancelled = reject
    timer = setTimeout(() => {
      reject(
        new CursorTransportError(`Cursor semantic-progress timeout after ${session.policy.semanticIdleMs}ms`, {
          transient: true,
          replaySafe: true,
          code: "CURSOR_SEMANTIC_IDLE_TIMEOUT",
        }),
      )
    }, remainingMs)
    timer.unref?.()
  })
  session.semanticDeadlineCancel = () => {
    rejectCancelled?.(
      session.closeError ??
        new CursorTransportError("Cursor semantic wait cancelled locally", {
          transient: false,
          replaySafe: false,
        }),
    )
  }
  try {
    return await Promise.race([session.frames.next(), deadline])
  } finally {
    if (timer) clearTimeout(timer)
    session.semanticDeadlineCancel = null
  }
}

/** Normalize protobufjs bytes / Buffer / number[] into a Uint8Array. */
function normalizeCheckpointBytes(raw: unknown): Uint8Array | undefined {
  if (raw instanceof Uint8Array) return raw
  if (Buffer.isBuffer(raw)) return new Uint8Array(raw)
  if (Array.isArray(raw)) return Uint8Array.from(raw)
  if (raw && typeof raw === "object" && "type" in (raw as object) && "data" in (raw as object)) {
    // protobufjs sometimes yields { type: "Buffer", data: number[] }
    const data = (raw as { data: unknown }).data
    if (Array.isArray(data)) return Uint8Array.from(data)
  }
  return undefined
}

/** Preserve exact request-local Cursor counters as diagnostics. */
export function cursorTurnEndedProviderMetadata(
  te: Record<string, unknown>,
  tokenDetails?: CursorConversationTokenDetails,
  contextSource?: CursorContextUsageSource,
): {
  cursor: {
    usageVersion: number
    inputTokensRaw: number
    outputTokensRaw: number
    cacheReadRaw: number
    cacheWriteRaw: number
    reasoningTokensRaw: number
    context?: ReturnType<typeof cursorContextUsageMetadata>
  }
} {
  return {
    cursor: {
      usageVersion: 3,
      inputTokensRaw: turnEndedCounter(te, "input_tokens"),
      outputTokensRaw: turnEndedCounter(te, "output_tokens"),
      cacheReadRaw: turnEndedCounter(te, "cache_read"),
      cacheWriteRaw: turnEndedCounter(te, "cache_write"),
      reasoningTokensRaw: turnEndedCounter(te, "reasoning_tokens"),
      ...(tokenDetails ? { context: cursorContextUsageMetadata(tokenDetails, contextSource) } : {}),
    },
  }
}

/** Exported for tests - AI SDK V3 span ends that must precede finish / tool-call. */
export function spanEndParts(opts: {
  textStarted: boolean
  reasoningStarted: boolean
  textId: string
  reasoningId: string
}): Array<{ type: "text-end" | "reasoning-end"; id: string }> {
  const out: Array<{ type: "text-end" | "reasoning-end"; id: string }> = []
  if (opts.reasoningStarted) out.push({ type: "reasoning-end", id: opts.reasoningId })
  if (opts.textStarted) out.push({ type: "text-end", id: opts.textId })
  return out
}

