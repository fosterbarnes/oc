import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { Command } from "../command"
import { ConfigMarkdown } from "@/config/markdown"
import DESCRIPTION from "./question.txt"

export const Parameters = Schema.Struct({
  questions: Schema.mutable(Schema.Array(Question.Prompt)).annotate({ description: "Questions to ask" }),
})

type Metadata = {
  answers: ReadonlyArray<Question.Answer>
}

export const QuestionTool = Tool.define<typeof Parameters, Metadata, Question.Service | Command.Service>(
  "question",
  Effect.gen(function* () {
    const question = yield* Question.Service
    const commands = yield* Command.Service

    // An answer typed as `/name args` is that command's instructions, followed once for this answer. It
    // does not become the active command. A command that changes the turn (subtask, agent, model,
    // permissions, tool host, push session, shell output) needs a turn of its own, so it is refused.
    const expand = Effect.fnUntraced(function* (text: string) {
      const match = text.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/)
      if (!match) return text
      const name = match[1]
      const cmd = (yield* commands.get(name)) ?? (yield* commands.list()).find((item) => item.aliases?.includes(name))
      if (!cmd) return text
      const turnBound = cmd.subtask || cmd.agent || cmd.model || cmd.permission || cmd.toolHost || cmd.pushSession
      const body = turnBound ? "" : Command.fill(yield* Effect.promise(async () => cmd.template), match[2] ?? "")
      if (turnBound || ConfigMarkdown.shell(body).length > 0)
        return `${text} (the /${cmd.name} command needs its own turn; ask the user to send it from the prompt)`
      return `${text} (the /${cmd.name} command; follow its instructions once, for this answer only:\n${body.trim()}\n)`
    })

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: params.questions,
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })
          const expanded = yield* Effect.forEach(answers, (answer) => Effect.forEach(answer, expand))

          const formatted = params.questions
            .map((q, i) => `"${q.question}"="${expanded[i]?.length ? expanded[i].join(", ") : "Unanswered"}"`)
            .join(", ")

          return {
            title: `Asked ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
            output: `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind.`,
            metadata: {
              answers,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
