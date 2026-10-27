import { expect } from "bun:test"
import path from "path"
import { Cause, Effect, Exit, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { MessageTable, SessionQueueTable, SessionTable } from "@opencode-ai/core/session/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { eq } from "drizzle-orm"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import { SessionPrompt } from "@/session/prompt"
import { SessionQueue } from "@/session/queue"
import { ScheduledDelivery } from "@/session/scheduledDelivery"
import { SessionRevert } from "@/session/revert"
import { SessionRunState } from "@/session/run-state"
import { MessageID, SessionID } from "@/session/schema"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(
  LayerNode.compile(
    LayerNode.group([
      SessionPrompt.node,
      SessionQueue.node,
      SessionRunState.node,
      Database.node,
      SessionRevert.node,
      SessionCompaction.node,
      Session.node,
      SessionProjector.node,
      EventV2Bridge.node,
      llmNode,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })]],
  ),
)

const setup = Effect.fnUntraced(function* (config: Record<string, unknown> = {}) {
  const instance = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* Effect.promise(() =>
    Bun.write(
      path.join(instance.directory, "opencode.json"),
      JSON.stringify({
        ...testProviderConfig(llm.url),
        enabled_providers: ["test"],
        model: "test/test-model",
        snapshot: false,
        ...config,
      }),
    ),
  )
  return {
    llm,
    sessions: yield* Session.Service,
    prompt: yield* SessionPrompt.Service,
    queue: yield* SessionQueue.Service,
    database: yield* Database.Service,
    state: yield* SessionRunState.Service,
    events: yield* EventV2Bridge.Service,
  }
})
type Fixture = Effect.Success<ReturnType<typeof setup>>

const text = (value: string) => ({ type: "text" as const, text: value })

const add = (fixture: Fixture, sessionID: SessionID, value: string) =>
  fixture.prompt.queue.add({ sessionID, payload: { model: ref, parts: [text(value)] } })

// Texts of the user messages, oldest first.
const userTexts = (fixture: Fixture, sessionID: SessionID) =>
  Effect.map(fixture.sessions.messages({ sessionID }), (messages) =>
    messages
      .filter((message) => message.info.role === "user")
      .map((message) => message.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")),
  )

// Waits until the queue is empty and the model has been called `calls` times.
const drained = (fixture: Fixture, sessionID: SessionID, calls: number) =>
  pollWithTimeout(
    Effect.gen(function* () {
      const snapshot = yield* fixture.queue.snapshot(sessionID)
      const made = yield* fixture.llm.calls
      return snapshot.entries.length === 0 && made === calls ? (true as const) : undefined
    }),
    "queue never drained",
  )

const waitForPause = (fixture: Fixture, sessionID: SessionID, reason: string) =>
  pollWithTimeout(
    Effect.gen(function* () {
      const snapshot = yield* fixture.queue.snapshot(sessionID)
      return snapshot.pause === reason ? snapshot : undefined
    }),
    `queue never paused with ${reason}`,
    "90 seconds",
  )

it.instance("sends queued prompts one at a time, in the order they were added", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "fifo" })
    yield* fixture.llm.text("reply one")
    yield* fixture.llm.text("reply two")
    yield* add(fixture, session.id, "first")
    yield* add(fixture, session.id, "second")
    yield* drained(fixture, session.id, 2)
    expect(yield* userTexts(fixture, session.id)).toEqual(["first", "second"])
    expect(yield* fixture.llm.calls).toBe(2)
  }),
)

