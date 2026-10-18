import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Effect, ManagedRuntime } from "effect"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import { Observability } from "@opencode-ai/core/observability"

export type LogLevel = "debug" | "info" | "notice" | "warn" | "error"
export type LogMode = "silent" | "debug"

export interface LoggerConfig {
  file: boolean
  dir: string | null
  mode: LogMode
  level: LogLevel
}

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  notice: 2,
  warn: 3,
  error: 4,
}

const MAX_LOG_BYTES = 5 * 1024 * 1024 // 5 MB
// Debug logging writes a line per stream delta, so lines queue and flush in batches.
const _FLUSH_MS = 100
const _FLUSH_CHARS = 64 * 1024
const DEFAULT_DIR = join(homedir(), ".local", "share", "opencode-claude-code")

const DEFAULT_CONFIG: LoggerConfig = {
  file: false,
  dir: null,
  mode: "silent",
  level: "info",
}

function parseBoolEnv(v: string | undefined): boolean | undefined {
  if (v == null) return undefined
  const s = v.toLowerCase().trim()
  if (s === "") return undefined
  if (s === "0" || s === "false" || s === "no" || s === "off") return false
  return true
}

function parseLevelEnv(v: string | undefined): LogLevel | undefined {
  if (v == null) return undefined
  const s = v.toLowerCase().trim()
  if (s === "") return undefined
  if (s === "debug" || s === "info" || s === "notice" || s === "warn" || s === "error") {
    return s
  }
  return undefined
}

function parseModeFromDebugEnv(v: string | undefined): LogMode | undefined {
  if (v == null || v === "") return undefined
  return v.includes("opencode-claude-code") ? "debug" : undefined
}

function withEnvOverrides(base: LoggerConfig): LoggerConfig {
  const result: LoggerConfig = { ...base }
  const envFile = parseBoolEnv(process.env.OPENCODE_CLAUDE_CODE_LOG_FILE)
  if (envFile !== undefined) result.file = envFile
  const envDir = process.env.OPENCODE_CLAUDE_CODE_LOG_DIR
  if (envDir !== undefined && envDir !== "") result.dir = envDir
  const envMode = parseModeFromDebugEnv(process.env.DEBUG)
  if (envMode !== undefined) result.mode = envMode
  const envLevel = parseLevelEnv(process.env.OPENCODE_CLAUDE_CODE_LOG_LEVEL)
  if (envLevel !== undefined) result.level = envLevel
  return result
}

let activeConfig: LoggerConfig = withEnvOverrides(DEFAULT_CONFIG)
let fileLoggingDisabled = false
let pending: string[] = []
let pendingChars = 0
let flushTimer: ReturnType<typeof setTimeout> | undefined
let exitHooked = false
// Log file whose directory exists and whose size `fileBytes` tracks, so a flush skips
// `mkdirSync`/`statSync`.
let preparedFile: string | null = null
let fileBytes = 0

/**
 * Configure the logger from plugin settings. Env vars override the supplied
 * config when explicitly set, so a developer can flip behavior for a single
 * process without editing opencode.jsonc.
 *
 *   `OPENCODE_CLAUDE_CODE_LOG_FILE`   → `file`   (1/true/on/yes vs 0/false/no/off)
 *   `OPENCODE_CLAUDE_CODE_LOG_DIR`    → `dir`
 *   `DEBUG=opencode-claude-code`      → `mode: "debug"`
 *   `OPENCODE_CLAUDE_CODE_LOG_LEVEL`  → `level` (debug | info | notice | warn | error)
 */
export function configureLogger(input: Partial<LoggerConfig>): void {
  // Queued lines belong to the old file.
  flushLogger()
  const merged: LoggerConfig = { ...DEFAULT_CONFIG, ...input }
  activeConfig = withEnvOverrides(merged)
  fileLoggingDisabled = false
  preparedFile = null
}

export function getLoggerConfig(): LoggerConfig {
  return { ...activeConfig }
}

/** Test-only helper. Resets to defaults+env so tests are deterministic; drops queued lines. */
export function _resetLoggerForTests(): void {
  clearTimeout(flushTimer)
  flushTimer = undefined
  pending = []
  pendingChars = 0
  preparedFile = null
  activeConfig = withEnvOverrides(DEFAULT_CONFIG)
  fileLoggingDisabled = false
}

