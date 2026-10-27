import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { randomUUID } from "node:crypto"
import { Database } from "@opencode-ai/core/database/database"
import { MessageTable, SessionQueueTable } from "@opencode-ai/core/session/sql"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { and, asc, eq, lte, ne, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schema, Semaphore } from "effect"
import { MessageID, SessionID } from "./schema"
import { ScheduledDelivery } from "./scheduledDelivery"

// Why a session's queue is not sending. Absent (with entries waiting) means paused after a restart.
export const PauseReason = Schema.Literals(["restart", "error", "interrupted"])
export type PauseReason = Schema.Schema.Type<typeof PauseReason>

// The prompt as the user sent it: model, agent, and variant snapshot plus the expanded parts. With
// `commands` it sends like a typed slash command: the plain text parts are the command's request.
export const Payload = Schema.Struct({
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.Struct({ providerID: ProviderV2.ID, modelID: ModelV2.ID })),
  variant: Schema.optional(Schema.String),
  parts: Schema.Array(
    Schema.Union([SessionV1.TextPartInput, SessionV1.FilePartInput, SessionV1.AgentPartInput]).annotate({
      discriminator: "type",
    }),
  ),
  commands: Schema.optional(Schema.Array(Schema.String)),
})
export type Payload = Schema.Schema.Type<typeof Payload>
type Part = Payload["parts"][number]

// What the user typed, as opposed to synthetic context such as an editor selection.
export const isTyped = (part: Part): part is Extract<Part, { type: "text" }> => part.type === "text" && !part.synthetic

/** The request text of a payload: its typed text parts. */
export const requestText = (payload: Payload) =>
  payload.parts
    .filter(isTyped)
    .map((part) => part.text)
    .join("\n")

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

/** A claimed entry cannot be edited. Cancellation is still allowed before admission. */
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

export interface EditInput {
  sessionID: SessionID
  id: MessageID
  text: string
  /** Replaces the entry's commands; `[]` makes it a plain prompt. Absent keeps them. */
  commands?: readonly string[]
}

export interface Queued {
  id: MessageID
  payload: Payload
  claim: ScheduledDelivery.Claim
}

/** A claimed fork or new-session entry; `sessionID` is the session it was scheduled from. */
export interface Detached extends Queued {
  sessionID: SessionID
  target: "fork" | "new"
}

export interface Interface {
  readonly snapshot: (sessionID: SessionID) => Effect.Effect<Snapshot>
  readonly add: (input: AddInput) => Effect.Effect<Snapshot>
  readonly edit: (input: EditInput) => Effect.Effect<Snapshot, NotFoundError | BusyError>
  readonly cancel: (input: {
    sessionID: SessionID
    id: MessageID
  }) => Effect.Effect<Snapshot, NotFoundError | BusyError>
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
  readonly settle: (id: MessageID, claim?: ScheduledDelivery.Claim) => Effect.Effect<void>
  readonly delivery: (id: MessageID, claim?: ScheduledDelivery.Claim) => ScheduledDelivery.Input
  readonly deadline: () => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionQueue") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const lock = Semaphore.makeUnsafe(1)
    const identity = yield* Effect.cached(Effect.promise(ScheduledDelivery.owner))
    const owned = new Map<MessageID, ScheduledDelivery.Claim>()
    const claimed = (row: typeof SessionQueueTable.$inferSelect) =>
      ScheduledDelivery.claim(Reflect.get(row.payload, "deliveryClaim"))
    const notify = Effect.sync(ScheduledDelivery.queueWake.notify)
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
        .pipe(
          Effect.orDie,
          Effect.map((row) => row !== undefined),
        )

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

    // Conditional state updates serialize claimers across processes without a new database column.
    const mark = (id: MessageID, owner: Effect.Success<typeof identity>) =>
      db
        .transaction(
          () =>
            Effect.gen(function* () {
              const current = yield* findRow(id)
              if (!current || current.state !== "pending") return undefined
              const claim = { ...owner, owner: randomUUID(), at: Date.now() }
              const payload = { ...current.payload, deliveryClaim: claim }
              const row = yield* db
                .update(SessionQueueTable)
                .set({ state: "dispatching", payload })
                .where(and(eq(SessionQueueTable.id, id), eq(SessionQueueTable.state, "pending")))
                .returning({ id: SessionQueueTable.id })
                .get()
                .pipe(Effect.orDie)
              if (!row) return undefined
              owned.set(id, claim)
              return claim
            }),
          { behavior: "immediate" },
        )
        .pipe(Effect.orDie)

