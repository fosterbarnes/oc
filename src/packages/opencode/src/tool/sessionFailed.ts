import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import * as Tool from "./tool"
import DESCRIPTION from "./session-failed.txt"

export const Parameters = Schema.Struct({})

export const SessionFailedTool = Tool.define(
  "session_failed",
  Effect.gen(function* () {
    const session = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "session_failed",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })
          yield* session.setSessionFailed({ sessionID: ctx.sessionID, sessionFailed: true })
          return {
            title: "Session failed",
            output: "Marked the current session failed.",
            metadata: {},
          }
        }),
    }
  }),
)
