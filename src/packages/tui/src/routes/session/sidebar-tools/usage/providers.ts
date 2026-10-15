export const USAGE_PROVIDER_IDS = ["openai", "cursor", "opencode-go", "openrouter", "claude-code"] as const
export type UsageProviderId = (typeof USAGE_PROVIDER_IDS)[number]

// Extra Claude Code accounts are separate providers named "claude-code-<account>".
export function usageProviderForModel(providerID: string): UsageProviderId | undefined {
  if (providerID.startsWith("claude-code-")) return "claude-code"
  return USAGE_PROVIDER_IDS.find((id) => id === providerID)
}

export const DEFAULT_USAGE_PROVIDERS: UsageProviderId[] = ["openai", "cursor", "opencode-go", "openrouter"]

export const USAGE_PROVIDER_OPTIONS: { id: UsageProviderId; title: string }[] = [
  { id: "openai", title: "Codex / OpenAI" },
  { id: "cursor", title: "Cursor" },
  { id: "opencode-go", title: "OpenCode Go" },
  { id: "openrouter", title: "OpenRouter" },
  { id: "claude-code", title: "Claude Code" },
]

export function isUsageProviderId(value: string): value is UsageProviderId {
  return (USAGE_PROVIDER_IDS as readonly string[]).includes(value)
}

export function normalizeUsageProviders(value: unknown, fallback = DEFAULT_USAGE_PROVIDERS): UsageProviderId[] {
  if (!Array.isArray(value)) return [...fallback]
  const providers: UsageProviderId[] = []
  for (const item of value) {
    if (typeof item !== "string" || !isUsageProviderId(item) || providers.includes(item)) continue
    providers.push(item)
  }
  return providers
}
