import path from "node:path"
import { encodeMessage } from "./messages.js"
import { traceRequestContextPaths } from "../debug.js"
import { BACKGROUND_SHELL_MARKER, type CursorShellOutcome } from "../shellTimeout.js"
import {
  countLines,
  parseOpenCodeReadMetadata,
  readFileLineCount,
  readFileSize,
  readOutputTruncated,
  readRangeApplied,
  readTruncationMessage,
  readTruncationNotice,
  restoreCompleteReadTerminator,
  unwrapReadOutput,
} from "./readResult.js"
import { str } from "./values.js"

// Exec variant field number whose reply is the server-initiated request_context
// probe (ExecServerMessage #10 -> ExecClientMessage #10). request/result share a
// field number for every exec variant, so this is also the result field.
export const REQUEST_CONTEXT_RESULT_FIELD = 10

/**
 * Encode a pre-execution read rejection as the exact frames Cursor's client
 * emits: the ExecClientMessage carrying the typed ReadResult oneof case, then
 * the ACM #5 stream_close for that id. `readResult` is the case object from
 * classifyMissingReadTarget (e.g. `{ file_not_found: { path } }`).
 */
export function buildReadRejectionMessages(execId: number, readResult: Record<string, unknown>): Uint8Array[] {
  return [
    encodeMessage("AgentClientMessage", {
      exec_client_message: {
        id: execId,
        local_execution_time_ms: 0,
        read_result: readResult,
      },
    }),
    buildExecStreamClose(execId),
  ]
}

// ── Build ExecClientMessage for a tool result ──

export type ToolResultInput = {
  execId: number
  /** ExecClientMessage result field (from ParsedExecRequest.resultField). */
  resultField: string
  output: string
  error?: string
  executionTimeMs?: number
  /**
   * Resolved opencode tool name (read/write/grep/…). Gates read-envelope
   * unwrapping on the mcp_result path so non-read MCP output is never
   * rewritten. read_result is always a read, so it unwraps regardless.
   */
  toolName?: string
  /** Original request fields required by a typed result (background shell). */
  resultMetadata?: Record<string, unknown>
  /** Structured shell completion captured by the OpenCode plugin hook. */
  shellOutcome?: CursorShellOutcome
  /**
   * Workspace root for result shapes that must name a directory
   * (grep_result workspace_results keys, ls_result directory_tree_root).
   * Must not fall back to process.cwd() - the OpenCode 2.0 daemon's cwd is
   * often $HOME and would re-advertise the wrong folder to the model.
   */
  workspaceRoot?: string
}

/**
 * Build one or more ExecClientMessage frames for a tool result.
 * Shell replies are a sequence of ShellStream oneofs under the same id  -
 * Start → stdout/stderr → exit - then an ACM #5 stream_close so the server
 * knows the client finished streaming (CLI always sends this; without it
 * shell execs hang on heartbeats forever).
 */
export function buildExecClientMessages(input: ToolResultInput): Uint8Array[] {
  const resultField = input.resultField || "mcp_result"
  const frames: Uint8Array[] = []

  if (resultField === "shell_stream") {
    // Real clients always emit Start → Stdout/Stderr* → Exit (capture/tests).
    frames.push(encodeShellStream(input.execId, undefined, { start: {} }))
    if (input.error) {
      frames.push(encodeShellStream(input.execId, undefined, { stderr: { data: input.error } }))
      frames.push(encodeShellStream(input.execId, input.executionTimeMs, { exit: { code: 1, aborted: false } }))
    } else {
      if (input.output) {
        frames.push(encodeShellStream(input.execId, undefined, { stdout: { data: input.output } }))
      }
      if (input.shellOutcome?.kind === "backgrounded") {
        frames.push(
          encodeShellStream(input.execId, input.executionTimeMs, {
            backgrounded: {
              shell_id: input.shellOutcome.shellId,
              command: input.shellOutcome.command,
              working_directory: input.shellOutcome.workingDirectory,
              pid: input.shellOutcome.pid,
              ms_to_wait: input.shellOutcome.msToWait,
              reason: input.shellOutcome.reason,
            },
          }),
        )
      } else if (input.shellOutcome?.kind === "timeout") {
        frames.push(
          encodeShellStream(input.execId, input.executionTimeMs, {
            // Native CLI represents timeout structurally. ShellAbortReason.TIMEOUT=2.
            exit: { code: 0, aborted: true, abort_reason: 2 },
          }),
        )
      } else {
        const exitCode =
          input.shellOutcome?.kind === "exit" ? Math.max(0, Math.min(0xffff_ffff, input.shellOutcome.code)) : 0
        frames.push(
          encodeShellStream(input.execId, input.executionTimeMs, {
            exit: { code: exitCode, aborted: false },
          }),
        )
      }
    }
  } else {
    const clientMsg: Record<string, unknown> = {
      id: input.execId,
      local_execution_time_ms: input.executionTimeMs ?? 0,
    }
    clientMsg[resultField] = buildTypedExecResult(
      resultField,
      input.output,
      input.error,
      input.toolName,
      input.resultMetadata,
      input.shellOutcome,
      input.workspaceRoot,
      input.executionTimeMs,
    )
    frames.push(
      encodeMessage("AgentClientMessage", {
        exec_client_message: clientMsg,
      }),
    )
  }

  // Always close the exec stream - mirrors CLI agent-exec after every handler.
  frames.push(buildExecStreamClose(input.execId))
  return frames
}