it.instance("a queued slash command keeps its editor context through an edit and sends as the command", () =>
  Effect.gen(function* () {
    const fixture = yield* setup({ command: { plain: { template: "Plain body" } } })
    const session = yield* fixture.sessions.create({ title: "queued command" })
    yield* fixture.llm.text("done")
    // Shape the TUI queues for `/plain old` with a pending editor selection (`queueInner`).
    const selection = {
      type: "text" as const,
      text: "Selected lines 3-4 of src/a.ts",
      synthetic: true,
      metadata: { kind: "editor_context", source: "editor", filePath: "src/a.ts" },
    }
    yield* fixture.state.maintenance(
      session.id,
      Effect.gen(function* () {
        const added = yield* fixture.prompt.queue.add({
          sessionID: session.id,
          payload: { model: ref, parts: [selection, text("old")], commands: ["plain"] },
        })
        expect(added.entries.map((entry) => entry.text)).toEqual(["/plain old"])
        const id = added.entries[0]!.id
        const edited = yield* fixture.prompt.queue.edit({
          sessionID: session.id,
          id,
          text: "request",
          commands: ["plain"],
        })
        expect(edited.entries.map((entry) => entry.text)).toEqual(["/plain request"])
      }),
    )
    yield* drained(fixture, session.id, 1)
    const user = (yield* fixture.sessions.messages({ sessionID: session.id })).find(
      (message) => message.info.role === "user",
    )
    expect(user?.parts.filter((part) => part.type === "text")).toMatchObject([
      { text: expect.stringContaining("Plain body\n\nrequest"), metadata: { ocCommands: ["plain"] } },
      selection,
    ])
  }),
)

it.instance("editing refuses a claimed prompt and cancellation removes it", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "claimed" })
    yield* fixture.llm.text("held reply")
    // Holding maintenance keeps the drain from sending, so the claim below is the only one.
    yield* fixture.state.maintenance(
      session.id,
      Effect.gen(function* () {
        const added = yield* add(fixture, session.id, "held")
        const id = added.entries[0]!.id
        expect(added.entries[0]!.state).toBe("pending")
        expect((yield* fixture.queue.claim(session.id, Effect.succeed(true)))?.id).toBe(id)

        const edit = yield* Effect.exit(fixture.prompt.queue.edit({ sessionID: session.id, id, text: "changed" }))
        expect(Exit.isFailure(edit) && Cause.squash(edit.cause)).toBeInstanceOf(SessionQueue.BusyError)
        expect((yield* fixture.prompt.queue.cancel({ sessionID: session.id, id })).entries).toEqual([])

        const missing = yield* Effect.exit(
          fixture.prompt.queue.cancel({ sessionID: session.id, id: MessageID.ascending() }),
        )
        expect(Exit.isFailure(missing) && Cause.squash(missing.cause)).toBeInstanceOf(SessionQueue.NotFoundError)

        yield* fixture.queue.settle(id)
      }),
    )
    expect(yield* userTexts(fixture, session.id)).toEqual([])
  }),
)

it.instance("a restart pauses left-over prompts until the user resumes", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "restart" })
    yield* fixture.llm.text("after resume")
    yield* fixture.database.db
      .insert(SessionQueueTable)
      .values({
        id: MessageID.ascending(),
        session_id: session.id,
        state: "pending",
        payload: { model: ref, parts: [text("left over")] },
      })
      .run()
      .pipe(Effect.orDie)

    const before = yield* fixture.queue.snapshot(session.id)
    expect(before.pause).toBe("restart")
    expect(before.entries.map((entry) => entry.text)).toEqual(["left over"])
    expect(yield* fixture.llm.calls).toBe(0)

    yield* fixture.prompt.queue.resume(session.id)
    yield* drained(fixture, session.id, 1)
    expect(yield* userTexts(fixture, session.id)).toEqual(["left over"])
  }),
)

it.instance("a failed turn pauses the queue and keeps the prompts behind it", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "error" })
    // A content-filter finish ends the turn with an error. A stream failure would be retried with backoff.
    yield* fixture.llm.push(reply().contentFilter())
    yield* add(fixture, session.id, "first")
    yield* add(fixture, session.id, "second")
    const paused = yield* waitForPause(fixture, session.id, "error")
    expect(paused.entries.map((entry) => entry.text)).toEqual(["second"])
    expect(yield* userTexts(fixture, session.id)).toEqual(["first"])
  }),
)

