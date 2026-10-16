import { expect, test } from "bun:test"
import { existsSync, mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs"
import { ProcessTree } from "@opencode-ai/core/util/processTree"
import path from "node:path"
import { ScheduledResume } from "@/session/scheduledResume"
import { ScheduledDelivery } from "@/session/scheduledDelivery"
import { Effect, Deferred } from "effect"
import { tmpdir } from "../fixture/fixture"

test("a claim survives the claim persistence boundary and a second owner cannot take it", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  const first = ScheduledResume.createStore(file, () => 100)
  first.setEnabled(true)
  const entry = first.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })!
  expect(await first.takeDue()).toHaveLength(1)
  expect(first.getState().entries[0]?.id).toBe(entry.id)
  expect(await ScheduledResume.createStore(file, () => 100).takeDue()).toEqual([])
})

test("restart recovers an expired claim with its original delivery id", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  const store = ScheduledResume.createStore(file, () => 100)
  store.setEnabled(true)
  const entry = store.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })!
  await store.takeDue()
  const restarted = ScheduledResume.createStore(file, () => 3_600_100)
  expect((await restarted.takeDue()).map((item) => item.id)).toEqual([entry.id])
})

test.skipIf(process.platform !== "win32")(
  "a reused PID with a different creation time cannot keep a claim alive",
  async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "resume.json")
    const first = ScheduledResume.createStore(file, () => 100)
    first.setEnabled(true)
    const entry = first.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })!
    const claimed = (await first.takeDue())[0]!
    const state = first.getState()
    state.entries[0]!.claim = { ...state.entries[0]!.claim!, created: "different process creation time" }
    writeFileSync(file, JSON.stringify(state))
    const other = ScheduledResume.createStore(file, () => 101)
    expect((await other.takeDue()).map((item) => item.id)).toEqual([entry.id])
    expect(first.owns(claimed)).toBe(false)
  },
)

test.skipIf(process.platform !== "win32")(
  "async liveness preserves a foreign live claim and reclaims its dead owner",
  async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "resume.json")
    const child = Bun.spawn([process.execPath, "-e", "process.stdin.resume()"], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
      windowsHide: true,
    })
    try {
      const foreign = await ProcessTree.processIdentity(child.pid)
      if (!foreign) throw new Error("Test child identity unavailable")
      const first = ScheduledResume.createStore(file, () => 100)
      first.setEnabled(true)
      const entry = first.requestResume({
        sessionID: "ses_contract",
        directory: tmp.path,
        fireAt: 100,
        reason: "test",
      })!
      const state = first.getState()
      state.entries[0]!.claim = { pid: foreign.pid, created: foreign.created, owner: "foreign", at: 100 }
      writeFileSync(file, JSON.stringify(state))
      const other = ScheduledResume.createStore(file, () => 101)
      const checking = other.takeDue()
      expect(checking).toBeInstanceOf(Promise)
      expect(existsSync(`${file}.lock`)).toBe(false)
      first.setPrompt("updated while checking liveness")
      expect(await checking).toEqual([])
      expect(other.getState().prompt).toBe("updated while checking liveness")
      child.kill()
      await child.exited
      expect((await other.takeDue()).map((item) => item.id)).toEqual([entry.id])
    } finally {
      child.kill()
      await child.exited
    }
  },
  15_000,
)

test.skipIf(process.platform !== "win32")("an async liveness result cannot reclaim a replacement claim", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  const first = ScheduledResume.createStore(file, () => 100)
  first.setEnabled(true)
  first.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })
  const original = (await first.takeDue())[0]!.claim!
  const state = first.getState()
  state.entries[0]!.claim = { ...original, created: "old process" }
  writeFileSync(file, JSON.stringify(state))
  const other = ScheduledResume.createStore(file, () => 101)
  const checking = other.takeDue()
  const replacement = { ...original, owner: "replacement", at: 101 }
  state.entries[0]!.claim = replacement
  writeFileSync(file, JSON.stringify(state))
  expect(await checking).toEqual([])
  expect(other.getState().entries[0]?.claim).toEqual(replacement)
})

