// Exec requests the pump answers on Cursor's own channel instead of handing them to OpenCode:
// refusals, the correlated edit read, and reads of missing paths. Each returns whether the
// request was answered here.
import fs from "node:fs"
import path from "node:path"
import { buildCompleteEditReadMessages } from "./protocol/editRemap.js"
import type { ParsedExecRequest } from "./protocol/execParse.js"
import { buildExecClientMessages, buildReadRejectionMessages } from "./protocol/execResult.js"
import { classifyMissingReadTarget, isUriReadTarget, resolveReadTargetPath } from "./protocol/readResult.js"
import { parseDisplayToolCall } from "./protocol/toolCallBridge.js"
import { workspaceRootFromRequestContext } from "./context/env.js"
import { trace } from "./debug.js"
import { sessionManager } from "./session.js"
import type { CursorPump } from "./pump.js"

/** Reply on Cursor's correlated exec channel without exposing a host tool call. */
export function rejectExec(pump: CursorPump, parsed: ParsedExecRequest, reason: string, label: string): boolean {
  const session = pump.session
  try {
    for (const frame of buildExecClientMessages({
      execId: parsed.id,
      resultField: parsed.resultField,
      output: "",
      error: reason,
      toolName: parsed.toolName,
      resultMetadata: parsed.resultMetadata,
      workspaceRoot: workspaceRootFromRequestContext(session.requestContext),
    })) {
      session.stream.write(frame)
    }
    trace(`exec: REFUSED ${label} toolName=${parsed.toolName} id=${parsed.id}`)
    return true
  } catch (e) {
    const error = new Error(`Failed to reject Cursor tool request (${label}): ${(e as Error).message}`)
    trace(`exec: REFUSED reply FAILED ${error.message}`)
    pump.safeError(error)
    sessionManager.close(session)
    return false
  }
}

/**
 * Cursor's streamed edit handshake needs the complete target before it sends
 * the replacement through write_args. OpenCode's ordinary read tool caps at
 * 50 KB, so forwarding this private prerequisite read teaches Cursor's editor
 * that a large file ends at the cap and produces a destructive replacement.
 *
 * Answer a correlated workspace-file read directly up to Cursor's own 50 MB
 * edit limit. Missing targets remain empty-file successes so creation can
 * continue. External and otherwise ineligible reads retain OpenCode's normal
 * permission-aware path.
 */
