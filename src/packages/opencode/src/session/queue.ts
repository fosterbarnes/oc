import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, SessionQueueTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Flock } from "@opencode-ai/core/util/flock"
import { and, asc, eq, lte, ne, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { MessageID, SessionID } from "./schema"

// Why a session's queue is not sending. Absent (with entries waiting) means paused after a restart.
export const PauseReason = Schema.Literals(["restart", "error", "interrupted"])
export type PauseReason = Schema.Schema.Type<typeof PauseReason>

// The prompt as the user sent it: model, agent, and variant snapshot plus the expanded parts.
export const Payload = Schema.Struct({
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.Struct({ providerID: ProviderV2.ID, modelID: ModelV2.ID })),
  variant: Schema.optional(Schema.String),
  parts: Schema.Array(
    Schema.Union([SessionV1.TextPartInput, SessionV1.FilePartInput, SessionV1.AgentPartInput]).annotate({
      discriminator: "type",
    }),
  ),
})
export type Payload = Schema.Schema.Type<typeof Payload>

// Where a scheduled prompt goes: this session, a fork of it, or a new session. Fork and new sessions
// are created when the prompt fires.
export const Target = Schema.Literals(["current", "fork", "new"])
export type Target = Schema.Schema.Type<typeof Target>

export const Entry = Schema.Struct({
  id: MessageID,
  state: Schema.Literals(["pending", "dispatching"]),
  text: Schema.String,
  attachments: Schema.Int,
  runAt: Schema.optional(Schema.Int),
  target: Target,
})
export type Entry = Schema.Schema.Type<typeof Entry>

export const Snapshot = Schema.Struct({
  pause: Schema.Literals(["none", "restart", "error", "interrupted"]),
  entries: Schema.Array(Entry),
})
export type Snapshot = Schema.Schema.Type<typeof Snapshot>

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("SessionQueueNotFoundError", {
  id: Schema.String,
}) {}

/** The entry is being sent, so it can no longer be edited or cancelled. */
export class BusyError extends Schema.TaggedErrorClass<BusyError>()("SessionQueueBusyError", {
  id: Schema.String,
}) {}

export interface AddInput {
  sessionID: SessionID
  id?: MessageID
  payload: Payload
  /** Send no earlier than this (ms). Without it the prompt waits only for the session to be idle. */
  runAt?: number
  target?: Target
}

export interface Queued {
  id: MessageID
  payload: Payload
}

/** A claimed fork or new-session entry; `sessionID` is the session it was scheduled from. */
export interface Detached extends Queued {
  sessionID: SessionID
  target: "fork" | "new"
}

