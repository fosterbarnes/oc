/**
 * Listener-owned warm-up scheduler lifecycle.
 *
 * Builds only warmupLoopLayer (with a mocked Config) inside an explicitly
 * managed scope: the loop ticks there on a fake clock, with a no-peer PeerSource and a ready
 * migration gate (deps.peers / deps.ready, so no tailnet or sync is touched), a slot crossed
 * between ticks fires once, a slot crossed before the loop started is caught up on its first
 * tick, and closing the scope ends a pending auth probe with no later model spawn. Handler-layer construction is
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
import { _setCliRunner } from "@/provider/claude-code/warmup/cli"
import { _resetInventoryForTests, _setInventoryProbe } from "@/provider/claude-code/warmup/inventory"
import { _resetIdentities } from "@/provider/claude-code/warmup/identities"
import type { PeerSource } from "@/provider/claude-code/warmup/peers"
import { _setStoreFile, readStore } from "@/provider/claude-code/warmup/store"
import { _setClaudeAccounts, type SyncedAccounts } from "@/provider/claude-code/warmup/synced"
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

/** No tailnet: this machine alone, and the account migration gate is open. */
const noPeers: PeerSource = { self: async () => "test-host", views: async () => [] }

function warmupLoopLayer(currentMs: { value: number }, accounts: () => string[]) {
  return Layer.effectDiscard(
    makeWarmupLoop(POLL_MS, { now: () => currentMs.value }, { peers: noPeers, ready: () => true }),
  ).pipe(
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

function lastAttemptOf(email: string) {
  return readStore(storeFile).accounts[email]?.lastAttempt
}

const scheduled = (...slots: Array<[email: string, slotAt: number]>): SyncedAccounts =>
  Object.fromEntries(
    slots.map(([email, slotAt]) => [
      email,
      { warmup: { enabled: true, schedule: { mode: "daily" as const, times: [hhmm(slotAt)] }, updatedAt: 0 } },
    ]),
  )

const sentBody = JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "s" })

const { effect } = testEffect(Layer.empty)

let dir = ""
let storeFile = ""

beforeEach(() => {
  _resetInventoryForTests()
  _setCliRunner(null)
  _setInventoryProbe(null)
  dir = mkdtempSync(path.join(tmpdir(), "warmup-listener-"))
  storeFile = path.join(dir, "warmup-state.json")
  _setStoreFile(storeFile)
  _resetIdentities(null)
  _setClaudeAccounts({})
})

afterEach(() => {
  _resetInventoryForTests()
  _setCliRunner(null)
  _setInventoryProbe(null)
  _setStoreFile(undefined)
  _setClaudeAccounts(undefined)
  _resetIdentities(undefined)
  rmSync(dir, { recursive: true, force: true })
})

