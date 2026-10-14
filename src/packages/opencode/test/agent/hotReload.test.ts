import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

afterEach(async () => {
  await disposeAllInstances()
})

// Same shape as ~/.config/opencode/agents/sub/general.md: one file, an `agents:` map of model + variant entries.
const generalFile = (entries: Record<string, { model: string; variant?: string; description: string }>) =>
  [
    "---",
    "mode: subagent",
    "agents:",
    ...Object.entries(entries).flatMap(([name, entry]) => [
      `  ${name}:`,
      `    model: ${entry.model}`,
      ...(entry.variant ? [`    variant: ${entry.variant}`] : []),
      `    description: ${entry.description}`,
    ]),
    "---",
    "",
  ].join("\n")

it.instance("hot reloads agent markdown and keeps the last good version", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const file = path.join(test.directory, ".opencode", "agents", "sub", "general.md")
    const write = (text: string) => Effect.promise(() => Bun.write(file, text))
    const agents = yield* Agent.Service
    const names = agents.list().pipe(Effect.map((list) => list.map((agent) => agent.name)))

    yield* write(generalFile({ "general-a-low": { model: "openai/gpt-a", variant: "low", description: "A low." } }))
    expect(yield* names).toContain("general-a-low")
    expect(yield* names).not.toContain("general-b")

    // Added in the same session: visible without an instance reload.
    yield* write(
      generalFile({
        "general-a-low": { model: "openai/gpt-a", variant: "low", description: "A low, edited." },
        "general-b": { model: "cursor/b-model", description: "B." },
      }),
    )
    const added = yield* agents.get("general-b")
    expect(added?.mode).toBe("subagent")
    expect(added?.model).toMatchObject({ providerID: "cursor", modelID: "b-model" })
    expect(added?.variant).toBeUndefined()
    const edited = yield* agents.get("general-a-low")
    expect(edited?.description).toBe("A low, edited.")
    expect(edited?.variant).toBe("low")

    // A broken save keeps serving the previous version of that file.
    yield* write("---\nagents: [unclosed\n---\n")
    expect(yield* names).toContain("general-b")

    yield* Effect.promise(() => fs.rm(file))
    expect(yield* names).not.toContain("general-b")
    expect(yield* names).toContain("build")
  }),
)
