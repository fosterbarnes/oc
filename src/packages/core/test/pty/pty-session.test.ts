import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Layer, Queue } from "effect"
import { Config } from "@opencode-ai/core/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { Pty } from "@opencode-ai/core/pty"
import type { PtyID } from "@opencode-ai/core/pty/schema"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"

type PtyEvent = { type: "created" | "exited" | "deleted"; id: PtyID }

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make("/tmp") })),
)
const configLayer = Layer.mock(Config.Service)({ entries: () => Effect.succeed([]) })
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Pty.node, EventV2.node]), [
    [Config.node, configLayer],
    [Location.node, locationLayer],
  ]),
)
const ptyTest = process.platform === "win32" ? it.live.skip : it.live

const subscribePtyEvents = Effect.fn("PtySessionTest.subscribePtyEvents")(function* () {
  const source = yield* EventV2.Service
  const events = yield* Queue.unbounded<PtyEvent>()
  const unsubscribe = yield* source.listen((event) => {
    if (event.type === Pty.Event.Created.type)
      Queue.offerUnsafe(events, { type: "created", id: (event.data as typeof Pty.Event.Created.data.Type).info.id })
    if (event.type === Pty.Event.Exited.type)
      Queue.offerUnsafe(events, { type: "exited", id: (event.data as typeof Pty.Event.Exited.data.Type).id })
    if (event.type === Pty.Event.Deleted.type)
      Queue.offerUnsafe(events, { type: "deleted", id: (event.data as typeof Pty.Event.Deleted.data.Type).id })
    return Effect.void
  })
  yield* Effect.addFinalizer(() => unsubscribe)
  return events
})

const createPty = Effect.fn("PtySessionTest.createPty")(function* (command: string, args: string[] = []) {
  const pty = yield* Pty.Service
  return yield* Effect.acquireRelease(
    pty.create({ command, args, cwd: "/tmp", env: { TERM: "xterm-256color", OPENCODE_TERMINAL: "1" } }),
    (info) => pty.remove(info.id).pipe(Effect.ignore),
  )
})

const waitForEvents = (events: Queue.Queue<PtyEvent>, id: PtyID, count: number) =>
  Effect.gen(function* () {
    const picked: Array<PtyEvent["type"]> = []
    while (picked.length < count) {
      const evt = yield* Queue.take(events)
      if (evt.id === id) picked.push(evt.type)
    }
    return picked
  }).pipe(
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(new Error("timeout waiting for pty events")),
    }),
  )

const attachCollecting = Effect.fn("PtySessionTest.attachCollecting")(function* (id: PtyID, cursor?: number) {
  const pty = yield* Pty.Service
  const output = yield* Queue.unbounded<string>()
  const ended = yield* Deferred.make<{ exitCode?: number }>()
  const attachment = yield* pty.attach(id, {
    cursor,
    onData: (chunk) => Queue.offerUnsafe(output, chunk),
    onEnd: (event) => Deferred.doneUnsafe(ended, Effect.succeed(event)),
  })
  attachment.activate()
  return { attachment, output, ended }
})

const waitForOutput = (output: Queue.Queue<string>, text: string) =>
  Effect.gen(function* () {
    let received = ""
    while (!received.includes(text)) received += yield* Queue.take(output)
    return received
  }).pipe(
    Effect.timeoutOrElse({
      duration: "5 seconds",
      orElse: () => Effect.fail(new Error(`timeout waiting for output containing ${JSON.stringify(text)}`)),
    }),
  )