describe.skipIf(!cliPath)("warmup listener lifecycle", () => {
  effect("a slot crossed between two ticks fires once, however many ticks follow", () =>
    Effect.gen(function* () {
      const slotAt = SCHEDULE_BASE_MS + 60_000
      const email = "loop@example.test"
      const accountID = path.join(dir, "claude-loop")
      _setClaudeAccounts(scheduled([email, slotAt]))
      _setInventoryProbe(async (_cli, id) => ({ id, status: "connected", email }))
      const sentTo: string[] = []
      _setCliRunner(async (opts) => {
        sentTo.push(opts.env.CLAUDE_CONFIG_DIR ?? "")
        return { code: 0, stdout: sentBody, stderr: "", timedOut: false }
      })

      // Ticks land 20 ms after each poll boundary, so the slot sits strictly between two of them.
      const currentMs = { value: SCHEDULE_BASE_MS - 45_000 + 20 }
      yield* TestClock.setTime(currentMs.value)
      const scope = yield* Scope.make()
      yield* Layer.buildWithMemoMap(
        warmupLoopLayer(currentMs, () => [accountID]),
        Layer.makeMemoMapUnsafe(),
        scope,
      )
      yield* Effect.yieldNow

      yield* advanceTo(currentMs, slotAt - POLL_MS)
      expect(sentTo).toEqual([])
      yield* advanceTo(currentMs, slotAt + POLL_MS)
      yield* waitFor("send", () => sentTo.length > 0)
      yield* waitFor("outcome", () => !!lastAttemptOf(email))
      expect(sentTo).toEqual([accountID])
      expect(lastAttemptOf(email)).toMatchObject({ scheduledAt: slotAt, outcome: "sent", host: "test-host" })

      yield* advanceTo(currentMs, slotAt + 20 * POLL_MS)
      yield* Effect.promise(() => Bun.sleep(50))
      expect(sentTo).toEqual([accountID])
      yield* Scope.close(scope, Exit.void)
    }),
  )

  effect("a slot crossed before the loop started is caught up on its first tick, not at start", () =>
    Effect.gen(function* () {
      const slotAt = SCHEDULE_BASE_MS
      const email = "loop@example.test"
      const accountID = path.join(dir, "claude-restart")
      _setClaudeAccounts(scheduled([email, slotAt]))
      _setInventoryProbe(async (_cli, id) => ({ id, status: "connected", email }))
      const sentTo: string[] = []
      _setCliRunner(async (opts) => {
        sentTo.push(opts.env.CLAUDE_CONFIG_DIR ?? "")
        return { code: 0, stdout: sentBody, stderr: "", timedOut: false }
      })

      const currentMs = { value: slotAt + 10 * 60_000 }
      yield* TestClock.setTime(currentMs.value)
      const scope = yield* Scope.make()
      yield* Layer.buildWithMemoMap(
        warmupLoopLayer(currentMs, () => [accountID]),
        Layer.makeMemoMapUnsafe(),
        scope,
      )
      yield* Effect.yieldNow
      // Start only sets the watermark.
      yield* Effect.promise(() => Bun.sleep(50))
      expect(sentTo).toEqual([])

      yield* advanceTo(currentMs, currentMs.value + POLL_MS)
      yield* waitFor("catch-up send", () => sentTo.length > 0)
      yield* waitFor("outcome", () => !!lastAttemptOf(email))
      expect(sentTo).toEqual([accountID])
      expect(lastAttemptOf(email)).toMatchObject({ scheduledAt: slotAt, outcome: "sent" })
      yield* advanceTo(currentMs, currentMs.value + 10 * POLL_MS)
      yield* Effect.promise(() => Bun.sleep(50))
      expect(sentTo).toEqual([accountID])
      yield* Scope.close(scope, Exit.void)
    }),
  )

  effect("scope start ticks, scope stop ends a pending auth probe without a model spawn", () =>
    Effect.gen(function* () {
      const slotAt = SCHEDULE_BASE_MS + 60_000
      const email = "pending@example.test"
      const accountID = path.join(dir, "claude-pending")
      _setClaudeAccounts(scheduled([email, slotAt]))

      // The first probe (the loop's identity probe) answers; the send-time probe hangs until aborted.
      let authSpawns = 0
      let hung = false
      _setInventoryProbe(async (_cli, id, signal) => {
        authSpawns += 1
        if (authSpawns === 1) return { id, status: "connected", email }
        hung = true
        await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }))
        return { id, status: "unknown" }
      })
      let modelSpawns = 0
      _setCliRunner(async () => {
        modelSpawns += 1
        return { code: 0, stdout: sentBody, stderr: "", timedOut: false }
      })

      const currentMs = { value: SCHEDULE_BASE_MS - 45_000 }
      yield* TestClock.setTime(currentMs.value)

      const scope = yield* Scope.make()
      yield* Layer.buildWithMemoMap(
        warmupLoopLayer(currentMs, () => [accountID]),
        Layer.makeMemoMapUnsafe(),
        scope,
      )
      yield* Effect.yieldNow

      yield* advanceTo(currentMs, slotAt)
      yield* waitFor("send-time probe start", () => hung)
      expect(authSpawns).toBe(2)

      yield* Scope.close(scope, Exit.void)
      // Grace period for a (wrongly) surviving loop to reach the model spawn.
      yield* Effect.promise(() => Bun.sleep(150))
      expect(authSpawns).toBe(2)
      expect(modelSpawns).toBe(0)
      expect(readStore(storeFile).accounts[email]?.claims ?? {}).toEqual({})
    }),
  )

  effect("loop observes global config updates through the shared service", () =>
    Effect.gen(function* () {
      const slotA = SCHEDULE_BASE_MS + 60_000
      const slotB = SCHEDULE_BASE_MS + 120_000
      const accountA = path.join(dir, "claude-a")
      const accountB = path.join(dir, "claude-b")
      const emails: Record<string, string> = { [accountA]: "a@example.test", [accountB]: "b@example.test" }
      _setClaudeAccounts(scheduled(["a@example.test", slotA], ["b@example.test", slotB]))

      const sentTo: string[] = []
      _setInventoryProbe(async (_cli, id) => ({ id, status: "connected", email: emails[id] }))
      _setCliRunner(async (opts) => {
        sentTo.push(opts.env.CLAUDE_CONFIG_DIR ?? "")
        return { code: 0, stdout: sentBody, stderr: "", timedOut: false }
      })

      let accounts: string[] = [accountA]
      const currentMs = { value: SCHEDULE_BASE_MS - 45_000 }
      yield* TestClock.setTime(currentMs.value)

      const scope = yield* Scope.make()
      yield* Layer.buildWithMemoMap(
        warmupLoopLayer(currentMs, () => accounts),
        Layer.makeMemoMapUnsafe(),
        scope,
      )
      yield* Effect.yieldNow

      yield* advanceTo(currentMs, slotA)
      yield* waitFor("account A send", () => sentTo.includes(accountA))
      // Outcome write ends the tick; only then is the loop back to sleeping.
      yield* waitFor("account A outcome", () => !!lastAttemptOf("a@example.test"))
      expect(sentTo).toEqual([accountA])

      accounts = [accountB]
      yield* advanceTo(currentMs, slotB)
      yield* waitFor("account B send", () => sentTo.includes(accountB))
      expect(sentTo).toEqual([accountA, accountB])

      yield* Scope.close(scope, Exit.void)
    }),
  )
})
