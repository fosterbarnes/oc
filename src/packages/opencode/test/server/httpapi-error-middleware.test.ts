import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { NamedError } from "@opencode-ai/core/util/error"
import { describe, expect } from "bun:test"
import { ConfigErrorV1 } from "@opencode-ai/core/v1/config/error"
import { Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpRouter, HttpServerResponse } from "effect/unstable/http"
import { errorLayer } from "../../src/server/routes/instance/httpapi/middleware/error"
import { NotFoundError } from "../../src/storage/storage"
import { SessionRunState } from "../../src/session/run-state"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Flock } from "@opencode-ai/core/util/flock"
import { Global } from "@opencode-ai/core/global"
import { InstanceRef } from "../../src/effect/instance-ref"
import { SessionID } from "../../src/session/schema"
import { TestInstance } from "../fixture/fixture"
import path from "node:path"
import fs from "node:fs/promises"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(
  NodeHttpServer.layerTest, NodeServices.layer, AppNodeBuilder.build(SessionRunState.node),
))

function expectUnknownErrorBody(body: unknown) {
  expect(body).toMatchObject({
    name: "UnknownError",
    data: { message: "Unexpected server error. Check server logs for details." },
  })
  expect((body as { data?: { ref?: unknown } }).data?.ref).toMatch(/^err_[0-9a-f-]{8}$/)
}

describe("HttpApi error middleware", () => {
  it.live("returns a safe body for unknown 500 defects", () =>
    Effect.gen(function* () {
      yield* HttpRouter.add("GET", "/boom", Effect.die(new Error("secret stack marker"))).pipe(
        Layer.provide(errorLayer),
        HttpRouter.serve,
        Layer.build,
      )

      const response = yield* HttpClientRequest.get("/boom").pipe(HttpClient.execute)
      const body = yield* response.json

      expect(response.status).toBe(500)
      expectUnknownErrorBody(body)
      expect(JSON.stringify(body)).not.toContain("secret stack marker")
    }),
  )

  it.live("returns a safe body for named defects", () =>
    Effect.gen(function* () {
      yield* HttpRouter.add(
        "GET",
        "/named",
        Effect.die(new NamedError.Unknown({ message: "secret named marker" })),
      ).pipe(Layer.provide(errorLayer), HttpRouter.serve, Layer.build)

      const response = yield* HttpClientRequest.get("/named").pipe(HttpClient.execute)
      const body = yield* response.json

      expect(response.status).toBe(500)
      expectUnknownErrorBody(body)
      expect(JSON.stringify(body)).not.toContain("secret named marker")
    }),
  )

  it.instance("classifies real session guard contention as 409 and filesystem failures as safe 500", () =>
    Effect.gen(function* () {
      const state = yield* SessionRunState.Service
      const instance = yield* InstanceRef
      const test = yield* TestInstance
      Flock.setGlobal({ state: test.directory })
      yield* Effect.addFinalizer(() => Effect.sync(() => Flock.setGlobal({ state: Global.Path.state })))
      const id = SessionID.make("ses_lockClassification")
      const lease = yield* Effect.promise(() => Flock.acquire(`session:${id}`))
      let released = false
      yield* Effect.addFinalizer(() => released ? Effect.void : Effect.promise(() => lease.release()))
      const work = Effect.die(new Error("guard unexpectedly ran work"))
      yield* Layer.mergeAll(
        HttpRouter.add("GET", "/held",
          state.ensureRunning(id, work, work).pipe(
            Effect.as(HttpServerResponse.empty({ status: 200 })),
            Effect.provideService(InstanceRef, instance))),
        HttpRouter.add("GET", "/shell-held",
          state.startShell(id, work, work).pipe(
            Effect.as(HttpServerResponse.empty({ status: 200 })),
            Effect.provideService(InstanceRef, instance))),
      ).pipe(Layer.provide(errorLayer), HttpRouter.serve, Layer.build)

      for (const route of ["/held", "/shell-held"]) {
        const response = yield* HttpClientRequest.get(route).pipe(HttpClient.execute)
        expect(response.status).toBe(409)
        expect(yield* response.json).toMatchObject({
          name: "UnknownError", data: { message: "Session is running in another oc process" },
        })
      }
      yield* Effect.promise(() => lease.release())
      released = true
      yield* Effect.promise(() => fs.rm(path.join(test.directory, "locks"), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(path.join(test.directory, "locks"), "not a directory"))
      for (const route of ["/held", "/shell-held"]) {
        const response = yield* HttpClientRequest.get(route).pipe(HttpClient.execute)
        const body = yield* response.json
        expect(response.status).toBe(500)
        expectUnknownErrorBody(body)
        expect(JSON.stringify(body)).not.toContain(test.directory)
        expect(JSON.stringify(body)).not.toContain("EEXIST")
      }
    }),
  )

  it.live("returns invalid config defects as structured client errors", () =>
    Effect.gen(function* () {
      const configError = new ConfigErrorV1.InvalidError({
        path: "/tmp/opencode.json",
        issues: [{ message: "Expected object", path: ["provider", "anthropic", "options"] }],
      })

      yield* HttpRouter.add("GET", "/config-error", Effect.die(configError)).pipe(
        Layer.provide(errorLayer),
        HttpRouter.serve,
        Layer.build,
      )

      const response = yield* HttpClientRequest.get("/config-error").pipe(HttpClient.execute)
      const body = yield* response.json
      const serialized = JSON.stringify(body)

      expect(response.status).toBe(400)
      expect(body).toMatchObject({
        name: "ConfigInvalidError",
        data: {
          path: "/tmp/opencode.json",
          issues: [{ message: "Expected object", path: ["provider", "anthropic", "options"] }],
        },
      })
      expect(serialized).toContain("/tmp/opencode.json")
      expect(serialized).toContain("anthropic")
    }),
  )

  it.live("does not map storage not-found defects to 404", () =>
    Effect.gen(function* () {
      yield* HttpRouter.add(
        "GET",
        "/missing",
        Effect.die(new NotFoundError({ message: "Resource not found: secret" })),
      ).pipe(Layer.provide(errorLayer), HttpRouter.serve, Layer.build)

      const response = yield* HttpClientRequest.get("/missing").pipe(HttpClient.execute)
      const body = yield* response.json

      expect(response.status).toBe(500)
      expectUnknownErrorBody(body)
    }),
  )
})
