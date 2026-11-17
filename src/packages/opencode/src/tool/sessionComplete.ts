import path from "path"
import { Effect, Schema } from "effect"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import DESCRIPTION from "./session-complete.txt"

export const Parameters = Schema.Struct({
  autoDelete: Schema.optional(Schema.Boolean).annotate({
    description:
      "Only after a successful push: let the TUI delete this session once it is left (only sessions a push command started)",
  }),
})

// Title a push command gives the session it starts (`SessionPrompt.command`); completion appends the
// pushed commit (`oc - ship:#b5e4f26`).
export function pushTitle(directory: string, command: string) {
  return `${path.basename(directory)} - ${command}:`
}

// Session metadata flag read by the TUI (`tui/src/pushAutoDelete.ts`).
export const AUTO_DELETE_KEY = "ocAutoDelete"
// Set when a push command (frontmatter `pushSession: true`) is a session's first message. Only such
// sessions may auto-delete; a push run in the middle of other work keeps its session and history.
export const PUSH_SESSION_KEY = "ocPushSession"

export const SessionCompleteTool = Tool.define(
  "session_complete",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const git = yield* Git.Service

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: { autoDelete?: boolean }, ctx: Tool.Context) =>
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
          const pushSession = info.metadata?.[PUSH_SESSION_KEY] === true
          // Still the push title (`pushTitle`): not renamed, and no commit appended yet.
          const titled =
            pushSession && info.title.startsWith(`${path.basename(info.directory)} - `) && info.title.endsWith(":")
          const done = { title: "Session complete", output: "Marked the current session complete.", metadata: {} }
          const autoDelete = params.autoDelete === true && pushSession
          const reply =
            params.autoDelete && !autoDelete
              ? {
                  ...done,
                  output: `${done.output} Not marked for auto-delete: the session did not start with a push command.`,
                }
              : done
          if (!titled && !autoDelete) return reply
          // Only a HEAD that matches its upstream counts as pushed; otherwise the bare title marks the failure.
          const refs = yield* git.run(["rev-parse", "HEAD", "@{u}"], { cwd: info.directory })
          const [head, upstream] = refs.text().trim().split(/\s+/)
          const short = yield* git.run(["rev-parse", "--short=7", "HEAD"], { cwd: info.directory })
          if (refs.exitCode !== 0 || head !== upstream || short.exitCode !== 0) {
            if (!autoDelete) return reply
            return { ...done, output: `${done.output} Not marked for auto-delete: HEAD does not match its upstream.` }
          }
          if (titled) {
            yield* session.setTitle({ sessionID: ctx.sessionID, title: `${info.title}#${short.text().trim()}` })
          }
          if (autoDelete) {
            yield* session.setMetadata({
              sessionID: ctx.sessionID,
              metadata: { ...info.metadata, [AUTO_DELETE_KEY]: true },
            })
          }
          return reply
        }),
    }
  }),
)
