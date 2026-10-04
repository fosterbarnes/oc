import { Auth } from "@/auth"

import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { RootHttpApi } from "../api"
import { LogInput } from "../groups/control"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { loadPersistedDebug, persistedDebug, setPersistedDebug } from "@opencode-ai/core/observability/logging"

export const controlHandlers = HttpApiBuilder.group(RootHttpApi, "control", (handlers) =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service

    const authSet = Effect.fn("ControlHttpApi.authSet")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: Auth.Info
    }) {
      yield* auth.set(ctx.params.providerID, ctx.payload).pipe(Effect.orDie)
      return true
    })

    const authRemove = Effect.fn("ControlHttpApi.authRemove")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
    }) {
      yield* auth.remove(ctx.params.providerID).pipe(Effect.orDie)
      return true
    })

    const log = Effect.fn("ControlHttpApi.log")(function* (ctx: { payload: typeof LogInput.Type }) {
      const write =
        ctx.payload.level === "debug"
          ? Effect.logDebug
          : ctx.payload.level === "info"
            ? Effect.logInfo
            : ctx.payload.level === "warn"
              ? Effect.logWarning
              : Effect.logError
      const extra = ctx.payload.extra ?? {}
      yield* write(ctx.payload.message).pipe(
        Effect.annotateLogs({
          ...extra,
          channel: typeof extra.channel === "string" ? extra.channel : "tui",
        }),
      )
      return true
    })

    const debugLoggingGet = Effect.fn("ControlHttpApi.debugLoggingGet")(function* () {
      return { enabled: persistedDebug() || loadPersistedDebug() }
    })

    const debugLoggingSet = Effect.fn("ControlHttpApi.debugLoggingSet")(function* (ctx: {
      payload: { enabled: boolean }
    }) {
      return { enabled: setPersistedDebug(ctx.payload.enabled) }
    })

    return handlers
      .handle("authSet", authSet)
      .handle("authRemove", authRemove)
      .handle("log", log)
      .handle("debugLoggingGet", debugLoggingGet)
      .handle("debugLoggingSet", debugLoggingSet)
  }),
)
