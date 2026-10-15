import { execFile } from "node:child_process"
import { realpath, stat, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { encodeMessage } from "./messages.js"
import { buildExecStreamClose } from "./execResult.js"

const execFileAsync = promisify(execFile)

export const GIT_DIFF_TIMEOUT_MS = 15_000
export const SAFE_MAX_RESPONSE_BYTES = 512 * 1024
export const SAFE_MAX_FILES = 100
export const SAFE_STDOUT_BYTES = SAFE_MAX_RESPONSE_BYTES
export const SAFE_STDERR_BYTES = 256 * 1024

function normalizePath(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value
}

export function isPathInside(child: string, parent: string): boolean {
  const p = path.resolve(parent)
  const c = path.resolve(child)
  const pn = normalizePath(p)
  const cn = normalizePath(c)
  // Use relative on normalized paths to handle Windows case insensitivity
  const relative = path.relative(pn, cn)
  if (relative === "") return true
  if (path.isAbsolute(relative)) return false
  if (relative === ".." || relative.startsWith(`..${path.sep}`)) return false
  // On Windows, relative may contain backslashes; also check forward slash variant
  if (relative.startsWith("../") || relative === "..") return false
  return true
}

async function trustedRootReal(workspaceRoot: string): Promise<string> {
  const resolved = path.resolve(workspaceRoot)
  try {
    return await realpath(resolved)
  } catch {
    return resolved
  }
}

async function resolveAndValidateCwd(
  cwd: string,
  workspaceRoot: string,
  trustedReal: string,
): Promise<string | undefined> {
  const raw = cwd && cwd.trim() ? cwd.trim() : workspaceRoot
  const expanded = raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw
  const resolved = path.isAbsolute(expanded) ? path.resolve(expanded) : path.resolve(workspaceRoot, expanded)
  if (!isPathInside(resolved, workspaceRoot)) return undefined
  let real: string
  try {
    real = await realpath(resolved)
  } catch {
    return undefined
  }
  if (!isPathInside(real, trustedReal)) return undefined
  // Also ensure it is a directory
  try {
    const st = await stat(real)
    if (!st.isDirectory()) return undefined
  } catch {
    return undefined
  }
  return real
}

async function resolveAndValidateTargetPath(
  requested: string,
  cwdReal: string,
  trustedReal: string,
): Promise<string | undefined> {
  if (!requested || typeof requested !== "string") return undefined
  const trimmed = requested.trim()
  if (!trimmed) return undefined
  // Reject absolute traversal attempts that escape? Already handled by isPathInside
  // Also reject paths containing NUL
  if (trimmed.includes("\0")) return undefined
  const resolved = path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(cwdReal, trimmed)
  if (!isPathInside(resolved, trustedReal)) return undefined
  // For existing files, check symlink escape via realpath
  try {
    const real = await realpath(resolved)
    if (!isPathInside(real, trustedReal)) return undefined
    return real
  } catch {
    // If file does not exist (untracked/new), still validate the parent directory's realpath
    const parent = path.dirname(resolved)
    try {
      const parentReal = await realpath(parent)
      if (!isPathInside(parentReal, trustedReal)) return undefined
      // Also check that the resolved path's parent is inside
      if (!isPathInside(path.resolve(resolved), trustedReal)) return undefined
      return resolved
    } catch {
      // Parent also doesn't exist; fallback to lexical check only (already done)
      return resolved
    }
  }
}

export type GetDiffRequestInput = {
  cwd?: string
  ref?: string
  baseRef?: string
  base_ref?: string
  mergeBase?: boolean
  merge_base?: boolean
  targetPaths?: string[]
  target_paths?: string[]
  unifiedContextLines?: number
  unified_context_lines?: number
  maxUntrackedFiles?: number
  max_untracked_files?: number
  outputFormat?: number
  output_format?: number
  submoduleRecurseDepth?: number
  submodule_recurse_depth?: number
  includeSpaceChanges?: boolean
  include_space_changes?: boolean
  committedOnly?: boolean
  committed_only?: boolean
  computePatchId?: boolean
  compute_patch_id?: boolean
  returnHeadSha?: boolean
  return_head_sha?: boolean
  maxResponseBytes?: number
  max_response_bytes?: number
}

export type NormalizedGetDiffRequest = {
  cwd: string
  ref: string
  baseRef: string
  mergeBase: boolean
  targetPaths: string[]
  unifiedContextLines?: number
  maxUntrackedFiles: number
  outputFormat: number
  submoduleRecurseDepth: number
  includeSpaceChanges: boolean
  committedOnly: boolean
  computePatchId: boolean
  returnHeadSha?: boolean
  maxResponseBytes?: number
}

function normalizeRequest(input: GetDiffRequestInput): NormalizedGetDiffRequest {
  return {
    cwd: typeof input.cwd === "string" ? input.cwd : "",
    ref: typeof input.ref === "string" ? input.ref : "",
    baseRef:
      typeof input.baseRef === "string" ? input.baseRef : typeof input.base_ref === "string" ? input.base_ref : "",
    mergeBase:
      typeof input.mergeBase === "boolean"
        ? input.mergeBase
        : typeof input.merge_base === "boolean"
          ? input.merge_base
          : false,
    targetPaths: Array.isArray(input.targetPaths)
      ? input.targetPaths.filter((v): v is string => typeof v === "string")
      : Array.isArray(input.target_paths)
        ? input.target_paths.filter((v): v is string => typeof v === "string")
        : [],
    unifiedContextLines:
      typeof input.unifiedContextLines === "number"
        ? input.unifiedContextLines
        : typeof input.unified_context_lines === "number"
          ? input.unified_context_lines
          : undefined,
    maxUntrackedFiles:
      typeof input.maxUntrackedFiles === "number"
        ? input.maxUntrackedFiles
        : typeof input.max_untracked_files === "number"
          ? input.max_untracked_files
          : 0,
    outputFormat:
      typeof input.outputFormat === "number"
        ? input.outputFormat
        : typeof input.output_format === "number"
          ? input.output_format
          : 0,
    submoduleRecurseDepth:
      typeof input.submoduleRecurseDepth === "number"
        ? input.submoduleRecurseDepth
        : typeof input.submodule_recurse_depth === "number"
          ? input.submodule_recurse_depth
          : 0,
    includeSpaceChanges:
      typeof input.includeSpaceChanges === "boolean"
        ? input.includeSpaceChanges
        : typeof input.include_space_changes === "boolean"
          ? input.include_space_changes
          : true,
    committedOnly:
      typeof input.committedOnly === "boolean"
        ? input.committedOnly
        : typeof input.committed_only === "boolean"
          ? input.committed_only
          : false,
    computePatchId:
      typeof input.computePatchId === "boolean"
        ? input.computePatchId
        : typeof input.compute_patch_id === "boolean"
          ? input.compute_patch_id
          : false,
    returnHeadSha:
      typeof input.returnHeadSha === "boolean"
        ? input.returnHeadSha
        : typeof input.return_head_sha === "boolean"
          ? input.return_head_sha
          : undefined,
    maxResponseBytes:
      typeof input.maxResponseBytes === "number"
        ? input.maxResponseBytes
        : typeof input.max_response_bytes === "number"
          ? input.max_response_bytes
          : undefined,
  }
}

export type FileDiffChunk = {
  content: string
  lines: string[]
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
}

export type FileDiff = {
  from: string
  to: string
  chunks: FileDiffChunk[]
  added: number
  removed: number
  beforeFileContents?: string
  afterFileContents?: string
  isGenerated?: boolean
}

export type GitDiff = {
  diffs: FileDiff[]
  diffType: number
}

export type SubmoduleDiff = {
  relativePath: string
  diff?: GitDiff
  errored: boolean
}

export type GetDiffResponse = {
  diff?: GitDiff
  submoduleDiffs: SubmoduleDiff[]
  patchId?: string
  headSha?: string
  hasUncommittedChanges?: boolean
}

function emptyDiffResponse(): GetDiffResponse {
  return {
    diff: { diffs: [], diffType: 0 },
    submoduleDiffs: [],
  }
}

function buildGitArgs(request: NormalizedGetDiffRequest, relativeTargets: string[]): string[] {
  const args: string[] = ["diff", "--no-color", "--no-ext-diff"]
  // output format controls flags
  if (request.outputFormat === 1) {
    args.push("--name-status")
  } else if (request.outputFormat === 2) {
    args.push("--numstat")
  }
  // unified context
  if (
    typeof request.unifiedContextLines === "number" &&
    Number.isInteger(request.unifiedContextLines) &&
    request.unifiedContextLines >= 0 &&
    request.unifiedContextLines <= 100
  ) {
    args.push(`-U${request.unifiedContextLines}`)
  }
  if (request.includeSpaceChanges === false) {
    args.push("-w")
  }
  if (request.committedOnly) {
    args.push("--cached")
  }
  // refs
  if (request.baseRef && request.ref) {
    if (request.mergeBase) {
      args.push(`${request.baseRef}...${request.ref}`)
    } else {
      args.push(`${request.baseRef}..${request.ref}`)
    }
  } else if (request.ref) {
    args.push(request.ref)
  } else if (request.baseRef) {
    args.push(request.baseRef)
  }
  if (relativeTargets.length > 0) {
    args.push("--", ...relativeTargets)
  }
  return args
}

function isSafeGitRef(value: string): boolean {
  if (value.length > 512 || value.startsWith("-") || /[\0\r\n\t ]/.test(value)) return false
  if (value.includes(":") || value.includes("^") || value.includes("@{") || value.includes("..")) return false
  return true
}

async function runGit(
  cwd: string,
  args: string[],
  timeoutMs: number,
  maxBuffer: number,
): Promise<{ stdout: string; stderr: string; timedOut: boolean; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer,
      windowsHide: true,
    } as never)
    const out = typeof stdout === "string" ? stdout : String(stdout ?? "")
    const err = typeof stderr === "string" ? stderr : String(stderr ?? "")
    return { stdout: out, stderr: err, timedOut: false, code: 0 }
  } catch (e) {
    const err = e as {
      stdout?: unknown
      stderr?: unknown
      message?: string
      killed?: boolean
      signal?: string
      code?: unknown
    }
    const stdout =
      typeof err.stdout === "string"
        ? err.stdout
        : typeof err.stdout === "object" && err.stdout
          ? String(err.stdout)
          : ""
    const stderr = typeof err.stderr === "string" ? err.stderr : err.message ? String(err.message) : ""
    const timedOut = err.killed === true || (typeof err.message === "string" && err.message.includes("timed out"))
    const code = typeof err.code === "number" ? err.code : 1
    return { stdout, stderr, timedOut, code }
  }
}

