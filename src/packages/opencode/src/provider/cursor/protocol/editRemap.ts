import fs from "node:fs"
import path from "node:path"
import { encodeMessage } from "./messages.js"
import { APPLY_PATCH_TOOL, buildAddFilePatch, buildUpdateFilePatch, planSubstringEdit } from "./applyPatch.js"
import { binaryWritePayload, type ParsedExecRequest } from "./execParse.js"
import { buildExecStreamClose } from "./execResult.js"
import { countLines } from "./readResult.js"
import { str, stringValue } from "./values.js"

/** Matches Cursor's own pre-write read threshold (`local-exec` 52428800). */
const MAX_EDIT_SOURCE_BYTES = 50 * 1024 * 1024

/**
 * Complete the private read inside Cursor's legacy edit transaction without
 * routing it through OpenCode's user-facing `read` tool. The latter caps every
 * result at 50 KB, while Cursor's editor needs the complete file to calculate
 * the correlated whole-file `write_args` that follows.
 *
 * The caller is responsible for proving that `filePath` is the same regular
 * file named by an active `edit_tool_call` and is contained by the workspace.
 */
export function buildCompleteEditReadMessages(
  execId: number,
  sourcePath: string,
  resultPath = sourcePath,
): Uint8Array[] | undefined {
  try {
    const stat = fs.statSync(sourcePath)
    if (!stat.isFile() || stat.size > MAX_EDIT_SOURCE_BYTES) return undefined
    const content = fs.readFileSync(sourcePath, "utf8")
    return [
      encodeMessage("AgentClientMessage", {
        exec_client_message: {
          id: execId,
          local_execution_time_ms: 0,
          read_result: {
            success: {
              path: resultPath,
              content,
              total_lines: countLines(content),
              file_size: stat.size,
              truncated: false,
              range_applied: false,
            },
          },
        },
      }),
      buildExecStreamClose(execId),
    ]
  } catch {
    return undefined
  }
}

type WholeFileEditReplacement = {
  oldString: string
  newString: string
}

/** Return the number of non-overlapping occurrences, stopping after ambiguity. */
function replacementOccurrenceCount(source: string, needle: string): number {
  if (!needle) return 0
  const first = source.indexOf(needle)
  if (first === -1) return 0
  return source.indexOf(needle, first + needle.length) === -1 ? 1 : 2
}

function previousLineStart(source: string, start: number): number {
  if (start <= 0) return 0
  const before = source[start - 1] === "\n" ? start - 2 : start - 1
  return source.lastIndexOf("\n", before) + 1
}

function followingLineEnd(source: string, end: number): number {
  if (end >= source.length) return source.length
  const newline = source.indexOf("\n", end)
  return newline === -1 ? source.length : newline + 1
}

/**
 * Collapse a whole-file replacement into one unique, line-bounded substring
 * edit. Cursor's legacy edit executor computes a complete new file internally;
 * OpenCode's `edit` tool instead wants old/new substrings.
 */
function planWholeFileEdit(source: string, target: string): WholeFileEditReplacement | undefined {
  if (!source || source === target) return undefined

  let prefix = 0
  const shared = Math.min(source.length, target.length)
  while (prefix < shared && source[prefix] === target[prefix]) prefix++

  let suffix = 0
  while (
    suffix < source.length - prefix &&
    suffix < target.length - prefix &&
    source[source.length - suffix - 1] === target[target.length - suffix - 1]
  )
    suffix++

  const sourceChangeEnd = source.length - suffix
  const targetChangeEnd = target.length - suffix
  let start = prefix === 0 ? 0 : source.lastIndexOf("\n", prefix - 1) + 1
  let end = sourceChangeEnd >= source.length ? source.length : followingLineEnd(source, sourceChangeEnd)

  // A pure insertion can initially select no source text. Include an adjacent
  // line because OpenCode edit deliberately rejects an empty oldString.
  if (start === end) {
    if (start > 0) start = previousLineStart(source, start)
    else end = followingLineEnd(source, end)
  }

  const replacement = (): WholeFileEditReplacement => ({
    oldString: source.slice(start, end),
    newString: source.slice(start, prefix) + target.slice(prefix, targetChangeEnd) + source.slice(sourceChangeEnd, end),
  })

  let result = replacement()
  while (replacementOccurrenceCount(source, result.oldString) !== 1) {
    const priorStart = start
    const priorEnd = end
    if (start > 0) start = previousLineStart(source, start)
    if (end < source.length) end = followingLineEnd(source, end)
    if (start === priorStart && end === priorEnd) return undefined
    result = replacement()
  }
  return result
}

