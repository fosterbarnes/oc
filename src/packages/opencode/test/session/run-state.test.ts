import { expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { SessionRunState } from "@/session/run-state"
import { SessionID } from "@/session/schema"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(SessionRunState.node))
const result = (text: string) => ({ info: { text }, parts: [] }) as unknown as SessionV1.WithParts

it.instance("replacement run waits for the cancelled run's finalizers instead of failing", () =>
  Effect.gen(function* () {
    const state = yield* SessionRunState.Service
    const sessionID = SessionID.make(`ses_runstate_${Date.now()}`)
    const started = yield* Deferred.make<void>()
    const hit = yield* Deferred.make<void>()
    const hold = yield* Deferred.make<void>()

    // A failed assertion must not leave the first run's finalizer (and the test fiber) waiting forever.
    yield* Effect.gen(function* () {
      const first = yield* state
        .ensureRunning(
          sessionID,
          Effect.succeed(result("interrupted")),
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(hit, undefined)),
            Effect.ensuring(Deferred.await(hold)),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)

      const stop = yield* state.cancel(sessionID).pipe(Effect.forkChild)
      yield* Deferred.await(hit)

      // The cancelled run still holds the session lock in its finalizer; the replacement must queue behind it.
      const second = yield* state
        .ensureRunning(sessionID, Effect.succeed(result("interrupted")), Effect.succeed(result("second")))
        .pipe(Effect.exit, Effect.forkChild)
      yield* Effect.sleep("100 millis")
      expect(second.pollUnsafe()).toBeUndefined()

      yield* Deferred.succeed(hold, undefined)
      const exit = yield* Fiber.join(second)
      expect(Exit.isSuccess(exit)).toBe(true)
      if (Exit.isSuccess(exit)) expect(exit.value).toEqual(result("second"))
      yield* Fiber.await(stop)
      yield* Fiber.await(first)
      yield* pollWithTimeout(
        state.phase(sessionID).pipe(Effect.map((phase) => (phase === "Idle" ? true : undefined))),
        "runner did not return to Idle",
      )
    }).pipe(Effect.ensuring(Deferred.succeed(hold, undefined)))
  }),
)
