import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { Context, Deferred, Effect, Fiber, Layer, Option } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionWork } from "@opencode-ai/core/session/work"
import { HttpBody, HttpClient, HttpClientRequest, HttpRouter } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { Installation } from "../../src/installation"
import { MoveSession } from "@opencode-ai/core/control-plane/move-session"
import { ServerAuth } from "../../src/server/auth"
import { RootHttpApi } from "../../src/server/routes/instance/httpapi/api"
import { GlobalPaths } from "../../src/server/routes/instance/httpapi/groups/global"
import { controlHandlers } from "../../src/server/routes/instance/httpapi/handlers/control"
import { controlPlaneHandlers } from "../../src/server/routes/instance/httpapi/handlers/control-plane"
import { globalHandlers } from "../../src/server/routes/instance/httpapi/handlers/global"
import { authorizationLayer } from "../../src/server/routes/instance/httpapi/middleware/authorization"
import { schemaErrorLayer } from "../../src/server/routes/instance/httpapi/middleware/schema-error"
import { testEffect } from "../lib/effect"
import { InstanceStore } from "../../src/project/instance-store"
import { ServerLifecycle } from "../../src/server/lifecycle"
import { testInstanceStoreLayer } from "../fixture/fixture"

const apiLayer = HttpRouter.serve(
  HttpApiBuilder.layer(RootHttpApi).pipe(
    Layer.provide([controlHandlers, controlPlaneHandlers, globalHandlers]),
    Layer.provide([authorizationLayer, schemaErrorLayer]),
    // Raw HttpApi routes expose an opaque handler context at the request boundary.
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    HttpRouter.provideRequest(Layer.succeedContext(Context.empty() as Context.Context<unknown>)),
  ),
  { disableListenLog: true, disableLogger: true },
).pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(Layer.mock(Auth.Service)({})),
  Layer.provide(Layer.mock(Config.Service)({})),
  Layer.provide(Layer.mock(MoveSession.Service)({})),
  Layer.provide(
    Layer.mock(Installation.Service)({
      method: () => Effect.succeed("npm"),
      latest: () => Effect.succeed("9.9.9"),
      upgrade: () => Effect.void,
    }),
  ),
  Layer.provide(ServerAuth.Config.configLayer({ password: Option.none(), username: "opencode" })),
  Layer.provideMerge(AppNodeBuilder.build(
    LayerNode.group([SessionWork.node, InstanceStore.node]),
    [[InstanceStore.node, testInstanceStoreLayer]],
  )),
)
const it = testEffect(apiLayer)

describe("global HttpApi", () => {
  it.live("prepares coordinated shutdown before scheduling the managed process exit", () =>
    Effect.gen(function* () {
      const work = yield* SessionWork.Service
      const started = yield* Deferred.make<void>()
      const cleaned = yield* Deferred.make<void>()
      const scheduled = yield* Deferred.make<void>()
      yield* Effect.acquireRelease(
        Effect.sync(() => ServerLifecycle.setController({
          shutdown: () => { Deferred.doneUnsafe(scheduled, Effect.void) },
          restart: () => { throw new Error("Unexpected restart") },
        })),
        (clear) => Effect.sync(clear),
      )
      const active = yield* work.run(Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Deferred.succeed(cleaned, undefined)),
      )).pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const response = yield* HttpClientRequest.post(GlobalPaths.shutdown).pipe(HttpClient.execute)
      expect(response.status).toBe(200)
      expect(yield* response.json).toBeTrue()
      expect(yield* Deferred.isDone(cleaned)).toBeTrue()
      yield* Deferred.await(scheduled)
      yield* Fiber.await(active)
      const rejected = yield* work.run(Effect.die("must not execute")).pipe(Effect.exit)
      expect(rejected._tag).toBe("Failure")
    }),
  )

  it.live("upgrades to the requested version", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: "9.9.9" }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(yield* response.json).toEqual({ success: true, version: "9.9.9" })
    }),
  )

  it.live("rejects invalid upgrade payloads", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: 1 }),
        HttpClient.execute,
      )

      expect(response.status).toBe(400)
    }),
  )

  it.live("rejects invalid upgrade target versions", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.bodyJsonUnsafe({ target: "latest" }),
        HttpClient.execute,
      )

      expect(response.status).toBe(400)
    }),
  )

  it.live("rejects unsupported upgrade content types", () =>
    Effect.gen(function* () {
      const response = yield* HttpClientRequest.post(GlobalPaths.upgrade).pipe(
        HttpClientRequest.setBody(HttpBody.text('{"target":"1.0.0"}', "text/plain")),
        HttpClient.execute,
      )

      expect(response.status).toBe(415)
    }),
  )

  it.live("rejects lifecycle controls for an unmanaged server", () =>
    Effect.gen(function* () {
      const shutdown = yield* HttpClientRequest.post(GlobalPaths.shutdown).pipe(HttpClient.execute)
      const restart = yield* HttpClientRequest.post(GlobalPaths.restart).pipe(HttpClient.execute)

      expect(shutdown.status).toBe(409)
      expect(restart.status).toBe(409)
    }),
  )
})
