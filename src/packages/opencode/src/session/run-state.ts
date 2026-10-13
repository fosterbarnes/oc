import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { InstanceState } from "@/effect/instance-state"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Runner } from "@/effect/runner"
import { BackgroundJob } from "@/background/job"
import { Deferred, Effect, Exit, Fiber, Latch, Layer, Scope, Context } from "effect"
import { Session } from "./session"
import { SessionID } from "./schema"
import { SessionStatus } from "./status"
import { Flock } from "@opencode-ai/core/util/flock"
import { SessionWork } from "@opencode-ai/core/session/work"

export interface Interface {
  readonly completion: (sessionID: SessionID) => Effect.Effect<Effect.Effect<boolean>>
  readonly maintenance: <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | Session.BusyError, R>
  readonly assertAvailable: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError>
  readonly cancellation: (sessionID: SessionID) => Effect.Effect<number>
  readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError>
  /** Waits out maintenance holding the session; a running turn is not waited on here (new turns coalesce). */
  readonly available: (sessionID: SessionID) => Effect.Effect<void>
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly ensureRunning: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<SessionV1.WithParts>,
    work: Effect.Effect<SessionV1.WithParts>,
  ) => Effect.Effect<SessionV1.WithParts>
  readonly startShell: (
    sessionID: SessionID,
    onInterrupt: Effect.Effect<SessionV1.WithParts>,
    work: Effect.Effect<SessionV1.WithParts>,
    ready?: Latch.Latch,
  ) => Effect.Effect<SessionV1.WithParts, Session.BusyError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionRunState") {}

export function successfulTurn(result: SessionV1.WithParts) {
  return result.info.role === "assistant" && !result.info.error &&
    typeof result.info.finish === "string" && result.info.finish.length > 0 &&
    !["tool-calls", "unknown", "error", "content-filter"].includes(result.info.finish)
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const background = yield* BackgroundJob.Service
    const status = yield* SessionStatus.Service
    const workBoundary = yield* SessionWork.Service
    // Maintenance gate per session; completes when maintenance releases the session.
    const held = new Map<SessionID, Deferred.Deferred<void>>()
    const cancellations = new Map<SessionID, number>()
    const assertAvailable = (sessionID: SessionID) => held.has(sessionID) ? Effect.fail(busyError(sessionID)) : Effect.void
    const available = (sessionID: SessionID): Effect.Effect<void> =>
      Effect.suspend(() => {
        const gate = held.get(sessionID)
        if (!gate) return Effect.void
        return Deferred.await(gate).pipe(Effect.andThen(available(sessionID)))
      })

    const state = yield* InstanceState.make(
      Effect.fn("SessionRunState.state")(function* () {
        const scope = yield* Scope.Scope
        const runners = new Map<SessionID, Runner.Runner<SessionV1.WithParts>>()
        yield* Effect.addFinalizer(
          Effect.fnUntraced(function* () {
            yield* Effect.forEach(runners.values(), (runner) => runner.cancel, {
              concurrency: "unbounded",
              discard: true,
            })
            runners.clear()
          }),
        )
        return { runners, scope }
      }),
    )

    const runner = Effect.fn("SessionRunState.runner")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
    ) {
      const data = yield* InstanceState.get(state)
      yield* assertAvailable(sessionID).pipe(Effect.orDie)
      const existing = data.runners.get(sessionID)
      if (existing) return existing
      const next = Runner.make<SessionV1.WithParts>(data.scope, {
        onIdle: Effect.gen(function* () {
          data.runners.delete(sessionID)
          yield* status.set(sessionID, { type: "idle" })
        }),
        onBusy: status.set(sessionID, { type: "busy" }),
        onInterrupt,
      })
      data.runners.set(sessionID, next)
      return next
    })

    const assertNotBusy = Effect.fn("SessionRunState.assertNotBusy")(function* (sessionID: SessionID) {
      yield* assertAvailable(sessionID)
      const data = yield* InstanceState.get(state)
      const existing = data.runners.get(sessionID)
      if (existing?.busy) yield* busyError(sessionID)
    })

    const cancel = Effect.fn("SessionRunState.cancel")(function* (sessionID: SessionID) {
      cancellations.set(sessionID, (cancellations.get(sessionID) ?? 0) + 1)
      yield* cancelBackgroundJobs(background, sessionID)
      const data = yield* InstanceState.get(state)
      const existing = data.runners.get(sessionID)
      if (!existing) {
        yield* status.set(sessionID, { type: "idle" })
        return
      }
      yield* existing.cancel
    })

    // Usually nested inside an admitted prompt, which keeps maintenance out. A queue wake that lands during
    // this project's reload fails its turn rather than run on the instance the reload replaces.
    const admitted = (sessionID: SessionID, work: Effect.Effect<SessionV1.WithParts>) =>
      InstanceState.context.pipe(
        Effect.flatMap((ctx) => workBoundary.run(ctx.directory, owned(sessionID, work))),
        Effect.orDie,
      )

    const ensureRunning = Effect.fn("SessionRunState.ensureRunning")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
      work: Effect.Effect<SessionV1.WithParts>,
    ) {
      return yield* (yield* runner(sessionID, onInterrupt)).ensureRunning(admitted(sessionID, work))
    })

    const startShell = Effect.fn("SessionRunState.startShell")(function* (
      sessionID: SessionID,
      onInterrupt: Effect.Effect<SessionV1.WithParts>,
      work: Effect.Effect<SessionV1.WithParts>,
      ready?: Latch.Latch,
    ) {
      return yield* (yield* runner(sessionID, onInterrupt))
        .startShell(admitted(sessionID, work), ready)
        .pipe(Effect.catchTag("RunnerBusy", () => Effect.fail(busyError(sessionID))))
    })

    const completion = Effect.fn("SessionRunState.completion")(function* (sessionID: SessionID) {
      const data = yield* InstanceState.get(state)
      const current = data.runners.get(sessionID)?.state
      if (!current || current._tag === "Idle") return Effect.succeed(true)
      if (current._tag === "Running") return Fiber.await(current.run.fiber).pipe(
        Effect.map((exit) => Exit.isSuccess(exit) && successfulTurn(exit.value)),
      )
      if (current._tag === "ShellThenRun") return Deferred.await(current.run.done).pipe(
        Effect.map(successfulTurn),
        Effect.catchCause(() => Effect.succeed(false)),
      )
      return Effect.gen(function* () {
        const exit = yield* Fiber.await(current.shell.fiber)
        return Exit.isSuccess(exit) && !(yield* Deferred.isDone(current.shell.cancelled))
      })
    })
    const maintenance: Interface["maintenance"] = (sessionID, effect) => Effect.gen(function* () {
      yield* assertNotBusy(sessionID)
      return yield* Effect.acquireUseRelease(
        Effect.suspend(() => {
          if (held.has(sessionID)) return Effect.fail(busyError(sessionID))
          return Deferred.make<void>().pipe(Effect.tap((gate) => Effect.sync(() => held.set(sessionID, gate))))
        }),
        () => effect,
        (gate) => Effect.sync(() => held.delete(sessionID)).pipe(Effect.andThen(Deferred.succeed(gate, undefined)), Effect.asVoid),
      )
    })
    return Service.of({ assertNotBusy, assertAvailable, available, completion, maintenance, cancel, ensureRunning, startShell,
      cancellation: (sessionID) => Effect.sync(() => cancellations.get(sessionID) ?? 0),
    })
  }),
)