it.instance("a confirmed interrupt pauses the queue before the running turn stops", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "interrupt" })
    yield* fixture.llm.hang
    yield* add(fixture, session.id, "running")
    yield* fixture.llm.wait(1)
    yield* add(fixture, session.id, "waiting")
    yield* fixture.prompt.cancel(session.id)
    const paused = yield* waitForPause(fixture, session.id, "interrupted")
    expect(paused.entries.map((entry) => entry.text)).toEqual(["waiting"])
    expect(yield* fixture.llm.calls).toBe(1)
  }),
)

it.instance("a queued revive chain holds the queue until one waiting TUI takes it and resumes", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "chain" })
    yield* fixture.llm.text("behind reply")
    yield* fixture.llm.text("late reply")
    // Shape the TUI queues for Alt+Enter on `/verify /revive request` (`queueInner`).
    const chain = [
      { type: "send" as const, names: ["verify"] },
      { type: "revive" as const, mode: "install" as const },
    ]
    const added = yield* fixture.prompt.queue.add({
      sessionID: session.id,
      payload: { agent: "build", model: ref, parts: [text("request")], chain },
    })
    expect(added.entries.map((entry) => [entry.text, entry.chain])).toEqual([["/verify /revive request", true]])
    yield* add(fixture, session.id, "behind")

    // Nobody waiting: the server never sends the chain, and the prompt behind it waits.
    yield* Effect.sleep("500 millis")
    expect(yield* fixture.llm.calls).toBe(0)
    expect((yield* fixture.queue.snapshot(session.id)).entries.map((entry) => entry.state)).toEqual([
      "pending",
      "pending",
    ])

    // Two TUIs wait; one gets the chain, the other is released once no chain is left.
    const takers = yield* Effect.all(
      [fixture.prompt.queue.takeChain(session.id), fixture.prompt.queue.takeChain(session.id)],
      {
        concurrency: "unbounded",
      },
    )
    expect(takers.filter(Boolean)).toEqual([expect.objectContaining({ chain, parts: [text("request")] })])

    // The chain's steps run from the TUI; queued prompts wait for it, including ones added meanwhile.
    yield* add(fixture, session.id, "late")
    yield* Effect.sleep("500 millis")
    const held = yield* fixture.queue.snapshot(session.id)
    expect(held.pause).toBe("chain")
    expect(held.entries.map((entry) => entry.text)).toEqual(["behind", "late"])
    expect(yield* fixture.llm.calls).toBe(0)

    yield* fixture.prompt.queue.resume(session.id)
    yield* drained(fixture, session.id, 2)
    expect(yield* userTexts(fixture, session.id)).toEqual(["behind", "late"])
  }),
)

it.instance("deleting the session removes its queued prompts", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "delete" })
    yield* fixture.database.db
      .insert(SessionQueueTable)
      .values({
        id: MessageID.ascending(),
        session_id: session.id,
        state: "pending",
        payload: { model: ref, parts: [text("gone soon")] },
      })
      .run()
      .pipe(Effect.orDie)
    yield* fixture.sessions.remove(session.id)
    const rows = yield* fixture.database.db
      .select()
      .from(SessionQueueTable)
      .where(eq(SessionQueueTable.session_id, session.id))
      .all()
      .pipe(Effect.orDie)
    expect(rows).toEqual([])
  }),
)

