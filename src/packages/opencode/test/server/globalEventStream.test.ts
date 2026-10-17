import { describe, expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Option, Stream } from "effect"
import { EventV2 } from "@opencode-ai/core/event"
import { GlobalBus } from "../../src/bus/global"
import { globalEventStream } from "../../src/server/routes/instance/httpapi/handlers/global"
import { it, pollWithTimeout } from "../lib/effect"

const emit = (n: number) =>
  GlobalBus.emit("event", { directory: "global", payload: { type: "test.global-stream", properties: { n } } })

describe("global event stream", () => {
  it.live("a reader that falls behind fails with SubscriberOverflowError and releases its listener", () =>
    Effect.gen(function* () {
      const listenersBefore = GlobalBus.listenerCount("event")
      const consuming = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const received: unknown[] = []
      const reader = yield* globalEventStream(2).pipe(
        Stream.runForEach((event) =>
          Effect.sync(() => received.push(event.payload.properties.n)).pipe(
            Effect.andThen(Deferred.succeed(consuming, undefined)),
            Effect.andThen(Deferred.await(release)),
          ),
        ),
        Effect.forkScoped,
      )
      // The GlobalBus listener is registered from a fiber the stream forks.
      yield* pollWithTimeout(
        Effect.sync(() => (GlobalBus.listenerCount("event") > listenersBefore ? true : undefined)),
        "global event stream never subscribed",
      )

      emit(1)
      yield* Deferred.await(consuming)
      for (const n of [2, 3, 4, 5]) emit(n)
      yield* Deferred.succeed(release, undefined)

      const exit = yield* Fiber.await(reader)
      expect(Exit.findErrorOption(exit).pipe(Option.getOrUndefined)).toBeInstanceOf(EventV2.SubscriberOverflowError)
      expect(received).toEqual([1, 2, 3])
      expect(GlobalBus.listenerCount("event")).toBe(listenersBefore)
    }),
  )
})
