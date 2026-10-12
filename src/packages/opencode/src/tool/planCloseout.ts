import fs from "fs/promises"
import path from "path"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { requirePlanFile } from "./planExecute"

export const Parameters = Schema.Struct({
  planPath: Schema.String,
})

export const PlanCloseoutTool = Tool.define<typeof Parameters, { archivePath?: string }, never>(
  "plan_closeout",
  Effect.succeed({
    description:
      "Archive a fully executed plan: moves it from its plans directory into plans/archive without overwriting. " +
      "Call once, only after every phase succeeded. Never call for failed, partial, blocked, or cancelled plans.",
    parameters: Parameters,
    execute: (params, ctx) =>
      Effect.gen(function* () {
        yield* ctx.ask({ permission: "plan_closeout", patterns: [params.planPath], always: ["*"], metadata: params })
        yield* requirePlanFile(params.planPath)
        const dir = path.dirname(params.planPath)
        if (path.basename(dir) !== "plans") {
          return yield* Effect.die(new Error(`Plan must be directly inside a plans directory: ${params.planPath}`))
        }
        const archivePath = path.join(dir, "archive", path.basename(params.planPath))
        if (yield* Effect.promise(() => Bun.file(archivePath).exists())) {
          return yield* Effect.die(new Error(`Archive already exists, plan kept in place: ${archivePath}`))
        }
        yield* Effect.promise(() => fs.mkdir(path.dirname(archivePath), { recursive: true }))
        yield* Effect.promise(() => fs.rename(params.planPath, archivePath))
        return {
          title: "Plan archived",
          output: `Archived ${params.planPath} to ${archivePath}.`,
          metadata: { archivePath },
        }
      }).pipe(Effect.orDie),
  }),
)
