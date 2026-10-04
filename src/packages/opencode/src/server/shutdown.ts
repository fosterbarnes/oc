import { Effect, Fiber } from "effect"
import { SessionWork } from "@opencode-ai/core/session/work"
import { disposeAllInstancesAndEmitGlobalDisposed } from "./global-lifecycle"

/** Closes session admission, awaits cancellation cleanup, then disposes instances. */
export const prepare = Effect.fn("ServerShutdown.prepare")(function* () {
  const work = yield* SessionWork.Service
  // close is uninterruptible; await it from a detached fiber so a stuck tool cannot hang exit.
  const closing = yield* Effect.forkDetach(work.close)
  yield* Fiber.await(closing).pipe(
    Effect.timeoutOrElse({
      duration: "30 seconds",
      orElse: () => Effect.logWarning("session work cleanup timed out; continuing shutdown"),
    }),
  )
  yield* disposeAllInstancesAndEmitGlobalDisposed()
})

export * as ServerShutdown from "./shutdown"
