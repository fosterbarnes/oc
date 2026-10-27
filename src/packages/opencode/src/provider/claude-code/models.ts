import type { ModelsDev } from "@opencode-ai/core/models-dev"
import type { OpenCodeModel } from "./opencodeTypes.js"
import { CLAUDE_CODE_PROVIDER_ID } from "./shared.js"

const NPM = "@opencode-ai/claude-code"

const reasoningVariants: Record<string, Record<string, unknown>> = {
  low: { reasoningEffort: "low" },
  medium: { reasoningEffort: "medium" },
  high: { reasoningEffort: "high" },
  xhigh: { reasoningEffort: "xhigh" },
  max: { reasoningEffort: "max" },
}

const baseCapabilities = {
  temperature: false,
  attachment: true,
  toolcall: true,
  input: { text: true, audio: false, image: true, video: false, pdf: false },
  output: { text: true, audio: false, image: false, video: false, pdf: false },
  interleaved: false as const,
}

/**
 * The complete model a user-declared id that this plugin does not know is
 * built on. opencode's config schema makes every model field optional, so a
 * `provider.claude-code.models` entry is usually partial (a name, a limit, a
 * variant); provider state overlays it on this template. Costs are zero
 * because they are unknown, the name is the id, and the window is the 4.5
 * generation's, the conservative choice. The id still passes straight
 * through to `claude --model`.
 */
export function passthroughModel(id: string, providerID = CLAUDE_CODE_PROVIDER_ID): OpenCodeModel {
  return {
    id,
    providerID,
    api: { id, url: "", npm: NPM },
    name: id,
    family: "",
    capabilities: { ...baseCapabilities, reasoning: true },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200_000, output: 64_000 },
    status: "active",
    options: {},
    headers: {},
    release_date: "",
    variants: reasoningVariants,
  }
}

/**
 * Convert an OpenCodeModel to the flat config schema that OpenCode's
 * provider.ts config parser expects (model.temperature, model.reasoning,
 * model.cost.cache_read, model.modalities, etc.).
 */
export function toConfigModel(model: OpenCodeModel): Record<string, unknown> {
  const inputMods: string[] = []
  const outputMods: string[] = []
  for (const [k, v] of Object.entries(model.capabilities.input)) {
    if (v) inputMods.push(k)
  }
  for (const [k, v] of Object.entries(model.capabilities.output)) {
    if (v) outputMods.push(k)
  }

  return {
    id: model.api.id,
    name: model.name,
    status: model.status,
    family: model.family ?? "",
    release_date: model.release_date,

    temperature: model.capabilities.temperature,
    reasoning: model.capabilities.reasoning,
    attachment: model.capabilities.attachment,
    tool_call: model.capabilities.toolcall,
    modalities: { input: inputMods, output: outputMods },

    cost: {
      input: model.cost.input,
      output: model.cost.output,
      cache_read: model.cost.cache.read,
      cache_write: model.cost.cache.write,
    },

    limit: model.limit,
    options: model.options,
    headers: model.headers,
    variants: model.variants,
  }
}

/** Marker this plugin appends to build a fast-mode model id. See `parseModelId`. */
const FAST_SUFFIX = "-fast"

// Dated snapshot ids (`claude-opus-4-5-20251101`) duplicate their undated alias.
const DATED_ID = /-\d{8}$/

// Mythos is the Fable tier without the safety classifiers (limited access via
// Project Glasswing) and is not in models.dev, so it is built from its Fable
// twin. A catalog entry for the same id wins. `claude --model` errors for
// accounts without access, so registering it unconditionally is safe.
const CATALOG_TWINS: Record<string, string> = {
  "claude-mythos-5": "claude-fable-5",
  "claude-mythos-5-1": "claude-fable-5-1",
}

/** Ids the current catalog registers; see `claudeCodeModels`. */
let known = new Set<string>()

/** Whether `id` (no `@account` marker) is a model this provider registers. */
export function knownModel(id: string): boolean {
  return known.has(id)
}