    const toEntry = (row: typeof SessionQueueTable.$inferSelect): Entry => ({
      id: row.id,
      state: row.state === "dispatching" ? "dispatching" : "pending",
      // As typed, in the same order as the TUI's `typedText`: `/spit /think request`.
      text: [...(row.payload.commands ?? []).map((name) => `/${name}`), requestText(row.payload)]
        .filter(Boolean)
        .join(" "),
      attachments: row.payload.parts.filter((part) => part.type !== "text").length,
      ...(row.run_at !== null && { runAt: row.run_at }),
      target: row.target,
    })

    const snapshotOf = (sessionID: SessionID) =>
      readRows(sessionID).pipe(
        Effect.map(
          (rows): Snapshot => ({
            pause: pausedFor(sessionID, hasUnscheduled(rows)) ?? "none",
            entries: rows.map(toEntry),
          }),
        ),
      )

    const receipt = (id: MessageID) =>
      db
        .transaction(
          () =>
            Effect.gen(function* () {
              const row = yield* findRow(id)
              if (!row) return
              yield* db
                .update(SessionQueueTable)
                .set({ state: "completed", payload: { parts: [] } })
                .where(eq(SessionQueueTable.id, id))
                .run()
                .pipe(Effect.orDie)
              const completed = yield* db
                .select({ id: SessionQueueTable.id })
                .from(SessionQueueTable)
                .where(and(eq(SessionQueueTable.session_id, row.session_id), eq(SessionQueueTable.state, "completed")))
                .orderBy(sql`${SessionQueueTable.time_updated} desc`, sql`rowid desc`)
                .all()
                .pipe(Effect.orDie)
              yield* Effect.forEach(
                completed.slice(50),
                (entry) =>
                  db.delete(SessionQueueTable).where(eq(SessionQueueTable.id, entry.id)).run().pipe(Effect.orDie),
                { discard: true },
              )
            }),
          { behavior: "immediate" },
        )
        .pipe(
          Effect.orDie,
          Effect.tap(() => Effect.sync(() => owned.delete(id))),
          Effect.tap(() => notify),
        )

    // A row whose message exists was sent before the crash or failure; keep only its receipt.
    // Otherwise the prompt never persisted and the entry waits again as an ordinary queued prompt for
    // its own session, so a failed scheduled send is held by the pause instead of retrying every poll.
    // Nothing is sent here.
    const settleRow = (id: MessageID, expected = owned.get(id)) =>
      Effect.gen(function* () {
        const row = yield* findRow(id)
        if (!row || row.state !== "dispatching") return
        const claim = claimed(row)
        if (claim && claim.owner !== expected?.owner) return
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
        owned.delete(id)
      })