test("setting resume options reports a held-lock timeout", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  const store = ScheduledResume.createStore(file)
  store.setEnabled(true)
  writeFileSync(`${file}.lock`, String(process.pid))
  expect(() => store.setPrompt("changed")).toThrow("lock timeout")
  expect(store.getState().prompt).toBe(ScheduledResume.DEFAULT_PROMPT)
}, 10_000)

test("cancellation removes both pending and claimed deliveries", async () => {
  await using tmp = await tmpdir()
  const store = ScheduledResume.createStore(path.join(tmp.path, "resume.json"), () => 100)
  store.setEnabled(true)
  const pending = store.requestResume({ sessionID: "ses_pending", directory: tmp.path, fireAt: 200, reason: "test" })!
  const claimed = store.requestResume({ sessionID: "ses_claimed", directory: tmp.path, fireAt: 100, reason: "test" })!
  await store.takeDue()
  expect(store.cancel(pending.id)).toBe(true)
  expect(store.cancel(claimed.id)).toBe(true)
  expect(store.getState().entries).toEqual([])
})

test("a corrupt resume file is preserved and mutations report failure", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  writeFileSync(file, "{broken")
  const store = ScheduledResume.createStore(file)
  expect(() => store.setEnabled(true)).toThrow()
  expect(readFileSync(file, "utf8")).toBe("{broken")
})

test("a delivered id counts once when the cap receipt is retried", async () => {
  await using tmp = await tmpdir()
  const store = ScheduledResume.createStore(path.join(tmp.path, "resume.json"), () => 100)
  store.setEnabled(true)
  const entry = store.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })!
  await store.takeDue()
  store.noteFired(entry.sessionID, entry.id)
  store.noteFired(entry.sessionID, entry.id)
  expect(store.getState().resumeCounts[entry.sessionID]).toBe(1)
  expect(store.getState().entries).toEqual([])
})

test("a failed cap state write preserves the claim until its receipt commits", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  const store = ScheduledResume.createStore(file, () => 100)
  store.setEnabled(true)
  const entry = store.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })!
  await store.takeDue()
  mkdirSync(`${file}.${process.pid}.tmp`)
  expect(() => store.noteFired(entry.sessionID, entry.id)).toThrow()
  expect(store.getState().entries).toHaveLength(1)
  expect(store.getState().resumeCounts).toEqual({})
  rmdirSync(`${file}.${process.pid}.tmp`)
  expect(store.noteFired(entry.sessionID, entry.id)).toBe(true)
  expect(store.noteFired(entry.sessionID, entry.id)).toBe(true)
  expect(store.getState().resumeCounts[entry.sessionID]).toBe(1)
})

test("an earlier entry re-arms a sleeping deadline without a lost wakeup", async () => {
  const wake = ScheduledDelivery.makeWake()
  await Effect.runPromise(
    Effect.gen(function* () {
      const ready = yield* Deferred.make<void>()
      const version = wake.version()
      yield* Effect.gen(function* () {
        yield* Deferred.succeed(ready, undefined)
        yield* wake.wait(version, Date.now() + 60_000)
      }).pipe(Effect.forkScoped)
      yield* Deferred.await(ready)
      wake.notify()
      yield* wake.wait(version, Date.now() + 60_000).pipe(Effect.timeout("1 second"))
    }).pipe(Effect.scoped),
  )
})

test("failed cap persistence leaves the claim and a retry counts only once", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "resume.json")
  const store = ScheduledResume.createStore(file, () => 100)
  store.setEnabled(true)
  const entry = store.requestResume({ sessionID: "ses_contract", directory: tmp.path, fireAt: 100, reason: "test" })!
  await store.takeDue()
  writeFileSync(`${file}.lock`, String(process.pid))
  expect(store.noteFired(entry.sessionID, entry.id)).toBe(false)
  expect(store.getState().entries).toHaveLength(1)
  const { unlinkSync } = await import("node:fs")
  unlinkSync(`${file}.lock`)
  expect(store.noteFired(entry.sessionID, entry.id)).toBe(true)
  expect(store.noteFired(entry.sessionID, entry.id)).toBe(true)
  expect(store.getState().resumeCounts[entry.sessionID]).toBe(1)
}, 10_000)
