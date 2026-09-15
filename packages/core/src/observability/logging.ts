import { Effect, Formatter, Logger, type LogLevel } from "effect"
import { CurrentLogAnnotations } from "effect/References"
import fs from "fs"
import path from "path"
import { Global } from "../global"
import { runID } from "./shared"

export const MAX_LOG_BYTES = 20 * 1024 * 1024

const LEVEL_RANK = { Debug: 0, Info: 1, Warn: 2, Error: 3 } as const

let persistedDebugEnabled = false

export function persistFile() {
  return process.env.OPENCODE_DEBUG_LOGGING_PATH ?? path.join(Global.Path.state, "debug-logging.json")
}

export function persistedDebug() {
  return persistedDebugEnabled
}

export function loadPersistedDebug() {
  try {
    const data = JSON.parse(fs.readFileSync(persistFile(), "utf8")) as { enabled?: unknown }
    persistedDebugEnabled = data.enabled === true
  } catch {
    persistedDebugEnabled = false
  }
  return persistedDebugEnabled
}

export function setPersistedDebug(enabled: boolean) {
  persistedDebugEnabled = enabled
  const file = persistFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify({ enabled }, null, 2)}\n`)
  return enabled
}

loadPersistedDebug()

function formatter(id: string = runID) {
  return Logger.map(Logger.formatStructured, (output) => {
    const messages = Array.isArray(output.message) ? output.message : [output.message]
    return [
      ["timestamp", output.timestamp],
      ["level", output.level],
      ["run", id],
      ...messages.flatMap((value) => (plain(value) ? flatten(value) : [["message", value] as const])),
      ...(output.cause === undefined ? [] : [["cause", output.cause] as const]),
      ...flatten(output.spans),
      ...flatten(output.annotations),
    ]
      .map(([key, value]) => `${key}=${format(value)}`)
      .join(" ")
  })
}

function flatten(
  input: Record<string, unknown>,
  prefix = "",
  seen = new WeakSet<object>(),
): Array<readonly [string, unknown]> {
  if (seen.has(input)) return [[prefix, "[Circular]"]]
  seen.add(input)
  const entries = Object.entries(input)
  if (entries.length === 0 && prefix) return [[prefix, input]]
  return entries.flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return plain(value) ? flatten(value, path, seen) : [[path, value] as const]
  })
}

function plain(input: unknown): input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

function format(input: unknown) {
  const value = typeof input === "string" ? input : Formatter.format(input)
  return /^[^\s="\\]+$/.test(value) ? value : JSON.stringify(value)
}

export function logChannels(value = process.env.OPENCODE_LOG_CHANNELS) {
  if (!value) return undefined
  const channels = new Set(
    value
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  )
  return channels.size > 0 ? channels : undefined
}

function normalizeLevel(level: unknown): keyof typeof LEVEL_RANK {
  const value =
    typeof level === "string"
      ? level
      : typeof level === "object" && level !== null && "_tag" in level
        ? String((level as { _tag?: string })._tag)
        : "Info"
  const key = (value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()) as keyof typeof LEVEL_RANK
  return key in LEVEL_RANK ? key : "Info"
}

export function requestedLogLevel() {
  const value = process.env.OPENCODE_LOG_LEVEL?.toUpperCase()
  const levels = {
    DEBUG: "Debug",
    INFO: "Info",
    WARN: "Warn",
    ERROR: "Error",
  } as const satisfies Record<string, LogLevel.LogLevel>
  if (value && value in levels) return levels[value as keyof typeof levels]
  if (logChannels() || persistedDebugEnabled) return "Debug" as const
  return "Info" as const
}

function shouldEmit(options: { logLevel: unknown; fiber: { getRef: (ref: typeof CurrentLogAnnotations) => unknown } }) {
  const level = normalizeLevel(options.logLevel)
  if (LEVEL_RANK[level] < LEVEL_RANK[normalizeLevel(requestedLogLevel())]) return false
  if (level !== "Debug") return true
  const channels = logChannels()
  if (!channels) return true
  const annotations = options.fiber.getRef(CurrentLogAnnotations) as Record<string, unknown>
  return channels.has(String(annotations.channel ?? "").toLowerCase())
}

export function filterLogs<Message, Output>(logger: Logger.Logger<Message, Output>): Logger.Logger<Message, Output> {
  return Logger.make((options) => {
    if (!shouldEmit(options)) return undefined as Output
    return logger.log(options)
  })
}

export function filterByChannel<Message, Output>(
  logger: Logger.Logger<Message, Output>,
): Logger.Logger<Message, Output> {
  return filterLogs(logger)
}

export function rotateLogFile(file: string, maxBytes = MAX_LOG_BYTES) {
  try {
    if (fs.statSync(file).size < maxBytes) return false
    const previous = `${file}.1`
    try {
      fs.unlinkSync(previous)
    } catch {}
    fs.renameSync(file, previous)
    return true
  } catch {
    return false
  }
}

export function fileLogger(file = path.join(Global.Path.log, "opencode.log"), id: string = runID) {
  rotateLogFile(file)
  // Do not set batchWindow to 0; it causes high idle CPU usage.
  return Logger.toFile(formatter(id), file, { flag: "a" }).pipe(Effect.map(filterLogs))
}

const stderrLogger = Logger.make((options) => process.stderr.write(formatter().log(options) + "\n"))

export function minimumLogLevel() {
  // Always Debug so a live persist toggle can emit without restarting.
  // filterLogs enforces requestedLogLevel() and channel filters at the sink.
  return "Debug" as const
}

export function loggers() {
  const file = fileLogger()
  return process.env.OPENCODE_PRINT_LOGS === "1" ? [file, filterLogs(stderrLogger)] : [file]
}

export const debug = (channel: string, message: string, extra?: Record<string, unknown>) =>
  (extra === undefined ? Effect.logDebug(message) : Effect.logDebug(message, extra)).pipe(
    Effect.annotateLogs({ channel }),
  )

export * as Logging from "./logging"
