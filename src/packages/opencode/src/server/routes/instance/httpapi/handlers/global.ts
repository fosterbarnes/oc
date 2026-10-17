import { Config } from "@/config/config"
import { GlobalBus, type GlobalEvent as GlobalBusEvent } from "@/bus/global"
import { EffectBridge } from "@/effect/bridge"
import { EffectPromise } from "@/effect/promise"
import { EventV2 } from "@opencode-ai/core/event"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Installation } from "@/installation"
import { accountView, POLL_MS, stateView, tickOnce } from "@/provider/claude-code/warmup"
import { checkWarmupCli, killTracker, type ChildTracker } from "@/provider/claude-code/warmup/cli"
import { poolIdsForConfig } from "@/provider/claude-code/warmup/identity"
import { listConnected } from "@/provider/claude-code/warmup/inventory"
import {
  readStore,
  ScheduleValidationError,
  setAccountSchedule,
  storeFile,
  WarmupStoreError,
} from "@/provider/claude-code/warmup/store"
import { disposeAllInstancesAndEmitGlobalDisposed } from "@/server/global-lifecycle"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { ServerLifecycle } from "@/server/lifecycle"
import { ServerShutdown } from "@/server/shutdown"
import { Cause, Effect, Layer, Queue, Result } from "effect"
import * as Stream from "effect/Stream"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { RootHttpApi } from "../api"
import {
  GlobalUpgradeInput,
  ServerLifecycleUnavailable,
  ApiWarmupScheduleError,
  ApiWarmupStoreError,
  type WarmupSetInputType,
} from "../groups/global"
import { notFound } from "../errors"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(data),
  }
}

const subscriberCapacity = 2048

/** Every GlobalBus event. A reader that falls `capacity` events behind fails with
 *  SubscriberOverflowError, which ends its SSE response so the client reconnects and resyncs. */
export function globalEventStream(capacity: number) {
  return Stream.callback<GlobalBusEvent, EventV2.SubscriberOverflowError>(
    (queue) => {
      const handler = (event: GlobalBusEvent) => {
        if (Queue.offerUnsafe(queue, event)) return
        Queue.failCauseUnsafe(queue, Cause.fail(new EventV2.SubscriberOverflowError({ capacity })))
      }
      return Effect.acquireRelease(
        Effect.sync(() => GlobalBus.on("event", handler)),
        () => Effect.sync(() => GlobalBus.off("event", handler)),
      )
    },
    { bufferSize: capacity, strategy: "dropping" },
  )
}

function eventResponse() {
  return Effect.gen(function* () {
    yield* Effect.logInfo("global event connected")
    const events = globalEventStream(subscriberCapacity).pipe(
      Stream.tapError(() =>
        Effect.logWarning("event reader fell behind; closing so it resyncs", { capacity: subscriberCapacity }),
      ),
    )
    const heartbeat = Stream.tick("10 seconds").pipe(
      Stream.drop(1),
      Stream.map(() => ({ payload: { id: EventV2.ID.create(), type: "server.heartbeat", properties: {} } })),
    )

    return HttpServerResponse.stream(
      Stream.make({ payload: { id: EventV2.ID.create(), type: "server.connected", properties: {} } }).pipe(
        Stream.concat(events.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }))),
        Stream.map(eventData),
        Stream.pipeThroughChannel(Sse.encode()),
        Stream.encodeText,
        Stream.ensuring(Effect.logInfo("global event disconnected")),
      ),
      {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      },
    )
  })
}

