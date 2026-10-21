import { describe, expect, test } from "bun:test"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import type { Provider } from "@/provider/provider"
import {
  DEFAULT_LIMIT_TOKENS,
  isOverflow,
  limitAction,
  limitProviderKey,
  overLimit,
  resolveLimit,
  tokenCount,
} from "@/session/overflow"

function model(providerID: string, opts?: { context?: number; input?: number; output?: number }): Provider.Model {
  return {
    id: "test-model",
    providerID,
    name: "Test",
    limit: {
      context: opts?.context ?? 200_000,
      input: opts?.input,
      output: opts?.output ?? 8192,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: {
      toolcall: true,
      attachment: false,
      reasoning: false,
      temperature: true,
      input: { text: true, image: false, audio: false, video: false },
      output: { text: true, image: false, audio: false, video: false, reasoning: false },
    },
    options: {},
    headers: {},
    family: "test",
    release: { date: "2020-01-01", version: "1" },
    variants: {},
    status: "active",
  } as unknown as Provider.Model
}

const tokens = (count: number) => ({
  total: count,
  input: count,
  output: 0,
  reasoning: 0,
  cache: { read: 0, write: 0 },
})

describe("overflow overLimit", () => {
  test("tokenCount prefers total then the same split fields isOverflow uses", () => {
    expect(tokenCount(tokens(10))).toBe(10)
    expect(
      tokenCount({
        input: 3,
        output: 2,
        reasoning: 0,
        cache: { read: 4, write: 1 },
      }),
    ).toBe(10)
  })

  test("isOverflow skips claude-code; overLimit does not", () => {
    const cfg = { compaction: { limit: { tokens: 100, action: "compact" as const } } } as ConfigV1.Info
    const claude = model("claude-code", { context: 200_000 })
    expect(isOverflow({ cfg, tokens: tokens(150), model: claude })).toBe(false)
    expect(overLimit({ cfg, tokens: tokens(150), model: claude })).toBe(true)
  })

  test("overLimit applies to cursor and other providers", () => {
    const cfg = { compaction: { limit: { tokens: 100, action: "handoff" as const } } } as ConfigV1.Info
    expect(overLimit({ cfg, tokens: tokens(150), model: model("cursor") })).toBe(true)
    expect(overLimit({ cfg, tokens: tokens(150), model: model("openai") })).toBe(true)
    expect(overLimit({ cfg, tokens: tokens(50), model: model("cursor") })).toBe(false)
  })

  test("caps the threshold at usable context so small models fire first", () => {
    const cfg = { compaction: { limit: { tokens: 500_000, action: "compact" as const } } } as ConfigV1.Info
    const small = model("openai", { context: 8_000, output: 2_000 })
    expect(overLimit({ cfg, tokens: tokens(7_000), model: small })).toBe(true)
  })

  test("off and missing limit do not fire; auto=false still honors an explicit limit", () => {
    const off = { compaction: { auto: false, limit: { tokens: 100, action: "off" as const } } } as ConfigV1.Info
    const explicit = {
      compaction: { auto: false, limit: { tokens: 100, action: "compact" as const } },
    } as ConfigV1.Info
    const legacy = { compaction: { auto: false } } as ConfigV1.Info
    const mdl = model("openai")
    expect(overLimit({ cfg: off, tokens: tokens(150), model: mdl })).toBe(false)
    expect(overLimit({ cfg: explicit, tokens: tokens(150), model: mdl })).toBe(true)
    expect(overLimit({ cfg: legacy, tokens: tokens(150), model: mdl })).toBe(false)
    expect(isOverflow({ cfg: explicit, tokens: tokens(1_000_000), model: mdl })).toBe(false)
  })
})

describe("overflow resolveLimit per provider", () => {
  test("no compaction.limit resolves to undefined and never fires", () => {
    const cfg = {} as ConfigV1.Info
    expect(resolveLimit(cfg, "openai")).toBeUndefined()
    expect(limitAction(cfg, "openai")).toBeUndefined()
    expect(overLimit({ cfg, tokens: tokens(150), model: model("openai") })).toBe(false)
  })

  test("context limit of 0 never fires, even with a provider entry", () => {
    const cfg = { compaction: { limit: { providers: { cursor: { tokens: 100 } } } } } as ConfigV1.Info
    expect(overLimit({ cfg, tokens: tokens(150), model: model("cursor", { context: 0 }) })).toBe(false)
  })

  test("global-only limit applies to every provider with compact and the given tokens", () => {
    const cfg = { compaction: { limit: { tokens: 100 } } } as ConfigV1.Info
    expect(resolveLimit(cfg, "cursor")).toEqual({ action: "compact", tokens: 100 })
    expect(resolveLimit(cfg, "claude-code-work")).toEqual({ action: "compact", tokens: 100 })
  })

  test("provider entry alone enables only that provider, with defaults for missing fields", () => {
    const cfg = { compaction: { limit: { providers: { cursor: { tokens: 100 } } } } } as ConfigV1.Info
    expect(resolveLimit(cfg, "cursor")).toEqual({ action: "compact", tokens: 100 })
    expect(overLimit({ cfg, tokens: tokens(150), model: model("cursor") })).toBe(true)
    expect(resolveLimit(cfg, "openai")).toBeUndefined()
    expect(overLimit({ cfg, tokens: tokens(150), model: model("openai") })).toBe(false)
  })

  test("provider-only action without tokens uses the default token threshold", () => {
    const cfg = { compaction: { limit: { providers: { cursor: { action: "handoff" as const } } } } } as ConfigV1.Info
    expect(resolveLimit(cfg, "cursor")).toEqual({ action: "handoff", tokens: DEFAULT_LIMIT_TOKENS })
  })

  test("an empty providers object alone enables nothing", () => {
    const cfg = { compaction: { limit: { providers: {} } } } as ConfigV1.Info
    expect(resolveLimit(cfg, "openai")).toBeUndefined()
  })

  test("provider off beats a global handoff; other providers keep the global action", () => {
    const cfg = {
      compaction: {
        limit: { tokens: 100, action: "handoff" as const, providers: { cursor: { action: "off" as const } } },
      },
    } as ConfigV1.Info
    expect(limitAction(cfg, "cursor")).toBe("off")
    expect(overLimit({ cfg, tokens: tokens(150), model: model("cursor") })).toBe(false)
    expect(limitAction(cfg, "openai")).toBe("handoff")
    expect(overLimit({ cfg, tokens: tokens(150), model: model("openai") })).toBe(true)
  })

  test("per-field precedence: provider fields win, missing provider fields fall back to global", () => {
    const cfg = {
      compaction: { limit: { tokens: 100, action: "handoff" as const, providers: { cursor: { tokens: 150 } } } },
    } as ConfigV1.Info
    expect(resolveLimit(cfg, "cursor")).toEqual({ action: "handoff", tokens: 150 })
    expect(overLimit({ cfg, tokens: tokens(120), model: model("cursor") })).toBe(false)
    expect(overLimit({ cfg, tokens: tokens(120), model: model("openai") })).toBe(true)
  })

  test("unknown provider ids and an empty providers object fall back to the global limit", () => {
    const base = { tokens: 100, action: "compact" as const }
    const cfg = { compaction: { limit: { ...base, providers: {} } } } as ConfigV1.Info
    expect(resolveLimit(cfg, "openai")).toEqual(base)
  })

  test("claude-code-<account> collapses to the claude-code entry", () => {
    const cfg = {
      compaction: { limit: { providers: { "claude-code": { tokens: 100, action: "handoff" as const } } } },
    } as ConfigV1.Info
    expect(limitProviderKey("claude-code-work")).toBe("claude-code")
    expect(limitProviderKey("claude-code")).toBe("claude-code")
    expect(limitProviderKey("cursor")).toBe("cursor")
    expect(limitAction(cfg, "claude-code-work")).toBe("handoff")
    expect(overLimit({ cfg, tokens: tokens(150), model: model("claude-code-work") })).toBe(true)
    expect(overLimit({ cfg, tokens: tokens(150), model: model("cursor") })).toBe(false)
  })
})

describe("overflow output reserve", () => {
  test("large output limits keep the 32k compaction reserve", () => {
    const cfg = {} as ConfigV1.Info
    const large = model("openai", { context: 400_000, output: 128_000 })
    expect(isOverflow({ cfg, tokens: tokens(367_999), model: large })).toBe(false)
    expect(isOverflow({ cfg, tokens: tokens(368_000), model: large })).toBe(true)
  })
})
