import { expect } from "bun:test"
import { Npm } from "@opencode-ai/core/npm"
import { Effect } from "effect"
import fs from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import { Agent } from "../../src/agent/agent"
import { Config } from "../../src/config/config"
import { Account } from "../../src/account/account"
import { Auth } from "../../src/auth"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { ProviderTest } from "../fake/provider"
import { SkillTest } from "../fake/skill"
import { testEffect } from "../lib/effect"
import { TestInstance } from "../fixture/fixture"
import { PLUGIN_AGENT } from "../fixture/agent-plugin.constants"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"

// `it.instance` skips InstanceBootstrap so LSP / MCP don't spin up — those
// services hang during scope teardown on Windows and aren't needed
// to verify plugin → config hook → Agent.list.
const pluginUrl = pathToFileURL(path.join(import.meta.dir, "..", "fixture", "agent-plugin.ts")).href

const provider = ProviderTest.fake()
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Agent.node, Plugin.node, Config.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, NpmTest.noop],
    [Provider.node, provider.layer],
    [Skill.node, SkillTest.empty],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)

it.instance(
  "plugin-registered agents appear in Agent.list",
  () =>
    Effect.gen(function* () {
      yield* Plugin.Service.use((p) => p.init())
      const agents = yield* Agent.use.list()
      const added = agents.find((agent) => agent.name === PLUGIN_AGENT.name)
      expect(added?.description).toBe(PLUGIN_AGENT.description)
      expect(added?.mode).toBe(PLUGIN_AGENT.mode)
    }),
  { config: { plugin: [pluginUrl] } },
)

it.instance(
  "plugin-registered agents survive an agent markdown hot reload",
  () =>
    Effect.gen(function* () {
      // Config dirs are discovered at startup, so the agents dir exists before the first load, as ~/.config/opencode does.
      const test = yield* TestInstance
      const dir = path.join(test.directory, ".opencode", "agents")
      yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }))
      yield* Plugin.Service.use((p) => p.init())
      expect((yield* Agent.use.list()).map((agent) => agent.name)).not.toContain("hot")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(dir, "hot.md"),
          "---\nmode: subagent\ndescription: Added after startup.\n---\n",
        ),
      )
      const names = (yield* Agent.use.list()).map((agent) => agent.name)
      expect(names).toContain("hot")
      expect(names).toContain(PLUGIN_AGENT.name)
    }),
  { config: { plugin: [pluginUrl] } },
)

it.instance(
  "plugin overrides and deletions survive startup and markdown edits without freezing unchanged fields",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, ".opencode", "agents", "sub", "general.md")
      const write = (description: string) => Effect.promise(() => Bun.write(file, [
        "---",
        "agents:",
        "  plugin_modified:",
        "    model: openai/file-model",
        "    prompt: File prompt.",
        `    description: ${description}`,
        "    temperature: 0.5",
        "    permission:",
        "      edit: allow",
        `      bash: ${description === "Initial." ? "ask" : "deny"}`,
        "    options:",
        "      removed: true",
        `      live: ${description}`,
        "  plugin_removed:",
        "    description: Removed by plugin.",
        "  untouched:",
        `    description: ${description}`,
        "---",
        "",
      ].join("\n")))
      yield* write("Initial.")
      yield* Plugin.Service.use((plugin) => plugin.init())
      const config = yield* Config.Service
      const agents = yield* Agent.Service
      for (const description of ["Initial.", "Edited."]) {
        if (description === "Edited.") yield* write(description)
        const modified = yield* agents.get("plugin_modified")
        expect(modified.prompt).toBe("Plugin prompt.")
        expect(String(modified.model?.modelID)).toBe("plugin-model")
        expect(modified.description).toBe(description)
        expect(modified.temperature).toBeUndefined()
        expect(modified.options).toEqual({ plugin: true, live: description })
        expect((yield* config.agents()).agents["plugin_modified"].permission).toEqual({
          edit: "deny",
          bash: description === "Initial." ? "ask" : "deny",
        })
        expect((yield* agents.list()).some((agent) => agent.name === "plugin_removed")).toBe(false)
        expect((yield* agents.get("untouched")).description).toBe(description)
      }
      yield* Effect.promise(() => fs.rm(file))
      expect((yield* agents.list()).some((agent) => agent.name === "untouched")).toBe(false)
      expect((yield* agents.get("plugin_added")).description).toBe(PLUGIN_AGENT.description)
    }),
  { config: { plugin: [pluginUrl] } },
)
