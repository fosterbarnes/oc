import { decodeStructEntriesToJson, readAllFields } from "./struct.js"
import { trace } from "../debug.js"
import { cursorExecVariantByRequestName } from "./execVariants.js"
import { buildBackgroundShellCommand } from "../shellTimeout.js"
import { mapCursorSubagentTypeToOpenCode } from "./subagents.js"
import { num, str, stringValue } from "./values.js"

// -- Cursor exec-variant -> opencode tool name --

// Native ExecServerMessage variants only (agent.v1). There is no edit_args or
// glob_args on the exec channel - Cursor's EditToolCall is display-only, and
// glob/edit from opencode are advertised as MCP tools and arrive as mcp_args.
//
// Design note (F11): Cursor has native delete / background-shell tools; OpenCode
// does not. This provider intentionally remaps:
//   - delete_args → bash `rm -f -- <quoted-path>`
//   - background_shell_spawn_args → bash (original command; plugin wraps nohup)
// Permissions still flow through OpenCode's advertised `bash` tool. Soft-
// background / detached children can outlive the OpenCode tool call; leftover
// process cleanup is left to the user / OS. Arg key remapping happens below.
const cursorToolToOpencode: Record<string, string> = {
  read_args: "read",
  write_args: "write",
  grep_args: "grep",
  ls_args: "read",
  pi_read_args: "read",
  pi_bash_args: "bash",
  pi_edit_args: "edit",
  pi_write_args: "write",
  pi_grep_args: "grep",
  pi_find_args: "glob",
  pi_ls_args: "read",
  delete_args: "bash",
  shell_args: "bash",
  shell_stream_args: "bash",
  background_shell_spawn_args: "bash",
  subagent_args: "task",
  mcp_args: "mcp",
}

/** Cursor-only fields that must not be forwarded as OpenCode tool input. */
const CURSOR_INTERNAL_KEYS = new Set([
  "tool_call_id",
  "toolCallId",
  "exec_id",
  "span",
  "sandbox_policy",
  "requested_sandbox_policy",
  "smart_mode_approval",
  "smart_mode_approval_only",
  "skip_approval",
  "parsing_result",
  "classifier_result",
  "hook_approval_requirement",
  "conversation_id",
  "simple_commands",
  "has_input_redirect",
  "has_output_redirect",
  "is_background",
  "timeout_behavior",
  "hard_timeout",
  "close_stdin",
  "output_notification",
  "file_output_threshold_bytes",
  // WriteArgs #4. A request for WriteSuccess.file_content_after_write, which we
  // do not populate; harmless to omit, but it is not tool input.
  "return_file_content_after_write",
  "ignore",
])
// WriteArgs #5/#6 are deliberately NOT internal: `file_bytes` carries the file
// content itself whenever Cursor sends it instead of `file_text` (its own
// LocalWriteExecutor prefers bytes when non-empty), and `encoding_hint` is how
// that payload is decoded. The `write` mapping consumes both explicitly.

/** Required content fields where an empty string is meaningful (for example, truncating a file). */
const PRESERVE_EMPTY_STRING_KEYS = new Set([
  "content",
  "file_text",
  "fileText",
  "stream_content",
  // Some advertised edit schemas use a single textual `input` payload. Preserve
  // an empty value so the executor reports the real edit error rather than a
  // misleading missing-property error.
  "input",
  "oldString",
  "old_string",
  "newString",
  "new_string",
])

// ── Extract exec args from ExecServerMessage ──

export type ParsedExecRequest = {
  id: number
  execId: string
  toolName: string
  args: Record<string, unknown>
  /** ExecClientMessage result field to reply with (matches the request variant). */
  resultField: string
  /** Typed error to return without asking OpenCode to execute invalid args. */
  localError?: string
  /** Original request values needed by typed Cursor result messages. */
  resultMetadata?: Record<string, unknown>
}

