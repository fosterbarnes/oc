import { randomUUID } from "node:crypto"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { PartTable, SessionTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProcessTree } from "@opencode-ai/core/util/processTree"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"

export const CLAIM_MS = 10 * 60_000
export const RECONCILE_MS = 60_000

export const Claim = Schema.Struct({
  pid: Schema.Int,
  created: Schema.String,
  owner: Schema.String,
  at: Schema.Number,
})
export type Claim = typeof Claim.Type
const decodeClaim = Schema.decodeUnknownOption(Claim)

const self = Effect.runSync(
  Effect.cached(
    Effect.promise(async () => {
      // Core's process inventory is Windows-only. Other platforms recover by the claim age bound.
      if (process.platform !== "win32") return { pid: process.pid, created: String(performance.timeOrigin) }
      const identity = await ProcessTree.processIdentity(process.pid)
      if (!identity?.created) throw new Error("Scheduler process creation time unavailable")
      return { pid: identity.pid, created: identity.created }
    }),
  ),
)

export async function owner() {
  return { ...(await Effect.runPromise(self)), owner: randomUUID() }
}

export function claim(value: unknown) {
  const decoded = decodeClaim(value)
  return decoded._tag === "Some" ? decoded.value : undefined
}

export async function expired(value: Claim, now: number) {
  if (now - value.at >= CLAIM_MS) return true
  if (value.pid === process.pid && value.created === (await Effect.runPromise(self)).created) return false
  if (process.platform !== "win32") return false
  return (await ProcessTree.processIdentity(value.pid))?.created !== value.created
}

export interface Input {
  id: string
  check: Effect.Effect<boolean>
}

class Skipped extends Schema.TaggedErrorClass<Skipped>()("ScheduledDeliverySkipped", {}) {}

/** The event projector, parts and bounded receipt commit in the same SQLite transaction. */
export const admit = (
  database: Database.Interface,
  events: EventV2.Interface,
  delivery: Input,
  info: SessionV1.User,
  parts: readonly SessionV1.Part[],
) =>
  events
    .publish(
      SessionV1.Event.MessageUpdated,
      { sessionID: info.sessionID, info },
      {
        commit: () =>
          Effect.gen(function* () {
            const row = yield* database.db
              .select({ metadata: SessionTable.metadata })
              .from(SessionTable)
              .where(eq(SessionTable.id, info.sessionID))
              .get()
              .pipe(Effect.orDie)
            const raw = row?.metadata?.scheduledDeliveries
            const ids = Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : []
            if (ids.includes(delivery.id) || !(yield* delivery.check)) return yield* Effect.die(new Skipped({}))
            for (const part of parts) {
              const { id, messageID, sessionID, ...data } = part
              yield* database.db
                .insert(PartTable)
                .values({ id, message_id: messageID, session_id: sessionID, data })
                .run()
                .pipe(Effect.orDie)
            }
            yield* database.db
              .update(SessionTable)
              .set({ metadata: { ...row?.metadata, scheduledDeliveries: [...ids, delivery.id].slice(-50) } })
              .where(eq(SessionTable.id, info.sessionID))
              .run()
              .pipe(Effect.orDie)
          }),
      },
    )
    .pipe(
      Effect.as(true),
      Effect.catchDefect((cause) => (cause instanceof Skipped ? Effect.succeed(false) : Effect.die(cause))),
    )

/** Versioning closes the read-deadline/subscribe gap; listeners are removed on interruption. */
export function makeWake() {
  let version = 0
  const listeners = new Set<() => void>()
  return {
    version: () => version,
    notify: () => {
      version++
      for (const listener of listeners) listener()
    },
    wait: (seen: number, deadline: number) =>
      Effect.raceFirst(
        Effect.callback<void>((resume) => {
          const wake = () => resume(Effect.void)
          listeners.add(wake)
          if (seen !== version) wake()
          return Effect.sync(() => {
            listeners.delete(wake)
          })
        }),
        Effect.sleep(Math.max(0, Math.min(deadline - Date.now(), RECONCILE_MS))),
      ),
  }
}

export const queueWake = makeWake()
export * as ScheduledDelivery from "./scheduledDelivery"
