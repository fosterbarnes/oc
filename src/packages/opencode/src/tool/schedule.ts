import { DateTime, Effect, Schema } from "effect"
import { MessageID } from "@/session/schema"
import type { SessionPrompt } from "@/session/prompt"
import { formatTime } from "./time"
import * as Tool from "./tool"

// One-shot prompts on the session queue (`session/queue.ts`): they survive restarts, show in the
// queue dialog, and fire through the normal turn path once the session is idle.

export const PromptParameters = Schema.Struct({
  prompt: Schema.String.annotate({ description: "The prompt to send when the time comes" }),
  at: Schema.optional(Schema.String).annotate({
    description: "Local time to send it, `YYYY-MM-DD HH:MM` (the `time` tool's format also works)",
  }),
  delaySeconds: Schema.optional(Schema.Number).annotate({ description: "Send it this many seconds from now" }),
  target: Schema.optional(Schema.Literals(["current", "fork", "new"])).annotate({
    description: "Where it runs: this session (default), a fork of it, or a new session",
  }),
})

export const CancelParameters = Schema.Struct({
  id: Schema.String.annotate({ description: "Scheduled prompt id from schedule_prompt or schedule_list" }),
})

export const SchedulePromptTool = Tool.define(
  "schedule_prompt",
  Effect.succeed({
    description:
      "Schedule a prompt to be sent later, once. Give `at` or `delaySeconds`. The schedule is kept by" +
      " oc and survives restarts. To repeat, schedule the next run from inside the scheduled prompt.",
    parameters: PromptParameters,
    execute: (params: Schema.Schema.Type<typeof PromptParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        const runAt = fireTime(params, now)
        if (typeof runAt === "string") return { title: "Not scheduled", output: runAt, metadata: {} }
        yield* ctx.ask({ permission: "schedule_prompt", patterns: ["*"], always: ["*"], metadata: {} })
        const lastUser = ctx.messages.findLast((item) => item.info.role === "user")?.info
        const model = lastUser?.role === "user" ? lastUser.model : undefined
        const id = MessageID.ascending()
        const prompt = yield* sessionPrompt()
        yield* prompt.queue.add({
          sessionID: ctx.sessionID,
          id,
          payload: {
            agent: ctx.agent,
            ...(model && { model: { providerID: model.providerID, modelID: model.modelID }, variant: model.variant }),
            parts: [{ type: "text", text: params.prompt }],
          },
          runAt: runAt.getTime(),
          target: params.target ?? "current",
        })
        const when = formatTime(runAt)
        return { title: `Scheduled for ${when}`, output: `Scheduled ${id} for ${when}.`, metadata: {} }
      }),
  }),
)

export const ScheduleListTool = Tool.define(
  "schedule_list",
  Effect.succeed({
    description: "List this session's scheduled prompts that have not been sent yet.",
    parameters: Schema.Struct({}),
    execute: (_params: object, ctx: Tool.Context) =>
      Effect.gen(function* () {
        const prompt = yield* sessionPrompt()
        const entries = (yield* prompt.queue.snapshot(ctx.sessionID)).entries.flatMap((entry) =>
          entry.runAt === undefined
            ? []
            : [`${entry.id}  ${formatTime(new Date(entry.runAt))}  ${entry.target}  ${entry.text.split("\n")[0]}`],
        )
        return {
          title: `${entries.length} scheduled`,
          output: entries.join("\n") || "No scheduled prompts.",
          metadata: {},
        }
      }),
  }),
)

export const ScheduleCancelTool = Tool.define(
  "schedule_cancel",
  Effect.succeed({
    description: "Cancel one of this session's scheduled prompts by id.",
    parameters: CancelParameters,
    execute: (params: Schema.Schema.Type<typeof CancelParameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({ permission: "schedule_cancel", patterns: ["*"], always: ["*"], metadata: {} })
        const prompt = yield* sessionPrompt()
        const output = yield* prompt.queue.cancel({ sessionID: ctx.sessionID, id: MessageID.make(params.id) }).pipe(
          Effect.as(`Cancelled ${params.id}.`),
          Effect.catchTags({
            SessionQueueNotFoundError: () => Effect.succeed(`No scheduled prompt ${params.id} in this session.`),
            SessionQueueBusyError: () => Effect.succeed(`${params.id} is being sent now and cannot be cancelled.`),
          }),
        )
        return { title: output, output, metadata: {} }
      }),
  }),
)

/** The send time, or the reason there is none. */
export function fireTime(params: { at?: string; delaySeconds?: number }, now: Date): Date | string {
  if ((params.at === undefined) === (params.delaySeconds === undefined)) return "Give exactly one of `at` or `delaySeconds`."
  const date = params.at === undefined ? new Date(now.getTime() + params.delaySeconds! * 1000) : parseLocal(params.at)
  if (!date || Number.isNaN(date.getTime())) return "`at` must look like `YYYY-MM-DD HH:MM` (local time)."
  if (date.getTime() <= now.getTime()) return `${formatTime(date)} is not in the future.`
  return date
}

// `YYYY-MM-DD HH:MM`, optionally with the weekday the `time` tool prints; any offset is ignored.
function parseLocal(text: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: [A-Za-z]{3})? (\d{2}):(\d{2})/.exec(text.trim())
  if (!match) return undefined
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day, hour, minute)
  return date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}

// Imported lazily: the prompt service builds the tool registry, so a static import would be a cycle.
function sessionPrompt(): Effect.Effect<SessionPrompt.Interface> {
  return Effect.gen(function* () {
    const loaded = yield* Effect.promise(() => import("@/session/prompt"))
    return yield* loaded.SessionPrompt.Service
  }) as unknown as Effect.Effect<SessionPrompt.Interface>
}