it.instance("on start, a dispatching prompt is completed when its message was saved and waits again otherwise", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "reconcile" })
    const saved = MessageID.ascending()
    const unsaved = MessageID.ascending()
    yield* fixture.sessions.updateMessage({
      id: saved,
      role: "user",
      sessionID: session.id,
      agent: "build",
      model: ref,
      time: { created: Date.now() },
    })
    yield* fixture.database.db
      .insert(SessionQueueTable)
      .values([
        { id: saved, session_id: session.id, state: "dispatching", payload: { model: ref, parts: [text("sent")] } },
        { id: unsaved, session_id: session.id, state: "dispatching", payload: { model: ref, parts: [text("unsent")] } },
      ])
      .run()
      .pipe(Effect.orDie)

    // A fresh SessionQueue layer runs the start-up reconciliation.
    yield* Layer.build(Layer.fresh(SessionQueue.layer)).pipe(
      Effect.provideService(Database.Service, fixture.database),
      Effect.scoped,
    )

    const rows = yield* fixture.database.db
      .select()
      .from(SessionQueueTable)
      .where(eq(SessionQueueTable.session_id, session.id))
      .all()
      .pipe(Effect.orDie)
    expect(rows.map((row) => [row.id, row.state])).toEqual([
      [saved, "completed"],
      [unsaved, "pending"],
    ])
    const snapshot = yield* fixture.queue.snapshot(session.id)
    expect(snapshot.pause).toBe("restart")
  }),
)

// The poll loop runs this in each session's project; the test is already inside one.
const fireDue = (fixture: Fixture) => fixture.prompt.queue.fireDue((_sessionID, effect) => effect)

const makeDue = (fixture: Fixture, id: MessageID) =>
  fixture.database.db
    .update(SessionQueueTable)
    .set({ run_at: Date.now() - 1000 })
    .where(eq(SessionQueueTable.id, id))
    .run()
    .pipe(Effect.orDie)

it.instance("delivery admission and receipt survive crashes without admitting twice", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "delivery boundaries" })
    for (const boundary of ["after claim", "after admission", "before receipt"]) {
      const added = yield* fixture.queue.add({
        sessionID: session.id,
        payload: { model: ref, parts: [text(boundary)] },
        runAt: Date.now() - 1000,
      })
      const id = added.entries[0]!.id
      expect((yield* fixture.queue.claim(session.id, Effect.succeed(true)))?.id).toBe(id)
      const messageID = yield* fixture.queue.prepare(id)
      const input = {
        sessionID: session.id,
        model: ref,
        messageID,
        noReply: true,
        parts: [text(boundary)],
        delivery: fixture.queue.delivery(id),
      }
      if (boundary === "before receipt") {
        const exit = yield* Effect.exit(
          fixture.prompt.prompt({ ...input, persisted: Effect.die(new Error("injected crash before receipt")) }),
        )
        expect(Exit.isFailure(exit)).toBe(true)
      }
      if (boundary === "after admission") yield* fixture.prompt.prompt(input)
      // Expire the persisted owner, as after a restart following a hard crash.
      const row = yield* fixture.database.db
        .select()
        .from(SessionQueueTable)
        .where(eq(SessionQueueTable.id, id))
        .get()
        .pipe(Effect.orDie)
      const payload = {
        ...row!.payload,
        deliveryClaim: { ...ScheduledDelivery.claim(Reflect.get(row!.payload, "deliveryClaim"))!, at: 0 },
      }
      yield* fixture.database.db
        .update(SessionQueueTable)
        .set({ payload })
        .where(eq(SessionQueueTable.id, id))
        .run()
        .pipe(Effect.orDie)
      yield* fixture.queue.due(Date.now())
      if (boundary === "after claim") {
        expect((yield* fixture.queue.snapshot(session.id)).entries[0]?.runAt).toBeDefined()
        expect((yield* fixture.queue.claim(session.id, Effect.succeed(true)))?.id).toBe(id)
        expect(yield* fixture.queue.prepare(id)).toBe(messageID)
      }
      const replay = boundary === "after claim" ? { ...input, delivery: fixture.queue.delivery(id) } : input
      yield* fixture.prompt.prompt(replay)
      yield* fixture.queue.complete(id)
      yield* fixture.prompt.prompt(replay)
    }
    expect(
      (yield* fixture.sessions.messages({ sessionID: session.id })).filter((item) => item.info.role === "user"),
    ).toHaveLength(3)
    expect(yield* userTexts(fixture, session.id)).toEqual(["after claim", "after admission", "before receipt"])
    expect(yield* fixture.llm.calls).toBe(0)
  }),
)

