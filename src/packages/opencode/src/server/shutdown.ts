import { Duration, Effect, Fiber } from "effect"
import { SessionWork } from "@opencode-ai/core/session/work"
import { disposeAllInstancesAndEmitGlobalDisposed } from "./global-lifecycle"

/** Closes session admission, awaits cancellation cleanup, then disposes instances. */
export const prepare = Effect.fn("ServerShutdown.prepare")(function* () {
  const work = yield* SessionWork.Service
  yield* drain(work, "30 seconds")
  yield* disposeAllInstancesAndEmitGlobalDisposed()
})

/** Closes session admission and awaits cancellation cleanup, giving up after `timeout`. */
export const drain = Effect.fn("ServerShutdown.drain")(function* (
  work: SessionWork.Interface,
  timeout: Duration.Input,
) {
  // close is uninterruptible; await it from a detached fiber so a stuck tool cannot hang exit.
  const closing = yield* Effect.forkDetach(work.close)
  yield* Fiber.await(closing).pipe(
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.logWarning("session work cleanup timed out; continuing shutdown"),
    }),
  )
})

export * as ServerShutdown from "./shutdown"
