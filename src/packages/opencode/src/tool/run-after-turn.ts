import { launchDetached } from "@opencode-ai/core/util/launch-detached"
import path from "path"
import { Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { SessionStatus } from "@/session/status"
import * as Tool from "./tool"
import DESCRIPTION from "./run-after-turn.txt"

export const Parameters = Schema.Struct({
  exe: Schema.String.annotate({ description: "Absolute path to the executable or .ps1 script" }),
  args: Schema.optional(Schema.Array(Schema.String)).annotate({ description: "Arguments for the executable" }),
})

export const RunAfterTurnTool = Tool.define(
  "run_after_turn",
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const queued = new Map<string, { exe: string; args: readonly string[] }>()

    // Spawn only once the session is idle, so the turn is finished and saved first.
    // launchDetached: it must outlive OpenCode (revive scripts shut it down).
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== SessionStatus.Event.Status.type) return Effect.void
      const data = event.data as { sessionID: string; status: { type: string } }
      if (data.status.type !== "idle") return Effect.void
      const command = queued.get(data.sessionID)
      if (!command) return Effect.void
      queued.delete(data.sessionID)
      return Effect.sync(() =>
        launchDetached(command.exe, command.args)
          .on("error", (cause) => console.error(`run_after_turn: failed to start ${command.exe}: ${cause.message}`)),
      )
    })
    yield* Effect.addFinalizer(() => unsubscribe)

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "run_after_turn",
            patterns: [params.exe],
            always: [params.exe],
            metadata: {},
          })
          queued.set(ctx.sessionID, { exe: params.exe, args: params.args ?? [] })
          return {
            title: `Queued ${path.basename(params.exe)}`,
            output: `Queued ${params.exe}. It runs after this turn. End your turn now.`,
            metadata: {},
          }
        }),
    }
  }),
)
