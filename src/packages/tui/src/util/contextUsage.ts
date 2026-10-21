import type { AssistantMessage, Message, Provider } from "@opencode-ai/sdk/v2"

// Last assistant reply with output before the revert boundary (the session's `revert.messageID`).
// Reverted turns stay in the v1 store, so they must not count. A boundary that is not loaded
// means every loaded message is reverted.
export function lastAssistantWithUsage(messages: readonly Message[], boundary?: string) {
  const boundaryIndex = boundary ? messages.findIndex((message) => message.id === boundary) : -1
  if (boundary && boundaryIndex === -1) return undefined
  return messages.findLast(
    (item, index): item is AssistantMessage =>
      item.role === "assistant" && item.tokens.output > 0 && (boundaryIndex === -1 || index < boundaryIndex),
  )
}

// Context size of a session: the token total of its last assistant reply, its share of that
// model's context limit (undefined when the model has no limit), and the model/effort it ran on.
export function contextUsage(messages: readonly Message[], providers: readonly Provider[], boundary?: string) {
  const last = lastAssistantWithUsage(messages, boundary)
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
