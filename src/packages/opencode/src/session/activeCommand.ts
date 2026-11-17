import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Option } from "effect"
import type { Session } from "./session"
import type { SessionID } from "./schema"

export const KEY = "ocActive"

export function read(parts: readonly SessionV1.Part[]) {
  const part = parts.find((part) => part.type === "text" && part.metadata && KEY in part.metadata)
  const value = part?.type === "text" ? part.metadata?.[KEY] : undefined
  return typeof value === "string" || value === null ? value : undefined
}

export const active = Effect.fn("ActiveCommand.active")(function* (
  sessions: Pick<Session.Interface, "findMessage">,
  sessionID: SessionID,
) {
  const message = yield* sessions
    .findMessage(
      sessionID,
      (message) =>
        message.info.role === "user" &&
        message.parts.some(
          (part) => part.type === "text" && (!part.synthetic || (!!part.metadata && KEY in part.metadata)),
        ),
    )
    .pipe(Effect.orDie)
  return Option.isSome(message) ? (read(message.value.parts) ?? undefined) : undefined
})

export const marker = (name: string) =>
  `[Active command: /${name}. Its rules and role still apply. This message is not a new run: repeat the command's one-time steps only if this message asks for it.]`

export * as ActiveCommand from "./activeCommand"