/** ACM #5 exec_client_control_message { stream_close { id } }. */
export function buildExecStreamClose(execId: number): Uint8Array {
  return encodeMessage("AgentClientMessage", {
    exec_client_control_message: {
      stream_close: { id: execId },
    },
  })
}

/**
 * Map OpenCode tool text into the agent.v1 result oneof for each exec variant.
 * OpenCode returns free-form text; we wrap it in the minimal success shape the
 * server accepts (verified against agent.v1 wire captures).
 */
export function buildTypedExecResult(
  resultField: string,
  output: string,
  error?: string,
  toolName?: string,
  resultMetadata?: Record<string, unknown>,
  shellOutcome?: CursorShellOutcome,
  workspaceRoot?: string,
  executionTimeMs?: number,
): Record<string, unknown> {
  // Prefer the session workspace; never advertise the host process cwd (daemon
  // often starts in $HOME) as the path Cursor shows the model for glob/ls.
  const resultRoot = typeof workspaceRoot === "string" && workspaceRoot.trim() ? path.resolve(workspaceRoot) : undefined
  switch (resultField) {
    case "read_result": {
      const readPath = str(resultMetadata?.path) ?? extractPathTag(output) ?? ""
      if (error) return { error: { path: readPath, error } }
      // Strip opencode's <path>/<content> envelope so Cursor's model receives
      // raw file content and can't echo the wrapper into subsequent writes.
      // Cursor's native read_args lands here; `mcp_args` reads land in
      // mcp_result. Live captures show gpt-5.4-mini and grok-4.5 both use the
      // native channel, so this is the path that matters in practice.
      const statPath = extractPathTag(output) ?? readPath
      const outputMetadata = parseOpenCodeReadMetadata(output)
      const content = restoreCompleteReadTerminator(
        unwrapReadOutput(output),
        statPath,
        outputMetadata,
        resultMetadata,
        resultRoot,
      )
      const totalLines = outputMetadata.totalLines ?? readFileLineCount(statPath) ?? countLines(content)
      const rangeApplied = readRangeApplied(resultMetadata, totalLines)
      // `truncated` alone is not enough: it is set here, and models still assert
      // the partial content is the whole file. Cursor's own executor puts the
      // limit marker in the output text for the same reason, so append one.
      const notice = readTruncationNotice(output, resultMetadata)
      return {
        success: {
          path: readPath,
          content: notice ? `${content}\n\n${notice}` : content,
          total_lines: totalLines,
          file_size: readFileSize(statPath),
          truncated: readOutputTruncated(resultMetadata, outputMetadata, totalLines),
          range_applied: rangeApplied,
        },
      }
    }
    case "grep_result": {
      if (error) return { error: { error } }
      // Prefer files_with_matches: OpenCode glob/grep often returns path lists.
      // Content-mode GrepSuccess also works but needs GrepFileMatch nesting.
      // Key the results by the searched folder. Cursor shows each file relative to that key
      // using POSIX path rules, so Windows paths go out with forward slashes; backslash paths
      // render as `../C:\...` or `../src\a.ts`.
      const searched = str(resultMetadata?.path)
      const cwd = forwardSlashes(searched ? path.resolve(resultRoot ?? "", searched) : (resultRoot ?? ""))
      const files = extractResultPaths(output).map(forwardSlashes)
      return {
        success: {
          pattern: "",
          path: cwd,
          output_mode: "files_with_matches",
          workspace_results: {
            [cwd]: {
              files: {
                files,
                total_files: files.length,
                client_truncated: false,
              },
            },
          },
        },
      }
    }
    case "write_result": {
      // `apply_patch` output carries no <path> tag, so prefer the path recorded
      // when the request was remapped away from `write`.
      const remappedPath = str(resultMetadata?.path)
      if (error) return { error: { path: remappedPath ?? "", error } }
      return {
        success: {
          path: remappedPath ?? extractPathTag(output) ?? "",
          lines_created: countLines(output),
          file_size: output.length,
        },
      }
    }
    case "pi_write_result":
      // PiWriteExecSuccess is just { output }; error is { error }.
      if (error) return { error: { error } }
      return { success: { output: output || "Wrote file successfully." } }
    case "pi_read_result": {
      if (error) return { error: { error } }
      // Pi results carry truncation structurally (PiReadExecSuccess field 2),
      // which is how Cursor's own executors report a capped payload.
      const content = unwrapReadOutput(output)
      const truncation = readTruncationMessage(output, content)
      return { success: { output: content, ...(truncation ? { truncation } : {}) } }
    }
    case "pi_bash_result":
    case "pi_edit_result":
    case "pi_grep_result":
    case "pi_find_result":
    case "pi_ls_result":
      if (error) return { error: { error } }
      return { success: { output } }
    case "delete_result":
      if (error) return { error: { path: "", error } }
      return { success: { path: "", deleted_file: "" } }
    case "background_shell_spawn_result": {
      const command = str(resultMetadata?.command) ?? ""
      const workingDirectory = str(resultMetadata?.working_directory) ?? ""
      if (error) return { error: { command, working_directory: workingDirectory, error } }
      // Prefer the structured outcome captured by the plugin after-hook; markers
      // are already stripped from the stored/rendered OpenCode output by then.
      if (shellOutcome?.kind === "backgrounded") {
        return {
          success: {
            shell_id: shellOutcome.shellId,
            command: shellOutcome.command || command,
            working_directory: shellOutcome.workingDirectory || workingDirectory,
            pid: shellOutcome.pid,
          },
        }
      }
      // Fallback when no plugin hook ran: parse the private spawn marker inline.
      const match = new RegExp(`${BACKGROUND_SHELL_MARKER}(\\d+):([^\\r\\n]+)`).exec(output)
      const pid = match ? Number(match[1]) : 0
      if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffff_ffff) {
        return {
          error: {
            command,
            working_directory: workingDirectory,
            error: "OpenCode did not return a valid background shell process id.",
          },
        }
      }
      return {
        success: {
          shell_id: pid,
          command,
          working_directory: workingDirectory,
          pid,
        },
      }
    }
    case "ls_result": {
      if (error) return { error: { path: "", error } }
      // ls_args runs OpenCode's read on the directory; its entries list marks folders with "/".
      const rootPath = extractPathTag(output) ?? resultRoot ?? ""
      const entries = readDirectoryEntries(output)
      const files = entries.filter((name) => !name.endsWith("/"))
      return {
        success: {
          directory_tree_root: {
            abs_path: rootPath,
            children_dirs: entries
              .filter((name) => name.endsWith("/"))
              .map((name) => ({ abs_path: path.join(rootPath, name.slice(0, -1)) })),
            children_files: files.map((name) => ({ name })),
            num_files: files.length,
          },
        },
      }
    }
    case "mcp_result": {
      if (error) return { error: { error } }
      // opencode built-ins (read/write/grep/…) are advertised as MCP tools, so
      // a read call returns through mcp_result. Scope the unwrap to toolName
      // "read" so a non-read MCP tool whose output merely contains a
      // "<content>"-like block is never rewritten.
      if (toolName !== "read") {
        return { success: { content: [{ text: { text: output } }], is_error: false } }
      }
      // Carry the truncation notice as its own content item: the file content
      // item stays byte-exact, so it can still never be echoed into a write.
      const notice = readTruncationNotice(output)
      return {
        success: {
          content: [{ text: { text: unwrapReadOutput(output) } }, ...(notice ? [{ text: { text: notice } }] : [])],
          is_error: false,
        },
      }
    }
    case "shell_result": {
      const command = str(resultMetadata?.command) ?? ""
      const workingDirectory = str(resultMetadata?.working_directory) ?? ""
      const executionTime = Math.max(0, executionTimeMs ?? 0)
      if (shellOutcome?.kind === "timeout") {
        return { timeout: { command, working_directory: workingDirectory, timeout_ms: shellOutcome.timeoutMs } }
      }
      if (error) {
        return {
          failure: {
            command,
            working_directory: workingDirectory,
            exit_code: shellOutcome?.kind === "exit" ? shellOutcome.code : 1,
            stdout: output,
            stderr: error,
            execution_time: executionTime,
            local_execution_time_ms: executionTime,
            aborted: false,
          },
        }
      }
      return {
        success: {
          command,
          working_directory: workingDirectory,
          exit_code: shellOutcome?.kind === "exit" ? shellOutcome.code : 0,
          stdout: output,
          stderr: "",
          execution_time: executionTime,
          local_execution_time_ms: executionTime,
        },
      }
    }
    case "subagent_result": {
      const task = parseOpenCodeTaskOutput(output)
      if (error || task.state === "error") {
        return {
          error: {
            ...(task.agentId ? { agent_id: task.agentId } : {}),
            error: error ?? task.message ?? output,
          },
        }
      }
      return {
        success: {
          agent_id: task.agentId ?? "",
          ...(task.message !== undefined ? { final_message: task.message } : {}),
          tool_call_count: 0,
          // OpenCode marks an asynchronous launch as state="running". Cursor's
          // canonical USER_REQUEST enum value is 2; foreground/default is 0.
          background_reason: task.state === "running" ? 2 : 0,
        },
      }
    }
    default:
      // Unknown variant: best-effort success wrapper so the server sees a oneof.
      if (error) return { error: { error } }
      return { success: { content: output } }
  }
}