/**
 * Preserve a legacy Cursor edit's intent when its internal executor follows
 * `edit_tool_call` with a whole-file `write_args` request.
 *
 * The result field intentionally remains `write_result`: that is the response
 * Cursor is awaiting even though OpenCode executes the mutation via `edit`.
 */
export function remapCorrelatedEditWriteForCatalog(
  parsed: ParsedExecRequest,
  advertisedToolNames: Iterable<string>,
  editPath: string,
  workspaceRoot?: string,
): boolean {
  if (parsed.resultField !== "write_result" || parsed.toolName !== "write") return false
  const advertised = new Set(advertisedToolNames)
  if (!advertised.has("edit") && !advertised.has(APPLY_PATCH_TOOL)) return false

  const filePath = str(parsed.args.filePath)
  const content = stringValue(parsed.args.content)
  if (!filePath || content === undefined || !editPath) return false

  const root = workspaceRoot ?? process.cwd()
  const absolute = path.resolve(root, filePath)
  if (absolute !== path.resolve(root, editPath)) return false

  let source: string
  try {
    const stat = fs.statSync(absolute)
    if (!stat.isFile() || stat.size > MAX_EDIT_SOURCE_BYTES) return false
    if (Buffer.byteLength(content, "utf8") > MAX_EDIT_SOURCE_BYTES) return false
    source = fs.readFileSync(absolute, "utf8")
  } catch {
    // Missing targets are creations and must stay writes. Other read failures
    // also fall back to the original host permission path without guessing.
    return false
  }

  const replacement = planWholeFileEdit(source, content)
  if (!replacement) return false
  parsed.toolName = "edit"
  parsed.args = {
    filePath,
    oldString: replacement.oldString,
    newString: replacement.newString,
  }
  parsed.resultMetadata = { ...parsed.resultMetadata, path: filePath }
  return true
}

/**
 * Express a native Cursor write/edit as `apply_patch` when the host swapped the
 * edit-tool family out from under us.
 *
 * OpenCode 1.x removes `edit` and `write` from the catalog for GPT models and
 * advertises `apply_patch` in their place - see the module comment in
 * `./applyPatch.ts` for the upstream reasoning and citations. Cursor keeps
 * using its native write/edit exec channel regardless, so without this the
 * request is refused as an unavailable tool and the model loses the ability to
 * change files at all.
 *
 * Keyed purely off the advertised set: this is inert whenever the host offers
 * `write`/`edit` normally, and equally inert when it offers neither those nor
 * `apply_patch` (the caller's unavailable-tool rejection still applies).
 */