export function parseExecServerMessage(msg: Record<string, unknown>): ParsedExecRequest | undefined {
  const id = msg.id as number | undefined
  if (id === undefined) return undefined

  // Find which args variant is set
  const execVariant = findOneOfVariant(msg, [
    "read_args",
    "write_args",
    "pi_read_args",
    "pi_bash_args",
    "pi_edit_args",
    "pi_write_args",
    "pi_grep_args",
    "pi_find_args",
    "pi_ls_args",
    "grep_args",
    "ls_args",
    "delete_args",
    "shell_args",
    "shell_stream_args",
    "background_shell_spawn_args",
    "mcp_args",
    "subagent_args",
  ])
  if (!execVariant) return undefined

  // Use the complete canonical request/result table. In particular, Pi request
  // fields #45..#51 pair with result fields #46..#52 rather than matching ids.
  const resultField = cursorExecVariantByRequestName(execVariant)?.resultName
  if (!resultField) return undefined
  const execId = (msg.exec_id as string) ?? ""

  // F11: Cursor native background shell → OpenCode bash. Keep the wrapper
  // self-contained so direct provider / hosts without shell.env still detach
  // and return a PID. The classic plugin replaces this with its display-safe
  // env or wrapper-file path before execution.
  if (execVariant === "background_shell_spawn_args") {
    const raw = (msg.background_shell_spawn_args as Record<string, unknown>) ?? {}
    const command = str(raw.command)
    const workingDirectory = str(raw.working_directory) ?? ""
    const args: Record<string, unknown> = {}
    if (command) args.command = buildBackgroundShellCommand(command)
    if (workingDirectory) args.workdir = workingDirectory
    return {
      id,
      execId,
      toolName: "bash",
      args,
      resultField,
      resultMetadata: {
        background_shell_spawn: true,
        command: command ?? "",
        working_directory: workingDirectory,
      },
      localError:
        raw.enable_write_shell_stdin_tool === true
          ? "Interactive background shells are not available through OpenCode's bash tool."
          : command
            ? undefined
            : "Cursor background shell request is missing a command.",
    }
  }

  if (execVariant === "subagent_args") {
    const raw = (msg.subagent_args as Record<string, unknown>) ?? {}
    const prompt = str(raw.prompt)
    const cursorSubagentType = str(raw.subagent_type)
    const subagentType = cursorSubagentType ? mapCursorSubagentTypeToOpenCode(cursorSubagentType) : undefined
    const args: Record<string, unknown> = {
      description: describeSubagentTask(prompt, subagentType),
      prompt: prompt ?? "",
      subagent_type: subagentType ?? "",
    }
    const resumeAgentId = str(raw.resume_agent_id)
    if (resumeAgentId) args.task_id = resumeAgentId
    // protobufjs materializes an absent proto3 optional bool as false in this
    // reflection schema. OpenCode's foreground default is already false, so
    // only forward the meaningful opt-in value.
    if (raw.run_in_background === true) args.background = true
    return {
      id,
      execId,
      toolName: "task",
      args,
      resultField,
      resultMetadata: cursorSubagentType ? { cursor_subagent_type: cursorSubagentType } : undefined,
      localError:
        prompt && cursorSubagentType
          ? undefined
          : "Cursor subagent request is missing a required prompt or subagent type.",
    }
  }

  if (execVariant === "mcp_args") {
    // An MCP call to one of the tools we advertised. Resolve the real opencode
    // tool name (Cursor's model may have shortened "opencode-read" → "read") and
    // decode the argument map back into JSON for opencode to execute.
    const m = (msg.mcp_args as Record<string, unknown>) ?? {}
    const mapped = mapCursorArgsToOpencode(mcpRealToolName(m), decodeMcpArgs(m.args), "mcp_args")
    return {
      id,
      execId,
      toolName: mapped.toolName,
      args: mapped.args,
      resultField,
    }
  }

  if (execVariant === "pi_edit_args") {
    const raw = (msg.pi_edit_args as Record<string, unknown>) ?? {}
    const edits = Array.isArray(raw.edits) ? raw.edits : []
    const replacement =
      edits.length === 1 && edits[0] && typeof edits[0] === "object" ? (edits[0] as Record<string, unknown>) : undefined
    const path = str(raw.path)
    const oldString = replacement ? stringValue(replacement.old_text) : undefined
    const newString = replacement ? stringValue(replacement.new_text) : undefined
    const args: Record<string, unknown> = {}
    if (path) args.filePath = path
    if (oldString !== undefined) args.oldString = oldString
    if (newString !== undefined) args.newString = newString
    return {
      id,
      execId,
      toolName: "edit",
      args,
      resultField,
      localError:
        path && oldString && newString !== undefined
          ? undefined
          : "Cursor Pi edit cannot be represented safely: expected one non-empty replacement.",
    }
  }

  const toolName = cursorToolToOpencode[execVariant]
  if (!toolName) return undefined

  const mapped = mapCursorArgsToOpencode(toolName, (msg[execVariant] as Record<string, unknown>) ?? {}, execVariant)
  const rawArgs = (msg[execVariant] as Record<string, unknown>) ?? {}
  const resultMetadata =
    execVariant === "shell_stream_args" || execVariant === "shell_args"
      ? shellStreamResultMetadata(rawArgs)
      : execVariant === "read_args"
        ? {
            path: str(rawArgs.path) ?? str(rawArgs.file_path) ?? "",
            ...(typeof mapped.args.offset === "number" ? { offset: mapped.args.offset } : {}),
            ...(typeof mapped.args.limit === "number" ? { limit: mapped.args.limit } : {}),
          }
        : undefined
  if (resultMetadata && resultMetadata.timeout_behavior !== 2 && typeof resultMetadata.timeout_ms === "number") {
    // Cursor's protobuf default (timeout=0) means 30 seconds for an ordinary
    // foreground shell. OpenCode instead treats zero literally, so pass the
    // effective native value rather than the raw protobuf default.
    mapped.args.timeout = resultMetadata.timeout_ms
  }
  return {
    id,
    execId,
    toolName: mapped.toolName,
    args: mapped.args,
    resultField,
    ...(resultMetadata || mapped.binaryBytes
      ? {
          resultMetadata: {
            ...resultMetadata,
            ...(mapped.binaryBytes
              ? {
                  binaryWriteBytes: mapped.binaryBytes,
                  path: str(rawArgs.path) ?? str(rawArgs.file_path) ?? "",
                }
              : {}),
          },
        }
      : {}),
  }
}

