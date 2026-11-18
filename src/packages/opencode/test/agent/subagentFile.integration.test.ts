import { afterEach, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { SubagentFile } from "../../src/agent/subagentFile"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer({})]],
  ),
)

afterEach(async () => {
  await disposeAllInstances()
})

const generalFile = (entries: Record<string, { model: string; description: string }>) =>
  [
    "---",
    "mode: subagent",
    "agents:",
    ...Object.entries(entries).flatMap(([name, entry]) => [
      `  ${name}:`,
      `    model: ${entry.model}`,
      `    description: ${entry.description}`,
    ]),
    "---",
    "",
  ].join("\n")

it.instance("agent list reflects subagent file upsert and remove", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const file = path.join(test.directory, ".opencode", "agents", "sub", "general.md")
    const write = (text: string) => Effect.promise(() => Bun.write(file, text))
    const agents = yield* Agent.Service
    const names = agents.list().pipe(Effect.map((list) => list.map((agent) => agent.name)))

    yield* write(generalFile({ "general-seed": { model: "openai/seed", description: "Seed." } }))
    expect(yield* names).toContain("general-seed")

    yield* Effect.promise(() =>
      SubagentFile.upsert({ name: "general-added", model: "cursor/added", description: 'Added: "model".' }, file),
    )
    expect(yield* names).toContain("general-added")
    expect(yield* Effect.promise(() => SubagentFile.names(file))).toEqual(["general-seed", "general-added"])
    const added = (yield* agents.list()).find((agent) => agent.name === "general-added")
    expect(added?.description).toBe('Added: "model".')

    // Merging a level shows up in the loaded agent
    yield* Effect.promise(() =>
      SubagentFile.upsert(
        { name: "general-added", model: "cursor/added", reasoning: { low: "on", high: "manual" } },
        file,
      ),
    )
    expect((yield* agents.list()).find((agent) => agent.name === "general-added")?.reasoning).toEqual({
      low: "on",
      high: "manual",
    })

    yield* Effect.promise(() => SubagentFile.remove("general-added", file))
    expect(yield* names).not.toContain("general-added")
    expect(yield* names).toContain("general-seed")
    expect(yield* Effect.promise(() => SubagentFile.names(file))).toEqual(["general-seed"])

    yield* Effect.promise(() => fs.rm(file).catch(() => undefined))
  }),
)
