import { Effect, Semaphore } from "effect"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { MessageID, SessionID } from "./schema"

// What oc's own step loop has read of a busy session. Every model request of a step is built from one
// read of the session at the step's start (`SessionPrompt` loop), so a user message saved after the
// latest read is in no request yet and the delete route may take it back while the session is busy.
// The read and a take-back hold the same lock: a message is either read or removed, never both.
// Claude Code steps take messages through their own intake (`claudeSteerSinks`), so a take-back here
// also needs the step behind the latest read to run on oc's own loop.

type Entry = {
  readonly lock: Semaphore.Semaphore
  // Newest message id in the latest read, and whether that step runs on oc's own loop (unset until the
  // loop has picked the step's model).
  through?: MessageID
  native?: boolean
}

const entries = new Map<SessionID, Entry>()

/** Runs a step's message read under the session's intake lock and records the newest message it returned. */
export function read<E, R>(sessionID: SessionID, effect: Effect.Effect<SessionV1.WithParts[], E, R>) {
  const entry = entries.get(sessionID) ?? { lock: Semaphore.makeUnsafe(1) }
  entries.set(sessionID, entry)
  return entry.lock.withPermit(
    effect.pipe(
      Effect.tap((msgs) =>
        Effect.sync(() => {
          entry.through = msgs.reduce<MessageID | undefined>(
            (newest, msg) => (newest && newest > msg.info.id ? newest : msg.info.id),
            undefined,
          )
          entry.native = undefined
        }),
      ),
    ),
  )
}

/** Records whether the step behind the latest read runs on oc's own loop rather than Claude Code. */
export function classify(sessionID: SessionID, native: boolean) {
  const entry = entries.get(sessionID)
  if (entry) entry.native = native
}

/** Removes a user message no step has read yet. False when one may have it, or the step is not native. */
export function takeBack<E, R>(sessionID: SessionID, messageID: MessageID, remove: Effect.Effect<unknown, E, R>) {
  const entry = entries.get(sessionID)
  if (!entry) return Effect.succeed(false)
  return entry.lock.withPermit(
    Effect.suspend(() =>
      entry.native === true && entry.through !== undefined && messageID > entry.through
        ? remove.pipe(Effect.as(true))
        : Effect.succeed(false),
    ),
  )
}

/** Forgets the session when its loop ends; a take-back still waiting on the lock then refuses. */
export function end(sessionID: SessionID) {
  return Effect.suspend(() => {
    const entry = entries.get(sessionID)
    if (!entry) return Effect.void
    return entry.lock.withPermit(
      Effect.sync(() => {
        entry.native = undefined
        if (entries.get(sessionID) === entry) entries.delete(sessionID)
      }),
    )
  })
}

export * as SessionIntake from "./intake"
