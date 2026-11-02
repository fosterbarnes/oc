import { ProviderAuth } from "@/provider/auth"
import { Config } from "@/config/config"
import { ModelsDev } from "@opencode-ai/core/models-dev"
import { Provider } from "@/provider/provider"
import { Auth } from "@/auth"

import { mapValues, pickBy } from "remeda"
import { Effect, Schema } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ProviderAuthApiError } from "../groups/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { getUsageSnapshot } from "@/provider/usage-observations"
import { ClaudeAgentCatalog } from "@/provider/claude-agent/catalog"
import { CLAUDE_AGENT_PROVIDER_ID } from "@/provider/claude-agent/id"

// Prices come from the models.dev provider the saved login bills through.
const claudeAgentInfo = Effect.fnUntraced(function* (all: Record<string, ModelsDev.Provider>) {
  const saved = yield* ClaudeAgentCatalog.read()
  const source = saved.priceSource ? all[saved.priceSource] : undefined
  return ClaudeAgentCatalog.info(saved, source ? { [source.id]: Provider.fromModelsDevProvider(source) } : {})
})

function mapProviderAuthError<A, R>(self: Effect.Effect<A, ProviderAuth.Error, R>) {
  return self.pipe(
    Effect.mapError((error) => {
      if (error instanceof ProviderAuth.OauthMissing) {
        return new ProviderAuthApiError({ name: error._tag, data: { providerID: error.providerID } })
      }
      if (error instanceof ProviderAuth.OauthCodeMissing) {
        return new ProviderAuthApiError({ name: error._tag, data: { providerID: error.providerID } })
      }
      if (error instanceof ProviderAuth.OauthCallbackFailed) {
        return new ProviderAuthApiError({ name: error._tag, data: {} })
      }
      if (error instanceof ProviderAuth.ValidationFailed) {
        return new ProviderAuthApiError({ name: error._tag, data: { field: error.field, message: error.message } })
      }
      return new ProviderAuthApiError({ name: "BadRequest", data: {} })
    }),
  )
}

export const providerHandlers = HttpApiBuilder.group(InstanceHttpApi, "provider", (handlers) =>
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const provider = yield* Provider.Service
    const svc = yield* ProviderAuth.Service
    const authStore = yield* Auth.Service

    // models.dev providers allowed by enabled/disabled_providers, with loaded providers layered on
    // top (same key order as Object.assign). Shared by `list` and `summary`.
    const selectProviders = Effect.fnUntraced(function* () {
      const config = yield* cfg.get()
      const all = yield* ModelsDev.Service.use((s) => s.get())
      const disabled = new Set(config.disabled_providers ?? [])
      const enabled = config.enabled_providers ? new Set(config.enabled_providers) : undefined
      const filtered: Record<string, (typeof all)[string]> = {}
      for (const [key, value] of Object.entries(all)) {
        if ((enabled ? enabled.has(key) : true) && !disabled.has(key)) filtered[key] = value
      }
      const loaded = yield* provider.list()
      const credentials = yield* authStore.all().pipe(Effect.orDie)
      // oc: Claude Agent is not on models.dev; list it so /connect can offer its login.
      const allowed =
        (enabled ? enabled.has(CLAUDE_AGENT_PROVIDER_ID) : true) && !disabled.has(CLAUDE_AGENT_PROVIDER_ID)
      const claudeAgent = allowed && !(CLAUDE_AGENT_PROVIDER_ID in loaded) ? yield* claudeAgentInfo(all) : undefined
      const extra = claudeAgent ? { [claudeAgent.id]: claudeAgent } : {}
      const ids = [...new Set([...Object.keys(filtered), ...Object.keys(extra), ...Object.keys(loaded)])]
      return { filtered, extra, loaded, connected: ids.filter((id) => id in loaded || credentials[id]) }
    })

    const list = Effect.fn("ProviderHttpApi.list")(function* () {
      const selected = yield* selectProviders()
      const providers = Object.assign(
        mapValues(selected.filtered, (item) => Provider.fromModelsDevProvider(item)),
        selected.extra,
        selected.loaded,
      )
      return {
        all: Object.values(providers).map(Provider.toPublicInfo),
        // Before its first login check Claude Agent has no models, so no default.
        default: Provider.defaultModelIDs(pickBy(providers, (item) => Object.keys(item.models).length > 0)),
        connected: selected.connected,
      }
    })

    const summary = Effect.fn("ProviderHttpApi.summary")(function* () {
      const selected = yield* selectProviders()
      const providers: Record<string, { id: string; name: string }> = {
        ...selected.filtered,
        ...selected.extra,
        ...selected.loaded,
      }
      return {
        all: Object.values(providers).map((item) => ({ id: item.id, name: item.name })),
        connected: selected.connected,
      }
    })

    const auth = Effect.fn("ProviderHttpApi.auth")(function* () {
      return yield* svc.methods()
    })

    const usage = Effect.fn("ProviderHttpApi.usage")(function* () {
      return getUsageSnapshot()
    })

    const authorize = Effect.fn("ProviderHttpApi.authorize")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: ProviderAuth.AuthorizeInput
    }) {
      return yield* mapProviderAuthError(
        svc.authorize({
          providerID: ctx.params.providerID,
          method: ctx.payload.method,
          inputs: ctx.payload.inputs,
        }),
      )
    })

    const authorizeRaw = Effect.fn("ProviderHttpApi.authorizeRaw")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      const payload = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ProviderAuth.AuthorizeInput))(body).pipe(
        Effect.mapError(() => new ProviderAuthApiError({ name: "BadRequest", data: {} })),
      )
      // Match legacy route behavior: when authorize() resolves without a
      // result (e.g. no further redirect), serialize as JSON `null` instead
      // of an empty body so clients can `.json()` parse the response.
      const result = yield* authorize({ params: ctx.params, payload })
      return HttpServerResponse.jsonUnsafe(result ?? null)
    })

    const callback = Effect.fn("ProviderHttpApi.callback")(function* (ctx: {
      params: { providerID: ProviderV2.ID }
      payload: ProviderAuth.CallbackInput
    }) {
      yield* mapProviderAuthError(
        svc.callback({
          providerID: ctx.params.providerID,
          method: ctx.payload.method,
          code: ctx.payload.code,
        }),
      )
      return true
    })

    return handlers
      .handle("list", list)
      .handle("summary", summary)
      .handle("auth", auth)
      .handle("usage", usage)
      .handleRaw("authorize", authorizeRaw)
      .handle("callback", callback)
  }),
)