function parseOpenCodeTaskOutput(output: string): {
  agentId?: string
  state?: "running" | "completed" | "error"
  message?: string
} {
  // Attribute order is not guaranteed; accept id/state in either order and
  // ignore additional attributes OpenCode may emit on the <task> open tag.
  const open = /<task\b([^>]*)>/i.exec(output)
  if (!open) return { message: output }
  const attrs = open[1]
  const agentId = /\bid="([^"]+)"/i.exec(attrs)?.[1]
  const state = /\bstate="(running|completed|error)"/i.exec(attrs)?.[1] as "running" | "completed" | "error" | undefined
  if (!agentId || !state) return { message: output }
  const tag = state === "error" ? "task_error" : "task_result"
  const body = new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`, "i").exec(output)
  return {
    agentId,
    state,
    message: body?.[1] ?? output,
  }
}

function extractPathTag(output: string): string | undefined {
  const m = output.match(/<path>([^<]+)<\/path>/)
  return m?.[1]
}

/**
 * File paths from OpenCode glob output (one absolute path per line) or grep output (absolute
 * `<path>:` headers). Match lines, counts, "No files found", and truncation notes drop out.
 */
function extractResultPaths(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/:$/, ""))
    .filter((line) => path.isAbsolute(line) || path.win32.isAbsolute(line))
    .slice(0, 2000)
}

function forwardSlashes(file: string): string {
  return file.replaceAll("\\", "/")
}

/** Entry names between `<entries>` tags of OpenCode's directory read, without its count note. */
function readDirectoryEntries(output: string): string[] {
  const body = /<entries>\n?([\s\S]*?)<\/entries>/.exec(output)?.[1] ?? ""
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\((Showing \d+ of \d+ entries\.|\d+ entries\))/.test(line))
}

function encodeShellStream(
  execId: number,
  executionTimeMs: number | undefined,
  shellStream: Record<string, unknown>,
): Uint8Array {
  const clientMsg: Record<string, unknown> = {
    id: execId,
    shell_stream: shellStream,
  }
  if (executionTimeMs !== undefined) {
    clientMsg.local_execution_time_ms = executionTimeMs
  }
  return encodeMessage("AgentClientMessage", {
    exec_client_message: clientMsg,
  })
}

/**
 * Encode exec #10 request_context_result from a prebuilt RequestContext payload.
 */
export function buildRequestContextResult(execId: number, requestContext: Record<string, unknown>): Uint8Array {
  traceRequestContextPaths(`buildRequestContextResult id=${execId}`, requestContext)
  return encodeMessage("AgentClientMessage", {
    exec_client_message: {
      id: execId,
      request_context_result: {
        success: {
          request_context: requestContext,
        },
      },
    },
  })
}
