import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import DESCRIPTION from "./session-complete.txt"

export const Parameters = Schema.Struct({})

export const SessionCompleteTool = Tool.define(
  "session_complete",
  Effect.gen(function* () {
    const session = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if ((yield* session.get(ctx.sessionID).pipe(Effect.orDie)).sessionComplete) {
            return { title: "Session complete", output: "The current session is already complete.", metadata: {} }
          }
          yield* ctx.ask({
            permission: "session_complete",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })
          yield* session.setSessionComplete({ sessionID: ctx.sessionID, sessionComplete: true })
          return {
            title: "Session complete",
            output: "Marked the current session complete.",
            metadata: {},
          }
        }),
    }
  }),
)