const cancelBackgroundJobs = Effect.fn("SessionRunState.cancelBackgroundJobs")(function* (
  background: BackgroundJob.Interface,
  sessionID: SessionID,
) {
  const jobs = yield* background.list()
  const pending = new Set<string>([sessionID])
  const cancelled = new Set<string>()
  const matches = (job: BackgroundJob.Info) => {
    if (job.status !== "running") return false
    if (cancelled.has(job.id)) return false
    if (pending.has(job.id)) return true
    if (typeof job.metadata?.sessionId === "string" && pending.has(job.metadata.sessionId)) return true
    return typeof job.metadata?.parentSessionId === "string" && pending.has(job.metadata.parentSessionId)
  }
  let batch = jobs.filter(matches)
  while (batch.length > 0) {
    yield* Effect.forEach(
      batch,
      (job) =>
        background.cancel(job.id).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              cancelled.add(job.id)
              pending.add(job.id)
              if (typeof job.metadata?.sessionId === "string") pending.add(job.metadata.sessionId)
            }),
          ),
        ),
      { concurrency: "unbounded", discard: true },
    )
    batch = jobs.filter(matches)
  }
})

/** Defect raised when another oc process holds the session lock; callers show `message` as is. */
export class HeldElsewhereError extends Error {
  override readonly name = "HeldElsewhereError"
}

// Cross-process guard so the resident server and a native `opencode` window never drive the same session at once.
// Held only while work runs; a crashed holder goes stale once its heartbeat stops.
function owned<A>(sessionID: SessionID, work: Effect.Effect<A>) {
  return Effect.acquireRelease(
    Effect.tryPromise({
      try: (signal) => Flock.acquire(`session:${sessionID}`, { timeoutMs: 0, staleMs: 15_000, signal }),
      catch: (cause) => cause instanceof Flock.ContentionError
        ? new HeldElsewhereError("Session is running in another oc process", { cause })
        : cause,
    }).pipe(Effect.orDie),
    (lock) => Effect.promise(() => lock.release().catch(() => undefined)),
  ).pipe(Effect.andThen(work), Effect.scoped)
}

function busyError(sessionID: SessionID) {
  return new Session.BusyError({ sessionID })
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [BackgroundJob.node, SessionStatus.node, SessionWork.node],
})

export * as SessionRunState from "./run-state"
