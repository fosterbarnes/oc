import path from "node:path"
import { trace } from "./debug.js"
import { decodeMessage, encodeMessage } from "./protocol/messages.js"
import { buildCompleteEditReadMessages } from "./protocol/editRemap.js"
import { buildExecClientMessages, buildExecStreamClose } from "./protocol/execResult.js"
import {
  buildAskQuestionInteractionReply,
  buildAsyncAskQuestionCompletion,
  buildCreatePlanInteractionReply,
  buildSwitchModeInteractionReply,
} from "./protocol/interactions.js"
import {
  ASK_QUESTION_RESULT_FIELD,
  type CursorAskQuestionArgs,
  askQuestionResultFromToolOutput,
} from "./protocol/askQuestion.js"
import {
  SWITCH_MODE_RESULT_FIELD,
  setActiveCursorMode,
  switchModeResultFromQuestionOutput,
  switchModeResultFromToolOutput,
} from "./protocol/switchMode.js"
import { CREATE_PLAN_NOT_APPROVED_REASON, CREATE_PLAN_RESULT_FIELD, createPlanApproved } from "./protocol/createPlan.js"
import {
  formatPlanKickoffPath,
  hasPlanExecutionKickoff,
  planPathFromUri,
  queuePlanExecutionKickoff,
} from "./planExecutionKickoff.js"
import { CURSOR_IMAGE_SAVE_TOOL } from "./protocol/generateImage.js"
import { IMAGE_PERMISSION_DENIED_PREFIX } from "./imageSave.js"
import { workspaceRootFromRequestContext } from "./context/env.js"
import { getSessionDirectory } from "./sessionDirectory.js"
import { sessionManager, type CursorSession, type PendingExec } from "./session.js"
import { CursorProtocolError } from "./errors.js"
import { consumeCursorShellResult } from "./shellTimeout.js"
import type { ExtractedToolResult } from "./prompt.js"
import { estimateTokens } from "./usage.js"

// Held-open Run continuations: deliver OpenCode tool results (and bridged AskQuestion,
// SwitchMode, CreatePlan answers) onto the Cursor session still waiting for them.

/**
 * OpenCode re-sends the full tool-result history on every continuation. Prefer
 * the newest result that still has a live pending exec on its tagged session.
 */
export function findContinuationSession(
  toolResults: Array<{ sessionId: string; execId: number }>,
): CursorSession | undefined {
  for (let i = toolResults.length - 1; i >= 0; i--) {
    const r = toolResults[i]
    const s = sessionManager.findByExecIds(r.sessionId, [r.execId])
    if (s) return s
  }
  return undefined
}

/**
 * Turn an OpenCode `question` tool result into the frame Cursor is waiting for.
 *
 * A synchronous AskQuestion still has its InteractionQuery open, so the answer
 * goes back as the InteractionResponse for that query id. A `run_async` one was
 * already released with `async{}`, so - exactly as Cursor CLI does - the answer
 * travels as a ConversationAction keyed by the originating tool call id, with
 * the server's own AskQuestionArgs bytes echoed back untouched.
 */
function buildAskQuestionContinuationFrame(pending: PendingExec, result: ExtractedToolResult): Uint8Array {
  const metadata = pending.resultMetadata ?? {}
  const args = metadata.askQuestionArgs as CursorAskQuestionArgs | undefined
  if (!args) throw new CursorProtocolError("Bridged AskQuestion lost its decoded arguments")
  const answer = askQuestionResultFromToolOutput(args, result.output, result.error !== undefined)
  if (!args.runAsync) {
    const interactionId = metadata.interactionId
    if (typeof interactionId !== "number") {
      throw new CursorProtocolError("Bridged AskQuestion lost its interaction id")
    }
    return buildAskQuestionInteractionReply(interactionId, answer)
  }
  const rawArgs = metadata.askQuestionRawArgs
  if (!(rawArgs instanceof Uint8Array)) {
    throw new CursorProtocolError("Bridged async AskQuestion lost its original arguments")
  }
  const toolCallId = metadata.askQuestionToolCallId
  return buildAsyncAskQuestionCompletion(typeof toolCallId === "string" ? toolCallId : "", rawArgs, answer)
}

