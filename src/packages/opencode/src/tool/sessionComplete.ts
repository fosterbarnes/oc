import path from "path"
import { Effect, Schema } from "effect"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { isRealUserMessage } from "@/session/titleGen"
import { Tool } from "./tool"
import DESCRIPTION from "./session-complete.txt"

export const Parameters = Schema.Struct({})

// Title a push command gives the session it starts (`SessionPrompt.command`); completion appends the
// pushed commit (`oc - ship:#b5e4f26`).
export function pushTitle(directory: string, command: string) {
  return `${path.basename(directory)} - ${command}:`
}

// Session metadata flag read by the TUI (`tui/src/pushAutoDelete.ts`).
export const AUTO_DELETE_KEY = "ocAutoDelete"
// Set when a push command (frontmatter `pushSession: true`) is a session's first message. Only such
// sessions may auto-delete: completion flags one whose commit reached its upstream while the push
// command is still its only prompt. A push run in the middle of other work keeps its session.
export const PUSH_SESSION_KEY = "ocPushSession"

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
          const done = { title: "Session complete", output: "Marked the current session complete.", metadata: {} }
          if (info.metadata?.[PUSH_SESSION_KEY] !== true) return done
          // Only a HEAD that matches its upstream counts as pushed; otherwise the bare title marks the failure.
          const refs = yield* git.run(["rev-parse", "HEAD", "@{u}"], { cwd: info.directory })
          const [head, upstream] = refs.text().trim().split(/\s+/)
          const short = yield* git.run(["rev-parse", "--short=7", "HEAD"], { cwd: info.directory })
          const pushed = refs.exitCode === 0 && head === upstream && short.exitCode === 0
          // Still the push title (`pushTitle`): not renamed, and no commit appended yet.
          const titled = info.title.startsWith(`${path.basename(info.directory)} - `) && info.title.endsWith(":")
          if (pushed && titled) {
            yield* session.setTitle({ sessionID: ctx.sessionID, title: `${info.title}#${short.text().trim()}` })
          }
          // Written on every completion, so a session prompted again after its push loses the flag.
          const messages = yield* session.messages({ sessionID: ctx.sessionID }).pipe(Effect.orDie)
          const prompts = messages.filter(isRealUserMessage).length
          yield* session.setMetadata({
            sessionID: ctx.sessionID,
            metadata: { ...info.metadata, [AUTO_DELETE_KEY]: pushed && prompts === 1 },
          })
          return done
        }),
    }
  }),
)
