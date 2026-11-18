import { NodeHttpServer } from "@effect/platform-node"
import { describe, expect } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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
import { OcConfig } from "../../src/config/oc"
import { _resetIdentities } from "../../src/provider/claude-code/warmup/identities"
import { materializePoolIds } from "../../src/provider/claude-code/warmup/identity"
import { _resetInventoryForTests, _setInventoryProbe } from "../../src/provider/claude-code/warmup/inventory"
import { _setStoreFile, claimOccurrence, readStore, recordAttempt } from "../../src/provider/claude-code/warmup/store"
import {
  _setClaudeAccounts,
  readClaudeAccounts,
  type SyncedAccounts,
} from "../../src/provider/claude-code/warmup/synced"
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
  Layer.provideMerge(
    AppNodeBuilder.build(LayerNode.group([SessionWork.node, InstanceStore.node]), [
      [InstanceStore.node, testInstanceStoreLayer],
    ]),
  ),
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
        Effect.sync(() =>
          ServerLifecycle.setController({
            shutdown: () => {
              Deferred.doneUnsafe(scheduled, Effect.void)
            },
            restart: () => {
              throw new Error("Unexpected restart")
            },
          }),
        ),
        (clear) => Effect.sync(clear),
      )
      const active = yield* work
        .run(
          "global",
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.ensuring(Deferred.succeed(cleaned, undefined)),
          ),
        )
        .pipe(Effect.forkChild)
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

  it.live("lists synced accounts and accounts signed in here, with a here flag and zone info", () =>
    Effect.gen(function* () {
      const file = yield* warmupTempFile()
      const lastAttempt = { scheduledAt: 1000, attemptedAt: 1100, outcome: "sent" as const, host: "goonstation" }
      yield* warmupSeams({
        file,
        signedIn: { [warmupDefaultId()]: "New@Example.test" },
        accounts: {
          "away@example.test": {
            name: "Away",
            warmup: { enabled: true, schedule: { mode: "daily", times: ["07:00"] }, updatedAt: 1 },
          },
        },
      })
      yield* Effect.promise(async () => {
        await claimOccurrence({ file, email: "away@example.test", at: 1000, now: Date.now() })
        await recordAttempt({ file, email: "away@example.test", attempt: lastAttempt })
      })
      const response = yield* HttpClientRequest.get(GlobalPaths.warmup).pipe(HttpClient.execute)

      expect(response.status).toBe(200)
      const body = (yield* response.json) as {
        accounts: Array<Record<string, unknown>>
        timeZone: string
        utcOffset: string
        available: boolean
        error?: string
      }
      // Signed in here (not yet synced) first, then synced accounts signed in elsewhere.
      expect(body.accounts).toHaveLength(2)
      expect(body.accounts[0]).toEqual({
        accountID: "new@example.test",
        label: "new@example.test",
        enabled: false,
        schedule: { mode: "daily", times: [] },
        here: true,
      })
      expect(body.accounts[1]).toMatchObject({
        accountID: "away@example.test",
        label: "Away",
        enabled: true,
        schedule: { mode: "daily", times: ["07:00"] },
        here: false,
        lastAttempt,
      })
      expect(typeof body.accounts[1]!.nextAt).toBe("number")
      expect(body.timeZone.length).toBeGreaterThan(0)
      expect(body.utcOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
      expect(typeof body.available).toBe("boolean")
      expect(body.error).toBeUndefined()
    }),
  )

  it.live("flags a signed-in folder whose email cannot be read instead of listing it", () =>
    Effect.gen(function* () {
      yield* warmupSeams({ signedIn: { [warmupDefaultId()]: undefined } })
      const response = yield* HttpClientRequest.get(GlobalPaths.warmup).pipe(HttpClient.execute)
      const body = (yield* response.json) as { accounts: unknown[]; error?: string }
      expect(response.status).toBe(200)
      expect(body.accounts).toEqual([])
      expect(body.error).toContain("could not read the email")
    }),
  )

  it.live("rejects unknown warm-up accounts", () =>
    Effect.gen(function* () {
      yield* warmupSeams({ signedIn: { [warmupDefaultId()]: "here@example.test" } })
      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "nobody@example.test",
          enabled: true,
          schedule: { mode: "daily", times: ["07:00"] },
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(404)
      expect(readClaudeAccounts()["nobody@example.test"]).toBeUndefined()
    }),
  )

  it.live("rejects malformed warm-up schedules", () =>
    Effect.gen(function* () {
      yield* warmupSeams({ signedIn: { [warmupDefaultId()]: "here@example.test" } })
      yield* openWarmupDialog
      const badClock = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "here@example.test",
          enabled: true,
          schedule: { mode: "daily", times: ["25:00"] },
        }),
        HttpClient.execute,
      )
      expect(badClock.status).toBe(400)
      expect(yield* badClock.text).toContain("HH:mm")

      const tooMany = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "here@example.test",
          enabled: true,
          schedule: {
            mode: "daily",
            times: Array.from(
              { length: 25 },
              (_, hour) => `${String(hour % 24).padStart(2, "0")}:${hour < 24 ? "00" : "30"}`,
            ),
          },
        }),
        HttpClient.execute,
      )
      expect(tooMany.status).toBe(400)
      expect(readClaudeAccounts()["here@example.test"]).toBeUndefined()
    }),
  )

  it.live("persists a valid schedule into claudeAccounts by email without touching others", () =>
    Effect.gen(function* () {
      const file = yield* warmupTempFile()
      yield* warmupSeams({
        file,
        signedIn: { [warmupDefaultId()]: "Here@Example.test" },
        accounts: {
          "extra@example.test": {
            name: "Extra",
            warmup: { enabled: true, schedule: { mode: "daily", times: ["06:00"] }, updatedAt: 1 },
          },
        },
      })
      yield* openWarmupDialog

      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "HERE@example.test",
          enabled: true,
          schedule: { mode: "daily", times: ["12:00", "07:00"] },
        }),
        HttpClient.execute,
      )
      expect(response.status).toBe(200)
      const updated = (yield* response.json) as {
        accountID: string
        enabled: boolean
        here: boolean
        schedule: unknown
        nextAt?: number
      }
      expect(updated.accountID).toBe("here@example.test")
      expect(updated.here).toBe(true)
      expect(updated.enabled).toBe(true)
      expect(updated.schedule).toEqual({ mode: "daily", times: ["07:00", "12:00"] })
      expect(typeof updated.nextAt).toBe("number")

      const saved = readClaudeAccounts()
      expect(saved["here@example.test"]?.warmup).toMatchObject({
        enabled: true,
        schedule: { mode: "daily", times: ["07:00", "12:00"] },
      })
      expect(typeof saved["here@example.test"]?.warmup?.updatedAt).toBe("number")
      expect(saved["extra@example.test"]).toEqual({
        name: "Extra",
        warmup: { enabled: true, schedule: { mode: "daily", times: ["06:00"] }, updatedAt: 1 },
      })
      // Schedules never land in the machine-local runtime store.
      expect(readStore(file).accounts["here@example.test"]).toBeUndefined()

      const state = yield* HttpClientRequest.get(GlobalPaths.warmup).pipe(HttpClient.execute)
      const body = (yield* state.json) as { accounts: Array<{ accountID: string; enabled: boolean; here?: boolean }> }
      expect(body.accounts.find((account) => account.accountID === "here@example.test")).toMatchObject({
        enabled: true,
        here: true,
      })
    }),
  )

  it.live("a synced account signed in only elsewhere can be paused from here", () =>
    Effect.gen(function* () {
      yield* warmupSeams({
        accounts: {
          "away@example.test": {
            warmup: { enabled: true, schedule: { mode: "daily", times: ["07:00"] }, updatedAt: 9 },
          },
        },
      })
      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "away@example.test",
          enabled: false,
          schedule: { mode: "daily", times: ["07:00"] },
        }),
        HttpClient.execute,
      )
      expect(response.status).toBe(200)
      const updated = (yield* response.json) as { enabled: boolean; here: boolean; nextAt?: number }
      expect(updated).toMatchObject({ enabled: false, here: false })
      expect(updated.nextAt).toBeUndefined()
      // Same times: updatedAt is kept, so a resume still catches up.
      expect(readClaudeAccounts()["away@example.test"]?.warmup).toEqual({
        enabled: false,
        schedule: { mode: "daily", times: ["07:00"] },
        updatedAt: 9,
      })
    }),
  )

  it.live("saving an empty warm-up schedule disables it but keeps no times", () =>
    Effect.gen(function* () {
      yield* warmupSeams({ signedIn: { [warmupDefaultId()]: "here@example.test" } })
      yield* openWarmupDialog
      const response = yield* HttpClientRequest.put(GlobalPaths.warmup).pipe(
        HttpClientRequest.bodyJsonUnsafe({
          accountID: "here@example.test",
          enabled: true,
          schedule: { mode: "daily", times: [] },
        }),
        HttpClient.execute,
      )

      expect(response.status).toBe(200)
      expect(((yield* response.json) as { enabled: boolean }).enabled).toBe(false)
      expect(readClaudeAccounts()["here@example.test"]?.warmup?.enabled).toBe(false)
    }),
  )

  it.live("writes the real oc.json when no seam is set, and reports a write failure instead of succeeding", () =>
    Effect.gen(function* () {
      yield* warmupSeams({ signedIn: { [warmupDefaultId()]: "here@example.test" }, realOcJson: true })
      yield* openWarmupDialog
      const ocJson = OcConfig.filePath()
      // The preload isolates XDG paths; never touch a real config.
      expect(ocJson).toContain("opencode-test-data-")
      yield* Effect.acquireRelease(
        Effect.promise(async () => {
          await mkdir(path.dirname(ocJson), { recursive: true })
          await rm(ocJson, { recursive: true, force: true })
        }),
        () => Effect.promise(() => rm(ocJson, { recursive: true, force: true })),
      )
      const put = () =>
        HttpClientRequest.put(GlobalPaths.warmup).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            accountID: "here@example.test",
            enabled: true,
            schedule: { mode: "daily", times: ["07:00"] },
          }),
          HttpClient.execute,
        )
      yield* Effect.promise(() => writeFile(ocJson, '{\n  // mine\n  "claudeFailover": "ask"\n}\n', "utf8"))
      const ok = yield* put()
      expect(ok.status).toBe(200)
      const text = yield* Effect.promise(() => readFile(ocJson, "utf8"))
      expect(text).toContain("// mine")
      expect(JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")).claudeAccounts["here@example.test"].warmup.schedule).toEqual(
        {
          mode: "daily",
          times: ["07:00"],
        },
      )

      // A directory at the oc.json path is an I/O failure.
      yield* Effect.promise(async () => {
        await rm(ocJson, { force: true })
        await mkdir(ocJson)
      })
      const failed = yield* put()
      expect(failed.status).toBe(500)
    }),
  )
})

