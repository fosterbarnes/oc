import { Effect, Schema } from "effect"
import { Session } from "@/session/session"
import * as Tool from "./tool"

const BUDGET = 16_000
const PART_CLIP = 4_000

export const Parameters = Schema.Struct({
  limit: Schema.optional(Schema.Number),
  before: Schema.optional(Schema.String),
})

type Row = { info: { id: string; role: string; sessionID: string }; parts: Array<{ type: string; text?: string }> }

export function renderSessionTail(
  messages: Row[],
  sessionID: string,
  params: { limit?: number; before?: string },
): { output: string; truncated: boolean } {
  const limit = Math.min(50, Math.max(1, params.limit ?? 20))
  const own = messages.filter((message) => message.info.sessionID === sessionID)
  let end = own.length
  if (params.before) {
    const index = own.findIndex((message) => message.info.id === params.before)
    if (index >= 0) end = index
  }
  const slice = own.slice(Math.max(0, end - limit), end)
  const lines: string[] = []
  let chars = 0
  let truncated = slice.length < end
  for (const message of slice) {
    const bits: string[] = []
    for (const part of message.parts) {
      if (part.type !== "text" || !part.text) continue
      const text = part.text.length > PART_CLIP ? part.text.slice(0, PART_CLIP) + "..." : part.text
      bits.push(text)
    }
    const line = `${message.info.role} ${message.info.id}: ${bits.join("\n")}`
    if (chars + line.length > BUDGET) {
      truncated = true
      break
    }
    lines.push(line)
    chars += line.length + 1
  }
  const output = lines.join("\n") || "(no messages)"
  return { output: truncated ? output + "\n(truncated)" : output, truncated }
}

export const SessionTailTool = Tool.define(
  "session_tail",
  Effect.gen(function* () {
    const session = yield* Session.Service
    return {
      description:
        "Read recent messages from the current OpenCode session. Use when this Claude session does not contain the turns on screen.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          yield* ctx.ask({
            permission: "session_tail",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
          })
          const messages = yield* session.messages({ sessionID: ctx.sessionID })
          const rendered = renderSessionTail(messages as Row[], ctx.sessionID, params)
          return {
            title: "Session tail",
            output: rendered.output,
            metadata: { truncated: rendered.truncated },
          }
        }),
    }
  }),
)
