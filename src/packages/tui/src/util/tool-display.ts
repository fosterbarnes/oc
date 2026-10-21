import { parse } from "./partial-json"

export function webSearchProviderLabel(provider: unknown) {
  if (provider === "parallel") return "Parallel Web Search"
  if (provider === "exa") return "Exa Web Search"
  if (provider === "firecrawl") return "Firecrawl Web Search"
  if (provider === "tavily") return "Tavily Web Search"
  return "Web Search"
}

// Arguments of a tool call the model is still writing (pending `state.raw`); {} until an object parses.
export function partialToolInput(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const value = parse(raw)
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    // Mid-string starts (raw resumed after a reload) are malformed, not partial.
    return {}
  }
}

// Read tool `offset` is a 1-based start line and `limit` a line count; "" when neither is set.
export function readRange(input: Record<string, unknown>) {
  const offset = finite(input.offset)
  const limit = finite(input.limit)
  if (offset === undefined && limit === undefined) return ""
  const start = offset || 1
  return `:${start}-${limit ? start + limit - 1 : ""}`
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

export function toolDisplayMetadata(state: unknown): Record<string, unknown> {
  if (!state || typeof state !== "object" || Array.isArray(state)) return {}
  if (!("status" in state) || state.status === "pending") return {}
  if (!("structured" in state) || !state.structured || typeof state.structured !== "object") return {}
  if (Array.isArray(state.structured)) return {}
  return state.structured as Record<string, unknown>
}
