import { expect, test } from "bun:test"
import { parseModel, recentModels, resolveCurrentModel } from "../../src/context/local"

test("parses model IDs containing slashes", () => {
  expect(parseModel("provider/family/model")).toEqual({
    providerID: "provider",
    modelID: "family/model",
  })
})

test("moves a model to the front, deduplicates, and limits recents", () => {
  const recent = Array.from({ length: 12 }, (_, index) => ({
    providerID: "provider",
    modelID: `model-${index}`,
  }))

  expect(recentModels({ providerID: "provider", modelID: "model-5" }, recent)).toEqual([
    { providerID: "provider", modelID: "model-5" },
    ...recent.slice(0, 5),
    ...recent.slice(6, 10),
  ])
})

test("uses the explicit CLI model before agent and recent fallbacks", () => {
  const cli = { providerID: "cli", modelID: "model" }
  const agent = { providerID: "agent", modelID: "model" }
  const recent = { providerID: "recent", modelID: "model" }

  expect(resolveCurrentModel(undefined, cli, agent, recent)).toEqual(cli)
  expect(resolveCurrentModel(undefined, undefined, agent, recent)).toEqual(agent)
})

test("keeps an in-session model selection ahead of the CLI seed", () => {
  const selected = { providerID: "selected", modelID: "model" }
  const cli = { providerID: "cli", modelID: "model" }

  expect(resolveCurrentModel(selected, cli, undefined, undefined)).toEqual(selected)
})
