import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { trace } from "../debug.js"
import { num } from "./values.js"

// ── Pre-execution read validation (Cursor LocalReadExecutor parity) ──

/** Expand a leading `~` to the home directory, matching Cursor's untildify. */
function untildify(input: string): string {
  return input.replace(/^~(?=$|\/|\\)/, os.homedir())
}

/**
 * A read target addressed by URI scheme rather than by local filesystem path.
 *
 * Cursor's LocalReadExecutor only ever reads local files, so this provider
 * mirrors its pre-execution validation. An advertised host read tool may also
 * accept URLs or internal URI schemes. Resolving those against the workspace
 * root mangles the URI and produces a false `file_not_found`, so URI targets
 * are forwarded untouched and left to the advertised executor.
 *
 * Requires a scheme of two or more characters followed by `://`, so Windows
 * drive letters (`C:\src`, `C:/src`) stay local paths.
 */
export function isUriReadTarget(requested: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]+:\/\//.test(requested)
}

/**
 * Resolve a read target the way Cursor's LocalReadExecutor does before it
 * stats the file: untildify, then resolve a relative path against the workspace
 * root (`env.workspace_paths[0]`), else resolve as-is. Kept in lockstep with
 * agent utils `resolvePath(path, workspaceRoot)`.
 *
 * Only meaningful for local paths; check {@link isUriReadTarget} first.
 */
export function resolveReadTargetPath(requested: string, workspaceRoot: string): string {
  const expanded = untildify(requested)
  if (workspaceRoot && !path.isAbsolute(expanded)) {
    return path.resolve(workspaceRoot, expanded)
  }
  return path.resolve(expanded)
}

/**
 * A typed ReadResult oneof case for a read target that fails Cursor's
 * pre-execution validation, or undefined when the path is a readable file the
 * tool should actually read. Mirrors LocalReadExecutor exactly:
 *  - missing path (ENOENT/ENOTDIR)     → file_not_found
 *  - directory                         → invalid_file "Path is a directory, not a file"
 *  - socket/fifo/etc (not a file)      → invalid_file "Path is neither a file nor a directory"
 * EACCES/EPERM (exists but unreadable) and any other stat error return undefined
 * so the call proceeds to OpenCode and a genuine permission decision is never
 * masked. Never rejects a non-existent *write/edit* target - this is read-only.
 */
export function classifyMissingReadTarget(absolutePath: string): Record<string, unknown> | undefined {
  let stat: fs.Stats
  try {
    stat = fs.statSync(absolutePath)
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === "ENOENT" || code === "ENOTDIR") {
      return { file_not_found: { path: absolutePath } }
    }
    return undefined
  }
  if (stat.isDirectory()) {
    return { invalid_file: { path: absolutePath, reason: "Path is a directory, not a file" } }
  }
  if (!stat.isFile()) {
    return {
      invalid_file: { path: absolutePath, reason: "Path is neither a file nor a directory" },
    }
  }
  return undefined
}

/**
 * Strip opencode's `read` envelope, leaving raw file content.
 *
 * opencode's read tool (opencode `tool/read.ts`) wraps content in an XML-ish
 * envelope its own models are trained on, but Cursor's are not:
 *   <path>{abs}</path>\n<type>file</type>\n<content>\n{N}: {line}\n…\n\n{footer}\n</content>
 * Forwarding that envelope verbatim made Cursor's model treat the wrapper as
 * literal file content and write `<path>`/`<content>` tags + `N:` line prefixes
 * back into files (silent corruption - the write still reports success; seen
 * across 8+ sessions, e.g. languageModel.ts rewritten starting with
 * `<path>…</path>\n<type>file</type>\n<content>\n1: import fs…`).
 *
 * Returns the raw file body (line numbers + footer + `<system-reminder>` dropped).
 *
 * Deliberately exception-safe: if the expected envelope is absent - non-read
 * output, already-raw text, or a future opencode format change - it returns the
 * input unchanged, so a result is never broken and we never throw mid-turn.
 * Callers must still gate `mcp_result` on `toolName === "read"`; this helper
 * alone is not a tool-identity check.
 */