it.instance("delivery cancellation is checked at admission and concurrent owners admit once", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "delivery ownership" })
    const info = {
      id: MessageID.ascending(),
      role: "user" as const,
      sessionID: session.id,
      agent: "build",
      model: ref,
      time: { created: Date.now() },
    }
    expect(
      yield* ScheduledDelivery.admit(
        fixture.database,
        fixture.events,
        { id: "cancelled", check: Effect.succeed(false) },
        info,
        [],
      ),
    ).toBe(false)
    expect(yield* fixture.sessions.messages({ sessionID: session.id })).toEqual([])
    const admit = ScheduledDelivery.admit(
      fixture.database,
      fixture.events,
      { id: "two owners", check: Effect.succeed(true) },
      info,
      [],
    )
    expect((yield* Effect.all([admit, admit], { concurrency: "unbounded" })).sort()).toEqual([false, true])
  }),
)

it.instance("delivery admission retains the last 50 ids per session", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "bounded receipts" })
    for (let index = 0; index < 51; index++) {
      const info = {
        id: MessageID.ascending(),
        role: "user" as const,
        sessionID: session.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      }
      yield* ScheduledDelivery.admit(
        fixture.database,
        fixture.events,
        { id: String(index), check: Effect.succeed(true) },
        info,
        [],
      )
    }
    const row = yield* fixture.database.db
      .select()
      .from(SessionTable)
      .where(eq(SessionTable.id, session.id))
      .get()
      .pipe(Effect.orDie)
    expect(row?.metadata?.scheduledDeliveries).toEqual(Array.from({ length: 50 }, (_, index) => String(index + 1)))
  }),
)

it.instance("an earlier queued schedule re-arms the sleeping deadline", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "deadline wake" })
    yield* fixture.llm.text("on time")
    const later = yield* fixture.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("later")] },
      runAt: Date.now() + 60_000,
    })
    yield* Effect.gen(function* () {
      const version = ScheduledDelivery.queueWake.version()
      yield* fireDue(fixture)
      yield* ScheduledDelivery.queueWake.wait(version, yield* fixture.queue.deadline())
    }).pipe(Effect.forever, Effect.forkScoped({ startImmediately: true }))
    yield* fixture.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("earlier")] },
      runAt: Date.now() + 50,
    })
    yield* fixture.llm.wait(1).pipe(Effect.timeout("2 seconds"))
    expect(yield* userTexts(fixture, session.id)).toEqual(["earlier"])
    yield* fixture.queue.cancel({ sessionID: session.id, id: later.entries[0]!.id })
  }),
)

it.instance("a scheduled prompt lets queued prompts pass, then fires when due", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "scheduled" })
    yield* fixture.llm.text("reply now")
    yield* fixture.llm.text("reply later")
    const scheduled = yield* fixture.prompt.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("later")] },
      runAt: Date.now() + 3_600_000,
    })
    const id = scheduled.entries[0]!.id
    yield* add(fixture, session.id, "now")
    yield* pollWithTimeout(
      Effect.map(fixture.queue.snapshot(session.id), (snapshot) =>
        snapshot.entries.length === 1 ? (true as const) : undefined,
      ),
      "queued prompt never passed the scheduled one",
    )
    yield* fireDue(fixture)
    expect(yield* userTexts(fixture, session.id)).toEqual(["now"])

    yield* makeDue(fixture, id)
    yield* fireDue(fixture)
    yield* drained(fixture, session.id, 2)
    expect(yield* userTexts(fixture, session.id)).toEqual(["now", "later"])
    const users = (yield* fixture.sessions.messages({ sessionID: session.id })).filter(
      (message) => message.info.role === "user",
    )
    expect(users[1]!.info.id > users[0]!.info.id).toBe(true)
    expect(users[1]!.info.id > id).toBe(true)
  }),
)