function shellStreamResultMetadata(raw: Record<string, unknown>): Record<string, unknown> {
  const timeout = num(raw.timeout) ?? 0
  const timeoutBehavior = num(raw.timeout_behavior) ?? 0
  const hardTimeout = num(raw.hard_timeout)
  // Cursor CLI: a nonzero timeout is used verbatim. A zero foreground timeout
  // defaults to 30s; zero with background/hard-timeout semantics means an
  // immediate soft handoff governed by the separate hard deadline.
  const effectiveTimeout =
    timeout !== 0 ? timeout : timeoutBehavior === 2 || (hardTimeout !== undefined && hardTimeout > 0) ? 0 : 30_000
  return {
    shell_stream: true,
    command: str(raw.command) ?? "",
    working_directory: str(raw.working_directory) ?? "",
    timeout_ms: effectiveTimeout,
    timeout_behavior: timeoutBehavior,
    ...(hardTimeout !== undefined && hardTimeout > 0 ? { hard_timeout_ms: hardTimeout } : {}),
  }
}

/**
 * Remap Cursor exec / MCP arg shapes onto OpenCode's Effect Schema keys.
 * Without this, OpenCode rejects calls with InvalidArgumentsError
 * (e.g. `path` instead of `filePath`, `file_text` instead of `content`).
 */