async function runGitWithInput(
  cwd: string,
  args: string[],
  input: string,
  timeoutMs: number,
  maxBuffer: number,
): Promise<{ stdout: string; stderr: string; timedOut: boolean; code: number }> {
  return await new Promise((resolve) => {
    const child = execFile(
      "git",
      args,
      { cwd, encoding: "utf-8", timeout: timeoutMs, maxBuffer, windowsHide: true },
      (error, stdout, stderr) => {
        const failure = error as { killed?: boolean; message?: string; code?: unknown } | null
        resolve({
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? failure?.message ?? ""),
          timedOut: failure?.killed === true || failure?.message?.includes("timed out") === true,
          code: typeof failure?.code === "number" ? failure.code : failure ? 1 : 0,
        })
      },
    )
    child.stdin?.end(input)
  })
}

function parseUnifiedDiff(text: string): FileDiff[] {
  const diffs: FileDiff[] = []
  const lines = text.split("\n")
  let current: FileDiff | undefined
  let currentChunk: FileDiffChunk | undefined
  let chunkLines: string[] = []
  let chunkHeader: { oldStart: number; oldLines: number; newStart: number; newLines: number } | undefined

  function flushChunk(): void {
    if (!current || !currentChunk || !chunkHeader) return
    const content = chunkLines.join("\n")
    currentChunk.content = content
    currentChunk.lines = [...chunkLines]
    currentChunk.oldStart = chunkHeader.oldStart
    currentChunk.oldLines = chunkHeader.oldLines
    currentChunk.newStart = chunkHeader.newStart
    currentChunk.newLines = chunkHeader.newLines
    current.chunks.push(currentChunk)
    currentChunk = undefined
    chunkLines = []
    chunkHeader = undefined
  }
  function flushFile(): void {
    if (current) {
      flushChunk()
      // compute added/removed if not already set via numstat path
      let added = 0
      let removed = 0
      for (const ch of current.chunks) {
        for (const l of ch.lines) {
          if (l.startsWith("+") && !l.startsWith("+++")) added++
          else if (l.startsWith("-") && !l.startsWith("---")) removed++
        }
      }
      current.added = added
      current.removed = removed
      diffs.push(current)
      current = undefined
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.startsWith("diff --git ")) {
      flushFile()
      const m = line.match(/^diff --git a\/(.*) b\/(.*)$/)
      const from = m ? m[1]! : ""
      const to = m ? m[2]! : ""
      current = { from, to, chunks: [], added: 0, removed: 0 }
      continue
    }
    if (!current) continue
    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      // part of chunk header, will be captured as chunk line if within hunk
      // For now ignore outside hunks
      continue
    }
    const hunk = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/)
    if (hunk) {
      flushChunk()
      chunkHeader = {
        oldStart: Number(hunk[1]),
        oldLines: hunk[2] ? Number(hunk[2]) : 1,
        newStart: Number(hunk[3]),
        newLines: hunk[4] ? Number(hunk[4]) : 1,
      }
      currentChunk = { content: "", lines: [], oldStart: 0, oldLines: 0, newStart: 0, newLines: 0 }
      chunkLines = [line]
      continue
    }
    if (currentChunk) {
      // Lines within a chunk: include context, added, removed, or header markers
      // Chunk ends when next diff header or hunk header encountered (handled above)
      chunkLines.push(line)
    }
  }
  flushFile()
  return diffs
}

