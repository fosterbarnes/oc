import path from "path"
import { Effect, Schema, Scope } from "effect"
import * as Tool from "./tool"
import { Session } from "@/session/session"
import { Provider } from "@/provider/provider"
import type { SessionID } from "../session/schema"
import { currentModel, requirePlanFile, startGoSession } from "./plan-execute"

export const Parameters = Schema.Struct({
  planPath: Schema.String,
  phase: Schema.Number.annotate({ description: "The phase number the new session should execute" }),
})

export const PlanNextPhaseTool = Tool.define<
  typeof Parameters,
  { sessionID?: SessionID },
  Session.Service | Provider.Service | Scope.Scope
>(
  "plan_next_phase",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const provider = yield* Provider.Service
    const scope = yield* Scope.Scope

    return {
      description:
        "Phase-sessions mode only: after the current phase passes its done-when check and Progress is saved, " +
        "start the next phase in a new Go session with this session's model. End your turn after calling it.",
      parameters: Parameters,
      execute: (params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* requirePlanFile(params.planPath)
          if (!Number.isInteger(params.phase) || params.phase < 2) {
            return yield* Effect.die(new Error(`Next phase must be an integer of at least 2: ${params.phase}`))
          }
          const goSession = yield* startGoSession({
            session,
            scope,
            model: currentModel(yield* session.messages({ sessionID: ctx.sessionID }), yield* provider.defaultModel()),
            title: `Go: ${path.basename(params.planPath)} phase ${params.phase}`,
            text: `go ${params.planPath} mode=sessions phase=${params.phase}`,
          })
          return {
            title: `Starting phase ${params.phase}`,
            output: `Phase ${params.phase} is starting in session ${goSession.id}. End this turn now.`,
            metadata: { sessionID: goSession.id },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
