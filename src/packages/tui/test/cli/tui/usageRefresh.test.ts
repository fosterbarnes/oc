import { expect, test } from "bun:test"
import { createUsageRefresh } from "../../../src/routes/session/sidebar-tools/usageRefresh"
import type { UsageProviderId } from "../../../src/routes/session/sidebar-tools/usage"

function clock() {
  let now = 0
  let id = 0
  const timers = new Map<number, { at: number; callback: () => void }>()
  return {
    now: () => now,
    schedule(callback: () => void, delay: number) {
      timers.set(++id, { at: now + delay, callback })
      return id
    },
    cancel(handle: unknown) { timers.delete(handle as number) },
    advance(ms: number) {
      now += ms
      for (const [key, timer] of [...timers]) {
        if (timer.at > now) continue
        timers.delete(key)
        timer.callback()
      }
    },
    timers,
  }
}

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

test("usage refresh queues one completion behind an in-flight probe, independently per provider", async () => {
  const time = clock()
  const calls: UsageProviderId[] = []
  let finish: ((value: { ok: boolean }) => void) | undefined
  const scheduler = createUsageRefresh({
    ...time,
    providers: () => ["openai", "cursor"],
    active: () => false,
    refresh: async (provider) => {
      calls.push(provider)
      if (provider === "cursor") return { ok: true }
      return new Promise<{ ok: boolean }>((resolve) => { finish = resolve })
    },
  })
  scheduler.request(["openai"])
  scheduler.request(["openai"])
  scheduler.request(["openai"])
  scheduler.request(["cursor"])
  expect(calls).toEqual(["openai", "cursor"])
  time.advance(6_000)
  finish?.({ ok: true })
  await flush()
  expect(calls).toEqual(["openai", "cursor", "openai"])
  finish?.({ ok: true })
  await flush()
  scheduler.dispose()
  expect(time.timers.size).toBe(0)
})

test("usage refresh retains a throttled completion and obeys Retry-After despite new requests", async () => {
  const time = clock()
  let count = 0
  const scheduler = createUsageRefresh({
    ...time,
    providers: () => ["openai"],
    active: () => true,
    refresh: async () => ++count === 1 ? { ok: false, retryAt: 60_000 } : { ok: true },
  })
  scheduler.request()
  await flush()
  time.advance(1_000)
  scheduler.request()
  scheduler.request()
  time.advance(58_999)
  expect(count).toBe(1)
  time.advance(1)
  await flush()
  expect(count).toBe(2)
  scheduler.request()
  time.advance(4_999)
  expect(count).toBe(2)
  time.advance(1)
  await flush()
  expect(count).toBe(3)
  scheduler.dispose()
})

test("usage refresh adjusts active polling and cancels hidden providers and disposal", async () => {
  const time = clock()
  let active = false
  let providers: UsageProviderId[] = ["cursor", "claude-code"]
  const calls: UsageProviderId[] = []
  const scheduler = createUsageRefresh({
    ...time,
    providers: () => providers,
    active: () => active,
    refresh: async (provider) => { calls.push(provider); return { ok: true } },
  })
  scheduler.request()
  await flush()
  active = true
  scheduler.reconcile()
  time.advance(30_000)
  await flush()
  expect(calls).toEqual(["cursor", "claude-code", "cursor"])
  providers = ["claude-code"]
  scheduler.reconcile()
  time.advance(150_000)
  await flush()
  expect(calls).toEqual(["cursor", "claude-code", "cursor", "claude-code"])
  scheduler.dispose()
  time.advance(1_000_000)
  expect(calls).toHaveLength(4)
  expect(time.timers.size).toBe(0)
})