it.instance("a due scheduled prompt ignores a restart pause that holds queued prompts", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "scheduled restart" })
    yield* fixture.llm.text("scheduled reply")
    yield* fixture.database.db
      .insert(SessionQueueTable)
      .values([
        {
          id: MessageID.ascending(),
          session_id: session.id,
          state: "pending",
          payload: { model: ref, parts: [text("held")] },
        },
        {
          id: MessageID.ascending(),
          session_id: session.id,
          state: "pending",
          payload: { model: ref, parts: [text("due")] },
          run_at: Date.now() - 1000,
        },
      ])
      .run()
      .pipe(Effect.orDie)
    yield* fireDue(fixture)
    const paused = yield* pollWithTimeout(
      Effect.map(fixture.queue.snapshot(session.id), (snapshot) =>
        snapshot.entries.length === 1 ? snapshot : undefined,
      ),
      "scheduled prompt never fired",
    )
    expect(paused.pause).toBe("restart")
    expect(paused.entries.map((entry) => entry.text)).toEqual(["held"])
    expect(yield* userTexts(fixture, session.id)).toEqual(["due"])
  }),
)

it.instance("a new-session prompt fires once, even with a second process on the same database", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "origin" })
    yield* fixture.llm.text("new session reply")
    const added = yield* fixture.prompt.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("elsewhere")] },
      runAt: Date.now() + 3_600_000,
      target: "new",
    })
    const id = added.entries[0]!.id
    expect(added.entries[0]!.target).toBe("new")
    yield* makeDue(fixture, id)

    // A second SessionQueue on the same database has its own lock, like another oc process.
    yield* Effect.gen(function* () {
      const other = yield* SessionQueue.Service
      yield* fireDue(fixture)
      expect((yield* other.due(Date.now())).detached).toEqual([])
    }).pipe(Effect.provide(Layer.fresh(SessionQueue.layer)), Effect.provideService(Database.Service, fixture.database))

    yield* drained(fixture, session.id, 1)
    expect(yield* userTexts(fixture, session.id)).toEqual([])
    const receipt = yield* fixture.database.db
      .select()
      .from(SessionQueueTable)
      .where(eq(SessionQueueTable.id, id))
      .get()
      .pipe(Effect.orDie)
    expect(receipt?.state).toBe("completed")
    expect(receipt?.payload.parts).toEqual([])
    expect(receipt?.message_id).toBeDefined()
    const sent = yield* fixture.database.db
      .select({ session_id: MessageTable.session_id })
      .from(MessageTable)
      .where(eq(MessageTable.id, receipt!.message_id!))
      .get()
      .pipe(Effect.orDie)
    expect(sent?.session_id).toBeDefined()
    expect(sent?.session_id).not.toBe(session.id)
    expect(
      (yield* fixture.prompt.queue.add({
        sessionID: session.id,
        id,
        payload: { model: ref, parts: [text("duplicate")] },
        runAt: Date.now() - 1000,
        target: "new",
      })).entries,
    ).toEqual([])
    yield* fireDue(fixture)
    expect(yield* fixture.llm.calls).toBe(1)
  }),
)

it.instance("a scheduled fork assigns its prompt id after copying history", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "fork origin" })
    yield* fixture.llm.text("original reply")
    yield* fixture.llm.text("scheduled reply")
    yield* fixture.prompt.prompt({ sessionID: session.id, model: ref, parts: [text("original")] })
    const added = yield* fixture.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("scheduled fork")] },
      runAt: Date.now() - 1000,
      target: "fork",
    })
    const id = added.entries[0]!.id
    yield* fireDue(fixture)
    yield* drained(fixture, session.id, 2)
    const receipt = yield* fixture.database.db
      .select()
      .from(SessionQueueTable)
      .where(eq(SessionQueueTable.id, id))
      .get()
      .pipe(Effect.orDie)
    const sent = yield* fixture.database.db
      .select()
      .from(MessageTable)
      .where(eq(MessageTable.id, receipt!.message_id!))
      .get()
      .pipe(Effect.orDie)
    const messages = yield* fixture.sessions.messages({ sessionID: sent!.session_id })
    const copied = messages.filter(
      (message) =>
        message.info.id !== receipt!.message_id &&
        !(message.info.role === "assistant" && message.info.parentID === receipt!.message_id),
    )
    expect(copied).toHaveLength(2)
    expect(copied.every((message) => message.info.id < receipt!.message_id!)).toBe(true)
    expect(yield* userTexts(fixture, sent!.session_id)).toEqual(["original", "scheduled fork"])
    expect(yield* userTexts(fixture, session.id)).toEqual(["original"])
  }),
)

