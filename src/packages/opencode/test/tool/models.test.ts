import { describe, expect, test } from "bun:test"
import type { Provider } from "../../src/provider/provider"
import { searchModels } from "../../src/tool/models"

const model = (providerID: string, id: string, family: string | undefined, release_date: string) =>
  ({ providerID, id, name: id.toUpperCase(), family, release_date, status: "active" }) as Provider.Model

const providers = [
  {
    id: "openai",
    name: "OpenAI",
    models: {
      a: model("openai", "gpt-5", "gpt", "2025-08-01"),
      b: model("openai", "gpt-6", "gpt", "2026-05-01"),
    },
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: {
      c: model("anthropic", "claude-opus-5-5", "opus", "2026-06-01"),
      d: model("anthropic", "claude-sonnet-5-5", "sonnet", "2026-06-01"),
    },
  },
] as unknown as Provider.Info[]

const ids = (list: Provider.Model[]) => list.map((item) => `${item.providerID}/${item.id}`)

describe("tool.models searchModels", () => {
  test("lists the current provider first and only the newest per family", () => {
    expect(ids(searchModels(providers, {}, "openai"))).toEqual([
      "openai/gpt-6",
      "anthropic/claude-opus-5-5",
      "anthropic/claude-sonnet-5-5",
    ])
  })

  test("filters by query terms, provider name, and keeps older versions with all", () => {
    expect(ids(searchModels(providers, { query: "opus 5" }))).toEqual(["anthropic/claude-opus-5-5"])
    expect(ids(searchModels(providers, { provider: "OpenAI", all: true }))).toEqual(["openai/gpt-6", "openai/gpt-5"])
  })
})
