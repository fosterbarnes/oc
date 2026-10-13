/**
 * Listener-owned warm-up scheduler lifecycle.
 *
 * Builds only warmupLoopLayer (with a mocked Config) inside an explicitly
 * managed scope: the loop ticks there, and closing the scope ends a pending
 * auth probe with no later model spawn. Handler-layer construction is
 * deliberately never built here: scheduling lives only in warmupLoopLayer,
 * which server.ts merges into the real listener layer, so a behavioral
 * "construction schedules nothing" check would need a 16s+ wait to mean
 * anything and is left to structure instead.
 */
import { afterEach, beforeEach, describe, expect } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Effect, Exit, Layer, Scope } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { Config } from "@/config/config"
import { makeWarmupLoop } from "@/server/routes/instance/httpapi/handlers/global"
import {
  _resetInventoryForTests,
  _setCliRunner,
  _setInventoryProbe,
  _setStoreFile,
  readStore,
  storeKeyForAccount,
  setAccountSchedule,
} from "@/provider/claude-code/warmup.js"
import { testEffect } from "../lib/effect"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")
const POLL_MS = 50

const pad = (value: number) => String(value).padStart(2, "0")

function hhmm(ms: number): string {
  const date = new Date(ms)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Fixed local noon anchor so minute slots never depend on wall clock. */
const SCHEDULE_BASE_MS = new Date(2026, 6, 10, 12, 0, 0, 0).getTime()

function warmupLoopLayer(currentMs: { value: number }, accounts: () => string[]) {
  return Layer.effectDiscard(makeWarmupLoop(POLL_MS, { now: () => currentMs.value })).pipe(
    Layer.provide(
      Layer.mock(Config.Service)({
        invalidate: () => Effect.void,
        getGlobal: () =>
          Effect.succeed({
            provider: { "claude-code": { options: { accounts: accounts(), cliPath: cliPath ?? "claude" } } },
          }),
      }),
    ),
  )
}

/** Steps the loop clock and TestClock one poll at a time so real promises settle between ticks. */
function advanceTo(currentMs: { value: number }, targetMs: number) {
  return Effect.gen(function* () {
    while (currentMs.value < targetMs) {
      currentMs.value += POLL_MS
      yield* TestClock.adjust(POLL_MS)
      yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)))
    }
  })
}

/** Real-time wait: TestClock never advances Effect timeouts, so a hung tick would hang the test. */
function waitFor(label: string, ready: () => boolean) {
  return Effect.promise(async () => {
    const deadline = Date.now() + 5_000
    while (!ready()) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`)
      await Bun.sleep(5)
    }
  })
}

function lastAttemptOf(accountID: string) {
  const stored = readStore(storeFile)
  return stored.status === "ok" ? stored.state.accounts[storeKeyForAccount(accountID)]?.lastAttempt : undefined
}

const { effect } = testEffect(Layer.empty)

let dir = ""
let storeFile = ""

beforeEach(() => {
  _resetInventoryForTests()
  _setCliRunner(null)
  _setInventoryProbe(null)
  dir = mkdtempSync(path.join(tmpdir(), "warmup-listener-"))
  storeFile = path.join(dir, "warmup.json")
  _setStoreFile(storeFile)
})

afterEach(() => {
  _resetInventoryForTests()
  _setCliRunner(null)
  _setInventoryProbe(null)
  _setStoreFile(undefined)
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!cliPath)("warmup listener lifecycle", () => {
  effect("scope start ticks, scope stop ends pending auth without model spawn", () =>
    Effect.gen(function* () {
      const slotAt = SCHEDULE_BASE_MS + 60_000
      const accountID = path.join(dir, "claude-pending")
      yield* Effect.promise(() =>
        setAccountSchedule({
          file: storeFile,
          accountID,
          enabled: true,
          schedule: { mode: "daily", times: [hhmm(slotAt)] },
        }),
      )

      _setInventoryProbe(async (_cli, id) => ({ id, status: "connected" }))

      let authReady = false
      let authSpawns = 0
      let modelSpawns = 0
      _setCliRunner(async (opts) => {
        if (opts.args[0] === "auth") {
          authSpawns += 1
          authReady = true
          await new Promise<void>((resolve) => opts.signal?.addEventListener("abort", () => resolve(), { once: true }))
          return { code: null, stdout: "", stderr: "aborted", timedOut: false }
        }
        modelSpawns += 1
        return {
          code: 0,
          stdout: JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "s" }),
          stderr: "",
          timedOut: false,
        }
      })

      const currentMs = { value: SCHEDULE_BASE_MS - 45_000 }
      yield* TestClock.setTime(currentMs.value)

      const scope = yield* Scope.make()
      yield* Layer.buildWithMemoMap(warmupLoopLayer(currentMs, () => [accountID]), Layer.makeMemoMapUnsafe(), scope)
      yield* Effect.yieldNow

      yield* advanceTo(currentMs, slotAt)
      yield* waitFor("auth probe start", () => authReady)
      expect(authSpawns).toBe(1)

      yield* Scope.close(scope, Exit.void)
      // Grace period for a (wrongly) surviving loop to reach the model spawn.
      yield* Effect.promise(() => Bun.sleep(150))
      expect(authSpawns).toBe(1)
      expect(modelSpawns).toBe(0)
    }),
  )

  effect("loop observes global config updates through the shared service", () =>
    Effect.gen(function* () {
      const slotA = SCHEDULE_BASE_MS + 60_000
      const slotB = SCHEDULE_BASE_MS + 120_000
      const accountA = path.join(dir, "claude-a")
      const accountB = path.join(dir, "claude-b")
      yield* Effect.promise(() =>
        Promise.all([
          setAccountSchedule({
            file: storeFile,
            accountID: accountA,
            enabled: true,
            schedule: { mode: "daily", times: [hhmm(slotA)] },
          }),
          setAccountSchedule({
            file: storeFile,
            accountID: accountB,
            enabled: true,
            schedule: { mode: "daily", times: [hhmm(slotB)] },
          }),
        ]),
      )

      const sentTo: string[] = []
      _setInventoryProbe(async (_cli, id) => ({ id, status: "connected" }))
      _setCliRunner(async (opts) => {
        if (opts.args[0] === "auth") {
          return {
            code: 0,
            stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }),
            stderr: "",
            timedOut: false,
          }
        }
        const configDir = opts.env.CLAUDE_CONFIG_DIR ?? ""
        sentTo.push(configDir)
        return {
          code: 0,
          stdout: JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "s" }),
          stderr: "",
          timedOut: false,
        }
      })

      let accounts: string[] = [accountA]
      const currentMs = { value: SCHEDULE_BASE_MS - 45_000 }
      yield* TestClock.setTime(currentMs.value)

      const scope = yield* Scope.make()
      yield* Layer.buildWithMemoMap(warmupLoopLayer(currentMs, () => accounts), Layer.makeMemoMapUnsafe(), scope)
      yield* Effect.yieldNow

      yield* advanceTo(currentMs, slotA)
      yield* waitFor("account A send", () => sentTo.includes(accountA))
      // Outcome write ends the tick; only then is the loop back to sleeping.
      yield* waitFor("account A outcome", () => !!lastAttemptOf(accountA))
      expect(sentTo).toEqual([accountA])

      accounts = [accountB]
      yield* advanceTo(currentMs, slotB)
      yield* waitFor("account B send", () => sentTo.includes(accountB))
      expect(sentTo).toEqual([accountA, accountB])

      yield* Scope.close(scope, Exit.void)
    }),
  )
})