/**
 * Every built-in claude-code model, from the models.dev `anthropic` entry oc
 * already loads and refreshes. Prices, limits and dates are the catalog's; the CLI-side
 * differences are applied here: no temperature or PDF input, effort-only
 * reasoning (`reasoning_options` of type `effort`, so budget-only Haiku 4.5
 * gets no variants), and the `-fast` twin of every model the catalog prices a
 * fast mode for (`parseModelId` turns that suffix into `fastMode`). The
 * `(N×)` name suffix is the input price relative to Haiku 4.5's $1/M.
 *
 * Also replaces the set `knownModel` reads, so model validation and the
 * picker always agree.
 */
export function claudeCodeModels(
  anthropic: ModelsDev.Provider | undefined,
  providerID: string,
): Record<string, OpenCodeModel> {
  const catalog: Record<string, ModelsDev.Model> = { ...anthropic?.models }
  for (const [id, twin] of Object.entries(CATALOG_TWINS)) {
    const source = catalog[twin]
    if (catalog[id] || !source) continue
    catalog[id] = { ...source, id, name: source.name.replace("Fable", "Mythos"), family: "claude-mythos" }
  }

  const models: Record<string, OpenCodeModel> = {}
  for (const [id, entry] of Object.entries(catalog)) {
    if (DATED_ID.test(id) || entry.status === "deprecated") continue
    models[id] = fromCatalog(id, entry, providerID)
    const fast = entry.experimental?.modes?.fast?.cost
    if (!fast) continue
    const fastId = `${id}${FAST_SUFFIX}`
    models[fastId] = fromCatalog(fastId, { ...entry, cost: fast }, providerID, " Fast")
  }
  known = new Set(Object.keys(models))
  return models
}

function fromCatalog(id: string, entry: ModelsDev.Model, providerID: string, suffix = ""): OpenCodeModel {
  const option = entry.reasoning_options?.find((item) => item.type === "effort")
  // A null effort value means "reasoning off", which the CLI has no flag for.
  const efforts = option?.type === "effort" ? option.values.filter((value) => value !== null) : []
  const variants =
    entry.reasoning && efforts.length > 0
      ? Object.fromEntries(efforts.map((value) => [value, { reasoningEffort: value }]))
      : undefined
  const cost = entry.cost ?? { input: 0, output: 0 }
  const name = entry.name.replace(/\s*\(latest\)$/, "")
  return {
    id,
    providerID,
    api: { id, url: "", npm: NPM },
    name: `${name}${suffix} (${cost.input}×)`,
    family: entry.family ?? "",
    capabilities: {
      ...baseCapabilities,
      attachment: entry.attachment,
      reasoning: variants !== undefined,
      input: { ...baseCapabilities.input, image: entry.modalities?.input.includes("image") ?? false },
    },
    cost: {
      input: cost.input,
      output: cost.output,
      cache: { read: cost.cache_read ?? 0, write: cost.cache_write ?? 0 },
    },
    limit: { context: entry.limit.context, output: entry.limit.output },
    status: entry.status ?? "active",
    options: {},
    headers: {},
    release_date: entry.release_date,
    variants,
  }
}

/**
 * Split an opencode model id into the name the Claude CLI actually accepts
 * and whether fast mode was requested.
 *
 * Two suffixes can ride on one id and they are NOT interchangeable:
 *
 *   claude-opus-5-fast@work
 *   \_____________/\___/\__/
 *     CLI model    ours  accounts.ts's
 *
 * `@work` must survive: it used to steer the per-account wrapper script at
 * spawn time, and now nothing produces these ids, so one only arrives
 * hand-written in config. `-fast` must not: the CLI has no such model
 * (`claude-opus-4-6-fast` is retired and `claude-opus-4-7-fast` errors
 * outright), so it becomes `--settings {"fastMode":true}` instead.
 *
 * `knownModel` is the guard against a false positive. Only ids registered
 * from the catalog are treated as fast markers, so a user-defined model that
 * happens to end in `-fast` is passed through untouched rather than being
 * silently rewritten into a model name that does not exist.
 */
export function parseModelId(modelId: string): { model: string; fast: boolean } {
  const at = modelId.indexOf("@")
  const base = at === -1 ? modelId : modelId.slice(0, at)
  const account = at === -1 ? "" : modelId.slice(at)

  if (!base.endsWith(FAST_SUFFIX)) return { model: modelId, fast: false }
  if (!knownModel(base)) return { model: modelId, fast: false }

  return { model: base.slice(0, -FAST_SUFFIX.length) + account, fast: true }
}
