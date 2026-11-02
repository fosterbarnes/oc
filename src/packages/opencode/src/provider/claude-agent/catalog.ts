import type { AccountInfo } from "@anthropic-ai/claude-agent-sdk"
import { Effect, Option, Schema } from "effect"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import type { Provider } from "@/provider/provider"
import type { ClaudeProbe } from "./upstream/claude/probe.js"
import { CLAUDE_AGENT_PROVIDER_ID } from "./id"
import { ClaudeAgentStorage } from "./storage"

// Ported from upstream `provider.ts`: the model list Claude Code reports, kept between starts so oc can
// list models and prices without running `claude`.

export const NPM = "@opencode-ai/claude-agent"
export const NAME = "Claude Agent"

const CatalogModel = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  efforts: Schema.Array(Schema.String),
  contextWindow: Schema.optionalKey(Schema.Number),
  resolvedModel: Schema.optionalKey(Schema.String),
})
type CatalogModel = typeof CatalogModel.Type
const Catalog = Schema.Struct({
  priceSource: Schema.optionalKey(Schema.String),
  models: Schema.Array(CatalogModel),
})
type Catalog = typeof Catalog.Type
const CATALOG_KEY = "models"
// opencode's context size when Claude does not report one
const DEFAULT_CONTEXT = 200_000

// Mantle is Bedrock serving Anthropic's API, and opencode drops most of its `anthropic.…` IDs from Bedrock's list,
// so it uses Anthropic's prices.
const PRICE_SOURCES: Partial<Record<NonNullable<AccountInfo["apiProvider"]>, string>> = {
  firstParty: "anthropic",
  anthropicAws: "anthropic",
  anthropicGoogleCloud: "anthropic",
  mantle: "anthropic",
  bedrock: "amazon-bedrock",
  vertex: "google-vertex",
  foundry: "azure",
}

export const read = Effect.fn("ClaudeAgentCatalog.read")(function* () {
  const saved = Schema.decodeUnknownOption(Catalog)(yield* ClaudeAgentStorage.get(CATALOG_KEY))
  return Option.getOrElse(saved, (): Catalog => ({ models: [] }))
})

// Saves what a probe or a chat's new process reported. Returns whether the list changed.
export const update = Effect.fn("ClaudeAgentCatalog.update")(function* (
  probe: ClaudeProbe.Result,
  baseURL: string | undefined,
) {
  const current = yield* read()
  const source = priceSource(probe.account, baseURL)
  const next: Catalog = {
    ...(source ? { priceSource: source } : {}),
    models: fromClaude(probe.models, current.models),
  }
  if (JSON.stringify(next) === JSON.stringify(current)) return false
  yield* ClaudeAgentStorage.set(CATALOG_KEY, next)
  return true
})

// `catalog` is the models.dev provider list, used for the login's prices.
export function info(saved: Catalog, catalog: Record<string, Provider.Info>): Provider.Info {
  const prices = saved.priceSource ? catalog[saved.priceSource]?.models : undefined
  return {
    id: ProviderV2.ID.make(CLAUDE_AGENT_PROVIDER_ID),
    name: NAME,
    source: "custom",
    env: [],
    options: {},
    models: Object.fromEntries(saved.models.map((model) => [model.id, toModel(model, prices)])),
  }
}

// Context windows only come from the full check, so a chat's startup report keeps the saved ones.
function fromClaude(models: readonly ClaudeProbe.Model[], saved: readonly CatalogModel[]): CatalogModel[] {
  const known = new Map(saved.map((model) => [model.id, model.contextWindow]))
  // "default" follows Claude Code's own default, which can change under a running oc session
  return models
    .filter((model) => model.value !== "default")
    .map((model) => {
      const contextWindow = model.contextWindow ?? known.get(model.value)
      return {
        id: model.value,
        name: model.displayName,
        efforts: model.supportedEffortLevels ?? [],
        ...(contextWindow !== undefined ? { contextWindow } : {}),
        ...(model.resolvedModel !== undefined ? { resolvedModel: model.resolvedModel } : {}),
      }
    })
}

// A subscription covers usage, and a custom base URL or an enterprise gateway can bill anything, so they show no cost.
function priceSource(account: AccountInfo, baseURL: string | undefined) {
  if (baseURL) return
  if (account.apiProvider === undefined) return
  if (account.apiProvider === "firstParty" && account.apiKeySource === undefined) return
  return PRICE_SOURCES[account.apiProvider]
}

function toModel(model: CatalogModel, prices: Record<string, Provider.Model> | undefined): Provider.Model {
  // The 1M context version's price tiers are on the base model
  const id = (model.resolvedModel ?? model.id).replace(/\[1m\]$/, "")
  // Mantle names models `anthropic.claude-…`, and Vertex lists current models as `claude-…@default`
  const priced = prices?.[id] ?? prices?.[id.replace(/^anthropic\./, "")] ?? prices?.[`${id}@default`]
  return {
    id: ModelV2.ID.make(model.id),
    providerID: ProviderV2.ID.make(CLAUDE_AGENT_PROVIDER_ID),
    api: { id: model.id, url: "", npm: NPM },
    name: model.name,
    // oc picks the title model by family (Provider.getSmallModel).
    ...(model.id.includes("haiku") ? { family: "claude-haiku" } : {}),
    capabilities: {
      temperature: false,
      reasoning: model.efforts.length > 0,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: true, video: false, pdf: true },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: priced?.cost ?? { input: 0, output: 0, cache: { read: 0, write: 0 } },
    // The SDK reports context windows before a prompt, but not output limits. 0 means unknown in oc.
    limit: { context: model.contextWindow ?? DEFAULT_CONTEXT, output: 0 },
    status: "active",
    options: {},
    headers: {},
    release_date: "",
    variants: Object.fromEntries(model.efforts.map((effort) => [effort, { effort }])),
  }
}

export * as ClaudeAgentCatalog from "./catalog"