export function unwrapReadOutput(output: string): string {
  if (typeof output !== "string" || output.length === 0) return output
  // Require the full opencode read-envelope skeleton *before* `<content>`
  // (read.ts opens with <path>…</path>, <type>file</type>, <content>) so a
  // stray "<content>" later in tool chatter can't trigger unwrapping just
  // because path/type tags appear elsewhere in the payload.
  const contentHeaderIdx = output.indexOf("<content>")
  if (contentHeaderIdx === -1) return output
  const header = output.slice(0, contentHeaderIdx)
  const hasSkeleton = header.indexOf("<path>") !== -1 && header.indexOf("<type>file</type>") !== -1
  if (!hasSkeleton) {
    // Saw "<content>" but not the read skeleton ahead of it - almost certainly
    // a non-read payload, or an opencode format drift. Surface it so drift
    // can't silently resurrect the wrapper-corruption bug, but still fail
    // safe (no mutate).
    trace(
      "unwrapReadOutput: <content> present without leading <path>/<type>file> skeleton - leaving output unchanged (possible non-read payload or opencode read format drift)",
    )
    return output
  }
  // Body starts right after "<content>\n". opencode emits one numbered line per
  // file line ("N: <line>"), then a blank, a "(…)" footer, and a standalone
  // "</content>". The body is a *contiguous run* of /^N: / lines - so we stop at
  // the first non-numbered line. Critically we do NOT search for a closing
  // "</content>" substring: a file line that literally contains "</content>"
  // is rendered as "N: </content>" (a body line), and a raw indexOf would
  // truncate the read there.
  let rest = output.slice(contentHeaderIdx + "<content>".length)
  if (rest.startsWith("\n")) rest = rest.slice(1)
  const raw: string[] = []
  for (const line of rest.split("\n")) {
    const m = /^(\d+):[ \t]?(.*)$/.exec(line)
    if (!m) break // blank / "(footer)" / "</content>" → end of body run
    // Strip only the leading "N: " prefix; a line that itself begins with
    // digits+colon keeps its content (we remove just the first match). Blank
    // file lines render as "N: " and are preserved (capture group is "").
    raw.push(m[2])
  }
  // Envelope confirmed but no numbered body → empty file. Return "" rather
  // than the envelope (the envelope is exactly what Cursor echoes into writes).
  return raw.join("\n")
}

export type OpenCodeReadMetadata = {
  startLine?: number
  endLine?: number
  totalLines?: number
  outputCapped?: boolean
}

/**
 * Isolate opencode's read footer: the last blank-line-separated block before
 * the closing `</content>`. Scanning the whole envelope would let a file that
 * merely *quotes* a footer (this repository's own docs and tests do) pass for a
 * truncated read. The body can never contain a blank line - every source line
 * is rendered as `N: …`, so even an empty line keeps its `N: ` prefix.
 *
 * Falls back to the full string when the envelope is absent, preserving
 * behavior for non-standard read output.
 */
function readEnvelopeFooter(output: string): string {
  const close = output.lastIndexOf("\n</content>")
  if (close === -1) return output
  const start = output.lastIndexOf("\n\n", close)
  if (start === -1) return output
  return output.slice(start + 2, close)
}

/** Recover full-file metadata before unwrapReadOutput removes OpenCode's footer. */
export function parseOpenCodeReadMetadata(output: string): OpenCodeReadMetadata {
  const footer = readEnvelopeFooter(output)
  const showing = /Showing lines (\d+)-(\d+)(?: of (\d+))?\./.exec(footer)
  if (showing) {
    return {
      startLine: Number(showing[1]),
      endLine: Number(showing[2]),
      ...(showing[3] ? { totalLines: Number(showing[3]) } : {}),
      outputCapped: footer.includes("(Output capped at "),
    }
  }
  const complete = /\(End of file - total (\d+) lines?\)/.exec(footer)
  if (complete) return { totalLines: Number(complete[1]) }
  return {}
}

/**
 * OpenCode's numbered read envelope cannot represent the terminator after the
 * final line. Cursor's legacy edit executor performs exact replacement against
 * this content, so dropping a real LF/CRLF makes otherwise-valid edits fail and
 * encourages a whole-file rewrite. Restore only that final terminator for an
 * unbounded, confirmed-complete read; paged/capped reads stay untouched.
 */
export function restoreCompleteReadTerminator(
  content: string,
  readPath: string,
  metadata: OpenCodeReadMetadata,
  resultMetadata?: Record<string, unknown>,
  workspaceRoot?: string,
): string {
  if (
    !readPath ||
    metadata.totalLines === undefined ||
    metadata.startLine !== undefined ||
    metadata.endLine !== undefined ||
    num(resultMetadata?.offset) !== undefined ||
    num(resultMetadata?.limit) !== undefined ||
    content.endsWith("\n")
  )
    return content

  const absolute = path.isAbsolute(readPath) ? readPath : path.resolve(workspaceRoot ?? process.cwd(), readPath)
  let fd: number | undefined
  try {
    fd = fs.openSync(absolute, "r")
    const size = fs.fstatSync(fd).size
    if (size === 0) return content
    const tail = Buffer.alloc(Math.min(2, size))
    fs.readSync(fd, tail, 0, tail.length, size - tail.length)
    if (tail.length >= 2 && tail[tail.length - 2] === 0x0d && tail[tail.length - 1] === 0x0a) {
      return `${content}\r\n`
    }
    if (tail[tail.length - 1] === 0x0a) return `${content}\n`
  } catch {
    // The host read result remains authoritative when the local path cannot be
    // inspected (deleted/raced/permission changed after the tool completed).
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        /* already closed */
      }
    }
  }
  return content
}