export function mapCursorArgsToOpencode(
  toolName: string,
  raw: Record<string, unknown>,
  execVariant?: string,
): { toolName: string; args: Record<string, unknown>; binaryBytes?: Uint8Array } {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue
    if (CURSOR_INTERNAL_KEYS.has(k)) continue
    // Drop empty strings from optional protobuf defaults, but retain required
    // content fields where empty means a valid destructive edit/write.
    if (typeof v === "string" && v.length === 0 && !PRESERVE_EMPTY_STRING_KEYS.has(k)) continue
    cleaned[k] = v
  }

  // Native ls_args → OpenCode read (directory listing via read).
  if (execVariant === "ls_args") {
    const filePath = str(cleaned.path) ?? str(cleaned.filePath)
    return { toolName: "read", args: filePath ? { filePath } : {} }
  }

  // F11: Cursor native delete_args → OpenCode bash. No delete builtin exists, so
  // we emulate with `rm -f -- <path>` (shell-quoted). Same permission boundary
  // as any other bash tool call.
  if (execVariant === "delete_args") {
    const target = str(cleaned.path) ?? str(cleaned.filePath)
    return {
      toolName: "bash",
      args: target ? { command: deleteShellCommand(target) } : { command: "true" },
    }
  }

  switch (toolName) {
    case "read": {
      const args: Record<string, unknown> = {}
      const filePath = str(cleaned.filePath) ?? str(cleaned.path) ?? str(cleaned.file_path)
      if (filePath) args.filePath = filePath
      // Cursor often sends offset=0/limit=0 as protobuf defaults. OpenCode's
      // read treats limit=0 as "read zero lines" (empty content) - omit zeros.
      const offset = num(cleaned.offset)
      if (offset !== undefined && offset > 0) args.offset = offset
      const limit = num(cleaned.limit)
      if (limit !== undefined && limit > 0) args.limit = limit
      return { toolName: "read", args }
    }
    case "write": {
      const args: Record<string, unknown> = {}
      const filePath = str(cleaned.filePath) ?? str(cleaned.path) ?? str(cleaned.file_path)
      if (filePath) args.filePath = filePath
      // Cursor's LocalWriteExecutor prefers `file_bytes` whenever it is
      // non-empty and only falls back to `file_text`; mirror that order so a
      // byte-encoded write is not silently seen as empty content.
      const bytes = bytesValue(cleaned.file_bytes) ?? bytesValue(cleaned.fileBytes)
      let content: string | undefined
      if (bytes !== undefined) {
        content = decodeWriteBytes(bytes, str(cleaned.encoding_hint) ?? str(cleaned.encodingHint))
        if (content === undefined) {
          // Binary. Surface the raw bytes to the caller instead of a lossy
          // decode; `binaryWritePayload` picks them up after parsing.
          return { toolName: "write", args, binaryBytes: bytes }
        }
      } else {
        content = stringValue(cleaned.content) ?? stringValue(cleaned.file_text) ?? stringValue(cleaned.fileText)
      }
      if (content !== undefined) args.content = content
      return { toolName: "write", args }
    }
    case "edit": {
      // Preserve an opaque textual edit payload when the advertised executor
      // accepts that generic shape; rebuilding only OpenCode's targeted fields
      // would silently turn a valid call into `{}`.
      if (typeof cleaned.input === "string") {
        return { toolName: "edit", args: { input: cleaned.input } }
      }
      const args: Record<string, unknown> = {}
      const filePath = str(cleaned.filePath) ?? str(cleaned.path) ?? str(cleaned.file_path)
      if (filePath) args.filePath = filePath
      const oldString = stringValue(cleaned.oldString) ?? stringValue(cleaned.old_string)
      if (oldString !== undefined) args.oldString = oldString
      const newString = stringValue(cleaned.newString) ?? stringValue(cleaned.new_string)
      if (newString !== undefined) args.newString = newString
      if (typeof cleaned.replaceAll === "boolean") args.replaceAll = cleaned.replaceAll
      return { toolName: "edit", args }
    }
    case "bash": {
      const args: Record<string, unknown> = {}
      const command = str(cleaned.command)
      if (command) args.command = command
      const workdir = str(cleaned.workdir) ?? str(cleaned.working_directory)
      if (workdir) args.workdir = workdir
      const timeout = num(cleaned.timeout)
      if (timeout !== undefined) args.timeout = timeout
      return { toolName: "bash", args }
    }
    case "grep": {
      const pattern = str(cleaned.pattern)
      const path = str(cleaned.path)
      const include = str(cleaned.include) ?? str(cleaned.glob)
      // Cursor's native Grep often arrives with an empty pattern + a glob
      // (e.g. "**/*") when the model is really listing files. OpenCode's grep
      // requires a non-empty string pattern - remap to glob instead of
      // forwarding a call that will fail and loop.
      if (!pattern) {
        const args: Record<string, unknown> = { pattern: include ?? "**/*" }
        if (path) args.path = path
        return { toolName: "glob", args }
      }
      const args: Record<string, unknown> = { pattern }
      if (path) args.path = path
      if (include) args.include = include
      return { toolName: "grep", args }
    }
    case "glob": {
      const args: Record<string, unknown> = {}
      const pattern = str(cleaned.pattern) ?? str(cleaned.glob_pattern) ?? str(cleaned.globPattern)
      if (pattern) args.pattern = pattern
      const path = str(cleaned.path) ?? str(cleaned.target_directory) ?? str(cleaned.targetDirectory)
      if (path) args.path = path
      return { toolName: "glob", args }
    }
    default:
      return { toolName, args: cleaned }
  }
}


