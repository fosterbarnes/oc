import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, SessionQueueTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { asc, eq, sql } from "drizzle-orm"
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

export const Entry = Schema.Struct({
  id: MessageID,
  state: Schema.Literals(["pending", "dispatching"]),
  text: Schema.String,
  attachments: Schema.Int,
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
}

export interface Queued {
  id: MessageID
  payload: Payload
}

export interface Interface {
  readonly snapshot: (sessionID: SessionID) => Effect.Effect<Snapshot>
  readonly add: (input: AddInput) => Effect.Effect<Snapshot>
  readonly edit: (input: { sessionID: SessionID; id: MessageID; text: string }) => Effect.Effect<Snapshot, NotFoundError | BusyError>
  readonly cancel: (input: { sessionID: SessionID; id: MessageID }) => Effect.Effect<Snapshot, NotFoundError | BusyError>
  readonly resume: (sessionID: SessionID) => Effect.Effect<Snapshot>
  readonly pause: (sessionID: SessionID, reason: PauseReason) => Effect.Effect<void>
  /** Marks the head pending entry `dispatching` when the session is paused-free and `idle` holds. */
  readonly claim: (sessionID: SessionID, idle: Effect.Effect<boolean>) => Effect.Effect<Queued | undefined>
  /** Removes an entry whose user message was persisted. */
  readonly complete: (id: MessageID) => Effect.Effect<void>
  /** Resolves a `dispatching` entry after its send failed: removed if the message exists, else pending again. */
  readonly settle: (id: MessageID) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionQueue") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const lock = Semaphore.makeUnsafe(1)
    // Explicit pause state per session, kept in memory. "running" clears a restart pause.
    const flags = new Map<SessionID, PauseReason | "running">()

    const readRows = (sessionID: SessionID) =>
      db
        .select()
        .from(SessionQueueTable)
        .where(eq(SessionQueueTable.session_id, sessionID))
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

    const pausedFor = (sessionID: SessionID, waiting: boolean): PauseReason | undefined => {
      const flag = flags.get(sessionID)
      if (flag === undefined) return waiting ? "restart" : undefined
      return flag === "running" ? undefined : flag
    }

    const toEntry = (row: typeof SessionQueueTable.$inferSelect): Entry => ({
      id: row.id,
      state: row.state,
      text: row.payload.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n"),
      attachments: row.payload.parts.filter((part) => part.type !== "text").length,
    })

    const snapshotOf = (sessionID: SessionID) =>
      readRows(sessionID).pipe(
        Effect.map((rows): Snapshot => ({
          pause: pausedFor(sessionID, rows.length > 0) ?? "none",
          entries: rows.map(toEntry),
        })),
      )

    // A `dispatching` row whose message exists was sent before the crash or failure, so it is dropped.
    // Otherwise the prompt never persisted and the entry waits again. Nothing is sent here.
    const settleRow = (id: MessageID) =>
      Effect.gen(function* () {
        if (yield* isSent(id)) {
          yield* db.delete(SessionQueueTable).where(eq(SessionQueueTable.id, id)).run().pipe(Effect.orDie)
          return
        }
        yield* db
          .update(SessionQueueTable)
          .set({ state: "pending" })
          .where(eq(SessionQueueTable.id, id))
          .run()
          .pipe(Effect.orDie)
      })

    const stranded = yield* db
      .select({ id: SessionQueueTable.id })
      .from(SessionQueueTable)
      .where(eq(SessionQueueTable.state, "dispatching"))
      .all()
      .pipe(Effect.orDie)
    yield* Effect.forEach(stranded, (row) => settleRow(row.id), { discard: true })

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
          if (yield* isSent(id)) return yield* snapshotOf(input.sessionID)
          // An empty queue is not paused: sending the first entry clears any earlier pause.
          if ((yield* readRows(input.sessionID)).length === 0) flags.set(input.sessionID, "running")
          yield* db
            .insert(SessionQueueTable)
            .values({ id, session_id: input.sessionID, state: "pending", payload: input.payload })
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
          const [head] = yield* readRows(sessionID)
          if (!head || head.state !== "pending") return undefined
          if (pausedFor(sessionID, true)) return undefined
          if (!(yield* idle)) return undefined
          yield* db
            .update(SessionQueueTable)
            .set({ state: "dispatching" })
            .where(eq(SessionQueueTable.id, head.id))
            .run()
            .pipe(Effect.orDie)
          return { id: head.id, payload: head.payload }
        }),
      )

    const settle: Interface["settle"] = (id) => lock.withPermit(settleRow(id))

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
      complete: (id) => db.delete(SessionQueueTable).where(eq(SessionQueueTable.id, id)).run().pipe(Effect.orDie, Effect.asVoid),
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
