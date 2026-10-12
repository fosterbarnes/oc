import { expect } from "bun:test"
import path from "path"
import { Effect, Fiber } from "effect"
import { Global } from "@opencode-ai/core/global"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Config } from "../../src/config/config"
import { AppRuntime } from "../../src/effect/app-runtime"
import { registerDisposer } from "../../src/effect/instance-registry"
import { InstanceStore } from "../../src/project/instance-store"
import { Server } from "../../src/server/server"
import { disposeAllInstances, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { waitGlobalBusEvent } from "./global-bus"

const it = testEffect(LayerNode.compile(CrossSpawnSpawner.node))

it.live("context limit updates refresh all configs without disposing running instances", () =>
  Effect.gen(function* () {
    const global = yield* tmpdirScoped()
    const first = yield* tmpdirScoped({
      config: { formatter: false, lsp: false, compaction: { prune: false, limit: { tokens: 123000 } } },
    })
    const second = yield* tmpdirScoped({ config: { formatter: false, lsp: false } })
    const file = path.join(global, "opencode.jsonc")
    yield* Effect.promise(() =>
      Bun.write(file, '// Keep this comment\n' + JSON.stringify({
        compaction: { limit: { action: "compact", tokens: 200000, providers: { cursor: { action: "off" } } } },
      })),
    )
    const previous = Global.Path.config
    yield* Effect.acquireRelease(
      Effect.promise(async () => {
        ;(Global.Path as { config: string }).config = global
        await AppRuntime.runPromise(Config.use.invalidate())
      }),
      () =>
        Effect.promise(async () => {
          await disposeAllInstances()
          ;(Global.Path as { config: string }).config = previous
          await AppRuntime.runPromise(Config.use.invalidate())
        }),
    )
    const disposed: string[] = []
    yield* Effect.acquireRelease(
      Effect.sync(() => registerDisposer(async (directory) => {
        disposed.push(directory)
      })),
      (off) => Effect.sync(off),
    )
    const app = Server.Default().app
    const read = (directory: string) =>
      Effect.promise(async () => {
        const response = await app.request("/config", { headers: { "x-opencode-directory": directory } })
        expect(response.status).toBe(200)
        return response.json()
      })
    const update = (config: Parameters<typeof Config.isCompactionUpdate>[0]) =>
      Effect.promise(async () => {
        const response = await app.request("/global/config", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(config),
        })
        expect(response.status).toBe(200)
        return response.json()
      })
    yield* read(first)
    yield* read(second)
    const instances = yield* Effect.promise(() =>
      AppRuntime.runPromise(Effect.gen(function* () {
        const store = yield* InstanceStore.Service
        return [yield* store.load({ directory: first }), yield* store.load({ directory: second })]
      })),
    )

    for (const action of ["off", "handoff", "compact"] as const) {
      const patch = { compaction: { limit: { providers: { "claude-code": { action, tokens: 150000 } } } } }
      expect(yield* update(patch)).toMatchObject(patch)
      for (const directory of [first, second]) {
        expect(yield* read(directory)).toMatchObject({
          compaction: { limit: { providers: { "claude-code": { action, tokens: 150000 }, cursor: { action: "off" } } } },
        })
      }
      expect(yield* read(first)).toMatchObject({ compaction: { prune: false, limit: { tokens: 123000 } } })
      expect(yield* read(second)).toMatchObject({ compaction: { limit: { tokens: 200000 } } })
      expect(disposed).toEqual([])
      yield* Effect.promise(() =>
        AppRuntime.runPromise(Effect.gen(function* () {
          const store = yield* InstanceStore.Service
          expect(yield* store.load({ directory: first })).toBe(instances[0])
          expect(yield* store.load({ directory: second })).toBe(instances[1])
        })),
      )
    }
    yield* update({ compaction: { auto: false, limit: { action: "off" } } })
    expect(yield* read(second)).toMatchObject({ compaction: { auto: false, limit: { action: "off" } } })
    expect(disposed).toEqual([])
    expect(yield* Effect.promise(() => Bun.file(file).text())).toContain("// Keep this comment")

    // A mixed update still needs a full reload. This also waits for the disposal queue to drain.
    const finished = yield* waitGlobalBusEvent({
      predicate: (event) => event.payload.type === "global.disposed",
    }).pipe(Effect.forkScoped({ startImmediately: true }))
    yield* update({ username: "updated", compaction: { auto: true } })
    yield* Fiber.join(finished)
    expect(disposed.toSorted()).toEqual([first, second].toSorted())
  }),
)