/**
 * OpenCode's `read` caps output at 50 KB (`tool/read.ts` MAX_BYTES = 50 * 1024)
 * and cuts on a whole-line boundary, then appends
 * "(Output capped at 50 KB. Showing lines X-Y. Use offset=N to continue.)".
 *
 * `unwrapReadOutput` strips that footer along with the envelope, deliberately:
 * Cursor's model echoes whatever it is handed straight back into the next
 * write, so anything left in the content stream can end up written into the
 * file. But dropping the notice with no replacement is worse - the model then
 * believes a capped read is the complete file, rewrites it from what it has,
 * and everything past the cap is destroyed.
 *
 * Cursor's own CLI never truncates silently. Its local executor annotates every
 * capped payload ("50KB limit reached", "[Showing last …KB of line N (50KB
 * limit). Full output: …]") and returns structured truncation metadata. Mirror
 * that, keeping the signal out of the file content itself so it still cannot be
 * echoed into a write.
 */
function readTruncationSummary(
  output: string,
): { startLine: number; endLine: number; nextOffset: number; capped: boolean; totalLines?: number } | undefined {
  const meta = parseOpenCodeReadMetadata(output)
  if (meta.startLine === undefined || meta.endLine === undefined) return undefined
  // A complete read reports "(End of file …)" and never reaches this shape.
  if (meta.totalLines !== undefined && meta.endLine >= meta.totalLines && !meta.outputCapped) return undefined
  return {
    startLine: meta.startLine,
    endLine: meta.endLine,
    nextOffset: meta.endLine + 1,
    capped: meta.outputCapped === true,
    ...(meta.totalLines !== undefined ? { totalLines: meta.totalLines } : {}),
  }
}

/**
 * Model-visible replacement for the stripped footer.
 *
 * Only for reads the model did not ask to bound. A caller that passed an
 * explicit offset/limit already knows it asked for a slice - warning there
 * would cry wolf on every deliberate paged read.
 */
export function readTruncationNotice(output: string, resultMetadata?: Record<string, unknown>): string | undefined {
  const summary = readTruncationSummary(output)
  if (!summary) return undefined
  const rangeRequested = num(resultMetadata?.offset) !== undefined || num(resultMetadata?.limit) !== undefined
  if (rangeRequested && !summary.capped) return undefined
  const range =
    summary.totalLines !== undefined
      ? `lines ${summary.startLine}-${summary.endLine} of ${summary.totalLines}`
      : `lines ${summary.startLine}-${summary.endLine}`
  return (
    `[Partial read: the content above is ${range}` +
    (summary.capped ? ", capped at the host's 50 KB output limit" : "") +
    `. It is NOT the complete file. Continue with offset=${summary.nextOffset} before ` +
    `acting on the whole file; writing the content above back would delete everything ` +
    `after line ${summary.endLine}.]`
  )
}

/** agent.v1.PiTruncation for a capped OpenCode read. */
export function readTruncationMessage(output: string, content: string): Record<string, unknown> | undefined {
  const summary = readTruncationSummary(output)
  if (!summary) return undefined
  return {
    truncated: true,
    truncated_by: summary.capped ? "bytes" : "lines",
    ...(summary.totalLines !== undefined ? { total_lines: summary.totalLines } : {}),
    output_lines: Math.max(0, summary.endLine - summary.startLine + 1),
    output_bytes: Buffer.byteLength(content, "utf8"),
    ...(summary.capped ? { max_bytes: OPENCODE_READ_MAX_BYTES } : {}),
  }
}

/** `tool/read.ts` MAX_BYTES - mirrored only to report the cap, never to apply it. */
const OPENCODE_READ_MAX_BYTES = 50 * 1024

export function readRangeApplied(resultMetadata: Record<string, unknown> | undefined, totalLines: number): boolean {
  const offset = num(resultMetadata?.offset)
  const limit = num(resultMetadata?.limit)
  if (offset === undefined && limit === undefined) return false
  if (totalLines === 0) return false
  const startLine = offset ?? 1
  return startLine < 0 || startLine <= totalLines
}

export function readOutputTruncated(
  resultMetadata: Record<string, unknown> | undefined,
  outputMetadata: OpenCodeReadMetadata,
  totalLines: number,
): boolean {
  if (outputMetadata.outputCapped) return true
  const returnedEnd = outputMetadata.endLine
  if (returnedEnd === undefined || totalLines === 0) return false

  const offset = num(resultMetadata?.offset)
  const limit = num(resultMetadata?.limit)
  const startLine = offset ?? 1
  if (startLine < 0) return false
  const expectedEnd = limit === undefined ? totalLines : Math.min(totalLines, Math.max(1, startLine) + limit - 1)
  return returnedEnd < expectedEnd
}

export function readFileSize(filePath: string): number {
  if (!filePath) return 0
  try {
    return fs.statSync(filePath).size
  } catch {
    return 0
  }
}

export function readFileLineCount(filePath: string): number | undefined {
  if (!filePath) return undefined
  let fd: number | undefined
  try {
    fd = fs.openSync(filePath, "r")
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let totalBytes = 0
    let lines = 1
    while (true) {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (bytesRead === 0) break
      totalBytes += bytesRead
      for (let index = 0; index < bytesRead; index++) {
        if (buffer[index] === 0x0a) lines++
      }
    }
    return totalBytes === 0 ? 0 : lines
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        /* best effort */
      }
    }
  }
}

export function countLines(s: string): number {
  if (!s) return 0
  let n = 1
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  return n
}