describe("pty", () => {
  it.live("returns typed not found errors for missing sessions", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const id = "pty_missing" as PtyID

      for (const result of [
        yield* pty.get(id).pipe(Effect.asVoid, Effect.exit),
        yield* pty.update(id, { title: "missing" }).pipe(Effect.asVoid, Effect.exit),
        yield* pty.remove(id).pipe(Effect.exit),
        yield* pty.write(id, "input").pipe(Effect.exit),
        yield* pty.attach(id, { onData: () => {}, onEnd: () => {} }).pipe(Effect.asVoid, Effect.exit),
      ]) {
        expect(Exit.isFailure(result)).toBe(true)
        if (Exit.isFailure(result))
          expect(Cause.squash(result.cause)).toMatchObject({ _tag: "Pty.NotFoundError", ptyID: id })
      }
    }),
  )

  ptyTest("retains exited sessions until removed", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const events = yield* subscribePtyEvents()
      const info = yield* createPty("/usr/bin/env", ["sh", "-c", "exit 3"])

      expect(yield* waitForEvents(events, info.id, 2)).toEqual(["created", "exited"])
      const exited = yield* pty.get(info.id)
      expect(exited.status).toBe("exited")
      expect(exited.exitCode).toBe(3)

      yield* pty.remove(info.id)
      expect(yield* waitForEvents(events, info.id, 1)).toEqual(["deleted"])
      const missing = yield* pty.get(info.id).pipe(Effect.exit)
      expect(Exit.isFailure(missing)).toBe(true)
    }),
  )

  ptyTest("replays buffered output and streams live output to attachments", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const info = yield* createPty("cat")
      yield* pty.write(info.id, "AAA\n")

      const first = yield* attachCollecting(info.id)
      expect(yield* waitForOutput(first.output, "AAA")).toContain("AAA")

      first.attachment.write("BBB\n")
      yield* waitForOutput(first.output, "BBB")

      // A later attachment replays everything already buffered.
      const replayed = yield* attachCollecting(info.id)
      expect(replayed.attachment.replay).toContain("AAA")
      expect(replayed.attachment.replay).toContain("BBB")
      expect(replayed.attachment.cursor).toBeGreaterThan(0)

      // Tail attachments skip the buffer and only see subsequent output.
      const tail = yield* attachCollecting(info.id, -1)
      expect(tail.attachment.replay).toBe("")
      expect(tail.attachment.cursor).toBe(replayed.attachment.cursor)
    }),
  )

  ptyTest("stops delivering output after detach", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const info = yield* createPty("cat")
      const attached = yield* attachCollecting(info.id, -1)

      attached.attachment.detach()
      yield* pty.write(info.id, "AAA\n")

      const verify = yield* attachCollecting(info.id)
      yield* waitForOutput(verify.output, "AAA")
      const leaked = yield* Queue.poll(attached.output)
      expect(leaked._tag).toBe("None")
    }),
  )

  ptyTest("isolates output between sessions", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const a = yield* createPty("cat")
      const b = yield* createPty("cat")
      const attachedA = yield* attachCollecting(a.id)
      const attachedB = yield* attachCollecting(b.id)

      yield* pty.write(a.id, "AAA\n")
      yield* waitForOutput(attachedA.output, "AAA")

      const leaked = yield* Queue.poll(attachedB.output)
      expect(leaked._tag).toBe("None")
    }),
  )

  ptyTest("notifies attachments with the exit code and rejects attach after exit", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const events = yield* subscribePtyEvents()
      const info = yield* createPty("cat")
      const attached = yield* attachCollecting(info.id)

      yield* pty.write(info.id, "\u0004")
      expect(yield* Deferred.await(attached.ended).pipe(Effect.timeout("5 seconds"))).toEqual({ exitCode: 0 })
      yield* waitForEvents(events, info.id, 2)

      const result = yield* pty.attach(info.id, { onData: () => {}, onEnd: () => {} }).pipe(Effect.exit)
      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result))
        expect(Cause.squash(result.cause)).toMatchObject({ _tag: "Pty.ExitedError", ptyID: info.id })
    }),
  )

  ptyTest("does not duplicate replay when data arrives before activate", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const info = yield* createPty("cat")
      yield* pty.write(info.id, "AAA\n")
      // Wait for the initial output to land in the retained buffer before attaching.
      const probe = yield* attachCollecting(info.id)
      yield* waitForOutput(probe.output, "AAA")
      probe.attachment.detach()

      const output = yield* Queue.unbounded<string>()
      const ended = yield* Deferred.make<{ exitCode?: number }>()
      const attachment = yield* pty.attach(info.id, {
        cursor: 0,
        onData: (chunk) => Queue.offerUnsafe(output, chunk),
        onEnd: (event) => Deferred.doneUnsafe(ended, Effect.succeed(event)),
      })
      // Replay should contain the earlier AAA but not the later BBB.
      expect(attachment.replay).toContain("AAA")
      expect(attachment.replay).not.toContain("BBB")
      // Data that arrives after attach but before activate must not be duplicated in replay.
      yield* pty.write(info.id, "BBB\n")
      attachment.activate()
      expect(yield* waitForOutput(output, "BBB")).toContain("BBB")
      // Drain any remaining chunks non-blockingly and verify BBB appeared exactly once across replay + live.
      const pending: string[] = []
      while (true) {
        const next = yield* Queue.poll(output)
        if (next._tag === "None") break
        pending.push(next.value)
      }
      const combined = attachment.replay + pending.join("")
      const bbbCount = (combined.match(/BBB/g) ?? []).length
      expect(bbbCount).toBe(1)
    }),
  )

  ptyTest("does not deliver stale output after detach", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const info = yield* createPty("cat")
      const output = yield* Queue.unbounded<string>()
      const attachment = yield* pty.attach(info.id, {
        cursor: -1,
        onData: (chunk) => Queue.offerUnsafe(output, chunk),
        onEnd: () => {},
      })
      attachment.activate()
      attachment.detach()
      yield* pty.write(info.id, "STALE\n")
      // Give the PTY a moment to emit; detached subscriber must not receive it.
      yield* Effect.sleep("100 millis")
      const leaked = yield* Queue.poll(output)
      expect(leaked._tag).toBe("None")
      // A fresh attachment should still see the data via replay, proving the write landed but was isolated.
      const fresh = yield* attachCollecting(info.id)
      expect(yield* waitForOutput(fresh.output, "STALE")).toContain("STALE")
    }),
  )

  ptyTest("delivers close without stranding when teardown races activate", () =>
    Effect.gen(function* () {
      const pty = yield* Pty.Service
      const info = yield* createPty("cat")
      const output = yield* Queue.unbounded<string>()
      const ended = yield* Deferred.make<{ exitCode?: number }>()
      const attachment = yield* pty.attach(info.id, {
        cursor: -1,
        onData: (chunk) => Queue.offerUnsafe(output, chunk),
        onEnd: (event) => Deferred.doneUnsafe(ended, Effect.succeed(event)),
      })
      // Do not activate yet; remove the session while the subscriber is still pending.
      yield* pty.remove(info.id)
      attachment.activate()
      // Pending subscriber must still receive the teardown close instead of hanging.
      const result = yield* Deferred.await(ended).pipe(Effect.timeout("5 seconds"), Effect.exit)
      expect(Exit.isSuccess(result)).toBe(true)
      // Second activate/detach must be idempotent and not throw.
      attachment.activate()
      attachment.detach()
      attachment.detach()
    }),
  )
})

const configuredShell = process.platform === "win32" ? undefined : Bun.which("bash")
const configuredIt = testEffect(
  AppNodeBuilder.build(LayerNode.group([Pty.node, EventV2.node]), [
    [
      Config.node,
      Layer.mock(Config.Service)({
        entries: () =>
          Effect.succeed(
            configuredShell
              ? [new Config.Document({ type: "document", info: new Config.Info({ shell: configuredShell }) })]
              : [],
          ),
      }),
    ],
    [Location.node, locationLayer],
  ]),
)
const configuredTest = process.platform === "win32" ? configuredIt.live.skip : configuredIt.live

describe("pty create defaults", () => {
  configuredTest("defaults command, login args, and cwd from config and location", () =>
    Effect.gen(function* () {
      if (!configuredShell) return
      const pty = yield* Pty.Service
      const info = yield* Effect.acquireRelease(pty.create({ title: "configured" }), (created) =>
        pty.remove(created.id).pipe(Effect.ignore),
      )
      expect(info.command).toBe(configuredShell)
      expect(info.args).toEqual(["-l"])
      expect(info.cwd).toBe("/tmp")
      expect(info.title).toBe("configured")
    }),
  )
})
