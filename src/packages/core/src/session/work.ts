import { Context, Effect, Exit, Fiber, Layer, Schema, Scope } from "effect"
import { makeGlobalNode } from "../effect/app-node"

// `key` names one project: callers pass its instance directory, so one project's reload never
// blocks another's session work.
export interface Interface {
  readonly run: <A, E, R>(key: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | BusyError, R>
  readonly maintain: <A, E, R>(key: string, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | BusyError, R>
  readonly close: Effect.Effect<void>
}

/** Refused: the project is under maintenance, or (for `maintain`) its session work is active. */
export class BusyError extends Schema.TaggedErrorClass<BusyError>()("SessionWorkBusyError", {}) {}

/** Process-local admission and cancellation boundary shared by all Session execution paths. */
export class Service extends Context.Service<Service, Interface>()("@opencode/SessionWork") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const scope = yield* Scope.make("parallel")
    const close = yield* Effect.cached(Scope.close(scope, Exit.void).pipe(Effect.uninterruptible))
    yield* Effect.addFinalizer(() => close)

    // Admitted runs per key, nested ones included. Maintenance starts only at zero. Checks and counts
    // run synchronously, so no admission can slip between a maintenance check and its start.
    const active = new Map<string, number>()
    const maintaining = new Set<string>()

    const release = (key: string) => {
      const count = (active.get(key) ?? 1) - 1
      if (count === 0) active.delete(key)
      else active.set(key, count)
    }

    const run: Interface["run"] = (key, effect) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          if (scope.state._tag === "Closed") return yield* Effect.interrupt
          // Refuses instead of waiting: a request admitted after maintenance would still hold the
          // instance it resolved before, which the maintenance may have replaced.
          if (maintaining.has(key)) return yield* Effect.fail(new BusyError())
          active.set(key, (active.get(key) ?? 0) + 1)
          const fiber = yield* restore(effect).pipe(Effect.forkIn(scope))
          const exit = yield* restore(Fiber.await(fiber)).pipe(
            Effect.onInterrupt(() => Fiber.interrupt(fiber)),
            // Runs after the fiber has ended, including when this caller is interrupted first.
            Effect.ensuring(Effect.sync(() => release(key))),
          )
          return yield* exit
        }),
      )

    const maintain = <A, E, R>(key: string, effect: Effect.Effect<A, E, R>) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.suspend<A, E | BusyError, R>(() => {
          if (active.has(key) || maintaining.has(key)) return Effect.fail(new BusyError())
          maintaining.add(key)
          return restore(effect).pipe(Effect.ensuring(Effect.sync(() => maintaining.delete(key))))
        }),
      )

    return Service.of({
      run,
      maintain,
      close,
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer, deps: [] })
export * as SessionWork from "./work"
