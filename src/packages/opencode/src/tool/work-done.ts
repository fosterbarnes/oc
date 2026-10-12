import { Effect, Schema } from "effect"
import { Tool } from "./tool"
import { WorkHandoff } from "@/session/work-handoff"
import { InstanceState } from "@/effect/instance-state"

const Parameters = Schema.Struct({ resolved: Schema.optional(Schema.Array(Schema.String)) })

export const WorkDoneTool = Tool.define("work_done", Effect.gen(function* () {
  const handoff = yield* WorkHandoff.Service
  return {
    description: "Finish this work copy. Queues merge and return to its parent after this turn succeeds. Call as your last tool and end the turn. Never commits. For pending conflicts, inspect and explicitly resolve every path before passing those paths in resolved; binary/delete/rename conflicts also require explicit resolution.",
    parameters: Parameters,
    execute: (input: typeof Parameters.Type, ctx: Tool.Context) => Effect.gen(function* () {
      const prompt = ctx.extra?.promptOps?.prompt
      if (!prompt) return yield* Effect.die(new Error("work_done requires the session prompt lifecycle"))
      yield* ctx.ask({ permission: "work_done", patterns: ["*"], always: ["*"], metadata: {} })
      const directory = yield* InstanceState.directory
      yield* handoff.request(ctx.sessionID, prompt, input.resolved, directory)
      return { title: "Work completion queued", output: "Work completion queued. The merge runs automatically after this turn. Reply with one short summary line and stop. Do not ask the user to run anything.", metadata: {} }
    }),
  }
}))