/**
 * Turn the host's plan-approval outcome into the CreatePlan reply Cursor is
 * still blocking on. One contract across every channel: `success` means the
 * user approved execution, `error` means the plan was written but not accepted,
 * so the model keeps planning instead of starting work.
 *
 * A host plan-stage tool reports that outcome as tool success/failure. The
 * emulated path asks through `question`, so only an explicit "Yes" approves.
 * On approval the session leaves plan mode, which arms the agent-mode
 * `<system_reminder>` for the next Run.
 */
function buildCreatePlanContinuationFrame(
  pending: PendingExec,
  result: ExtractedToolResult,
  sessionKey: string | undefined,
  cursorSessionID: string,
): Uint8Array {
  const metadata = pending.resultMetadata ?? {}
  const interactionId = metadata.interactionId
  if (typeof interactionId !== "number") {
    throw new CursorProtocolError("Bridged CreatePlan lost its interaction id")
  }
  const planUri = metadata.planUri
  if (typeof planUri !== "string" || !planUri.trim()) {
    throw new CursorProtocolError("Bridged CreatePlan lost its plan URI")
  }

  const approved =
    metadata.createPlanBridgeKind === "approve"
      ? createPlanApproved(
          result.output,
          result.error !== undefined,
          typeof metadata.createPlanQuestion === "string" ? metadata.createPlanQuestion : "",
        )
      : result.error === undefined
  if (!approved) {
    const reason = result.error?.trim()
    return buildCreatePlanInteractionReply(interactionId, {
      error: { error: reason || CREATE_PLAN_NOT_APPROVED_REASON },
      plan_uri: "",
    })
  }

  // The question-emulated path can report execution approval only when a host
  // kickoff exists. Otherwise keep planning mode active and return an error.
  const instanceDirectory = getSessionDirectory(sessionKey) ?? ""
  if (metadata.createPlanBridgeKind === "approve" && !hasPlanExecutionKickoff(instanceDirectory)) {
    return buildCreatePlanInteractionReply(interactionId, {
      error: { error: "The plan was approved, but this host cannot start its execution turn." },
      plan_uri: planUri,
    })
  }

  // Approved: planning is over for this plan, so drop the plan-mode reminder
  // and hand the next Run the agent-mode contract, exactly as an approved
  // plan_exit does.
  setActiveCursorMode(sessionKey, "agent")

  // Only the question-emulated path needs the provider's synthetic build turn.
  // A host stage tool owns both approval and execution handoff itself.
  if (metadata.createPlanBridgeKind === "approve" && sessionKey) {
    const absolute =
      typeof metadata.planPath === "string" && metadata.planPath.trim()
        ? metadata.planPath.trim()
        : planPathFromUri(planUri)
    const workspaceRoot = typeof metadata.workspaceRoot === "string" ? metadata.workspaceRoot : undefined
    if (
      !queuePlanExecutionKickoff({
        sessionID: sessionKey,
        instanceDirectory,
        planPath: formatPlanKickoffPath(absolute, workspaceRoot),
        cursorSessionID,
      })
    ) {
      return buildCreatePlanInteractionReply(interactionId, {
        error: { error: "The plan was approved, but this host cannot start its execution turn." },
        plan_uri: planUri,
      })
    }
  }

  return buildCreatePlanInteractionReply(interactionId, {
    success: {},
    plan_uri: planUri,
  })
}

function buildSwitchModeContinuationFrame(
  pending: PendingExec,
  result: ExtractedToolResult,
  sessionKey: string | undefined,
): Uint8Array {
  const metadata = pending.resultMetadata ?? {}
  const interactionId = metadata.interactionId
  if (typeof interactionId !== "number") {
    throw new CursorProtocolError("Bridged SwitchMode lost its interaction id")
  }
  // A question-emulated exit carries the user's Yes/No as prose, not a plan
  // tool's success/failure, so it needs the answer parser rather than the
  // error-shaped mapping.
  const answer =
    metadata.switchModeBridgeKind === "question"
      ? switchModeResultFromQuestionOutput(result.output, result.error !== undefined)
      : switchModeResultFromToolOutput(result.output, result.error !== undefined)
  if ("approved" in answer) {
    const target = metadata.switchModeTarget
    if (typeof target === "string" && target.trim()) {
      const normalized = target.trim().toLowerCase()
      setActiveCursorMode(sessionKey, target, {
        bridgedPlanEntered: normalized === "plan" || normalized === "spec",
      })
    }
  }
  return buildSwitchModeInteractionReply(interactionId, answer)
}

