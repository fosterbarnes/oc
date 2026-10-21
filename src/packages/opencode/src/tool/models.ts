import { Effect, Schema } from "effect"
import { Provider } from "@/provider/provider"
import { Tool } from "./tool"

export const Parameters = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({ description: "Text to search for in model names and IDs." }),
  provider: Schema.optional(Schema.String).annotate({
    description: "Provider ID or name to filter by. Try your own provider first.",
  }),
  all: Schema.optional(Schema.Boolean).annotate({
    description: "Include older versions of each model family. By default only the newest version is listed.",
  }),
  limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))).annotate({
    description: "Maximum number of models to return. Defaults to 20.",
  }),
  offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).annotate({
    description: "Number of models to skip, for paging through results.",
  }),
})

type Params = Schema.Schema.Type<typeof Parameters>

// Matching models, the current provider first, then by provider and newest release. Without `all`,
// only the newest model of each provider family is kept.
export function searchModels(providers: Provider.Info[], params: Params, own?: string) {
  const terms = params.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? []
  const wanted = params.provider?.toLowerCase()
  return providers
    .filter((item) => wanted === undefined || item.id.toLowerCase() === wanted || item.name.toLowerCase() === wanted)
    .flatMap((item) => Object.values(item.models))
    .filter((model) => {
      const text = `${model.providerID}/${model.id} ${model.name}`.toLowerCase()
      return terms.every((term) => text.includes(term))
    })
    .toSorted(
      (left, right) =>
        Number(right.providerID === own) - Number(left.providerID === own) ||
        left.providerID.localeCompare(right.providerID) ||
        right.release_date.localeCompare(left.release_date),
    )
    .filter(
      (model, index, sorted) =>
        params.all ||
        !model.family ||
        sorted.findIndex((other) => other.providerID === model.providerID && other.family === model.family) === index,
    )
}

export const ModelsTool = Tool.define(
  "models",
  Effect.gen(function* () {
    const provider = yield* Provider.Service

    return {
      description:
        "Search the models available to use. Use this to turn a model name the user mentions into an exact provider/model id (and variant) for the task tool's `model` parameter. Check your own provider first.",
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const offset = params.offset ?? 0
          const limit = params.limit ?? 20
          const user = ctx.messages.findLast((message) => message.info.role === "user")?.info
          const own = user?.role === "user" ? user.model.providerID : undefined
          const matching = searchModels(Object.values(yield* provider.list()), params, own)
          const page = matching.slice(offset, offset + limit)
          const lines = page.map((model) => {
            const variants = Object.keys(model.variants ?? {})
            return [
              `${model.providerID}/${model.id} - ${model.name}`,
              ...(variants.length > 0 ? [`variants: ${variants.join(", ")}`] : []),
              ...(model.status !== "active" ? [model.status] : []),
            ].join(" | ")
          })
          const next = offset + limit < matching.length ? offset + limit : undefined
          const footer =
            page.length === 0
              ? `No matching models${matching.length > 0 ? ` at offset ${offset} (${matching.length} total)` : ""}.`
              : `Showing ${offset + 1}-${offset + page.length} of ${matching.length} models.${next === undefined ? "" : ` Use offset=${next} for more.`}`
          return {
            title: params.query ?? params.provider ?? "models",
            output: [...lines, ...(lines.length > 0 ? [""] : []), footer].join("\n"),
            metadata: { total: matching.length },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
