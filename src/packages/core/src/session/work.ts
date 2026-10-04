import { Context, Effect, Exit, Fiber, Layer, Scope } from "effect"
import { makeGlobalNode } from "../effect/app-node"

export interface Interface {
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
  readonly close: Effect.Effect<void>
}

/** Process-local admission and cancellation boundary shared by all Session execution paths. */
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionWork") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const scope = yield* Scope.make("parallel")
    const close = yield* Effect.cached(Scope.close(scope, Exit.void).pipe(Effect.uninterruptible))
    yield* Effect.addFinalizer(() => close)

    return Service.of({
      run: (effect) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            if (scope.state._tag === "Closed") return yield* Effect.interrupt
            const fiber = yield* restore(effect).pipe(Effect.forkIn(scope))
            const exit = yield* restore(Fiber.await(fiber)).pipe(Effect.onInterrupt(() => Fiber.interrupt(fiber)))
            return yield* exit
          }),
        ),
      close,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
export * as SessionWork from "./work"
