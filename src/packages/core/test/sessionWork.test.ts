import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { SessionWork } from "@opencode-ai/core/session/work"
import { testEffect } from "./lib/effect"

const it = testEffect(SessionWork.layer)

describe("SessionWork", () => {
  it.effect("closes admission, interrupts work, and joins concurrent shutdown cleanup", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const started = yield* Deferred.make<void>()
      const cleaning = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const cleaned = yield* Deferred.make<void>()
      const active = yield* work
        .run(
          "a",
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(
              Deferred.succeed(cleaning, undefined).pipe(
                Effect.andThen(Deferred.await(finish)),
                Effect.andThen(Deferred.succeed(cleaned, undefined)),
              ),
            ),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const first = yield* work.close.pipe(Effect.forkChild)
      yield* Deferred.await(cleaning)
      const second = yield* work.close.pipe(Effect.forkChild)
      const rejected = yield* work.run("a", Effect.die("must not start")).pipe(Effect.exit)
      expect(Exit.isFailure(rejected) && Cause.hasInterruptsOnly(rejected.cause)).toBeTrue()
      expect(yield* Deferred.isDone(cleaned)).toBeFalse()
      yield* Deferred.succeed(finish, undefined)
      yield* Effect.all([Fiber.join(first), Fiber.join(second)])
      expect(yield* Deferred.isDone(cleaned)).toBeTrue()
      const exit = yield* Fiber.await(active)
      expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
    }),
  )

  it.live("waits for an atomic admission already in progress", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const committed = yield* Deferred.make<void>()
      const admission = yield* work
        .run(
          "a",
          Effect.uninterruptible(
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(Deferred.succeed(committed, undefined)),
            ),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(started).pipe(
        Effect.timeoutOrElse({
          duration: "1 second",
          orElse: () => Effect.die("Atomic admission did not start"),
        }),
      )
      const shutdown = yield* work.close.pipe(Effect.forkChild)
      yield* Effect.yieldNow
      expect(yield* Deferred.isDone(committed)).toBeFalse()
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(shutdown).pipe(
        Effect.timeoutOrElse({
          duration: "1 second",
          orElse: () => Effect.die("Shutdown did not finish after admission committed"),
        }),
      )
      yield* Fiber.await(admission)
      expect(yield* Deferred.isDone(committed)).toBeTrue()
    }),
  )
})