/**
 * Deliver trailing tool results onto a live continuation session.
 * Returns the same session when writes succeed (or only bridged results were
 * cleared). Returns undefined after closing the session when a write fails, so
 * the caller can rebase onto a fresh Run instead of pumping a dead stream.
 */
export function deliverContinuationResults(
  session: CursorSession,
  trailingToolResults: ExtractedToolResult[],
): CursorSession | undefined {
  const pendingResults = trailingToolResults.filter(
    (r) => r.sessionId === session.sessionId && session.pending.has(r.execId),
  )
  trace(
    `continuation: ${trailingToolResults.length} trailing tool result(s), ` +
      `${pendingResults.length} pending for sessionId=${session.sessionId} ` +
      `pending={${[...session.pending.keys()].join(",")}}`,
  )
  for (const r of pendingResults) {
    const claim = sessionManager.claim(session.sessionId, r.execId)
    if ("kind" in claim) {
      if (claim.kind === "deliverable") {
        throw new CursorProtocolError("Cursor continuation claim remained unclaimed")
      }
      if (claim.kind === "duplicate") {
        trace(`continuation: skipped duplicate execId=${r.execId} reason=${claim.reason}`)
        continue
      }
      trace(`continuation: unavailable execId=${r.execId} reason=${claim.reason}`)
      return undefined
    }
    const pending = claim.pending
    let frames: Uint8Array[] = []
    if (pending.resultField === ASK_QUESTION_RESULT_FIELD) {
      // A bridged Cursor AskQuestion. The host tool result carries the user's
      // choices; translate them back into the Cursor result the interaction is
      // waiting for (or into the deferred completion, when Cursor was already
      // released with `async`).
      try {
        frames = [buildAskQuestionContinuationFrame(pending, r)]
      } catch (error) {
        trace(`continuation: ask_question encode FAILED execId=${r.execId} err=${(error as Error).message}`)
        sessionManager.close(session, "result-write-failed")
        return undefined
      }
    } else if (pending.resultField === SWITCH_MODE_RESULT_FIELD) {
      // Bridged SwitchMode: host plan_exit (or the emulated question) outcome
      // becomes approved{} or rejected{reason} on the still-open InteractionQuery.
      // Approval also arms the CLI-shaped mode reminder for the next Run.
      try {
        frames = [buildSwitchModeContinuationFrame(pending, r, session.openCodeSessionId)]
      } catch (error) {
        trace(`continuation: switch_mode encode FAILED execId=${r.execId} err=${(error as Error).message}`)
        sessionManager.close(session, "result-write-failed")
        return undefined
      }
    } else if (pending.resultField === CREATE_PLAN_RESULT_FIELD) {
      try {
        frames = [buildCreatePlanContinuationFrame(pending, r, session.openCodeSessionId, session.sessionId)]
      } catch (error) {
        trace(`continuation: create_plan encode FAILED execId=${r.execId} err=${(error as Error).message}`)
        sessionManager.close(session, "result-write-failed")
        return undefined
      }
    } else if (!pending.bridged) {
      try {
        const shellResult =
          pending.resultField === "shell_stream" || pending.resultField === "background_shell_spawn_result"
            ? consumeCursorShellResult(r.toolCallId, r.output)
            : undefined
        const workspaceRoot = workspaceRootFromRequestContext(session.requestContext)
        const correlatedEditCallId = pending.resultMetadata?.correlatedEditCallId
        const requestedPath = pending.resultMetadata?.path
        const correlatedEdit =
          !r.error &&
          pending.resultField === "read_result" &&
          pending.toolName === "read" &&
          typeof correlatedEditCallId === "string" &&
          typeof requestedPath === "string"
            ? session.editToolCalls?.get(correlatedEditCallId)
            : undefined
        if (correlatedEdit) {
          const absolutePath = path.resolve(workspaceRoot, requestedPath as string)
          if (absolutePath === path.resolve(workspaceRoot, correlatedEdit.path)) {
            frames = buildCompleteEditReadMessages(r.execId, absolutePath, requestedPath as string) ?? []
            if (frames.length > 0) {
              correlatedEdit.completeRead = true
              trace(
                `continuation: upgraded authorized correlated edit read execId=${r.execId} ` +
                  `path=${JSON.stringify(requestedPath)}`,
              )
            }
          }
        }
        // A refused image commit is Cursor's own `permission_denied` variant,
        // not a generic write error: its agent branches on that case. The
        // marker is set by this provider's own tool, so matching it is a
        // contract rather than a guess at someone else's message text.
        if (
          pending.toolName === CURSOR_IMAGE_SAVE_TOOL &&
          pending.resultField === "write_result" &&
          r.error?.includes(IMAGE_PERMISSION_DENIED_PREFIX)
        ) {
          const deniedPath = typeof pending.resultMetadata?.path === "string" ? pending.resultMetadata.path : ""
          frames = [
            encodeMessage("AgentClientMessage", {
              exec_client_message: {
                id: r.execId,
                write_result: {
                  permission_denied: {
                    path: deniedPath,
                    directory: deniedPath ? path.dirname(deniedPath) : "",
                    operation: "write",
                    error: r.error.replace(`${IMAGE_PERMISSION_DENIED_PREFIX} `, ""),
                    is_readonly: false,
                  },
                },
              },
            }),
          ]
        }
        // A committed image reports the file Cursor asked about, not the tool's
        // prose. `buildExecClientMessages` would otherwise put the message's
        // character count in `WriteSuccess.file_size`.
        if (
          frames.length === 0 &&
          !r.error &&
          pending.toolName === CURSOR_IMAGE_SAVE_TOOL &&
          pending.resultField === "write_result"
        ) {
          frames = [
            encodeMessage("AgentClientMessage", {
              exec_client_message: {
                id: r.execId,
                write_result: {
                  success: {
                    path: typeof pending.resultMetadata?.path === "string" ? pending.resultMetadata.path : "",
                    lines_created: 0,
                    file_size:
                      typeof pending.resultMetadata?.imageByteLength === "number"
                        ? pending.resultMetadata.imageByteLength
                        : 0,
                  },
                },
              },
            }),
          ]
        }
        if (frames.length === 0) {
          frames = buildExecClientMessages({
            execId: r.execId,
            resultField: pending.resultField,
            output: shellResult?.output ?? r.output,
            error: r.error,
            toolName: pending.toolName ?? r.toolName,
            resultMetadata: pending.resultMetadata,
            shellOutcome: shellResult?.outcome,
            workspaceRoot,
          })
        }
        const last = frames.at(-1)
        const closed = last
          ? (decodeMessage("AgentClientMessage", last) as {
              exec_client_control_message?: { stream_close?: { id?: number } }
            }).exec_client_control_message?.stream_close?.id === r.execId
          : false
        if (!closed) frames.push(buildExecStreamClose(r.execId))
      } catch (error) {
        trace(`continuation: result encode FAILED execId=${r.execId} err=${(error as Error).message}`)
        sessionManager.close(session, "result-write-failed")
        return undefined
      }
    }
    const outcome = sessionManager.deliverClaim(claim, frames)
    if (outcome.kind !== "delivered") {
      trace(`continuation: delivery stopped execId=${r.execId} reason=${outcome.reason}`)
      if (outcome.kind === "duplicate") continue
      return undefined
    }
    session.usageEstimate.inputTokens += estimateTokens(r.output.length)
    if (pending.bridged) {
      trace(
        `continuation: completed bridged result execId=${r.execId} toolName=${pending.toolName ?? r.toolName} outLen=${r.output.length}`,
      )
      continue
    }
    const resultKind =
      pending.resultField === ASK_QUESTION_RESULT_FIELD
        ? "ask_question answer"
        : pending.resultField === SWITCH_MODE_RESULT_FIELD
          ? "switch_mode answer"
          : pending.resultField === CREATE_PLAN_RESULT_FIELD
            ? "create_plan answer"
            : "exec result"
    trace(
      `continuation: wrote ${resultKind} execId=${r.execId} field=${pending.resultField} ` +
        `frames=${outcome.framesWritten} outLen=${r.output.length}`,
    )
  }
  return session
}