export function remapEditToolsForCatalog(
  parsed: ParsedExecRequest,
  advertisedToolNames: Iterable<string>,
  workspaceRoot?: string,
): void {
  if (parsed.toolName !== "write" && parsed.toolName !== "edit") return
  // `apply_patch` envelopes are text. A binary write has no patch form at all,
  // so it must stay a write and reach the byte-preserving path - converting it
  // here would drop the bytes and report a patch-translation failure instead of
  // the image Cursor asked to save.
  if (binaryWritePayload(parsed)) return
  const advertised = new Set(advertisedToolNames)
  if (advertised.has(parsed.toolName) || !advertised.has(APPLY_PATCH_TOOL)) return

  const requested = parsed.toolName
  const filePath = str(parsed.args.filePath)
  const refuse = (reason: string) => {
    parsed.toolName = APPLY_PATCH_TOOL
    parsed.args = {}
    parsed.localError =
      `Cursor ${requested} request cannot be expressed as an apply_patch call: ${reason}. ` +
      "The host advertises `apply_patch` instead of `edit`/`write` for this model."
  }

  if (!filePath) {
    refuse("no target path was provided")
    return
  }

  let patchText: string
  if (requested === "write") {
    const content = stringValue(parsed.args.content)
    if (content === undefined) {
      refuse("no file content was provided")
      return
    }
    // `*** Add File:` overwrites an existing target, so a whole-file write maps
    // directly without reading the current contents or diffing.
    patchText = buildAddFilePatch(filePath, content)
  } else {
    const oldString = stringValue(parsed.args.oldString)
    const newString = stringValue(parsed.args.newString)
    if (oldString === undefined || newString === undefined) {
      refuse("the replacement is missing its old or new text")
      return
    }
    // apply_patch matches whole lines, so a substring edit has to be widened to
    // the lines it touches - which requires the file the model is editing.
    const absolute = path.resolve(workspaceRoot ?? process.cwd(), filePath)
    let source: string
    try {
      // Bounded because this read is synchronous on the Run pump. Cursor's own
      // executor uses the same 50 MB threshold before reading a file it is
      // about to write.
      const size = fs.statSync(absolute).size
      if (size > MAX_EDIT_SOURCE_BYTES) {
        refuse(`the target file is ${Math.round(size / 1024 / 1024)} MB, too large to patch`)
        return
      }
      source = fs.readFileSync(absolute, "utf8")
    } catch (e) {
      refuse(`the target file could not be read (${(e as Error).message})`)
      return
    }
    const plan = planSubstringEdit(source, oldString, newString, parsed.args.replaceAll === true)
    if (!plan.ok) {
      refuse(plan.reason)
      return
    }
    patchText = buildUpdateFilePatch(filePath, plan.chunks)
  }

  parsed.toolName = APPLY_PATCH_TOOL
  parsed.args = { patchText }
  // apply_patch's output does not carry opencode `write`'s <path> tag, so keep
  // the requested path for the typed Cursor result.
  parsed.resultMetadata = { ...parsed.resultMetadata, path: filePath }
}

/**
 * A partial-read notice is for Cursor's model, never for a file. Refuse only
 * whole-file mutation forms that echo it. A targeted edit or Update File patch
 * cannot truncate an unseen tail, and may legitimately edit source that quotes
 * this provider's warning text.
 */
export function rejectPartialReadMutation(parsed: ParsedExecRequest): void {
  if (parsed.localError) return

  let content: unknown
  if (parsed.toolName === "write") {
    content = parsed.args.content
  } else if (parsed.toolName === APPLY_PATCH_TOOL) {
    const patchText = parsed.args.patchText
    if (typeof patchText !== "string" || !patchText.includes("*** Add File:")) return
    content = patchText
  } else {
    return
  }

  if (
    typeof content !== "string" ||
    !content.includes("[Partial read:") ||
    !content.includes("It is NOT the complete file.")
  )
    return

  const filePath = typeof parsed.args.filePath === "string" ? parsed.args.filePath : "the target file"
  const nextOffset = /Continue with offset=(\d+)/.exec(content)?.[1]
  parsed.localError =
    `NO FILE CHANGE WAS MADE. Refusing a whole-file mutation of ${JSON.stringify(filePath)} ` +
    "because it contains the provider's partial-read notice. Do not retry the same mutation. " +
    (nextOffset
      ? `Read the file from offset=${nextOffset}, then use a targeted edit or Update File patch.`
      : "Read the remaining file ranges, then use a targeted edit or Update File patch.")
}