it.instance("starting another queue service leaves an already-live claim untouched", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "live owner" })
    const at = Date.now() - 1000
    const added = yield* fixture.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("owned")] },
      runAt: at,
      target: "new",
    })
    const id = added.entries[0]!.id
    expect((yield* fixture.queue.due(Date.now())).detached.map((entry) => entry.id)).toEqual([id])
    const messageID = yield* fixture.queue.prepare(id)
    yield* Effect.gen(function* () {
      const other = yield* SessionQueue.Service
      expect((yield* other.snapshot(session.id)).entries[0]).toMatchObject({
        id,
        state: "dispatching",
        runAt: at,
        target: "new",
      })
      expect((yield* other.due(Date.now())).detached).toEqual([])
      const row = yield* fixture.database.db
        .select()
        .from(SessionQueueTable)
        .where(eq(SessionQueueTable.id, id))
        .get()
        .pipe(Effect.orDie)
      expect(row?.message_id).toBe(messageID)
    }).pipe(Effect.provide(Layer.fresh(SessionQueue.layer)), Effect.provideService(Database.Service, fixture.database))
    yield* fixture.queue.settle(id)
  }),
)

it.instance("recovery uses the sent message id and keeps duplicate-add protection after the owner exits", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "saved before exit" })
    const added = yield* fixture.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("persisted")] },
      runAt: Date.now() - 1000,
    })
    const id = added.entries[0]!.id
    yield* Effect.gen(function* () {
      const owner = yield* SessionQueue.Service
      yield* owner.resume(session.id)
      expect((yield* owner.claim(session.id, Effect.succeed(true)))?.id).toBe(id)
      const messageID = yield* owner.prepare(id)
      expect(messageID).not.toBe(id)
      yield* fixture.sessions.updateMessage({
        id: messageID,
        role: "user",
        sessionID: session.id,
        agent: "build",
        model: ref,
        time: { created: Date.now() },
      })
    }).pipe(Effect.provide(Layer.fresh(SessionQueue.layer)), Effect.provideService(Database.Service, fixture.database))
    // Polling also recovers claims whose owner ended after this service started.
    yield* fixture.queue.due(Date.now())
    expect((yield* fixture.queue.snapshot(session.id)).entries).toEqual([])
    expect(
      (yield* fixture.queue.add({ sessionID: session.id, id, payload: { parts: [text("retry")] } })).entries,
    ).toEqual([])
    expect(yield* fixture.llm.calls).toBe(0)
  }),
)

it.instance("a failed project load releases a detached claim into the paused queue", () =>
  Effect.gen(function* () {
    const fixture = yield* setup()
    const session = yield* fixture.sessions.create({ title: "unavailable project" })
    yield* fixture.queue.add({
      sessionID: session.id,
      payload: { model: ref, parts: [text("recover me")] },
      runAt: Date.now() - 1000,
      target: "fork",
    })
    yield* fixture.prompt.queue.fireDue(() => Effect.die(new Error("project unavailable")))
    const snapshot = yield* waitForPause(fixture, session.id, "error")
    expect(snapshot.entries).toHaveLength(1)
    expect(snapshot.entries[0]).toMatchObject({ text: "recover me", state: "pending", target: "current" })
    expect(snapshot.entries[0]!.runAt).toBeUndefined()
    expect(yield* fixture.llm.calls).toBe(0)
  }),
)