/** A non-empty protobuf `bytes` field, or undefined when absent/empty. */
function bytesValue(v: unknown): Uint8Array | undefined {
  if (v instanceof Uint8Array) return v.length > 0 ? v : undefined
  if (Array.isArray(v) && v.every((b) => typeof b === "number")) {
    return v.length > 0 ? Uint8Array.from(v) : undefined
  }
  return undefined
}

/** UTF-16/32 embed NUL bytes in ordinary text; 8-bit encodings do not. */
const WIDE_TEXT_ENCODING = /^utf-?(16|32)/

/**
 * Decode `WriteArgs.file_bytes`. `encoding_hint` names the file's original
 * encoding; OpenCode's `write` takes a string, so an unknown encoding label
 * falls back to UTF-8 rather than dropping the write.
 *
 * Returns undefined when the bytes are not text in that encoding. A non-fatal
 * decode would replace every undecodable sequence with U+FFFD and hand the host
 * a corrupted file that still reports success, so binary content must take the
 * byte-preserving path instead (see `isBinaryWriteRequest`).
 */
export function decodeWriteBytes(bytes: Uint8Array, encodingHint?: string): string | undefined {
  const encoding = encodingHint?.trim().toLowerCase().replace(/[_ ]/g, "-")

  let decoder: TextDecoder | undefined
  let label = "utf-8"
  if (encoding && encoding !== "utf-8" && encoding !== "utf8") {
    try {
      decoder = new TextDecoder(encoding, { fatal: true })
      label = encoding
    } catch {
      trace(`write: unsupported encoding_hint ${JSON.stringify(encodingHint)} - decoding as utf-8`)
    }
  }
  if (!decoder) decoder = new TextDecoder("utf-8", { fatal: true })

  // Single-byte encodings decode any byte sequence without error, so a decode
  // that cannot fail is not on its own evidence of text.
  if (!WIDE_TEXT_ENCODING.test(label) && bytes.includes(0)) return undefined
  try {
    return decoder.decode(bytes)
  } catch {
    return undefined
  }
}

/**
 * True when a parsed `write` request carries bytes that are not text. Such a
 * request cannot go to OpenCode's `write` tool at all - it takes a string, and
 * additionally BOM-splits, diffs, and runs `Format.file()` on what it writes.
 */
export function binaryWritePayload(parsed: ParsedExecRequest): { path: string; data: Uint8Array } | undefined {
  if (parsed.toolName !== "write") return undefined
  const data = parsed.resultMetadata?.binaryWriteBytes
  if (!(data instanceof Uint8Array)) return undefined
  return { path: str(parsed.resultMetadata?.path) ?? "", data }
}

function describeSubagentTask(prompt?: string, subagentType?: string): string {
  const words = prompt?.replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5)
  if (words?.length) return words.join(" ")
  return `${subagentType || "Delegated"} task`
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function deleteShellCommand(target: string): string {
  if (process.platform === "win32")
    return `Remove-Item -LiteralPath '${target.replaceAll("'", "''")}' -Force -ErrorAction Stop`
  return `rm -f -- ${shellQuote(target)}`
}

