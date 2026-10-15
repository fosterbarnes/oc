import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
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
import { materializePoolIds } from "../../src/provider/claude-code/warmup/identity"
import { _resetInventoryForTests, _setInventoryProbe } from "../../src/provider/claude-code/warmup/inventory"
import { _setStoreFile, readStore, setAccountSchedule } from "../../src/provider/claude-code/warmup/store"
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
  Layer.provide(
    Layer.mock(Config.Service)({
      getGlobal: () => Effect.succeed({ provider: { "claude-code": { options: { cliPath: "claude" } } } }),
    }),
  ),
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
      const active = yield* work.run("global", Deferred.succeed(started, undefined).pipe(
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
      const rejected = yield* work.run("global", Effect.die("must not execute")).pipe(Effect.exit)
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

  it.live("returns warm-up state with connected accounts and zone info", () =>
    Effect.gen(function* () {
      yield* warmupSeams(null, [warmupDefaultId()])
      const response = yield* HttpClientRequest.get(GlobalPaths.warmup).pipe(HttpClient.execute)

      expect(response.status).toBe(200)
      const body = (yield* response.json) as {
        accounts: Array<{ accountID: string; label: string; enabled: boolean; schedule: unknown }>
        timeZone: string
        utcOffset: string
        available: boolean
      }
      expect(body.accounts).toEqual([
        {
          accountID: warmupDefaultId(),
          label: path.basename(warmupDefaultId()),
          enabled: false,
          schedule: { mode: "daily", times: [] },
        },
      ])
      expect(body.timeZone.length).toBeGreaterThan(0)
      expect(body.utcOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
      expect(typeof body.available).toBe("boolean")
    }),
  )

  it.live("rejects unknown warm-up accounts", () =>
    Effect.gen(function* () {
      yield* warmupSeams(null, [warmupDefaultId()])
      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "nope",
          enabled: true,
          schedule: { mode: "daily", times: ["07:00"] },
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(404)
    }),
  )

  it.live("rejects malformed warm-up schedules", () =>
    Effect.gen(function* () {
      yield* warmupSeams(null, [warmupDefaultId()])
      const badClock = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: warmupDefaultId(),
          enabled: true,
          schedule: { mode: "daily", times: ["25:00"] },
        }),
        HttpClient.execute,
      )
      expect(badClock.status).toBe(400)
      expect(yield* badClock.text).toContain("HH:mm")

      const tooMany = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: warmupDefaultId(),
          enabled: true,
          schedule: { mode: "daily", times: ["00:00", "01:00", "02:00", "03:00", "04:00"] },
        }),
        HttpClient.execute,
      )
      expect(tooMany.status).toBe(400)
    }),
  )

  it.live("persists warm-up schedules per account without touching others", () =>
    Effect.gen(function* () {
      const file = yield* warmupTempFile()
      yield* warmupSeams(file, [warmupDefaultId()])
      yield* Effect.promise(() =>
        setAccountSchedule({
          file,
          accountID: "extra",
          enabled: true,
          schedule: { mode: "daily", times: ["06:00"] },
        }),
      )

      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: warmupDefaultId(),
          enabled: true,
          schedule: { mode: "daily", times: ["12:00", "07:00"] },
        }),
        HttpClient.execute,
      )
      expect(response.status).toBe(200)
      const updated = (yield* response.json) as { accountID: string; enabled: boolean; schedule: unknown; nextAt?: number }
      expect(updated.accountID).toBe(warmupDefaultId())
      expect(updated.enabled).toBe(true)
      expect(updated.schedule).toEqual({ mode: "daily", times: ["07:00", "12:00"] })
      expect(typeof updated.nextAt).toBe("number")

      const state = yield* HttpClientRequest.get(GlobalPaths.warmup).pipe(HttpClient.execute)
      const body = (yield* state.json) as { accounts: Array<{ accountID: string; enabled: boolean }> }
      expect(body.accounts.find((account) => account.accountID === warmupDefaultId())?.enabled).toBe(true)
      const stored = readStore(file)
      expect(stored.status === "ok" && stored.state.accounts["extra"]?.schedule).toEqual({
        mode: "daily",
        times: ["06:00"],
      })
    }),
  )

  it.live("saving an empty warm-up schedule disables it but keeps no times", () =>
    Effect.gen(function* () {
      const file = yield* warmupTempFile()
      yield* warmupSeams(file, [warmupDefaultId()])
      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({ accountID: warmupDefaultId(), enabled: true, schedule: { mode: "daily", times: [] } }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(((yield* response.json) as { enabled: boolean }).enabled).toBe(false)
    }),
  )

  it.live("reports warm-up store write failures instead of succeeding", () =>
    Effect.gen(function* () {
      const file = yield* warmupTempFile()
      yield* warmupSeams(file, [warmupDefaultId()])
      yield* Effect.promise(() => writeFile(file, "not json", "utf8"))
      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: warmupDefaultId(),
          enabled: true,
          schedule: { mode: "daily", times: ["07:00"] },
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(500)
      expect(yield* response.text).toContain("warm-up")
    }),
  )
})

function warmupDefaultId() {
  return materializePoolIds(undefined)[0]!
}

function warmupTempFile() {
  return Effect.acquireRelease(
    Effect.promise(async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "warmup-httpapi-"))
      return path.join(dir, "warmup.json")
    }),
    (file) => Effect.promise(() => rm(path.dirname(file), { recursive: true, force: true })).pipe(Effect.ignore),
  )
}

function warmupSeams(file: string | null, connected: string[]) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      _setStoreFile(file)
      _setInventoryProbe(async (cliPath, id) => ({
        id,
        status: connected.includes(id) ? ("connected" as const) : ("signed-out" as const),
      }))
    }),
    () =>
      Effect.sync(() => {
        _setStoreFile(undefined)
        _setInventoryProbe(null)
        _resetInventoryForTests()
      }),
  )
}
