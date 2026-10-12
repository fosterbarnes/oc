import { describe, expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionWork } from "@opencode-ai/core/session/work"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import path from "node:path"
import { InstanceStore } from "../../src/project/instance-store"
import { ServerShutdown } from "../../src/server/shutdown"
import { SessionRunState } from "../../src/session/run-state"
import { Session } from "../../src/session/session"
import { MessageID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      SessionRunState.node,
      Session.node,
      SessionStatus.node,
      SessionWork.node,
      SessionPrompt.node,
      Database.node,
      EventV2.node,
      SessionProjector.node,
      InstanceStore.node,
    ]),
    [[InstanceStore.node, testInstanceStoreLayer]],
  ),
)

describe("ServerShutdown", () => {
  it.instance(
    "stops command-template subprocesses before shutdown completes",
    () =>
      Effect.gen(function* () {
        const session = yield* Session.Service
        const prompt = yield* SessionPrompt.Service
        const test = yield* TestInstance
        const chat = yield* session.create({ title: "Shutdown probe" })
        const command = yield* prompt
          .command({
            sessionID: chat.id,
            command: "shutdownProbe",
            arguments: "",
            agent: "build",
          })
          .pipe(Effect.forkChild)
        const pid = yield* pollWithTimeout(
          Effect.promise(async () => {
            const file = Bun.file(path.join(test.directory, "shutdown.pid"))
            if (!(await file.exists())) return
            const pid = Number(await file.text())
            return Number.isInteger(pid) && pid > 0 ? pid : undefined
          }),
          "command-template subprocess did not start",
        )
        yield* Effect.addFinalizer(() =>
          Effect.try({
            try: () => process.kill(pid),
            catch: (error) => error,
          }).pipe(Effect.ignore),
        )
        yield* ServerShutdown.prepare()
        yield* Fiber.await(command)
        expect(() => process.kill(pid, 0)).toThrow()
      }),
    {
      init: (directory) =>
        Effect.promise(() =>
          Bun.write(
            path.join(directory, "opencode.json"),
            JSON.stringify({
              shell: "pwsh",
              command: {
                shutdownProbe: {
                  template:
                    "!`[IO.File]::WriteAllText('" +
                    path.join(directory, "shutdown.pid") +
                    "', [string]$PID); Start-Sleep -Seconds 30`",
                },
              },
            }),
          ),
        ).pipe(Effect.asVoid),
    },
    15_000,
  )

  it.instance("joins legacy execution cleanup before disposing instances", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const state = yield* SessionRunState.Service
      const status = yield* SessionStatus.Service
      const chat = yield* session.create({})
      const message = {
        info: yield* session.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          role: "user",
          agent: "build",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
          time: { created: Date.now() },
        }),
        parts: [],
      }
      const started = yield* Deferred.make<void>()
      const cleaning = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const active = yield* state
        .ensureRunning(
          chat.id,
          Effect.succeed(message),
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(cleaning, undefined).pipe(Effect.andThen(Deferred.await(finish)))),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)
      const shutdown = yield* ServerShutdown.prepare().pipe(Effect.forkChild)
      yield* Deferred.await(cleaning)
      expect(shutdown.pollUnsafe()).toBeUndefined()
      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.join(shutdown)
      yield* Fiber.await(active)
      expect(yield* status.get(chat.id)).toEqual({ type: "idle" })
    }),
  )

  // The single-instance worker drains with a short cap so window close stays inside Windows' ~5 s grace.
  it.instance("drain gives up on stuck cleanup after its timeout", () =>
    Effect.gen(function* () {
      const session = yield* Session.Service
      const state = yield* SessionRunState.Service
      const work = yield* SessionWork.Service
      const chat = yield* session.create({})
      const message = {
        info: yield* session.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          role: "user",
          agent: "build",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test") },
          time: { created: Date.now() },
        }),
        parts: [],
      }
      const started = yield* Deferred.make<void>()
      const finish = yield* Deferred.make<void>()
      const active = yield* state
        .ensureRunning(
          chat.id,
          Effect.succeed(message),
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.await(finish)),
          ),
        )
        .pipe(Effect.forkChild)
      yield* Deferred.await(started)
      yield* ServerShutdown.drain(work, "200 millis")
      expect(active.pollUnsafe()).toBeUndefined()
      yield* Deferred.succeed(finish, undefined)
      yield* Fiber.await(active)
    }),
  )
})
