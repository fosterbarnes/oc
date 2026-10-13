import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionWork } from "@opencode-ai/core/session/work"
import { Config, Deferred, Effect, FileSystem, Fiber, Layer, Path } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServer } from "effect/unstable/http"
import * as Socket from "effect/unstable/socket/Socket"
import { InstanceStore } from "../../src/project/instance-store"
import { InstancePaths } from "../../src/server/routes/instance/httpapi/groups/instance"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { resetDatabase } from "../fixture/db"
import { testInstanceStoreLayer, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Served routes share one SessionWork and one InstanceStore with the test body, so the
// busy refusal and the directory checks observe the same state the endpoint uses.
const testStateLayer = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.promise(() => resetDatabase())
    yield* Effect.addFinalizer(() => Effect.promise(() => resetDatabase()))
  }),
)

const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  { disableListenLog: true, disableLogger: true },
)

const httpApiServerLayer = servedRoutes.pipe(
  Layer.provide(Socket.layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
  Layer.provideMerge(
    AppNodeBuilder.build(
      LayerNode.group([SessionWork.node, InstanceStore.node]),
      [[InstanceStore.node, testInstanceStoreLayer]],
    ),
  ),
)

const it = testEffect(Layer.mergeAll(testStateLayer, httpApiServerLayer))

const inDirectory = (method: "GET" | "POST", path: string, directory: string) =>
  HttpClientRequest.make(method)(path).pipe(
    HttpClientRequest.setHeader("x-opencode-directory", directory),
    HttpClient.execute,
  )

const writeConfig = (directory: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    yield* fs.writeFileString(path.join(directory, "opencode.json"), text)
  })

const agentNames = (directory: string) =>
  Effect.gen(function* () {
    const response = yield* inDirectory("GET", InstancePaths.agent, directory)
    const agents = (yield* response.json) as { name: string }[]
    return agents.map((agent) => agent.name)
  })

const config = (agent: string) => JSON.stringify({ agent: { [agent]: { description: agent, mode: "subagent" } } })

describe("instance reload", () => {
  it.live("refuses reload with a conflict while session work runs and keeps the instance", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      yield* writeConfig(dir, config("reviewer"))
      const before = yield* agentNames(dir)
      const work = yield* SessionWork.Service
      const store = yield* InstanceStore.Service
      const key = (yield* store.load({ directory: dir })).directory
      const started = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const active = yield* work
        .run(key, Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(finish))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)

      const refused = yield* inDirectory("POST", InstancePaths.reload, dir)
      expect(refused.status).toBe(409)
      expect(yield* refused.json).toMatchObject({ _tag: "ConflictError", resource: "session" })

      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.await(active)
      expect(yield* agentNames(dir)).toEqual(before)
    }),
  )

  it.live("reloads a project while another project has session work running", () =>
    Effect.gen(function* () {
      const one = yield* tmpdirScoped({ git: true })
      const two = yield* tmpdirScoped({ git: true })
      yield* writeConfig(one, config("first"))
      expect(yield* agentNames(one)).toContain("first")
      const work = yield* SessionWork.Service
      const store = yield* InstanceStore.Service
      const busyKey = (yield* store.load({ directory: two })).directory
      const started = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const busy = yield* work
        .run(busyKey, Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(finish))))
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)

      yield* writeConfig(one, config("renamed"))
      expect((yield* inDirectory("POST", InstancePaths.reload, one)).status).toBe(200)
      expect(yield* agentNames(one)).toContain("renamed")

      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.await(busy)
    }),
  )

  it.live("keeps the old config when the edited file is invalid and applies a valid edit", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      yield* writeConfig(dir, config("reviewer"))
      expect(yield* agentNames(dir)).toContain("reviewer")

      yield* writeConfig(dir, '{ "agent": ')
      const invalid = yield* inDirectory("POST", InstancePaths.reload, dir)
      expect(invalid.status).toBe(400)
      expect(yield* invalid.json).toMatchObject({ name: "ConfigJsonError" })
      expect(yield* agentNames(dir)).toContain("reviewer")

      yield* writeConfig(dir, config("auditor"))
      const reloaded = yield* inDirectory("POST", InstancePaths.reload, dir)
      expect(reloaded.status).toBe(200)
      expect(yield* reloaded.json).toBe(true)
      const names = yield* agentNames(dir)
      expect(names).toContain("auditor")
      expect(names).not.toContain("reviewer")
    }),
  )

  it.live("reloads only the selected directory", () =>
    Effect.gen(function* () {
      const one = yield* tmpdirScoped({ git: true })
      const two = yield* tmpdirScoped({ git: true })
      yield* writeConfig(one, config("first"))
      yield* writeConfig(two, config("second"))
      expect(yield* agentNames(one)).toContain("first")
      expect(yield* agentNames(two)).toContain("second")
      const store = yield* InstanceStore.Service
      const untouched = yield* store.load({ directory: two })

      yield* writeConfig(one, config("renamed"))
      expect((yield* inDirectory("POST", InstancePaths.reload, one)).status).toBe(200)

      expect(yield* agentNames(one)).toContain("renamed")
      expect(yield* store.load({ directory: two })).toBe(untouched)
      expect(yield* agentNames(two)).toContain("second")
    }),
  )
})