/** The dialog's own GET: it probes the folders, which is how the server learns which email is signed in here. */
const openWarmupDialog = HttpClientRequest.get(GlobalPaths.warmup).pipe(HttpClient.execute, Effect.asVoid)

function warmupDefaultId() {
  return materializePoolIds(undefined)[0]!
}

function warmupTempFile() {
  return Effect.acquireRelease(
    Effect.promise(async () => {
      const dir = await mkdtemp(path.join(tmpdir(), "warmup-httpapi-"))
      return path.join(dir, "warmup-state.json")
    }),
    (file) => Effect.promise(() => rm(path.dirname(file), { recursive: true, force: true })).pipe(Effect.ignore),
  )
}

/**
 * Seams for the warm-up routes: the runtime store file, the folders signed in here (folder -> email;
 * `undefined` is a login whose email cannot be read), and the synced `claudeAccounts` (an in-memory
 * map unless `realOcJson`, which reads and writes the test-isolated oc.json).
 */
function warmupSeams(input: {
  file?: string | null
  signedIn?: Record<string, string | undefined>
  accounts?: SyncedAccounts
  realOcJson?: boolean
}) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      const signedIn = input.signedIn ?? {}
      _setStoreFile(input.file ?? null)
      _resetIdentities(null)
      _setClaudeAccounts(input.realOcJson ? undefined : (input.accounts ?? {}))
      _setInventoryProbe(async (_cliPath, id) =>
        id in signedIn
          ? { id, status: "connected" as const, ...(signedIn[id] ? { email: signedIn[id] } : {}) }
          : { id, status: "signed-out" as const },
      )
    }),
    () =>
      Effect.sync(() => {
        _setStoreFile(undefined)
        _setClaudeAccounts(undefined)
        _resetIdentities(undefined)
        _setInventoryProbe(null)
        _resetInventoryForTests()
      }),
  )
}
