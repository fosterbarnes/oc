import { describe, expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { SessionWork } from "@opencode-ai/core/session/work"
import { testEffect } from "./lib/effect"

const it = testEffect(SessionWork.layer)

describe("SessionWork maintenance", () => {
  it.live("refuses maintenance while work is active and allows it after the work ends", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const started = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const active = yield* work
        .run("a", Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(finish))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const refused = yield* work.maintain("a", Effect.succeed("ran")).pipe(Effect.flip)
      expect(refused._tag).toBe("SessionWorkBusyError")
      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.await(active)
      expect(yield* work.maintain("a", Effect.succeed("ran"))).toBe("ran")
    }),
  )

  it.live("counts a nested run that outlives its parent until it ends", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const nestedStarted = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const nested = yield* work.run(
        "a",
        Effect.forkDetach(
          work.run("a", Deferred.succeed(nestedStarted, undefined).pipe(Effect.andThen(Deferred.await(finish)))),
        ),
      )
      yield* Deferred.await(nestedStarted)
      expect((yield* work.maintain("a", Effect.succeed("ran")).pipe(Effect.flip))._tag).toBe("SessionWorkBusyError")
      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.await(nested)
      expect(yield* work.maintain("a", Effect.succeed("ran"))).toBe("ran")
    }),
  )

  it.live("refuses new admissions and a second maintenance for its key while maintenance runs", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const maintenanceStarted = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const maintaining = yield* work
        .maintain("a", Deferred.succeed(maintenanceStarted, undefined).pipe(Effect.andThen(Deferred.await(release))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(maintenanceStarted)
      expect((yield* work.maintain("a", Effect.void).pipe(Effect.flip))._tag).toBe("SessionWorkBusyError")
      expect((yield* work.run("a", Effect.die("must not run")).pipe(Effect.flip))._tag).toBe("SessionWorkBusyError")
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.await(maintaining)
      expect(yield* work.run("a", Effect.succeed("admitted"))).toBe("admitted")
    }),
  )

  it.live("keeps keys independent: work in one project neither blocks nor waits on another's maintenance", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const started = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const busy = yield* work
        .run("b", Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(finish))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const maintenanceStarted = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const maintaining = yield* work
        .maintain("a", Deferred.succeed(maintenanceStarted, undefined).pipe(Effect.andThen(Deferred.await(release))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(maintenanceStarted)
      expect(yield* work.run("b", Effect.succeed("admitted"))).toBe("admitted")
      yield* Deferred.succeed(release, undefined)
      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.await(maintaining)
      yield* Fiber.await(busy)
    }),
  )

  it.live("reopens admissions when the maintenance effect dies", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      yield* work.maintain("a", Effect.die("reload failed")).pipe(Effect.exit)
      expect(yield* work.run("a", Effect.succeed("admitted"))).toBe("admitted")
    }),
  )
})