export function recoverCorrelatedEditRead(
  pump: CursorPump,
  parsed: ParsedExecRequest,
  displayCallId: string | undefined,
): boolean {
  const session = pump.session
  if (
    !displayCallId ||
    parsed.resultField !== "read_result" ||
    parsed.toolName !== "read" ||
    // `apply_patch` is the substitute this host offers when it withholds
    // `write` - the follow-up write_args is remapped onto it either way.
    !(pump.advertisedToolNameSet.has("write") || pump.advertisedToolNameSet.has("apply_patch"))
  )
    return false

  const stored = session.displayToolCalls.get(displayCallId)
  const display = parseDisplayToolCall(displayCallId, stored)
  if (display?.variant !== "edit_tool_call" || display.bridgeable === false) return false

  const requestedPath = typeof parsed.args.filePath === "string" ? parsed.args.filePath : ""
  const editPath = typeof display.args.path === "string" ? display.args.path : ""
  if (!requestedPath || !editPath) return false

  // Prefer env.workspace_paths - project_folder / workspace_project_dir are
  // Cursor metadata roots under <host-cache>/projects/, not the git tree.
  const workspaceRoot = workspaceRootFromRequestContext(session.requestContext)
  const resolvePath = (value: string) => path.resolve(workspaceRoot, value)
  const absolutePath = resolvePath(requestedPath)
  if (absolutePath !== resolvePath(editPath)) return false

  let exists = true
  try {
    fs.lstatSync(absolutePath)
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? (error as { code?: unknown }).code : undefined
    if (code !== "ENOENT") return false
    exists = false
  }

  if (exists) {
    // Do not bypass OpenCode's external-directory permission boundary, even
    // through a symlink rooted in the workspace.
    try {
      const realRoot = fs.realpathSync(workspaceRoot)
      const realTarget = fs.realpathSync(absolutePath)
      const relative = path.relative(realRoot, realTarget)
      if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        parsed.resultMetadata = {
          ...parsed.resultMetadata,
          correlatedEditCallId: displayCallId,
        }
        return false
      }

      const frames = buildCompleteEditReadMessages(parsed.id, absolutePath, requestedPath)
      if (!frames) return false
      for (const frame of frames) session.stream.write(frame)
      const editCall = session.editToolCalls?.get(displayCallId)
      if (editCall) editCall.completeRead = true
      trace(
        `exec: correlated edit read completed directly id=${parsed.id} ` +
          `path=${JSON.stringify(requestedPath)}; awaiting write_args`,
      )
      return true
    } catch {
      parsed.resultMetadata = {
        ...parsed.resultMetadata,
        correlatedEditCallId: displayCallId,
      }
      return false
    }
  }

  try {
    for (const frame of buildExecClientMessages({
      execId: parsed.id,
      resultField: parsed.resultField,
      output: "",
      toolName: parsed.toolName,
      resultMetadata: { path: requestedPath },
      workspaceRoot,
    })) {
      session.stream.write(frame)
    }
    trace(
      `exec: missing edit target treated as empty file id=${parsed.id} ` +
        `path=${JSON.stringify(requestedPath)}; awaiting write_args`,
    )
    return true
  } catch (e) {
    const error = new Error(`Failed to recover Cursor edit read: ${(e as Error).message}`)
    trace(`exec: edit read recovery FAILED ${error.message}`)
    pump.safeError(error)
    sessionManager.close(session)
    return true
  }
}

/**
 * A read of a path that does not exist would otherwise reach OpenCode as a
 * real tool call and raise a permission prompt for a file the user never had.
 * Cursor's own LocalReadExecutor instead resolves the target against the
 * workspace, stats it, and returns a typed ReadResult (file_not_found /
 * invalid_file) before execution. Mirror that here: reply on the held-open
 * exec channel with the exact typed case so the model receives a structured
 * observation and the host surfaces no prompt.
 *
 * Read-only by construction - write/edit targets are never checked, so
 * legitimate file creation (path resolves, file absent) is never denied. Runs
 * after recoverCorrelatedEditRead, which has already converted the edit
 * handshake read into an empty-file success. EACCES/EPERM and other stat
 * errors fall through to OpenCode so a genuine permission decision stands.
 */
export function rejectMissingReadTarget(pump: CursorPump, parsed: ParsedExecRequest): boolean {
  const session = pump.session
  if (parsed.toolName !== "read") return false
  const requested = typeof parsed.args.filePath === "string" ? parsed.args.filePath : ""
  if (!requested) return false
  // A scheme-addressed target is the advertised host executor's to resolve,
  // not a local file to stat. Rejecting it here would make any URI-backed
  // capability permanently unreachable through this provider.
  if (isUriReadTarget(requested)) {
    trace(`exec: forwarding URI read target id=${parsed.id} target=${JSON.stringify(requested)}`)
    return false
  }
  const workspaceRoot = workspaceRootFromRequestContext(session.requestContext)
  const absolutePath = resolveReadTargetPath(requested, workspaceRoot)
  const readResult = classifyMissingReadTarget(absolutePath)
  if (!readResult) return false
  try {
    for (const frame of buildReadRejectionMessages(parsed.id, readResult)) {
      session.stream.write(frame)
    }
    const kind = Object.keys(readResult)[0]
    trace(`exec: rejected missing read target id=${parsed.id} kind=${kind} ` + `path=${JSON.stringify(absolutePath)}`)
    return true
  } catch (e) {
    const error = new Error(`Failed to reject Cursor read of a missing path: ${(e as Error).message}`)
    trace(`exec: missing read rejection FAILED ${error.message}`)
    pump.safeError(error)
    sessionManager.close(session)
    return true
  }
}
