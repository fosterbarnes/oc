/**
 * Asks oc before Claude runs a built-in tool, through the CLI's stream-json `PreToolUse` callback.
 * Handled per process, because a callback can arrive while no turn is attached (a background wake)
 * or while a turn ignores other lines (an account switch). Anything but a clear allow denies.
 */
import { writeControlResponse } from "./controlRequest.js"
import { log } from "./logger.js"
import type { ActiveProcess } from "./sessionManager.js"
import { claudeToolGuards } from "./shared.js"

const INIT_REQUEST_ID = "oc-tool-guard-init"
const CALLBACK_ID = "ocToolGuard"
// An approval can wait overnight. The CLI blocks the tool if this ever runs out.
const CALLBACK_TIMEOUT_SECONDS = 7 * 24 * 60 * 60

export function startToolGuard(ap: ActiveProcess) {
  ap.proc.stdin?.write(
    JSON.stringify({
      type: "control_request",
      request_id: INIT_REQUEST_ID,
      request: {
        subtype: "initialize",
        hooks: {
          PreToolUse: [{ matcher: "*", hookCallbackIds: [CALLBACK_ID], timeout: CALLBACK_TIMEOUT_SECONDS }],
        },
      },
    }) + "\n",
  )
}

/** True when `line` belonged to the guard and must not reach a turn. */
export function handleToolGuardLine(ap: ActiveProcess, line: string) {
  if (!line.includes(INIT_REQUEST_ID) && !line.includes('"hook_callback"')) return false
  const message = parse(line)
  if (message?.type === "control_response" && message.response?.request_id === INIT_REQUEST_ID) {
    if (message.response.subtype === "success") return true
    log.error("claude refused oc's tool guard; stopping the process", { error: message.response.error })
    ap.closing = true
    ap.proc.kill()
    return true
  }
  if (message?.type !== "control_request" || message.request?.subtype !== "hook_callback") return false
  void answer(ap, message.request_id, message.request)
  return true
}

async function answer(ap: ActiveProcess, requestID: string, request: GuardRequest) {
  const guard = ap.opencodeSessionID ? claudeToolGuards.get(ap.opencodeSessionID) : undefined
  const tool = request.input?.tool_name
  const callID = request.tool_use_id ?? request.input?.tool_use_id
  const abort = new AbortController()
  const stop = () => abort.abort()
  ap.proc.once("exit", stop)
  ap.guardPending = (ap.guardPending ?? 0) + 1
  const denial =
    request.callback_id !== CALLBACK_ID || !guard || !tool || !callID
      ? "oc could not check this tool call, so it was blocked."
      : await guard(tool, request.input?.tool_input ?? {}, callID, abort.signal).catch((error: unknown) => {
          log.warn("tool guard failed; blocking the call", { tool, error: String(error) })
          return "oc could not check this tool call, so it was blocked."
        })
  ap.guardPending -= 1
  ap.proc.off("exit", stop)
  writeControlResponse(
    ap.proc,
    requestID,
    denial
      ? {
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: denial,
          },
        }
      : {},
  )
}

type GuardRequest = {
  subtype?: string
  callback_id?: string
  tool_use_id?: string
  input?: { tool_name?: string; tool_use_id?: string; tool_input?: Record<string, unknown> }
}
type GuardMessage = {
  type?: string
  request_id: string
  request?: GuardRequest
  response?: { request_id?: string; subtype?: string; error?: string }
}

function parse(line: string): GuardMessage | undefined {
  try {
    return JSON.parse(line) as GuardMessage
  } catch {
    return undefined
  }
}