    const recover = Effect.gen(function* () {
      const stranded = yield* db
        .select()
        .from(SessionQueueTable)
        .where(eq(SessionQueueTable.state, "dispatching"))
        .all()
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        stranded,
        (row) =>
          Effect.gen(function* () {
            const claim = claimed(row)
            if (yield* isSent(row.message_id ?? row.id)) return yield* lock.withPermit(receipt(row.id))
            if (claim && !(yield* Effect.promise(() => ScheduledDelivery.expired(claim, Date.now())))) return
            // A crash retains its deadline and target. Ordinary failures alone use settleRow's pause.
            // Comparing the payload also checks owner + at after the unlocked identity query.
            const recovered = yield* lock.withPermit(
              db
                .update(SessionQueueTable)
                .set({ state: "pending" })
                .where(
                  and(
                    eq(SessionQueueTable.id, row.id),
                    eq(SessionQueueTable.state, "dispatching"),
                    eq(SessionQueueTable.payload, row.payload),
                  ),
                )
                .returning({ id: SessionQueueTable.id })
                .get()
                .pipe(Effect.orDie),
            )
            if (recovered && row.run_at === null) flags.set(row.session_id, "restart")
          }),
        { discard: true },
      )
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
          yield* notify
          return yield* snapshotOf(input.sessionID)
        }),
      )

    const edit: Interface["edit"] = (input) =>
      lock.withPermit(
        Effect.gen(function* () {
          const row = yield* ownRow(input)
          // Editor context and attachments stay; only the typed text and the commands change.
          const kept = row.payload.parts.filter((part) => !isTyped(part))
          const parts = [...(input.text.trim() ? [{ type: "text" as const, text: input.text }] : []), ...kept]
          const commands = input.commands ?? row.payload.commands
          const payload = { ...row.payload, parts, commands: commands?.length ? commands : undefined }
          const edited = yield* db
            .update(SessionQueueTable)
            .set({ payload })
            .where(and(eq(SessionQueueTable.id, input.id), eq(SessionQueueTable.state, "pending")))
            .returning({ id: SessionQueueTable.id })
            .get()
            .pipe(Effect.orDie)
          if (!edited) return yield* new BusyError({ id: input.id })
          yield* notify
          return yield* snapshotOf(input.sessionID)
        }),
      )

    const cancel: Interface["cancel"] = (input) =>
      lock.withPermit(
        Effect.gen(function* () {
          const row = yield* findRow(input.id)
          if (!row || row.session_id !== input.sessionID || row.state === "completed") {
            return yield* new NotFoundError({ id: input.id })
          }
          yield* db.delete(SessionQueueTable).where(eq(SessionQueueTable.id, input.id)).run().pipe(Effect.orDie)
          owned.delete(input.id)
          yield* notify
          return yield* snapshotOf(input.sessionID)
        }),
      )

    const resume: Interface["resume"] = (sessionID) =>
      lock.withPermit(
        Effect.suspend(() => {
          flags.set(sessionID, "running")
          return snapshotOf(sessionID).pipe(Effect.tap(() => notify))
        }),
      )

    const claim: Interface["claim"] = (sessionID, idle) =>
      identity.pipe(
        Effect.flatMap((owner) =>
          lock.withPermit(
            Effect.gen(function* () {
              const row = nextRow(sessionID, yield* readRows(sessionID), Date.now())
              if (!row) return undefined
              if (!(yield* idle)) return undefined
              const claim = yield* mark(row.id, owner)
              if (!claim) return undefined
              return { id: row.id, payload: row.payload, claim }
            }),
          ),
        ),
      )

    const ready: Interface["ready"] = (sessionID) =>
      lock.withPermit(
        readRows(sessionID).pipe(Effect.map((rows) => nextRow(sessionID, rows, Date.now()) !== undefined)),
      )

    const due: Interface["due"] = (now) =>
      Effect.gen(function* () {
        yield* recover
        const owner = yield* identity
        return yield* lock.withPermit(
          Effect.gen(function* () {
            const rows = yield* db
              .select()
              .from(SessionQueueTable)
              .where(and(eq(SessionQueueTable.state, "pending"), lte(SessionQueueTable.run_at, now)))
              .all()
              .pipe(Effect.orDie)
            const detached = yield* Effect.forEach(
              rows.filter((row): row is typeof row & { target: Detached["target"] } => row.target !== "current"),
              (row) => mark(row.id, owner).pipe(Effect.map((claim) => (claim ? [{ row, claim }] : []))),
            )
            return {
              detached: detached.flat().map(({ row, claim }) => ({
                id: row.id,
                payload: row.payload,
                sessionID: row.session_id,
                target: row.target,
                claim,
              })),
              sessions: [...new Set(rows.filter((row) => row.target === "current").map((row) => row.session_id))],
            }
          }),
        )
      })

    const settle: Interface["settle"] = (id, claim) =>
      lock.withPermit(settleRow(id, claim).pipe(Effect.tap(() => notify)))
    const prepare: Interface["prepare"] = (id) =>
      lock.withPermit(
        Effect.gen(function* () {
          const row = yield* findRow(id)
          if (!row || row.state !== "dispatching" || claimed(row)?.owner !== owned.get(id)?.owner) {
            return yield* Effect.die(new Error(`Queue claim is not owned: ${id}`))
          }
          if (row.message_id) return row.message_id
          const messageID = MessageID.ascending()
          yield* db
            .update(SessionQueueTable)
            .set({ message_id: messageID })
            .where(eq(SessionQueueTable.id, id))
            .run()
            .pipe(Effect.orDie)
          return messageID
        }),
      )

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
      complete: (id) => lock.withPermit(receipt(id)),
      settle,
      delivery: (id, claim = owned.get(id)) => ({
        id,
        check: Effect.gen(function* () {
          const row = yield* findRow(id)
          return !!row && row.state === "dispatching" && claimed(row)?.owner === claim?.owner
        }),
      }),
      deadline: () =>
        Effect.gen(function* () {
          const now = Date.now()
          const rows = yield* db
            .select()
            .from(SessionQueueTable)
            .where(ne(SessionQueueTable.state, "completed"))
            .all()
            .pipe(Effect.orDie)
          return Math.min(
            now + ScheduledDelivery.RECONCILE_MS,
            ...rows.flatMap((row) => {
              if (row.state === "dispatching") return [(claimed(row)?.at ?? now) + ScheduledDelivery.CLAIM_MS]
              return row.run_at !== null && row.run_at > now ? [row.run_at] : []
            }),
          )
        }),
    })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Database.node],
})

export * as SessionQueue from "./queue"
