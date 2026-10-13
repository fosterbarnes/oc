import { afterEach, describe, expect } from "bun:test"
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Config, Effect, Layer } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse, HttpRouter, HttpServer } from "effect/unstable/http"
import { layerWebSocketConstructorGlobal } from "effect/unstable/socket/Socket"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Workspace } from "../../src/control-plane/workspace"
import { InstanceBootstrap as InstanceBootstrapService } from "../../src/project/bootstrap-service"
import { InstanceStore } from "../../src/project/instance-store"
import { Project } from "../../src/project/project"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { SessionPaths } from "../../src/server/routes/instance/httpapi/groups/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { SessionQueue } from "@/session/queue"
import { SessionRunState } from "@/session/run-state"
import { resetDatabase } from "../fixture/db"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { testProviderConfig } from "../lib/test-provider"

const noopBootstrapLayer = Layer.succeed(
  InstanceBootstrapService.Service,
  InstanceBootstrapService.Service.of({ run: Effect.void }),
)
const appLayer = AppNodeBuilder.build(
  LayerNode.group([
    InstanceStore.node,
    Project.node,
    Session.node,
    SessionRunState.node,
    SessionPrompt.node,
    SessionQueue.node,
    EventV2Bridge.node,
    Workspace.node,
    Database.node,
    Ripgrep.node,
  ]),
  [[InstanceStore.bootstrapNode, noopBootstrapLayer]],
)
const servedRoutes: Layer.Layer<never, Config.ConfigError, HttpServer.HttpServer> = HttpRouter.serve(
  HttpApiApp.routes,
  {
    disableListenLog: true,
    disableLogger: true,
  },
)
const httpApiLayer = servedRoutes.pipe(
  Layer.provide(layerWebSocketConstructorGlobal),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
)
const it = testEffect(Layer.mergeAll(appLayer, httpApiLayer))

function pathFor(path: string, params: Record<string, string>) {
  return Object.entries(params).reduce((result, [key, value]) => result.replace(`:${key}`, value), path)
}

function request(path: string, init?: RequestInit) {
  const url = new URL(path, "http://localhost")
  return HttpClientRequest.fromWeb(new Request(url, init)).pipe(
    HttpClientRequest.setUrl(url.pathname),
    HttpClient.execute,
  )
}

function json<T>(response: HttpClientResponse.HttpClientResponse) {
  return response.json.pipe(Effect.map((value) => value as T))
}

afterEach(async () => {
  await disposeAllInstances()
  await resetDatabase()
})

describe("session queue HttpApi", () => {
  it.instance(
    "adds, edits, cancels, and resumes queued prompts with typed errors",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance
        const session = yield* Session.use.create({ title: "queue http" })
        const headers = { "x-opencode-directory": test.directory, "content-type": "application/json" }
        const path = pathFor(SessionPaths.queue, { sessionID: session.id })
        const post = (body: unknown) => request(path, { method: "POST", headers, body: JSON.stringify(body) })

        const empty = yield* request(path, { headers }).pipe(Effect.flatMap(json<{ entries: unknown[] }>))
        expect(empty.entries).toEqual([])

        // Holding maintenance keeps the drain from sending the prompt while the calls below run.
        const state = yield* SessionRunState.Service
        yield* state.maintenance(
          session.id,
          Effect.gen(function* () {
            const added = yield* post({ type: "add", parts: [{ type: "text", text: "later" }] }).pipe(
              Effect.flatMap(json<{ entries: { id: string; state: string; text: string }[] }>),
            )
            expect(added.entries.map((entry) => [entry.state, entry.text])).toEqual([["pending", "later"]])
            const id = added.entries[0]!.id

            const edited = yield* post({ type: "edit", id, text: "changed" }).pipe(
              Effect.flatMap(json<{ entries: { text: string }[] }>),
            )
            expect(edited.entries.map((entry) => entry.text)).toEqual(["changed"])

            const missing = yield* post({ type: "cancel", id: "msg_missing" })
            expect(missing.status).toBe(404)

            const synthetic = yield* post({
              type: "add",
              parts: [{ type: "text", text: "system", synthetic: true }],
            })
            expect(synthetic.status).toBe(400)

            const cancelled = yield* post({ type: "cancel", id }).pipe(Effect.flatMap(json<{ entries: unknown[] }>))
            expect(cancelled.entries).toEqual([])

            const resumed = yield* post({ type: "resume" }).pipe(Effect.flatMap(json<{ pause: string }>))
            expect(resumed.pause).toBe("none")
          }),
        )
      }),
    { config: testProviderConfig("http://127.0.0.1:1") },
  )
})