function parseNameStatus(text: string): FileDiff[] {
  const diffs: FileDiff[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split("\t")
    const status = parts[0] ?? ""
    const file = parts[1] ?? parts[0] ?? ""
    if (!file) continue
    // status like M, A, D, R100 etc
    const first = status[0] ?? ""
    const from = first === "A" ? "/dev/null" : file
    const to = first === "D" ? "/dev/null" : file
    diffs.push({ from, to, chunks: [], added: 0, removed: 0 })
  }
  return diffs
}

function parseNumstat(text: string): FileDiff[] {
  const diffs: FileDiff[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split("\t")
    if (parts.length < 3) continue
    const added = Number(parts[0])
    const removed = Number(parts[1])
    const file = parts[2]!
    diffs.push({
      from: file,
      to: file,
      chunks: [],
      added: Number.isFinite(added) ? added : 0,
      removed: Number.isFinite(removed) ? removed : 0,
    })
  }
  return diffs
}

function capBytes(value: string, limit: number): string {
  const bytes = Buffer.byteLength(value, "utf8")
  if (bytes <= limit) return value
  // Truncate by bytes, not characters, to respect limit
  const buf = Buffer.from(value, "utf8")
  return buf.subarray(0, limit).toString("utf8")
}

function capFileCount(diffs: FileDiff[], limit: number): FileDiff[] {
  if (limit <= 0) return diffs
  return diffs.slice(0, limit)
}