export const globalHandlers = HttpApiBuilder.group(RootHttpApi, "global", (handlers) =>
  Effect.gen(function* () {
    const config = yield* Config.Service
    const installation = yield* Installation.Service
    const bridge = yield* EffectBridge.make()
    const prepareShutdown = yield* Effect.cached(ServerShutdown.prepare())

    const health = Effect.fn("GlobalHttpApi.health")(function* () {
      if (!ServerLifecycle.isHealthy()) return yield* Effect.die(new Error("Server is draining"))
      return { healthy: true as const, version: InstallationVersion }
    })

    const event = Effect.fn("GlobalHttpApi.event")(function* () {
      return yield* eventResponse()
    })

    const configGet = Effect.fn("GlobalHttpApi.configGet")(function* () {
      return yield* config.getGlobal()
    })

    const configUpdate = Effect.fn("GlobalHttpApi.configUpdate")(function* (ctx) {
      const result = yield* config.updateGlobal(ctx.payload)
      if (result.changed && !Config.isCompactionUpdate(ctx.payload)) {
        bridge.fork(disposeAllInstancesAndEmitGlobalDisposed({ swallowErrors: true }))
      }
      return result.info
    })

    const dispose = Effect.fn("GlobalHttpApi.dispose")(function* () {
      yield* disposeAllInstancesAndEmitGlobalDisposed()
      return true
    })

    const shutdown = Effect.fn("GlobalHttpApi.shutdown")(function* () {
      const controller = ServerLifecycle.getController()
      if (!controller) {
        return yield* new ServerLifecycleUnavailable({
          name: "ServerLifecycleUnavailable",
          data: { message: "Server lifecycle control is only available for a headless server." },
        })
      }
      // Explicit ordering: dispose first, then schedule process exit.
      // HTTP 200 is not a replacement barrier; callers must not assume new server is ready.
      yield* Effect.promise(() => ServerLifecycle.beginShutdown(false))
      yield* prepareShutdown
      yield* Effect.sync(() => setTimeout(controller.shutdown, 0))
      return true
    })

    const restart = Effect.fn("GlobalHttpApi.restart")(function* () {
      const controller = ServerLifecycle.getController()
      if (!controller) {
        return yield* new ServerLifecycleUnavailable({
          name: "ServerLifecycleUnavailable",
          data: { message: "Server lifecycle control is only available for a headless server." },
        })
      }
      // Explicit bounded ordering: disposal completes before replacement is scheduled.
      // The HTTP response is returned before the detached replacement is observable;
      // callers must poll health + live PID rather than treating 200 as happens-before.
      yield* Effect.promise(() => ServerLifecycle.beginShutdown(true))
      yield* prepareShutdown
      yield* Effect.sync(() => setTimeout(controller.restart, 0))
      return true
    })

    const upgrade = Effect.fn("GlobalHttpApi.upgrade")(function* (ctx: { payload: typeof GlobalUpgradeInput.Type }) {      const method = yield* installation.method()
      if (method === "unknown") {
        return HttpServerResponse.jsonUnsafe(
          { success: false as const, error: "Unknown installation method" },
          { status: 400 },
        )
      }
      const target = ctx.payload.target
      const result = yield* installation.upgrade(method, target).pipe(
        Effect.as({ success: true as const, version: target }),
        Effect.catch((err) =>
          Effect.succeed({
            success: false as const,
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
      )
      if (!result.success) return HttpServerResponse.jsonUnsafe(result, { status: 500 })
      GlobalBus.emit("event", {
        directory: "global",
        payload: {
          type: Installation.Event.Updated.type,
          properties: { version: target },
        },
      })
      return HttpServerResponse.jsonUnsafe(result)
    })

    const warmupPool = Effect.fnUntraced(function* () {
      const global = yield* config.getGlobal()
      const options = global.provider?.["claude-code"]?.options as
        | { accounts?: unknown; cliPath?: unknown }
        | undefined
      return {
        poolIds: poolIdsForConfig(options?.accounts),
        cliPath:
          typeof options?.cliPath === "string" && options.cliPath ? options.cliPath : (process.env.CLAUDE_CLI_PATH ?? "claude"),
      }
    })

    const claudeWarmup = Effect.fn("GlobalHttpApi.claudeWarmup")(function* () {
      const pool = yield* warmupPool()
      const cli = yield* Effect.tryPromise(() => checkWarmupCli(pool.cliPath)).pipe(
        Effect.orElseSucceed(() => ({ available: false as const, error: "Claude CLI check failed" })),
      )
      const store = readStore(storeFile())
      if (store.status === "malformed") {
        return stateView({
          poolIds: pool.poolIds,
          connectedIds: [],
          store,
          available: cli.available,
          error: store.error,
        })
      }
      // Without a supported CLI there is nothing to probe with; report the
      // update requirement instead of spawning a binary that cannot serve it.
      if (!cli.available) {
        return stateView({
          poolIds: pool.poolIds,
          connectedIds: [],
          store,
          available: false,
          error: cli.error,
        })
      }
      const inventory = yield* Effect.tryPromise(() =>
        listConnected({ cliPath: pool.cliPath, candidates: pool.poolIds }),
      ).pipe(Effect.orElseSucceed(() => ({ at: Date.now(), connectedIds: [] as string[], error: "account probe failed" })))
      return stateView({
        poolIds: pool.poolIds,
        connectedIds: inventory.connectedIds,
        store,
        available: true,
        error: inventory.error,
      })
    })

    const setClaudeWarmup = Effect.fn("GlobalHttpApi.setClaudeWarmup")(function* (ctx: {
      payload: WarmupSetInputType
    }) {
      const pool = yield* warmupPool()
      if (!pool.poolIds.includes(ctx.payload.accountID)) {
        return yield* notFound(`Unknown Claude account ${ctx.payload.accountID}`)
      }
      const record = yield* EffectPromise.refineRejection(
        () =>
          setAccountSchedule({
            file: storeFile(),
            accountID: ctx.payload.accountID,
            enabled: ctx.payload.enabled,
            schedule: ctx.payload.schedule,
          }),
        (cause) => {
          if (cause instanceof ScheduleValidationError) {
            return new ApiWarmupScheduleError({ name: "WarmupScheduleError", data: { message: cause.message } })
          }
          if (cause instanceof WarmupStoreError) {
            return new ApiWarmupStoreError({ name: "WarmupStoreError", data: { message: cause.message } })
          }
          return undefined
        },
      )
      return accountView({ accountID: ctx.payload.accountID, record, now: Date.now() })
    })

    return handlers
      .handle("health", health)
      .handleRaw("event", event)
      .handle("configGet", configGet)
      .handle("configUpdate", configUpdate)
      .handle("dispose", dispose)
      .handle("shutdown", shutdown)
      .handle("restart", restart)
      .handle("upgrade", upgrade)
      .handle("claudeWarmup", claudeWarmup)
      .handle("setClaudeWarmup", setClaudeWarmup)
  }),
)

// Listener-owned scheduler. This layer is merged only into the real listener
// layer (server.ts), never into handler construction, so building
// webHandler/OpenAPI/Codegen layers or test layers schedules nothing. It runs
// in the listener scope: scope close interrupts the loop, aborts in-flight
// auth/sends, and stops only this loop's children. Config resolves to the
// same service instance the HttpApi graph uses (identical node compilations
// share one build under the listener memoMap), so the loop reads the normal
// cached global config with the normal invalidation path: no second instance,
// no per-tick reload. The first iteration only establishes the watermark and
// overdue slots are never drained. With no enabled schedules the tick reads
// one small file and probes nothing.
export type WarmupLoopClock = {
  /** Wall clock for watermarking and tick windows; defaults to `Date.now`. */
  now: () => number
}

function tickAbortSignal(controller: AbortController, interrupt: AbortSignal): AbortSignal {
  return AbortSignal.any([controller.signal, interrupt])
}

export const makeWarmupLoop = (pollMs: number, clock?: WarmupLoopClock) => Effect.gen(function* () {
  const config = yield* Config.Service
  const owned: ChildTracker = new Set()
  const controller = new AbortController()
  const nowMs = clock?.now ?? Date.now
  yield* Effect.addFinalizer(() =>
    Effect.sync(() => {
      controller.abort()
      killTracker(owned)
    }),
  )
  let prev = nowMs()
  yield* Effect.forkScoped(
    Effect.forever(
      Effect.sleep(pollMs).pipe(
        Effect.andThen(
          Effect.gen(function* () {
            const now = nowMs()
            const global = yield* config.getGlobal()
            const options = global.provider?.["claude-code"]?.options as
              | { accounts?: unknown; cliPath?: unknown }
              | undefined
            yield* Effect.tryPromise((interrupt) =>
              tickOnce({
                file: storeFile(),
                prevMs: prev,
                nowMs: now,
                poolIds: poolIdsForConfig(options?.accounts),
                cliPath:
                  typeof options?.cliPath === "string" && options.cliPath
                    ? options.cliPath
                    : (process.env.CLAUDE_CLI_PATH ?? "claude"),
                signal: tickAbortSignal(controller, interrupt),
                tracker: owned,
                clock: nowMs,
                // Current membership reread at the send boundary, not the
                // tick's snapshot: a removed account stops immediately.
                getPoolIds: async () => {
                  const fresh = await Effect.runPromise(config.getGlobal())
                  return poolIdsForConfig(
                    (fresh.provider?.["claude-code"]?.options as { accounts?: unknown } | undefined)?.accounts,
                  )
                },
              }),
            ).pipe(
              Effect.catchCause((cause) =>
                Result.isSuccess(Cause.findInterrupt(cause))
                  ? Effect.failCause(cause)
                  : Effect.logWarning("claude warm-up tick failed", { cause: String(cause) }),
              ),
            )
            prev = now
          }),
        ),
      ),
    ),
  )
})

export const warmupLoopLayer = Layer.effectDiscard(makeWarmupLoop(POLL_MS)).pipe(
  Layer.provide(AppNodeBuilder.build(Config.node)),
)
