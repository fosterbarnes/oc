import type { AssistantMessage, Message, Provider } from "@opencode-ai/sdk/v2"

// Context size of a session: the token total of its last assistant reply, its share of that
// model's context limit (undefined when the model has no limit), and the model/effort it ran on.
export function contextUsage(messages: readonly Message[], providers: readonly Provider[]) {
  const last = messages.findLast(
    (item): item is AssistantMessage => item.role === "assistant" && item.tokens.output > 0,
  )
  if (!last) return
  const tokens =
    last.tokens.input + last.tokens.output + last.tokens.reasoning + last.tokens.cache.read + last.tokens.cache.write
  if (tokens <= 0) return
  const limit = providers.find((item) => item.id === last.providerID)?.models[last.modelID]?.limit.context
  return {
    tokens,
    percent: limit ? Math.round((tokens / limit) * 100) : undefined,
    modelID: last.modelID,
    variant: last.variant,
  }
}
