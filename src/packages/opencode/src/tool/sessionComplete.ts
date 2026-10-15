import path from "path"
import { Effect, Schema } from "effect"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import DESCRIPTION from "./session-complete.txt"

export const Parameters = Schema.Struct({})

// Title set when /agent-push starts; completion appends the pushed commit (`oc - agent-push:#b5e4f26`).
export function agentPushTitle(directory: string) {
  return `${path.basename(directory)} - agent-push:`
}

export const SessionCompleteTool = Tool.define(
  "session_complete",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const git = yield* Git.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const info = yield* session.get(ctx.sessionID).pipe(Effect.orDie)
          if (info.sessionComplete) {
            return { title: "Session complete", output: "The current session is already complete.", metadata: {} }
          }
          yield* ctx.ask({
            permission: "session_complete",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })
          yield* session.setSessionComplete({ sessionID: ctx.sessionID, sessionComplete: true })
          if (info.title === agentPushTitle(info.directory)) {
            // Only a HEAD that matches its upstream counts as pushed; otherwise the bare title marks the failure.
            const refs = yield* git.run(["rev-parse", "HEAD", "@{u}"], { cwd: info.directory })
            const [head, upstream] = refs.text().trim().split(/\s+/)
            const short = yield* git.run(["rev-parse", "--short=7", "HEAD"], { cwd: info.directory })
            if (refs.exitCode === 0 && head === upstream && short.exitCode === 0) {
              yield* session.setTitle({ sessionID: ctx.sessionID, title: `${info.title}#${short.text().trim()}` })
            }
          }
          return {
            title: "Session complete",
            output: "Marked the current session complete.",
            metadata: {},
          }
        }),
    }
  }),
)
