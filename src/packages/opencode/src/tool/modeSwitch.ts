import { Effect, Schema } from "effect"
import { Command } from "@/command"
import { Question } from "@/question"
import { ActiveCommand } from "@/session/activeCommand"
import { Session } from "@/session/session"
import { Tool } from "./tool"
import DESCRIPTION from "./modeSwitch.txt"

export const ModeSwitchTool = Tool.define(
  "mode_switch",
  Effect.gen(function* () {
    const commands = yield* Command.Service
    const sessions = yield* Session.Service
    const question = yield* Question.Service
    return {
      description: DESCRIPTION,
      parameters: Schema.Struct({ mode: Schema.String, reason: Schema.String }),
      execute: (params: { mode: string; reason: string }, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const from = yield* ActiveCommand.active(sessions, ctx.sessionID)
          const session = yield* sessions.get(ctx.sessionID).pipe(Effect.orDie)
          const targets = (yield* commands.list()).filter((command) => command.suggest && command.name !== from)
          const valid = [...targets.map((command) => command.name), "none"]
          if (session.parentID || !from || params.mode === from || !valid.includes(params.mode)) {
            throw new Error(`Cannot switch to "${params.mode}". Valid targets: ${valid.join(", ")}`)
          }
          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                header: "Switch command",
                question: `Switch from /${from} to ${params.mode === "none" ? "none" : `/${params.mode}`}?\n\n${params.reason}`,
                options: [
                  { label: "Switch", description: "Approve the command switch" },
                  { label: "Stay", description: "Keep the active command" },
                ],
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })
          if (answers[0]?.length !== 1 || answers[0][0] !== "Switch")
            return {
              title: "Command switch declined",
              output: `Declined. /${from} stays active. ${answers[0]?.join("\n") ?? ""}`.trim(),
              metadata: {},
            }
          // A typed command sent while the form was open supersedes this request.
          if ((yield* ActiveCommand.active(sessions, ctx.sessionID)) !== from)
            throw new Error("Active command changed while awaiting approval")
          if (!ctx.extra?.promptOps) throw new Error("Prompt operations unavailable")
          yield* ctx.extra.promptOps.switchMode({
            sessionID: ctx.sessionID,
            mode: params.mode,
            from,
            reason: params.reason,
          })
          return {
            title: "Command switch approved",
            output: `Approved. ${params.mode === "none" ? "Default agent rules" : `/${params.mode}`} starts with the next turn, which begins automatically. End this turn now; do not start the work here.`,
            metadata: {},
          }
        }).pipe(Effect.orDie),
    }
  }),
)
