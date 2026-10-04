/**
 * Claude stream-json control requests. oc makes every permission decision
 * through its proxied tools, so `can_use_tool` is always denied: reaching it
 * means a tool slipped past the proxy.
 */
import type { ClaudeStreamMessage } from "./types.js"
import { denyMessageForTool, isAskUserQuestionTool } from "./ask-user-question.js"
import { log } from "./logger.js"

export function writeControlResponse(
  proc: import("child_process").ChildProcess,
  requestId: string,
  response?: Record<string, unknown>,
): void {
  const payload = {
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response,
    },
  }

  try {
    proc.stdin?.write(JSON.stringify(payload) + "\n")
  } catch (error) {
    log.warn("failed to write control response", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Handle Claude stream-json control requests (`can_use_tool`, etc.) and
 * respond via stdin with a matching `control_response`.
 */
export function handleControlRequest(
  msg: ClaudeStreamMessage,
  proc: import("child_process").ChildProcess,
): boolean {
  if (msg.type !== "control_request") return false
  const requestId = msg.request_id
  const request = msg.request
  if (!requestId || !request?.subtype) return false

  if (request.subtype === "can_use_tool") {
    const toolName = request.tool_name ?? "unknown"
    writeControlResponse(proc, requestId, {
      behavior: "deny",
      message: denyMessageForTool(toolName),
      toolUseID: request.tool_use_id,
    })
    // AskUserQuestion is expected here when the question proxy is off; the
    // question is rendered as text. Anything else bypassed oc's permissions.
    if (isAskUserQuestionTool(toolName)) log.info("control request denied", { requestId, toolName })
    else log.warn("tool reached can_use_tool outside the proxy; denied", { requestId, toolName })
    return true
  }

  // For control request subtypes we don't actively handle yet, acknowledge
  // with an empty success so the CLI stream does not stall.
  writeControlResponse(proc, requestId, {})
  log.debug("control request acknowledged", {
    requestId,
    subtype: request.subtype,
  })
  return true
}
