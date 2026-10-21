import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"
import { Tool } from "./tool"

export const Parameters = Schema.Struct({
  sessionID: Schema.optional(SessionID).annotate({ description: "Omit to rename the current session." }),
  title: Schema.String.annotate({ description: "New session title." }),
})

// Writes through Session.setTitle, the same path as a manual rename, so a pending automatic title
// (`titleGen.ts`) sees the changed title and does not overwrite it.
export const SessionRenameTool = Tool.define(
  "session_rename",
  Effect.gen(function* () {
    const session = yield* Session.Service

    return {
      description:
        "Rename a session, or omit sessionID to rename the current session. Use a short, specific title that summarizes the work being done.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const sessionID = params.sessionID ?? ctx.sessionID
          const title = params.title.trim()
          if (!title) throw new Error("Session title must not be empty")
          yield* session.get(sessionID).pipe(Effect.mapError(() => new Error(`Session not found: ${sessionID}`)))
          yield* session.setTitle({ sessionID, title })
          return { title, output: `Renamed session ${sessionID} to ${title}.`, metadata: {} }
        }).pipe(Effect.orDie),
    }
  }),
)
