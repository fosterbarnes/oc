import { expect, test } from "bun:test"
import { Provider } from "../../src/provider/provider"
import { executionModel, modelOptions, needsVariantChoice, variantOptions } from "../../src/tool/plan-execute"

test("plan execution offers the approved Go model choices", () => {
  expect(modelOptions().map((option) => option.label)).toEqual([
    "Same as planner",
    "OpenAI Luna",
    "Meta Muse Spark Contributor",
    "Cursor Grok 4.6",
    "Cursor Composer 2.5",
    "Cursor Auto",
  ])
})

test("plan execution maps fixed choices to exact provider models", () => {
  expect(executionModel("luna")).toMatchObject({ providerID: "openai", modelID: "gpt-5.6-luna" })
  expect(executionModel("muse")).toMatchObject({ providerID: "meta", modelID: "muse-spark-1.2-contributor" })
  expect(executionModel("grok")).toMatchObject({ providerID: "cursor", modelID: "grok-4.6" })
  expect(executionModel("composer")).toMatchObject({ providerID: "cursor", modelID: "composer-2.5" })
  expect(executionModel("auto")).toMatchObject({ providerID: "cursor", modelID: "default" })
})

test("only reasoning-capable Go choices request a variant", () => {
  expect(needsVariantChoice("inherit")).toBe(false)
  expect(needsVariantChoice("luna")).toBe(true)
  expect(needsVariantChoice("muse")).toBe(true)
  expect(needsVariantChoice("grok")).toBe(true)
  expect(needsVariantChoice("composer")).toBe(false)
  expect(needsVariantChoice("auto")).toBe(false)
})

test("variant choices preserve provider model keys and labels", () => {
  const model = {
    name: "Example model",
    variants: {
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
    },
  } as unknown as Provider.Model

  expect(variantOptions(model)).toEqual([
    { label: "medium", description: "Use the medium variant reported by Example model" },
    { label: "high", description: "Use the high variant reported by Example model" },
  ])
})
