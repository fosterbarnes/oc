import { expect, test } from "bun:test"
import {
  parseModel,
  pruneSessionAgents,
  pruneSessionModelOverrides,
  recentModels,
  resolveCurrentModel,
  resolveSessionAgent,
  resolveSessionModel,
} from "../../src/context/local"

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

test("matches existing resolution when no session override exists", () => {
  const selected = { providerID: "selected", modelID: "a" }
  const cli = { providerID: "cli", modelID: "c" }
  const agent = { providerID: "agent", modelID: "d" }
  const fallback = { providerID: "fallback", modelID: "e" }

  expect(
    resolveSessionModel(undefined, selected, cli, agent, fallback),
  ).toEqual(resolveCurrentModel(selected, cli, agent, fallback))
})

test("uses an explicit session selection across agent names", () => {
  const session = { providerID: "session", modelID: "model", variant: "high" }
  const agentA = { providerID: "agent-a", modelID: "model" }
  const agentB = { providerID: "agent-b", modelID: "model" }

  expect(
    resolveSessionModel(session, undefined, undefined, agentA, agentB),
  ).toEqual(session)
  expect(
    resolveSessionModel(session, undefined, undefined, agentB, agentA),
  ).toEqual(session)
})

test("keeps agent defaults for a session without an override", () => {
  const agent = { providerID: "agent", modelID: "configured" }
  const fallback = { providerID: "fallback", modelID: "model" }

  expect(resolveSessionModel(undefined, undefined, undefined, agent, fallback)).toEqual(agent)
})

test("keeps a session override ahead of CLI and fallback choices", () => {
  const session = { providerID: "session", modelID: "model" }
  const cli = { providerID: "cli", modelID: "model" }
  const agent = { providerID: "agent", modelID: "model" }
  const fallback = { providerID: "fallback", modelID: "model" }

  expect(

    resolveSessionModel(session, undefined, cli, agent, fallback),
  ).toEqual(session)
  expect(resolveSessionModel(undefined, undefined, cli, agent, fallback)).toEqual(cli)
})

test("prunes only the deleted session override", () => {
  expect(
    pruneSessionModelOverrides(
      {
        first: { providerID: "provider", modelID: "first", variant: "high" },
        second: { providerID: "provider", modelID: "second" },
      },
      "first",
    ),
  ).toEqual({ second: { providerID: "provider", modelID: "second" } })
})

test("uses the session agent ahead of the last selected and CLI agents", () => {
  expect(resolveSessionAgent("plan", "build", "explore", "build")).toBe("plan")
  expect(resolveSessionAgent(undefined, "plan", "explore", "build")).toBe("plan")
  expect(resolveSessionAgent(undefined, undefined, "explore", "build")).toBe("explore")
  expect(resolveSessionAgent(undefined, undefined, undefined, "build")).toBe("build")
})

test("prunes only the deleted session agent", () => {
  expect(pruneSessionAgents({ first: "plan", second: "build" }, "first")).toEqual({ second: "build" })

})