export interface Interface {
  readonly snapshot: (sessionID: SessionID) => Effect.Effect<Snapshot>
  readonly add: (input: AddInput) => Effect.Effect<Snapshot>
  readonly edit: (input: { sessionID: SessionID; id: MessageID; text: string }) => Effect.Effect<Snapshot, NotFoundError | BusyError>
  readonly cancel: (input: { sessionID: SessionID; id: MessageID }) => Effect.Effect<Snapshot, NotFoundError | BusyError>
  readonly resume: (sessionID: SessionID) => Effect.Effect<Snapshot>
  readonly pause: (sessionID: SessionID, reason: PauseReason) => Effect.Effect<void>
  /** Marks the next sendable entry `dispatching` when `idle` holds. */
  readonly claim: (sessionID: SessionID, idle: Effect.Effect<boolean>) => Effect.Effect<Queued | undefined>
  /** Whether `claim` would find an entry, ignoring idle. */
  readonly ready: (sessionID: SessionID) => Effect.Effect<boolean>
  /** Claims every due fork/new entry and lists sessions with a due entry for the session itself. */
  readonly due: (now: number) => Effect.Effect<{ detached: Detached[]; sessions: SessionID[] }>
  /** Assigns a fresh user-message id after the target session (including any fork) exists. */
  readonly prepare: (id: MessageID) => Effect.Effect<MessageID>
  /** Hides a persisted entry, retaining an empty receipt for duplicate-add protection. */
  readonly complete: (id: MessageID) => Effect.Effect<void>
  /** Settles a failed send: completed if its message exists, otherwise pending again. */
  readonly settle: (id: MessageID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionQueue") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const lock = Semaphore.makeUnsafe(1)
    const leases = new Map<MessageID, Flock.Lease>()
    const release = (id: MessageID) => Effect.promise(async () => {
      const lease = leases.get(id)
      if (!lease) return
      leases.delete(id)
      await lease.release()
    })
    yield* Effect.addFinalizer(() => Effect.forEach([...leases.keys()], release, { discard: true }))
    const acquire = (id: MessageID) => Effect.tryPromise({
      try: (signal) => Flock.acquire(`session-queue:${id}`, { timeoutMs: 0, staleMs: 15_000, signal }),
      catch: (cause) => cause,
    }).pipe(Effect.catch((cause) => cause instanceof Flock.ContentionError ? Effect.succeed(undefined) : Effect.die(cause)))
    // Explicit pause state per session, kept in memory. "running" clears a restart pause.
    const flags = new Map<SessionID, PauseReason | "running">()

    const readRows = (sessionID: SessionID) =>
      db
        .select()
        .from(SessionQueueTable)
        .where(and(eq(SessionQueueTable.session_id, sessionID), ne(SessionQueueTable.state, "completed")))
        .orderBy(asc(SessionQueueTable.time_created), sql`rowid`)
        .all()
        .pipe(Effect.orDie)

    const findRow = (id: MessageID) =>
      db.select().from(SessionQueueTable).where(eq(SessionQueueTable.id, id)).get().pipe(Effect.orDie)

    const isSent = (id: MessageID) =>
      db
        .select({ id: MessageTable.id })
        .from(MessageTable)
        .where(eq(MessageTable.id, id))
        .get()
        .pipe(Effect.orDie, Effect.map((row) => row !== undefined))

    // Pauses hold only unscheduled entries: a scheduled entry was asked for at its time, so it fires then.
    const pausedFor = (sessionID: SessionID, waiting: boolean): PauseReason | undefined => {
      const flag = flags.get(sessionID)
      if (flag === undefined) return waiting ? "restart" : undefined
      return flag === "running" ? undefined : flag
    }

    const hasUnscheduled = (rows: (typeof SessionQueueTable.$inferSelect)[]) => rows.some((row) => row.run_at === null)

    // The next entry this session sends: unscheduled ones unless paused, scheduled ones once due,
    // earliest first. One at a time, so nothing is picked while another is being sent.
    const nextRow = (sessionID: SessionID, rows: (typeof SessionQueueTable.$inferSelect)[], now: number) => {
      const own = rows.filter((row) => row.target === "current")
      if (own.some((row) => row.state === "dispatching")) return undefined
      const paused = pausedFor(sessionID, hasUnscheduled(own)) !== undefined
      return own
        .filter((row) => (row.run_at === null ? !paused : row.run_at <= now))
        .toSorted((a, b) => (a.run_at ?? a.time_created) - (b.run_at ?? b.time_created))[0]
    }

    // Hold a heartbeat lease until persistence/settlement. Recovery cannot release a live owner's claim.
    const mark = (id: MessageID) =>
      Effect.uninterruptible(Effect.gen(function* () {
        const lease = yield* acquire(id)
        if (!lease) return false
        leases.set(id, lease)
        const row = yield* db
          .update(SessionQueueTable)
          .set({ state: "dispatching" })
          .where(and(eq(SessionQueueTable.id, id), eq(SessionQueueTable.state, "pending")))
          .returning({ id: SessionQueueTable.id })
          .get()
          .pipe(Effect.orDie, Effect.onError(() => release(id)))
        if (row) return true
        yield* release(id)
        return false
      }))

    const toEntry = (row: typeof SessionQueueTable.$inferSelect): Entry => ({
      id: row.id,
      state: row.state === "dispatching" ? "dispatching" : "pending",
      text: row.payload.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n"),
      attachments: row.payload.parts.filter((part) => part.type !== "text").length,
      ...(row.run_at !== null && { runAt: row.run_at }),
      target: row.target,
    })

    const snapshotOf = (sessionID: SessionID) =>
      readRows(sessionID).pipe(
        Effect.map((rows): Snapshot => ({
          pause: pausedFor(sessionID, hasUnscheduled(rows)) ?? "none",
          entries: rows.map(toEntry),
        })),
      )

    const receipt = (id: MessageID) => db
      .update(SessionQueueTable)
      .set({ state: "completed", payload: { parts: [] } })
      .where(eq(SessionQueueTable.id, id))
      .run()
      .pipe(Effect.orDie, Effect.asVoid)

    // A row whose message exists was sent before the crash or failure; keep only its receipt.
    // Otherwise the prompt never persisted and the entry waits again as an ordinary queued prompt for
    // its own session, so a failed scheduled send is held by the pause instead of retrying every poll.
    // Nothing is sent here.
    const settleRow = (id: MessageID) =>
      Effect.gen(function* () {
        const row = yield* findRow(id)
        if (!row || row.state !== "dispatching") return
        if (yield* isSent(row.message_id ?? id)) {
          yield* receipt(id)
          return
        }
        yield* db
          .update(SessionQueueTable)
          .set({ state: "pending", message_id: null, run_at: null, target: "current" })
          .where(eq(SessionQueueTable.id, id))
          .run()
          .pipe(Effect.orDie)
      })

    const recover = Effect.gen(function* () {
      const stranded = yield* db
        .select({ id: SessionQueueTable.id, sessionID: SessionQueueTable.session_id })
        .from(SessionQueueTable)
        .where(eq(SessionQueueTable.state, "dispatching"))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(stranded.filter((row) => !leases.has(row.id)), (row) => Effect.acquireUseRelease(
        acquire(row.id),
        (lease) => lease ? Effect.gen(function* () {
          yield* settleRow(row.id)
          if ((yield* findRow(row.id))?.state === "pending") flags.set(row.sessionID, "restart")
        }) : Effect.void,
        (lease) => lease ? Effect.promise(() => lease.release()) : Effect.void,
      ), { discard: true })
    })
    yield* recover

    const ownRow = (input: { sessionID: SessionID; id: MessageID }) =>
      Effect.gen(function* () {
        const row = yield* findRow(input.id)
        if (!row || row.session_id !== input.sessionID) return yield* new NotFoundError({ id: input.id })
        if (row.state !== "pending") return yield* new BusyError({ id: input.id })
        return row
      })

    const add = (input: AddInput) =>
      lock.withPermit(
        Effect.gen(function* () {
          const id = input.id ?? MessageID.ascending()
          if ((yield* findRow(id))?.state === "completed") return yield* snapshotOf(input.sessionID)
          if (yield* isSent(id)) return yield* snapshotOf(input.sessionID)
          // With nothing unscheduled waiting the queue is not paused: a new entry clears any earlier pause.
          if (!hasUnscheduled(yield* readRows(input.sessionID))) flags.set(input.sessionID, "running")
          yield* db
            .insert(SessionQueueTable)
            .values({
              id,
              session_id: input.sessionID,
              state: "pending",
              payload: input.payload,
              run_at: input.runAt ?? null,
              target: input.target ?? "current",
            })
            .onConflictDoNothing()
            .run()
            .pipe(Effect.orDie)
          return yield* snapshotOf(input.sessionID)
        }),
      )

    const edit: Interface["edit"] = (input) =>
      lock.withPermit(
        Effect.gen(function* () {
          const row = yield* ownRow(input)
          const attachments = row.payload.parts.filter((part) => part.type !== "text")
          const parts = [{ type: "text" as const, text: input.text }, ...attachments]
          yield* db
            .update(SessionQueueTable)
            .set({ payload: { ...row.payload, parts } })
            .where(eq(SessionQueueTable.id, input.id))
            .run()
            .pipe(Effect.orDie)
          return yield* snapshotOf(input.sessionID)
        }),
      )

    const cancel: Interface["cancel"] = (input) =>
      lock.withPermit(
        Effect.gen(function* () {
          yield* ownRow(input)
          yield* db.delete(SessionQueueTable).where(eq(SessionQueueTable.id, input.id)).run().pipe(Effect.orDie)
          return yield* snapshotOf(input.sessionID)
        }),
      )

    const resume: Interface["resume"] = (sessionID) =>
      lock.withPermit(
        Effect.suspend(() => {
          flags.set(sessionID, "running")
          return snapshotOf(sessionID)
        }),
      )

    const claim: Interface["claim"] = (sessionID, idle) =>
      lock.withPermit(
        Effect.gen(function* () {
          const row = nextRow(sessionID, yield* readRows(sessionID), Date.now())
          if (!row) return undefined
          if (!(yield* idle)) return undefined
          if (!(yield* mark(row.id))) return undefined
          return { id: row.id, payload: row.payload }
        }),
      )

    const ready: Interface["ready"] = (sessionID) =>
      lock.withPermit(readRows(sessionID).pipe(Effect.map((rows) => nextRow(sessionID, rows, Date.now()) !== undefined)))

    const due: Interface["due"] = (now) =>
      lock.withPermit(
        Effect.gen(function* () {
          yield* recover
          const rows = yield* db
            .select()
            .from(SessionQueueTable)
            .where(and(eq(SessionQueueTable.state, "pending"), lte(SessionQueueTable.run_at, now)))
            .all()
            .pipe(Effect.orDie)
          const detached = yield* Effect.forEach(
            rows.filter((row): row is typeof row & { target: Detached["target"] } => row.target !== "current"),
            (row) => mark(row.id).pipe(Effect.map((claimed) => (claimed ? [row] : []))),
          )
          return {
            detached: detached
              .flat()
              .map((row) => ({ id: row.id, payload: row.payload, sessionID: row.session_id, target: row.target })),
            sessions: [...new Set(rows.filter((row) => row.target === "current").map((row) => row.session_id))],
          }
        }),
      )

    const settle: Interface["settle"] = (id) => lock.withPermit(settleRow(id).pipe(Effect.ensuring(release(id))))
    const prepare: Interface["prepare"] = (id) => lock.withPermit(Effect.gen(function* () {
      const row = yield* findRow(id)
      if (!row || row.state !== "dispatching" || !leases.has(id)) {
        return yield* Effect.die(new Error(`Queue claim is not owned: ${id}`))
      }
      if (row.message_id) return row.message_id
      const messageID = MessageID.ascending()
      yield* db.update(SessionQueueTable).set({ message_id: messageID }).where(eq(SessionQueueTable.id, id))
        .run().pipe(Effect.orDie)
      return messageID
    }))

    return Service.of({
      snapshot: snapshotOf,
      add,
      edit,
      cancel,
      resume,
      // Under the same permit as `claim`, so a pause cannot land between a claim's pause check and its write.
      pause: (sessionID, reason) =>
        lock.withPermit(
          Effect.sync(() => {
            const flag = flags.get(sessionID)
            // The first reason sticks: a failed run after a confirmed interrupt keeps "interrupted".
            if (flag === undefined || flag === "running") flags.set(sessionID, reason)
          }),
        ),
      claim,
      ready,
      due,
      prepare,
      complete: (id) => lock.withPermit(receipt(id).pipe(Effect.ensuring(release(id)))),
      settle,
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Database.node],
})

export * as SessionQueue from "./queue"
