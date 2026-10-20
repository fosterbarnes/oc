export * as State from "./state"

import { Context, Effect, Scope, Semaphore } from "effect"

/**
 * A replayable transform applied to a draft during reload.
 *
 * Domain drafts expose readable and writable state while preserving concise
 * plugin/config code. Transforms may perform Effects before returning.
 */
type TransformCallback<DraftApi> = (draft: DraftApi) => Effect.Effect<void> | void
export type MakeDraft<State, DraftApi> = (state: State) => DraftApi

export interface Registration {
  readonly dispose: Effect.Effect<void>
}

export type Transform<DraftApi> = (
  transform: TransformCallback<DraftApi>,
) => Effect.Effect<Registration, never, Scope.Scope>

export type Reload = () => Effect.Effect<void>

export interface Transformable<DraftApi> {
  readonly transform: Transform<DraftApi>
  readonly reload: Reload
}

const CurrentBatch = Context.Reference<Set<Reload> | undefined>("@opencode/State/CurrentBatch", {
  defaultValue: () => undefined,
})

/** flush: false is terminal teardown: states whose transforms are removed skip their pending reloads. */
export function batch<A, E, R>(effect: Effect.Effect<A, E, R>, options: { readonly flush?: boolean } = {}) {
  return Effect.gen(function* () {
    const flush = options.flush !== false
    const current = yield* CurrentBatch
    if (current && flush) return yield* effect
    const reloads = new Set<Reload>()
    const result = yield* effect.pipe(Effect.provideService(CurrentBatch, reloads))
    if (flush) yield* Effect.forEach(reloads, (reload) => reload(), { discard: true })
    return result
  })
}

export interface Options<State, DraftApi> {
  /** Creates the base value for initial state and every scoped-transform reload. */
  readonly initial: () => State
  /** Wraps mutable state in a domain-specific draft API. */
  readonly draft: MakeDraft<State, DraftApi>
  /**
   * Runs after the rebuilt state becomes visible. Update events published here
   * act as read barriers: subscribers refetching on the event observe the
   * committed state.
   */
  readonly finalize?: (draft: DraftApi) => Effect.Effect<void>
}

export interface Interface<State, DraftApi> extends Transformable<DraftApi> {
  readonly get: () => State
  /**
   * Registers and applies a scoped transform. Closing the owning Scope removes
   * the transform and reloads the materialized state.
   */
}

export function create<State, DraftApi>(options: Options<State, DraftApi>): Interface<State, DraftApi> {
  let state = options.initial()
  let transforms: { run: TransformCallback<DraftApi> }[] = []
  const semaphore = Semaphore.makeUnsafe(1)

  const commit = Effect.fn("State.commit")(function* (next: State) {
    state = next
    if (options.finalize) yield* options.finalize(options.draft(next))
  })

  const apply = (transform: TransformCallback<DraftApi>, draft: DraftApi) =>
    Effect.suspend(() => {
      const result = transform(draft)
      return Effect.isEffect(result) ? Effect.asVoid(result).pipe(Effect.orDie) : Effect.void
    })

  const materialize = Effect.fnUntraced(function* () {
    const next = options.initial()
    const api = options.draft(next)
    for (const transform of transforms) yield* apply(transform.run, api).pipe(Effect.withSpan("State.reload.update"))
    yield* commit(next)
  })

  const reload = () => semaphore.withPermit(materialize())

  const result: Interface<State, DraftApi> = {
    get: () => state,
    transform: Effect.fn("State.transform")(function* (update) {
      const scope = yield* Scope.Scope
      return yield* Effect.uninterruptible(
        Effect.gen(function* () {
          const transform = { run: update }
          let active = true
          const dispose = Effect.uninterruptible(
            semaphore.withPermit(
              Effect.suspend(() => {
                if (!active) return Effect.void
                active = false
                transforms = transforms.filter((item) => item !== transform)
                return Effect.gen(function* () {
                  const batch = yield* CurrentBatch
                  if (batch) {
                    batch.add(reload)
                    return
                  }
                  yield* materialize()
                })
              }),
            ),
          )
          yield* semaphore.withPermit(
            Effect.sync(() => {
              transforms = [...transforms, transform]
            }),
          )
          yield* Scope.addFinalizer(scope, dispose)
          const batch = yield* CurrentBatch
          if (batch) batch.add(reload)
          else yield* reload()
          return { dispose }
        }),
      )
    }),
    reload,
  }
  return result
}
