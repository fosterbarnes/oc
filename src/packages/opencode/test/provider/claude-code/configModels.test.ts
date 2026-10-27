// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
import assert from "node:assert/strict"
import { test } from "node:test"
import { configModelsForProvider, createClaudeCode } from "@/provider/claude-code/index.js"
import { claudeCodeModels, knownModel, passthroughModel, toConfigModel } from "@/provider/claude-code/models.js"
import { anthropicCatalog } from "./catalogFixture"

// Built-in claude-code models come from the models.dev anthropic entry. These pin the CLI-side
// differences claudeCodeModels applies on top of the catalog, not the catalog's own numbers.

test("claudeCodeModels takes prices and limits from the catalog and adds the CLI's fast twin", () => {
  const models = claudeCodeModels(anthropicCatalog, "claude-code")
  const opus = models["claude-opus-5-5"]
  assert.equal(opus.name, "Claude Opus 5.5 (4×)")
  assert.equal(opus.api.npm, "@opencode-ai/claude-code")
  assert.deepEqual(opus.cost, { input: 4, output: 20, cache: { read: 0.2, write: 5 } })
  assert.deepEqual(opus.limit, { context: 1_000_000, output: 128_000 })
  assert.deepEqual(Object.keys(opus.variants), ["low", "medium", "high", "xhigh", "max"])
  // The CLI path takes no temperature and no PDF attachments.
  assert.equal(opus.capabilities.temperature, false)
  assert.equal(opus.capabilities.input.pdf, false)

  // A fast-mode twin bills at the catalog's fast price, and only exists where the catalog has one.
  const fast = models["claude-opus-5-5-fast"]
  assert.equal(fast.name, "Claude Opus 5.5 Fast (8×)")
  assert.deepEqual(fast.cost, { input: 8, output: 40, cache: { read: 0.4, write: 10 } })
  assert.equal(models["claude-sonnet-5-fast"], undefined)
})

test("claudeCodeModels skips dated aliases and gives budget-only models no effort variants", () => {
  const models = claudeCodeModels(anthropicCatalog, "claude-code")
  assert.equal(
    Object.keys(models).some((id) => /-\d{8}$/.test(id)),
    false,
  )
  const haiku = models["claude-haiku-4-5"]
  assert.equal(haiku.name, "Claude Haiku 4.5 (1×)", "the catalog's (latest) tag is dropped")
  assert.equal(haiku.capabilities.reasoning, false)
  assert.equal(haiku.variants, undefined)
})

test("claudeCodeModels builds Mythos from its Fable twin and lets the catalog override it", () => {
  const models = claudeCodeModels(anthropicCatalog, "claude-code")
  const mythos = models["claude-mythos-5-1"]
  assert.equal(mythos.name, "Claude Mythos 5.1 (10×)")
  assert.equal(mythos.family, "claude-mythos")
  assert.deepEqual(mythos.cost, models["claude-fable-5-1"].cost)

  const own = { ...anthropicCatalog.models["claude-fable-5"], id: "claude-mythos-5", name: "Catalog Mythos" }
  const catalog = { ...anthropicCatalog, models: { ...anthropicCatalog.models, "claude-mythos-5": own } }
  assert.equal(claudeCodeModels(catalog, "claude-code")["claude-mythos-5"].name, "Catalog Mythos (10×)")
})

test("claudeCodeModels registers exactly the ids knownModel accepts", () => {
  const models = claudeCodeModels(anthropicCatalog, "claude-code")
  assert.ok(models["claude-opus-5-fast"])
  assert.equal(knownModel("claude-opus-5-fast"), true)
  assert.equal(models["claude-3-opus-20240229"], undefined)
  assert.equal(knownModel("claude-3-opus-20240229"), false)
})

test("configModelsForProvider passes partial entries through and flattens runtime-shaped ones", () => {
  const runtime = { ...passthroughModel("my-custom-model"), name: "Mine" }
  const models = configModelsForProvider({
    "claude-opus-5-5": { name: "Renamed", variants: { custom: { reasoningEffort: "low" } } },
    "some-model": null,
    "my-custom-model": runtime,
  })
  assert.deepEqual(models["claude-opus-5-5"], {
    name: "Renamed",
    variants: { custom: { reasoningEffort: "low" } },
  })
  assert.equal(models["some-model"], null)
  assert.deepEqual(models["my-custom-model"], toConfigModel(runtime))
})

test("createClaudeCode passes idle process timeout to language models", () => {
  const model = createClaudeCode({ idleProcessTimeoutMs: 900_000 })("claude-sonnet-5")

  assert.equal((model as any).config.idleProcessTimeoutMs, 900_000)
})