async function listSubmodulePaths(cwd: string, timeoutMs: number): Promise<string[]> {
  const result = await runGit(cwd, ["ls-files", "--stage", "-z"], Math.min(timeoutMs, 2000), 256 * 1024)
  if (result.code !== 0) return []
  return result.stdout
    .split("\0")
    .map((entry) => entry.match(/^160000\s+\S+\s+\d+\t(.+)$/)?.[1])
    .filter((value): value is string => value !== undefined)
}

export async function executeGitDiff(
  input: GetDiffRequestInput,
  workspaceRoot: string,
  options?: { timeoutMs?: number; maxResponseBytes?: number },
): Promise<GetDiffResponse> {
  const request = normalizeRequest(input)
  if (!isSafeGitRef(request.ref) || !isSafeGitRef(request.baseRef)) return emptyDiffResponse()
  const trustedReal = await trustedRootReal(workspaceRoot)
  const cwdReal = await resolveAndValidateCwd(request.cwd, workspaceRoot, trustedReal)
  if (!cwdReal) return emptyDiffResponse()

  // Validate target paths
  const validated: string[] = []
  for (const p of request.targetPaths) {
    const v = await resolveAndValidateTargetPath(p, cwdReal, trustedReal)
    if (!v) return emptyDiffResponse()
    validated.push(v)
  }
  const relativeTargets = validated.map((abs) => {
    const rel = path.relative(cwdReal, abs)
    return rel === "" ? "." : rel
  })

  const safeMax = (() => {
    const requested = request.maxResponseBytes
    const preferred = typeof options?.maxResponseBytes === "number" ? options.maxResponseBytes : undefined
    const candidate = preferred ?? requested
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.min(candidate, SAFE_MAX_RESPONSE_BYTES)
    }
    return SAFE_MAX_RESPONSE_BYTES
  })()

  const timeoutMs = options?.timeoutMs ?? GIT_DIFF_TIMEOUT_MS
  const fileCountLimit =
    request.maxUntrackedFiles > 0 ? Math.min(request.maxUntrackedFiles, SAFE_MAX_FILES) : SAFE_MAX_FILES

  const args = buildGitArgs(request, relativeTargets)

  // Bound argument count
  if (args.length > 200) return emptyDiffResponse()

  const maxBuffer = safeMax * 2 + SAFE_STDERR_BYTES

  const result = await runGit(cwdReal, args, timeoutMs, maxBuffer)

  // If timed out, return empty diff (still truthful)
  if (result.timedOut) return emptyDiffResponse()

  // If git error (non-zero) and no stdout, return empty
  // But git diff returns 0 even when no changes; non-zero indicates error (e.g., bad ref)
  if (result.code !== 0 && !result.stdout.trim()) {
    return emptyDiffResponse()
  }

  let diffs: FileDiff[] = []
  const stdoutCapped = capBytes(result.stdout, SAFE_STDOUT_BYTES)
  // stderr is not used for diff, but we cap applies to response size later
  const stderrCapped = capBytes(result.stderr, SAFE_STDERR_BYTES)

  if (request.outputFormat === 1) {
    diffs = parseNameStatus(stdoutCapped)
  } else if (request.outputFormat === 2) {
    diffs = parseNumstat(stdoutCapped)
    const statusResult = await runGit(
      cwdReal,
      args.map((arg) => (arg === "--numstat" ? "--name-status" : arg)),
      timeoutMs,
      maxBuffer,
    )
    const statuses = parseNameStatus(capBytes(statusResult.stdout, SAFE_STDOUT_BYTES))
    diffs = diffs.map((diff, index) => ({
      ...diff,
      from: statuses[index]?.from ?? diff.from,
      to: statuses[index]?.to ?? diff.to,
    }))
  } else {
    diffs = parseUnifiedDiff(stdoutCapped)
    // Fallback: if unified parse produced nothing but stdout has name-status style lines, try alternative
    if (diffs.length === 0 && stdoutCapped.trim()) {
      // Could be that git with --name-status produced nothing due to our args? Try numstat alternative?
      // Keep empty
    }
    // For outputFormat 4, populate before/after file contents if requested and diffs small
    if (request.outputFormat === 4) {
      for (const fd of diffs) {
        try {
          const beforePath = await resolveAndValidateTargetPath(fd.from, cwdReal, trustedReal)
          const afterPath = await resolveAndValidateTargetPath(fd.to, cwdReal, trustedReal)
          if (beforePath) {
            const beforeStat = await stat(beforePath).catch(() => undefined)
            if (beforeStat && beforeStat.isFile() && beforeStat.size < SAFE_MAX_RESPONSE_BYTES) {
              const b = await readFile(beforePath, "utf8").catch(() => undefined)
              if (typeof b === "string")
                fd.beforeFileContents = capBytes(b, Math.floor(safeMax / Math.max(1, diffs.length)))
            }
          }
          if (afterPath) {
            const afterStat = await stat(afterPath).catch(() => undefined)
            if (afterStat && afterStat.isFile() && afterStat.size < SAFE_MAX_RESPONSE_BYTES) {
              const a = await readFile(afterPath, "utf8").catch(() => undefined)
              if (typeof a === "string")
                fd.afterFileContents = capBytes(a, Math.floor(safeMax / Math.max(1, diffs.length)))
            }
          }
        } catch {
          // ignore per-file errors
        }
      }
    }
    // Suppress stderr in diff output? Keep for debugging but not in diffs
    void stderrCapped
  }

  diffs = capFileCount(diffs, fileCountLimit)

  // Enforce max response bytes by truncating diffs until encoded size fits
  const candidate: GetDiffResponse = {
    diff: { diffs, diffType: request.ref || request.baseRef ? 2 : 1 },
    submoduleDiffs: [],
  }

  if (request.submoduleRecurseDepth > 0) {
    const submodulePaths = await listSubmodulePaths(cwdReal, timeoutMs)
    candidate.submoduleDiffs = await Promise.all(
      submodulePaths.map(async (relativePath) => {
        const submoduleCwd = await resolveAndValidateCwd(path.join(cwdReal, relativePath), workspaceRoot, trustedReal)
        if (!submoduleCwd) return { relativePath, errored: true }
        const nested = await executeGitDiff(
          {
            cwd: submoduleCwd,
            output_format: request.outputFormat,
            max_untracked_files: request.maxUntrackedFiles,
            unified_context_lines: request.unifiedContextLines,
            submodule_recurse_depth: request.submoduleRecurseDepth - 1,
            include_space_changes: request.includeSpaceChanges,
            committed_only: request.committedOnly,
            compute_patch_id: request.computePatchId,
            return_head_sha: request.returnHeadSha,
            max_response_bytes: Math.floor(safeMax / 2),
          },
          workspaceRoot,
          options,
        )
        return { relativePath, diff: nested.diff, errored: false }
      }),
    )
  }

  // Optionally add hasUncommittedChanges: true if any diffs or git status dirty
  try {
    const status = await runGit(cwdReal, ["status", "--porcelain"], Math.min(2000, timeoutMs), 64 * 1024)
    candidate.hasUncommittedChanges = status.stdout.trim().length > 0 || diffs.length > 0
  } catch {
    candidate.hasUncommittedChanges = diffs.length > 0
  }

  if (request.computePatchId && result.stdout.length > 0) {
    const patch = await runGitWithInput(
      cwdReal,
      ["patch-id", "--stable"],
      result.stdout,
      Math.min(2000, timeoutMs),
      64 * 1024,
    )
    const patchId = patch.stdout.trim().split(/\s+/)[0]
    if (/^[0-9a-f]{40}$/.test(patchId ?? "")) candidate.patchId = patchId
  }

  if (request.returnHeadSha) {
    try {
      const head = await runGit(cwdReal, ["rev-parse", "HEAD"], Math.min(2000, timeoutMs), 64 * 1024)
      const sha = head.stdout.trim()
      if (/^[0-9a-f]{40}$/.test(sha)) candidate.headSha = sha
    } catch {
      // ignore
    }
  }

  // Apply byte cap iteratively
  let encoded = encodeMessage("GetDiffResponse", toSnake(candidate) as Record<string, unknown>)
  let tries = 0
  while (encoded.length > safeMax && candidate.diff && candidate.diff.diffs.length > 0 && tries < 20) {
    candidate.diff.diffs.pop()
    encoded = encodeMessage("GetDiffResponse", toSnake(candidate) as Record<string, unknown>)
    tries++
  }
  // If still too large (e.g., before/after contents), strip those fields
  if (encoded.length > safeMax) {
    for (const fd of candidate.diff?.diffs ?? []) {
      delete fd.beforeFileContents
      delete fd.afterFileContents
    }
    encoded = encodeMessage("GetDiffResponse", toSnake(candidate) as Record<string, unknown>)
  }

  return candidate
}

