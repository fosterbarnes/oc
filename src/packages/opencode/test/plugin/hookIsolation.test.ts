import { describe, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { EventV2 } from "@opencode-ai/core/event"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { Npm } from "@opencode-ai/core/npm"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Effect, Schema } from "effect"
import path from "path"
import { pathToFileURL } from "url"
import { Account } from "../../src/account/account"
import { Auth } from "../../src/auth"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Plugin } from "../../src/plugin/index"
import { TestInstance } from "../fixture/fixture"
import { AccountTest } from "../fake/account"
import { AuthTest } from "../fake/auth"
import { NpmTest } from "../fake/npm"
import { testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Plugin.node, EventV2Bridge.node, CrossSpawnSpawner.node]), [
    [Auth.node, AuthTest.empty],
    [Account.node, AccountTest.empty],
    [Npm.node, NpmTest.noop],
    [RuntimeFlags.node, RuntimeFlags.layer({ disableDefaultPlugins: true })],
  ]),
)
const Message = EventV2.define({ type: "test.plugin-hook", schema: { text: Schema.String } })

function withPlugins<A, E, R>(sources: (directory: string) => string[], self: Effect.Effect<A, E, R>) {
  return Effect.gen(function* () {
    const test = yield* TestInstance
    const contents = sources(test.directory)
    const files = contents.map((_, index) => path.join(test.directory, `plugin-${index}.ts`))
    yield* Effect.forEach(files, (file, index) => Effect.promise(() => Bun.write(file, contents[index]!)), {
      discard: true,
    })
    yield* Effect.promise(() =>
      Bun.write(
        path.join(test.directory, "opencode.json"),
        JSON.stringify({ plugin: files.map((file) => pathToFileURL(file).href) }),
      ),
    )
    return yield* self
  })
}

describe("plugin hook isolation", () => {
  it.instance("logs observational event failures and continues through later hooks", () =>
    withPlugins(
      (directory) => [
        'export default async () => ({ event: () => { throw new Error("sync event failure") } })',
        'export default async () => ({ event: async () => { throw new Error("async event failure") } })',
        // Never settles: publish must not wait on it.
        "export default async () => ({ event: () => new Promise(() => {}) })",
        'import { writeFileSync } from "node:fs"\nexport default async () => ({ event: () => writeFileSync(' +
          JSON.stringify(path.join(directory, "hook-observer-ran")) +
          ', "ran") })',
      ],
      Effect.gen(function* () {
        const test = yield* TestInstance
        const plugin = yield* Plugin.Service
        const events = yield* EventV2Bridge.Service
        yield* plugin.init()
        yield* events.publish(
          Message,
          { text: "notify" },
          { location: { directory: AbsolutePath.make(test.directory) } },
        )

        expect(yield* Effect.promise(() => Bun.file(path.join(test.directory, "hook-observer-ran")).text())).toBe("ran")
      }),
    ),
  )

  it.instance("keeps veto and transform hooks ordered and fail closed", () =>
    withPlugins(
      () => [
        'export default async () => ({ "permission.ask": (_input, output) => { output.status = "deny" } })',
        'export default async () => ({ "experimental.chat.system.transform": () => { throw new Error("transform failure") } })',
      ],
      Effect.gen(function* () {
        const plugin = yield* Plugin.Service
        yield* plugin.init()
        const permission = yield* plugin.trigger(
          "permission.ask",
          {} as Parameters<NonNullable<import("@opencode-ai/plugin").Hooks["permission.ask"]>>[0],
          { status: "allow" },
        )
        const transform = yield* plugin
          .trigger(
            "experimental.chat.system.transform",
            { model: { providerID: ProviderV2.ID.anthropic, modelID: ModelV2.ID.make("claude-sonnet-4-6") } },
            { system: [] },
          )
          .pipe(Effect.exit)

        expect(permission.status).toBe("deny")
        expect(String(transform)).toContain("transform failure")
      }),
    ),
  )
})
