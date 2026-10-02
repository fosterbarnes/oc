import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import DESCRIPTION from "./session-in-progress.txt"

export const SessionInProgressTool = Tool.define(
  "session_in_progress",
  Effect.gen(function* () {
    const session = yield* Session.Service

    return {
      description: DESCRIPTION,
      parameters: Schema.Struct({}),
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "session_in_progress",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })
          const current = yield* session.get(ctx.sessionID)
          if (current.sessionInProgress) {
            return {
              title: "Session in progress",
              output: "The current session is already in progress.",
              metadata: {},
            }
          }
          if (current.sessionComplete || current.sessionFailed) {
            yield* ctx.ask({
              permission: "session_reopen",
              patterns: ["*"],
              always: ["*"],
              metadata: { previous: current.sessionFailed ? "failed" : "complete" },
            })
            const latest = yield* session.get(ctx.sessionID)
            if (
              latest.sessionComplete !== current.sessionComplete ||
              latest.sessionFailed !== current.sessionFailed ||
              latest.sessionInProgress
            ) {
              return {
                title: "Session status changed",
                output: "The session status changed while reopening was awaiting approval; left it unchanged.",
                metadata: {},
              }
            }
          }
          yield* session.setSessionInProgress({ sessionID: ctx.sessionID, sessionInProgress: true })
          return {
            title: "Session in progress",
            output: "Marked the current session in progress.",
            metadata: {},
          }
        }),
    }
  }),
)