function toSnake(response: GetDiffResponse): Record<string, unknown> {
  return {
    diff: response.diff
      ? {
          diffs: response.diff.diffs.map((fd) => ({
            from: fd.from,
            to: fd.to,
            chunks: fd.chunks.map((ch) => ({
              content: ch.content,
              lines: ch.lines,
              old_start: ch.oldStart,
              old_lines: ch.oldLines,
              new_start: ch.newStart,
              new_lines: ch.newLines,
            })),
            added: fd.added,
            removed: fd.removed,
            ...(fd.beforeFileContents !== undefined ? { before_file_contents: fd.beforeFileContents } : {}),
            ...(fd.afterFileContents !== undefined ? { after_file_contents: fd.afterFileContents } : {}),
            ...(fd.isGenerated !== undefined ? { is_generated: fd.isGenerated } : {}),
          })),
          diff_type: response.diff.diffType,
        }
      : undefined,
    submodule_diffs: response.submoduleDiffs.map((sd) => ({
      relative_path: sd.relativePath,
      diff: sd.diff
        ? {
            diffs: sd.diff.diffs.map((fd) => ({
              from: fd.from,
              to: fd.to,
              chunks: fd.chunks.map((ch) => ({
                content: ch.content,
                lines: ch.lines,
                old_start: ch.oldStart,
                old_lines: ch.oldLines,
                new_start: ch.newStart,
                new_lines: ch.newLines,
              })),
              added: fd.added,
              removed: fd.removed,
            })),
            diff_type: sd.diff.diffType,
          }
        : undefined,
      errored: sd.errored,
    })),
    ...(response.patchId !== undefined ? { patch_id: response.patchId } : {}),
    ...(response.headSha !== undefined ? { head_sha: response.headSha } : {}),
    ...(response.hasUncommittedChanges !== undefined
      ? { has_uncommitted_changes: response.hasUncommittedChanges }
      : {}),
  }
}

export function buildGitDiffReply(params: { id: number; execId: string; response: GetDiffResponse }): Uint8Array[] {
  const snake = toSnake(params.response)
  const frame = encodeMessage("AgentClientMessage", {
    exec_client_message: {
      id: params.id,
      exec_id: params.execId,
      local_execution_time_ms: 0,
      git_diff_response: snake,
    },
  })
  const close = buildExecStreamClose(params.id)
  return [frame, close]
}