/**
 * Map Cursor McpArgs back to the OpenCode tool id.
 * Prefers provider_identifier + bare tool_name (github + create_pull_request
 * → github_create_pull_request). Builtins under the default server stay bare.
 */
export function mcpRealToolName(mcpArgs: Record<string, unknown>, defaultServer = "opencode"): string {
  const toolName = typeof mcpArgs.tool_name === "string" ? mcpArgs.tool_name : undefined
  const provider = typeof mcpArgs.provider_identifier === "string" ? mcpArgs.provider_identifier : undefined

  if (toolName) {
    if (provider && provider !== defaultServer) {
      // Already a full OpenCode id (legacy ads or model echo).
      if (toolName.startsWith(`${provider}_`)) return toolName
      return `${provider}_${toolName}`
    }
    return toolName
  }

  const name = typeof mcpArgs.name === "string" ? mcpArgs.name : ""
  const dash = name.indexOf("-")
  if (dash > 0) {
    const server = name.slice(0, dash)
    const bare = name.slice(dash + 1)
    if (server && bare) {
      if (server === defaultServer) return bare
      return `${server}_${bare}`
    }
  }
  return name || "mcp"
}

function decodeMcpArgs(raw: unknown): Record<string, unknown> {
  if (!Array.isArray(raw)) return {}
  const entries = raw.map((a) => (typeof a === "string" ? b64ToBytes(a) : (a as Uint8Array)))
  try {
    return decodeStructEntriesToJson(entries)
  } catch {
    return {}
  }
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function findOneOfVariant(msg: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    if (msg[key] !== undefined && msg[key] !== null) {
      return key
    }
  }
  return undefined
}

// ── Map a Cursor tool call to the opencode tool-call struct ──

export function buildToolCallPart(
  execMsg: ParsedExecRequest,
  sessionId: string,
): { toolCallId: string; toolName: string; input: string } {
  // Tag the toolCallId with the originating session's id so the result-bearing
  // doStream call can disambiguate the Run stream - Cursor resets exec ids per
  // stream, so two concurrent conversations would otherwise collide on `id`.
  return {
    toolCallId: `cursor_${sessionId}_${execMsg.id}`,
    toolName: execMsg.toolName,
    // LanguageModelV3ToolCall.input is a *stringified* JSON object. The AI SDK
    // does `input.trim()` before JSON.parse; emitting a plain object crashes
    // with "input.trim is not a function" and the model retries forever.
    // OpenCode's processor then receives the parsed object from the SDK.
    input: JSON.stringify(execMsg.args ?? {}),
  }
}

// ── Extract exec id from tool call id ──

export function parseExecIdFromToolCallId(toolCallId: string): { sessionId: string; execId: number } | undefined {
  // Format: cursor_<sessionId>_<execId>. sessionId may itself contain
  // underscores (e.g. UUIDs), so anchor on the trailing _<digits>.
  const match = toolCallId.match(/^cursor_(.+)_(\d+)$/)
  if (!match) return undefined
  const execId = parseInt(match[2], 10)
  if (!Number.isFinite(execId)) return undefined
  return { sessionId: match[1], execId }
}

// ── Unknown exec diagnostics ──
//
// Request/result field numbers are not universally identical (the Pi range is
// offset by one), so unknown variants must never receive a guessed empty reply.
// The pump uses this raw detector to report schema drift and fail the Run.

/**
 * Find the exec variant field number from the raw (gunzipped) AgentServerMessage
 * payload: peel field #2 (exec_server_message), then return the first
 * message-typed field that isn't id(#1)/exec_id(#15)/span_context(#19).
 * Returns undefined if there is no exec_server_message or no variant set.
 */
export function detectExecVariantField(agentServerPayload: Uint8Array): number | undefined {
  const execBytes = readAllFields(agentServerPayload).find((f) => f.fn === 2 && f.wt === 2)?.bytes
  if (!execBytes) return undefined
  for (const f of readAllFields(execBytes)) {
    if (f.wt !== 2) continue // message-typed only (wire type 2)
    if (f.fn === 1 || f.fn === 15 || f.fn === 19) continue
    return f.fn
  }
  return undefined
}