function resolvedLogFile(): string {
  return join(activeConfig.dir ?? DEFAULT_DIR, "plugin.log")
}

/**
 * Writes queued lines with one append. Runs 100 ms after the first queued line, at 64K
 * chars, at once for warn/error, before `configureLogger` changes the file, and on exit.
 * A hard kill loses at most the last 100 ms of debug lines.
 */
export function flushLogger(): void {
  clearTimeout(flushTimer)
  flushTimer = undefined
  if (pending.length === 0) return
  const text = pending.join("\n") + "\n"
  pending = []
  pendingChars = 0
  if (fileLoggingDisabled) return
  try {
    const logFile = resolvedLogFile()
    if (preparedFile !== logFile) {
      mkdirSync(dirname(logFile), { recursive: true })
      fileBytes = statSync(logFile, { throwIfNoEntry: false })?.size ?? 0
      preparedFile = logFile
    }
    if (fileBytes > MAX_LOG_BYTES) rotate(logFile)
    appendFileSync(logFile, text, "utf8")
    fileBytes += Buffer.byteLength(text)
  } catch {
    // Disable on first failure to avoid spamming errors on a read-only FS.
    fileLoggingDisabled = true
  }
}

function rotate(logFile: string): void {
  try {
    renameSync(logFile, `${logFile}.1`)
    fileBytes = 0
  } catch {
    // Another process may hold the file; keep appending and retry on the next flush.
  }
}

function writeToFile(line: string, now: boolean): void {
  if (!activeConfig.file) return
  if (fileLoggingDisabled) return
  pending.push(line)
  pendingChars += line.length + 1
  if (!exitHooked) {
    exitHooked = true
    process.on("exit", flushLogger)
  }
  if (now || pendingChars >= _FLUSH_CHARS) return flushLogger()
  flushTimer ??= setTimeout(flushLogger, _FLUSH_MS).unref()
}

function fmt(level: string, msg: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString()
  const base = `[${ts}] [opencode-claude-code] ${level}: ${msg}`
  if (data && Object.keys(data).length > 0) {
    return `${base} ${JSON.stringify(data)}`
  }
  return base
}

function shouldEmit(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[activeConfig.level]
}

// Lazily built; the shared memoMap reuses the app's logging layer instead of
// building a second one.
let mainLogRuntime: ManagedRuntime.ManagedRuntime<never, never> | undefined

/**
 * warn/error always land in oc's main log (opencode.log, `channel=claude-code`),
 * like every other subsystem. They are not toasted: a problem the user must act
 * on gets its own plain-English `showToast` at the call site. Never stderr: in
 * the TUI the server worker's stderr is the terminal and paints over the frame.
 */
function toMainLog(level: "warn" | "error", msg: string, data?: Record<string, unknown>): void {
  mainLogRuntime ??= ManagedRuntime.make(Observability.layer, { memoMap })
  const args = data ? [msg, data] : [msg]
  const effect = level === "warn" ? Effect.logWarning(...args) : Effect.logError(...args)
  mainLogRuntime.runFork(effect.pipe(Effect.annotateLogs({ channel: "claude-code" })))
}

function emit(level: LogLevel, msg: string, data?: Record<string, unknown>): void {
  if (!shouldEmit(level)) return
  const line = fmt(level.toUpperCase(), msg, data)
  writeToFile(line, level === "warn" || level === "error")
  if (level === "warn" || level === "error") toMainLog(level, msg, data)
  if (activeConfig.mode === "debug") console.error(line)
}

export const log = {
  debug(msg: string, data?: Record<string, unknown>) {
    emit("debug", msg, data)
  },
  info(msg: string, data?: Record<string, unknown>) {
    emit("info", msg, data)
  },
  notice(msg: string, data?: Record<string, unknown>) {
    emit("notice", msg, data)
  },
  warn(msg: string, data?: Record<string, unknown>) {
    emit("warn", msg, data)
  },
  error(msg: string, data?: Record<string, unknown>) {
    emit("error", msg, data)
  },
}
