import { Effect, Schema } from "effect"
import { Tool } from "./tool"
import { ShellJobs } from "@/background/shellJobs"

const LIST_MAX = 50
const DEFAULT_TAIL = 40
const HARD_TAIL = 80
const DEFAULT_CHARS = 4000
const HARD_CHARS = 8000

const StatusParameters = Schema.Struct({
  jobId: Schema.optional(Schema.String).annotate({
    description: "Job id returned by bash with background: true. Omit to list this session's jobs.",
  }),
  tail: Schema.optional(Schema.Number).annotate({
    description: `Log lines to return per stream. Default ${DEFAULT_TAIL}, hard cap ${HARD_TAIL}.`,
  }),
  maxChars: Schema.optional(Schema.Number).annotate({
    description: `Max characters per stream tail. Default ${DEFAULT_CHARS}, hard cap ${HARD_CHARS}.`,
  }),
})

const KillParameters = Schema.Struct({
  jobId: Schema.String.annotate({ description: "Job id returned by bash with background: true" }),
})

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function elapsed(info: ShellJobs.Info) {
  const seconds = Math.max(0, Math.floor(((info.endedAt ?? Date.now()) - info.startedAt) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m${seconds % 60}s`
  return `${Math.floor(minutes / 60)}h${minutes % 60}m`
}

function summary(info: ShellJobs.Info) {
  return [
    info.id,
    `status=${info.status}`,
    `pid=${info.pid ?? "none"}`,
    `exit=${info.exitCode ?? "none"}`,
    `elapsed=${elapsed(info)}`,
    `cmd=${info.command.slice(0, 80)}`,
  ].join(" ")
}

function detail(info: ShellJobs.Info, out: string, err: string) {
  return [
    summary(info),
    `outLog: ${info.outLog}`,
    `errLog: ${info.errLog}`,
    "",
    "--- out tail ---",
    out || "(empty)",
    "",
    "--- err tail ---",
    err || "(empty)",
  ].join("\n")
}

/** Text returned by the bash call that started a background job. */
export function renderStarted(info: ShellJobs.Info) {
  return [
    `jobId=${info.id}`,
    `pid=${info.pid ?? "none"}`,
    `status=${info.status}`,
    `outLog: ${info.outLog}`,
    `errLog: ${info.errLog}`,
    "The job runs in the background. Read it with bgStatus; you are notified when it exits.",
  ].join("\n")
}

/** Synthetic message sent to the session when a background job exits. */
export function renderNotice(info: ShellJobs.Info, output: string) {
  const exit = info.exitCode == null ? "" : ` exitCode="${info.exitCode}"`
  return [
    `<background_shell id="${info.id}" state="${info.status}"${exit}>`,
    `command: ${info.command}`,
    `outLog: ${info.outLog}`,
    `errLog: ${info.errLog}`,
    output || "(no output)",
    "</background_shell>",
  ].join("\n")
}

export const BgStatusTool = Tool.define(
  "bgStatus",
  Effect.gen(function* () {
    const jobs = yield* ShellJobs.Service
    return {
      description:
        "Reads background jobs started by bash with background: true: status, pid, exit code, and capped, ANSI-stripped log tails. " +
        "Omit jobId to list this session's jobs. Completion also arrives as a notice; do not sleep or poll.",
      parameters: StatusParameters,
      execute: (params: Schema.Schema.Type<typeof StatusParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (!params.jobId) {
            const list = yield* jobs.list(ctx.sessionID)
            if (list.length === 0) return { title: "bgStatus", output: "no jobs in this session", metadata: {} }
            const lines = list.slice(0, LIST_MAX).map(summary)
            if (list.length > LIST_MAX) lines.push(`list cap ${LIST_MAX}; pass jobId for detail`)
            return { title: "bgStatus list", output: lines.join("\n"), metadata: {} }
          }
          const info = yield* jobs.get(ctx.sessionID, params.jobId)
          if (!info) return { title: "bgStatus error", output: `unknown jobId: ${params.jobId}`, metadata: {} }
          const tail = clamp(params.tail, DEFAULT_TAIL, 1, HARD_TAIL)
          const maxChars = clamp(params.maxChars, DEFAULT_CHARS, 200, HARD_CHARS)
          const out = yield* Effect.promise(() => ShellJobs.readTail(info.outLog, tail, maxChars))
          const err = yield* Effect.promise(() => ShellJobs.readTail(info.errLog, tail, maxChars))
          return { title: `bgStatus ${info.id}`, output: detail(info, out, err), metadata: {} }
        }),
    }
  }),
)

export const BgKillTool = Tool.define(
  "bgKill",
  Effect.gen(function* () {
    const jobs = yield* ShellJobs.Service
    return {
      description:
        "Stops a background job started by bash with background: true, along with the processes it started. Only jobs from this session can be stopped.",
      parameters: KillParameters,
      execute: (params: Schema.Schema.Type<typeof KillParameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const info = yield* jobs.kill(ctx.sessionID, params.jobId)
          if (!info) return { title: "bgKill error", output: `unknown jobId: ${params.jobId}`, metadata: {} }
          return { title: `bgKill ${info.id}`, output: killOutput(info), metadata: {} }
        }),
    }
  }),
)

function killOutput(info: ShellJobs.Info) {
  if (info.status === "killed") return `killed jobId=${info.id} pid=${info.pid ?? "none"}`
  if (info.status === "running") {
    return `jobId=${info.id} runs in another oc instance (process ${info.owner}); only that instance can stop it`
  }
  if (info.status === "interrupted") {
    return `interrupted jobId=${info.id}: the oc process that started it ended, so pid=${info.pid ?? "none"} was not signalled`
  }
  return `already ${info.status} pid=${info.pid ?? "none"} exit=${info.exitCode ?? "none"}`
}
