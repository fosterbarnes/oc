import { Effect, Schema } from "effect"
import { BackgroundJob } from "@/background/job"
import { Session } from "@/session/session"
import { SessionID } from "../session/schema"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  task_id: Schema.String.annotate({ description: "task_id of a background task this chat started" }),
})

// Cancelling the job interrupts its run, whose onInterrupt cancels the child session (task.ts).
export const TaskCancelTool = Tool.define(
  "task_cancel",
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const sessions = yield* Session.Service
    return {
      description:
        "Stop a background subagent task this chat started, by its task_id. Its session keeps the work so far.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const id = params.task_id
          const child = yield* sessions.get(SessionID.make(id)).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
          const output = yield* Effect.gen(function* () {
            if (!child) return `No task ${id}.`
            if (child.parentID !== ctx.sessionID) return `Task ${id} is not a subagent of this chat.`
            // cancel() returns a finished job's old snapshot too, so read the status first.
            const info = yield* background.get(id)
            if (!info) return `Task ${id} is not running in the background.`
            if (info.status !== "running") return `Task ${id} already ${info.status}.`
            yield* background.cancel(id)
            return `Stopped task ${id}. Its session keeps the work so far; resume it with task and this task_id if needed.`
          })
          return { title: output, output, metadata: {} }
        }),
    }
  }),
)
