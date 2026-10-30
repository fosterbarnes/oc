/**
 * Claude warm-up schedules (warmup/): validation, due selection, the
 * locked atomic store, the pinned sender environment, and the tick rules.
 * No real CLI is spawned here; the fake-model sibling covers the installed
 * binary against TestLLMServer.
 */
import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import {
  _resetAccountPool,
  _setAccountPoolFile,
  poolState,
  setCurrentAccount,
} from "@/provider/claude-code/accounts.js"
import { accountView, isStillSendable, sendWarmup, stateView, tickOnce } from "@/provider/claude-code/warmup"
import {
  _setCliRunner,
  buildWarmupArgs,
  buildWarmupEnv,
  checkWarmupCli,
  cliSupportsWarmup,
  warmupCwd,
  type ChildTracker,
} from "@/provider/claude-code/warmup/cli"
import { materializePoolIds } from "@/provider/claude-code/warmup/identity"
import { _resetInventoryForTests, _setInventoryProbe, listConnected } from "@/provider/claude-code/warmup/inventory"
import {
  isScheduleEmpty,
  nextOccurrence,
  normalizeSchedule,
  occurrencesInWindow,
  occurrenceMs,
  parseTimeList,
  type DueOccurrence,
} from "@/provider/claude-code/warmup/schedule"
import {
  claimDueOccurrences,
  readStore,
  recordAttempt,
  setAccountSchedule,
  storeKeyForAccount,
} from "@/provider/claude-code/warmup/store"

let dir = ""
let storeFile = ""

beforeEach(() => {
  _resetAccountPool()
  _setAccountPoolFile(null)
  _resetInventoryForTests()
  _setCliRunner(null)
  _setInventoryProbe(null)
  dir = mkdtempSync(path.join(tmpdir(), "warmup-"))
  storeFile = path.join(dir, "warmup.json")
})

afterEach(() => {
  _resetAccountPool()
  _setAccountPoolFile(null)
  _resetInventoryForTests()
  _setCliRunner(null)
  _setInventoryProbe(null)
  rmSync(dir, { recursive: true, force: true })
})

const daily = (times: string[]): { mode: "daily"; times: string[] } => ({ mode: "daily", times })
const weekly = (days: Record<string, string[]>): { mode: "weekly"; days: Record<string, string[]> } => ({
  mode: "weekly",
  days,
})

// A minute-start occurrence with a tight window around it. A non-positive
// offset stays inside the firing allowance (queued under 60s by
// construction: the minute start is always less than 60s old); -150_000 is
// always past it, so the occurrence is claimed but recorded as missed.
function minuteSlot(offsetMs: number): { time: string; at: number; prevMs: number; nowMs: number } {
  const at = Math.floor((Date.now() + offsetMs) / 60_000) * 60_000
  const date = new Date(at)
  return {
    time: `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    at,
    prevMs: at - 30_000,
    nowMs: at + 30_000,
  }
}

const connectedAuth = {
  code: 0,
  stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }),
  stderr: "",
  timedOut: false,
}

const signedOutAuth = { code: 1, stdout: "", stderr: "not logged in", timedOut: false }

const sentResult = {
  code: 0,
  stdout: JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "test-session" }),
  stderr: "",
  timedOut: false,
}

test("time parser: trims, dedupes, sorts, and rejects bad clock values", () => {
  expect(parseTimeList("12:00, 07:00,07:00 ")).toEqual({ times: ["07:00", "12:00"] })
  expect(parseTimeList("")).toEqual({ times: [] })
  expect(parseTimeList("  ")).toEqual({ times: [] })
  expect("error" in parseTimeList("7:00")).toBe(true)
  expect("error" in parseTimeList("07:0")).toBe(true)
  expect("error" in parseTimeList("24:00")).toBe(true)
  expect("error" in parseTimeList("07:60")).toBe(true)
  expect("error" in parseTimeList("noon")).toBe(true)
  expect("error" in parseTimeList("07:00:00")).toBe(true)
  expect("error" in parseTimeList("00:00,01:00,02:00,03:00,04:00")).toBe(true)
  expect(parseTimeList("00:00,01:00,02:00,03:00")).toEqual({ times: ["00:00", "01:00", "02:00", "03:00"] })
  expect(parseTimeList("00:00, 12:00")).toEqual({ times: ["00:00", "12:00"] })
})

test("schedule validation: daily and weekly modes, blank weekends, bad shapes", () => {
  expect(normalizeSchedule({ mode: "daily", times: ["22:00", "07:00"] })).toEqual({
    schedule: { mode: "daily", times: ["07:00", "22:00"] },
  })
  expect(normalizeSchedule({ mode: "daily", times: "07:00, 12:00" })).toEqual({
    schedule: { mode: "daily", times: ["07:00", "12:00"] },
  })
  const week = normalizeSchedule({
    mode: "weekly",
    days: { mon: ["07:00"], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] },
  })
  expect("error" in week).toBe(false)
  expect("error" in normalizeSchedule({ mode: "daily", times: ["x"] })).toBe(true)
  expect("error" in normalizeSchedule({ mode: "daily", times: ["00:00", "01:00", "02:00", "03:00", "04:00"] })).toBe(
    true,
  )
  expect("error" in normalizeSchedule({ mode: "weekly", days: { mon: ["25:00"] } })).toBe(true)
  expect("error" in normalizeSchedule({ mode: "cron", times: [] })).toBe(true)
  expect("error" in normalizeSchedule(null)).toBe(true)
  expect(isScheduleEmpty({ mode: "daily", times: [] })).toBe(true)
  expect(isScheduleEmpty({ mode: "daily", times: ["07:00"] })).toBe(false)
})

test("save: normalizes times, empty schedule disables, pause retains times", async () => {
  const saved = await setAccountSchedule({
    file: storeFile,
    accountID: "acc-a",
    enabled: true,
    schedule: { mode: "daily", times: ["12:00", "07:00", "07:00"] },
  })
  expect(saved.enabled).toBe(true)
  expect(saved.schedule).toEqual({ mode: "daily", times: ["07:00", "12:00"] })
  const paused = await setAccountSchedule({
    file: storeFile,
    accountID: "acc-a",
    enabled: false,
    schedule: { mode: "daily", times: ["12:00", "07:00"] },
  })
  expect(paused.enabled).toBe(false)
  expect(paused.schedule).toEqual({ mode: "daily", times: ["07:00", "12:00"] })
  const cleared = await setAccountSchedule({
    file: storeFile,
    accountID: "acc-a",
    enabled: true,
    schedule: { mode: "daily", times: [] },
  })
  expect(cleared.enabled).toBe(false)
})

test("save: concurrent account updates preserve each other", async () => {
  await Promise.all([
    setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) }),
    setAccountSchedule({ file: storeFile, accountID: "b", enabled: true, schedule: daily(["08:00"]) }),
  ])
  const read = readStore(storeFile)
  expect(read.status).toBe("ok")
  if (read.status !== "ok") return
  expect(read.state.accounts["a"]?.schedule).toEqual({ mode: "daily", times: ["07:00"] })
  expect(read.state.accounts["b"]?.schedule).toEqual({ mode: "daily", times: ["08:00"] })
})

test("save: malformed clock values and unknown shapes are rejected before any write", async () => {
  await expect(
    setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["nope"]) }),
  ).rejects.toThrow()
  expect(readStore(storeFile).status).toBe("missing")
})

test("store: survives a fresh read and rejects malformed state instead of resetting it", async () => {
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const reread = readStore(storeFile)
  expect(reread.status).toBe("ok")
  writeFileSync(storeFile, JSON.stringify({ accounts: { a: { enabled: "yes" } } }), "utf8")
  const bad = readStore(storeFile)
  expect(bad.status).toBe("malformed")
  await expect(
    setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["08:00"]) }),
  ).rejects.toThrow()
  expect(JSON.parse(await Bun.file(storeFile).text()).accounts.a.enabled).toBe("yes")
})

test("claims: a normal tick fires once and a repeated poll cannot resubmit", async () => {
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const at = occurrenceMs(2026, 9, 13, "07:00")!
  const occurrences: DueOccurrence[] = [{ key: "2026-10-13|07:00", at, time: "07:00" }]
  expect(await claimDueOccurrences({ file: storeFile, accountID: "a", occurrences, now: at })).toHaveLength(1)
  expect(await claimDueOccurrences({ file: storeFile, accountID: "a", occurrences, now: at })).toHaveLength(0)
})

test("claims: two clients contending for one occurrence, one wins", async () => {
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const at = occurrenceMs(2026, 9, 13, "07:00")!
  const occurrences: DueOccurrence[] = [{ key: "2026-10-13|07:00", at, time: "07:00" }]
  const [first, second] = await Promise.all([
    claimDueOccurrences({ file: storeFile, accountID: "a", occurrences, now: at }),
    claimDueOccurrences({ file: storeFile, accountID: "a", occurrences, now: at }),
  ])
  expect(first.length + second.length).toBe(1)
})

test("claims: pausing before the send boundary cancels unstarted work", async () => {
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const at = occurrenceMs(2026, 9, 13, "07:00")!
  await claimDueOccurrences({
    file: storeFile,
    accountID: "a",
    occurrences: [{ key: "2026-10-13|07:00", at, time: "07:00" }],
  })
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: false, schedule: daily(["07:00"]) })
  expect(isStillSendable({ store: readStore(storeFile), accountID: "a", poolIds: ["a"], connectedIds: ["a"] })).toBe(
    false,
  )
  expect(isStillSendable({ store: readStore(storeFile), accountID: "a", poolIds: ["a"], connectedIds: [] })).toBe(false)
  expect(isStillSendable({ store: readStore(storeFile), accountID: "zz", poolIds: ["a"], connectedIds: ["a"] })).toBe(
    false,
  )
})

test("claims: never switch the pool current account or session pins", async () => {
  const ids = ["a", "b"]
  setCurrentAccount("a", ids)
  const before = poolState(ids, Date.now())
  await setAccountSchedule({ file: storeFile, accountID: "b", enabled: true, schedule: daily(["07:00"]) })
  const at = occurrenceMs(2026, 9, 13, "07:00")!
  await claimDueOccurrences({
    file: storeFile,
    accountID: "b",
    occurrences: [{ key: "2026-10-13|07:00", at, time: "07:00" }],
  })
  await recordAttempt({
    file: storeFile,
    accountID: "b",
    attempt: { scheduledAt: at, attemptedAt: at + 1, outcome: "sent" },
  })
  expect(poolState(ids, Date.now())).toEqual(before)
})

test("outcomes: failure and timeout record without retry or failover", async () => {
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const at = Date.now()
  expect(
    await recordAttempt({
      file: storeFile,
      accountID: "a",
      attempt: { scheduledAt: at, attemptedAt: at + 5, outcome: "failed" },
    }),
  ).toBe(true)
  const read = readStore(storeFile)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt?.outcome).toBe("failed")
  // A newer attempt wins; an older duplicate never overwrites it.
  expect(
    await recordAttempt({
      file: storeFile,
      accountID: "a",
      attempt: { scheduledAt: at, attemptedAt: at + 2, outcome: "sent" },
    }),
  ).toBe(true)
  const reread = readStore(storeFile)
  expect(reread.status === "ok" && reread.state.accounts["a"]?.lastAttempt?.outcome).toBe("failed")
  // Recording for a removed account writes nothing and never resurrects it.
  expect(
    await recordAttempt({
      file: storeFile,
      accountID: "gone",
      attempt: { scheduledAt: at, attemptedAt: at + 9, outcome: "sent" },
    }),
  ).toBe(false)
  const final = readStore(storeFile)
  expect(final.status === "ok" && "gone" in final.state.accounts).toBe(false)
})

test("outcomes: a slow older occurrence never overwrites a newer scheduled attempt", async () => {
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00", "08:00"]) })
  const early = Date.now() - 7200_000
  const late = Date.now() - 3600_000
  // Newer scheduled occurrence completes first.
  expect(
    await recordAttempt({
      file: storeFile,
      accountID: "a",
      attempt: { scheduledAt: late, attemptedAt: late + 1, outcome: "sent" },
    }),
  ).toBe(true)
  // Older scheduled occurrence completes later: outcome stays with the newer schedule.
  expect(
    await recordAttempt({
      file: storeFile,
      accountID: "a",
      attempt: { scheduledAt: early, attemptedAt: late + 2, outcome: "failed" },
    }),
  ).toBe(true)
  const read = readStore(storeFile)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt).toEqual({
    scheduledAt: late,
    attemptedAt: late + 1,
    outcome: "sent",
  })
  expect(read.status === "ok" && read.state.accounts["a"]?.enabled).toBe(true)
})

test("tick: restart, sleep, and stall gaps skip overdue work without spawning", async () => {
  let spawns = 0
  _setCliRunner(async () => {
    spawns += 1
    return { code: 0, stdout: "{}", stderr: "", timedOut: false }
  })
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const now = Date.now()
  // A gap larger than the firing allowance is a suspend or stall: skip all crossed slots.
  const stalled = await tickOnce({
    file: storeFile,
    prevMs: now - 3600_000,
    nowMs: now,
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(stalled).toEqual({ fired: 0, missed: 0, skipped: 0 })
  // A backward clock move re-establishes the watermark.
  const backward = await tickOnce({
    file: storeFile,
    prevMs: now + 1000,
    nowMs: now,
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(backward).toEqual({ fired: 0, missed: 0, skipped: 0 })
  expect(spawns).toBe(0)
})

test("tick: a stalled queue past the firing allowance records missed, never sends", async () => {
  let spawns = 0
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") return connectedAuth
    spawns += 1
    return sentResult
  })
  const slot = minuteSlot(-150_000)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  // A window two minutes in the past: the occurrence is claimed, but by send
  // time it is already outside the firing allowance, so it is missed.
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(result.missed).toBe(1)
  expect(spawns).toBe(0)
  const read = readStore(storeFile)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt?.outcome).toBe("missed")
})

test("tick: malformed store stops sends and never spawns", async () => {
  let spawns = 0
  _setCliRunner(async () => {
    spawns += 1
    return { code: 0, stdout: "{}", stderr: "", timedOut: false }
  })
  writeFileSync(storeFile, "not json", "utf8")
  const now = Date.now()
  const result = await tickOnce({ file: storeFile, prevMs: now - 1000, nowMs: now, poolIds: ["a"], cliPath: "claude" })
  expect(result).toEqual({ fired: 0, missed: 0, skipped: 0 })
  expect(spawns).toBe(0)
})

test("tick: a failing send records its outcome once, with no retry", async () => {
  const seen: string[] = []
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") return connectedAuth
    seen.push(opts.env.CLAUDE_CONFIG_DIR ?? "")
    return { code: 1, stdout: "", stderr: "boom", timedOut: false }
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(result.fired).toBe(1)
  expect(seen).toHaveLength(1)
  const read = readStore(storeFile)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt?.outcome).toBe("failed")
  // The claimed occurrence never resubmits on the next tick.
  const second = await tickOnce({
    file: storeFile,
    prevMs: slot.nowMs,
    nowMs: Date.now(),
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(second.fired).toBe(0)
  expect(seen).toHaveLength(1)
})

test("sender outcomes: timeout, rejection, and unsupported flags map without retry", async () => {
  _setCliRunner(async () => ({ code: null, stdout: "", stderr: "", timedOut: true }))
  const timedOut = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now(), timeoutMs: 20 })
  expect(timedOut.outcome).toBe("timeout")
  _setCliRunner(async () => ({ code: 1, stdout: "", stderr: "Error 429 rate limited", timedOut: false }))
  const rejected = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now() })
  expect(rejected.outcome).toBe("rejected")
  _setCliRunner(async () => ({
    code: 0,
    stdout: JSON.stringify({ type: "result", is_error: true }),
    stderr: "",
    timedOut: false,
  }))
  const errorResult = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now() })
  expect(errorResult.outcome).toBe("rejected")
  _setCliRunner(async () => ({ code: 2, stdout: "", stderr: "error: unknown option", timedOut: false }))
  const unsupported = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now() })
  expect(unsupported.outcome).toBe("failed")
  expect(unsupported.detail).toMatch(/update claude/)
  // Zero-exit output without a valid success result is not evidence of delivery.
  _setCliRunner(async () => ({ code: 0, stdout: "{}", stderr: "", timedOut: false }))
  const empty = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now() })
  expect(empty.outcome).toBe("failed")
  _setCliRunner(async () => ({ code: 0, stdout: "not json", stderr: "", timedOut: false }))
  const garbage = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now() })
  expect(garbage.outcome).toBe("failed")
  _setCliRunner(async () => ({
    code: 0,
    stdout: JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "s" }),
    stderr: "",
    timedOut: false,
  }))
  const sent = await sendWarmup({ cliPath: "claude", accountID: "a", scheduledAt: Date.now() })
  expect(sent.outcome).toBe("sent")
})

test("tick: an enabled schedule with no due work never touches the CLI", async () => {
  let calls = 0
  _setCliRunner(async () => {
    calls += 1
    return connectedAuth
  })
  // Schedule sits at 07:00; the tick window is mid-afternoon with nothing due.
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily(["07:00"]) })
  const afternoon = new Date()
  afternoon.setHours(15, 0, 0, 0)
  const prevMs = afternoon.getTime() - 10_000
  const nowMs = afternoon.getTime()
  // Guard the fixture: 07:00 really is outside this window in any zone.
  expect(occurrencesInWindow({ mode: "daily", times: ["07:00"] }, prevMs, nowMs)).toEqual([])
  const result = await tickOnce({ file: storeFile, prevMs, nowMs, poolIds: ["a"], cliPath: "claude" })
  expect(result).toEqual({ fired: 0, missed: 0, skipped: 0 })
  expect(calls).toBe(0)
})

test("tick: stopping while send-time auth is pending skips model; durable claims may remain", async () => {
  let modelSpawns = 0
  let authSpawns = 0
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") {
      authSpawns += 1
      if (authSpawns === 1) return connectedAuth
      await new Promise<void>((resolve) => opts.signal?.addEventListener("abort", () => resolve(), { once: true }))
      return { code: null, stdout: "", stderr: "spawn failed: aborted", timedOut: false }
    }
    modelSpawns += 1
    return sentResult
  })
  const controller = new AbortController()
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const pending = tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "claude",
    signal: controller.signal,
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  controller.abort()
  expect(await pending).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(authSpawns).toBe(2)
  expect(modelSpawns).toBe(0)
  const read = readStore(storeFile)
  expect(read.status === "ok" && Object.keys(read.state.accounts["a"]?.claims ?? {})).toHaveLength(1)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt).toBeUndefined()
})

test("tick: an already-aborted tick never probes or spawns", async () => {
  let spawns = 0
  _setCliRunner(async () => {
    spawns += 1
    return connectedAuth
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const controller = new AbortController()
  controller.abort()
  expect(
    await tickOnce({
      file: storeFile,
      prevMs: slot.prevMs,
      nowMs: slot.nowMs,
      poolIds: ["a"],
      cliPath: "claude",
      signal: controller.signal,
    }),
  ).toEqual({ fired: 0, missed: 0, skipped: 0 })
  expect(spawns).toBe(0)
})

test("tick: accounts outside the connected inventory claim nothing and burn no outcome", async () => {
  let modelSpawns = 0
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") {
      return opts.env.CLAUDE_CONFIG_DIR === "a" ? connectedAuth : signedOutAuth
    }
    modelSpawns += 1
    return sentResult
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  await setAccountSchedule({ file: storeFile, accountID: "b", enabled: true, schedule: daily([slot.time]) })
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a", "b"],
    cliPath: "claude",
  })
  expect(result.fired).toBe(1)
  expect(modelSpawns).toBe(1)
  const read = readStore(storeFile)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt?.outcome).toBe("sent")
  expect(read.status === "ok" && read.state.accounts["b"]?.claims).toEqual({})
  expect(read.status === "ok" && read.state.accounts["b"]?.lastAttempt).toBeUndefined()
})

test("windows: daily fires across midnight and weekly skips blank days", () => {
  // Saturday 2026-10-17 23:59 local, window crossing into Sunday.
  const saturday = new Date(2026, 9, 17, 23, 59, 0, 0).getTime()
  const sunday = saturday + 2 * 60 * 1000
  const crossed = occurrencesInWindow({ mode: "daily", times: ["00:00"] }, saturday, sunday)
  expect(crossed).toHaveLength(1)
  expect(new Date(crossed[0]!.at).getDate()).toBe(18)
  const week = weekly({ mon: ["07:00"], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] })
  const monday = new Date(2026, 9, 19, 0, 0, 0, 0).getTime()
  const next = nextOccurrence(week, true, new Date(2026, 9, 17, 12, 0, 0, 0).getTime())
  expect(next).toBe(monday + 7 * 60 * 60 * 1000)
  expect(nextOccurrence(week, false, monday)).toBeUndefined()
  expect(nextOccurrence(daily([]), true, monday)).toBeUndefined()
})

test("windows: midnight after fall-back is visited exactly once", () => {
  // Find a fall-back transition: the noon UTC offset grows overnight.
  // Zones without daylight saving skip; the fixed-step bug only bites there.
  let transition: { year: number; month: number; day: number } | undefined
  for (const year of [new Date().getFullYear(), new Date().getFullYear() + 1]) {
    const start = new Date(year, 0, 1, 12, 0, 0, 0)
    for (let t = start.getTime(); t < new Date(year + 1, 0, 2).getTime(); t += 24 * 60 * 60 * 1000) {
      const probe = new Date(t)
      const next = new Date(probe.getFullYear(), probe.getMonth(), probe.getDate() + 1, 12, 0, 0, 0)
      if (next.getTimezoneOffset() > probe.getTimezoneOffset()) {
        transition = { year: next.getFullYear(), month: next.getMonth(), day: next.getDate() }
        break
      }
    }
    if (transition) break
  }
  if (!transition) return
  const from = new Date(transition.year, transition.month, transition.day, 23, 59, 50, 0).getTime()
  const to = new Date(transition.year, transition.month, transition.day + 1, 0, 0, 5, 0).getTime()
  const crossed = occurrencesInWindow({ mode: "daily", times: ["00:00"] }, from, to)
  expect(crossed).toHaveLength(1)
  const at = new Date(crossed[0]!.at)
  expect([at.getHours(), at.getMinutes()]).toEqual([0, 0])
  expect(crossed[0]!.at).toBeGreaterThan(from)
  expect(crossed[0]!.at).toBeLessThanOrEqual(to)
})

test("windows: a spring-forward gap skips the nonexistent time when the zone observes DST", () => {
  // Scan the current year for a day whose UTC offset changes: only zones
  // with daylight saving have one, otherwise there is nothing to assert.
  let gap: { year: number; month: number; day: number; hour: number } | undefined
  const year = new Date().getFullYear()
  let previous = new Date(year, 0, 1, 12, 0, 0, 0).getTimezoneOffset()
  outer: for (let month = 0; month < 12; month++) {
    for (let day = 1; day <= 28; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const offset = new Date(year, month, day, hour, 30, 0, 0).getTimezoneOffset()
        if (offset !== previous) {
          gap = { year, month, day, hour }
          break outer
        }
        previous = offset
      }
    }
  }
  if (!gap) return
  const missing = occurrenceMs(gap.year, gap.month, gap.day, `${String(gap.hour).padStart(2, "0")}:30`)
  expect(missing).toBeUndefined()
})

test("identity: every candidate materializes before use; saved schedules never retarget", async () => {
  const previous = process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR
  try {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ""
    const expected = path.resolve(path.join(home, ".claude"))
    expect(materializePoolIds(undefined)).toEqual([expected])
    const second = path.join(dir, "second")
    expect(materializePoolIds(["~/.claude", second, second])).toEqual([expected, path.resolve(second)])
    // A schedule saved under the materialized dir stays there when a later
    // shell change moves the inherited config dir elsewhere.
    await setAccountSchedule({ file: storeFile, accountID: expected, enabled: true, schedule: daily(["07:00"]) })
    const moved = path.join(dir, "moved-home", ".claude")
    process.env.CLAUDE_CONFIG_DIR = moved
    expect(materializePoolIds(undefined)).toEqual([path.resolve(moved)])
    const read = readStore(storeFile)
    expect(read.status === "ok" && Object.keys(read.state.accounts)).toEqual([storeKeyForAccount(expected)])
    expect(read.status === "ok" && read.state.accounts[storeKeyForAccount(expected)]?.schedule).toEqual({
      mode: "daily",
      times: ["07:00"],
    })
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
  }
})

test("identity: duplicate basenames keep distinct identities with disambiguated labels", () => {
  const first = path.join(dir, "one", ".claude")
  const second = path.join(dir, "two", ".claude")
  expect(materializePoolIds([first, second])).toEqual([path.resolve(first), path.resolve(second)])
  const view = stateView({
    poolIds: [path.resolve(first), path.resolve(second)],
    connectedIds: [path.resolve(first), path.resolve(second)],
    store: { status: "missing" },
    available: true,
  })
  expect(view.accounts).toHaveLength(2)
  expect(view.accounts[0]!.label).not.toBe(view.accounts[1]!.label)
  expect(view.accounts[0]!.accountID).toBe(path.resolve(first))
})

test("schedule validation: each array entry is its own exact HH:mm", () => {
  expect(normalizeSchedule({ mode: "daily", times: ["07:00", "12:00"] })).toEqual({
    schedule: { mode: "daily", times: ["07:00", "12:00"] },
  })
  expect(normalizeSchedule({ mode: "daily", times: [" 07:00 "] })).toEqual({
    schedule: { mode: "daily", times: ["07:00"] },
  })
  expect("error" in normalizeSchedule({ mode: "daily", times: ["07:00,12:00"] })).toBe(true)
  expect("error" in normalizeSchedule({ mode: "daily", times: [""] })).toBe(true)
  expect("error" in normalizeSchedule({ mode: "daily", times: ["07:00", "nope"] })).toBe(true)
  expect(
    "error" in
      normalizeSchedule({
        mode: "weekly",
        days: { mon: ["07:00"], tue: [], wed: [], thu: [], fri: [], sat: [], sun: ["25:00"] },
      }),
  ).toBe(true)
})

test("sender cwd: an owned data-dir folder, never a shared root or repo", () => {
  expect(warmupCwd().startsWith(Global.Path.data)).toBe(true)
})

test("sender recheck: fresh per-account probe gates each send", async () => {
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") return signedOutAuth
    return sentResult
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(result).toEqual({ fired: 0, missed: 0, skipped: 0 })
  const read = readStore(storeFile)
  expect(read.status === "ok" && read.state.accounts["a"]?.claims).toEqual({})
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt).toBeUndefined()
})

test("tick: a removed account stops via the current membership callback", async () => {
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") return connectedAuth
    return sentResult
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "claude",
    getPoolIds: () => [],
  })
  expect(result).toEqual({ fired: 0, missed: 0, skipped: 1 })
})

test("inventory: changed candidates or cliPath start fresh, never stale or shared", async () => {
  const seen: Array<{ cli: string; id: string }> = []
  _setInventoryProbe(async (cliPath, id) => {
    seen.push({ cli: cliPath, id })
    return { id, status: "connected" as const }
  })
  expect((await listConnected({ cliPath: "claude", candidates: ["a"] })).connectedIds).toEqual(["a"])
  // A changed candidate set within the TTL probes fresh instead of
  // returning the previous inventory.
  const grown = await listConnected({ cliPath: "claude", candidates: ["a", "b"] })
  expect(grown.connectedIds).toEqual(["a", "b"])
  expect(seen.filter((call) => call.id === "b")).toHaveLength(1)
  // Same candidates on another cliPath never share the pending probe.
  const other = await listConnected({ cliPath: "other-claude", candidates: ["a", "b"] })
  expect(other.connectedIds).toEqual(["a", "b"])
  expect(seen.filter((call) => call.cli === "other-claude")).toHaveLength(2)
})

test("inventory: merge keeps per-account truth across mixed results", async () => {
  _setInventoryProbe(async (cliPath, id) => ({ id, status: "connected" as const }))
  expect((await listConnected({ cliPath: "claude", candidates: ["a", "b", "c"] })).connectedIds).toEqual([
    "a",
    "b",
    "c",
  ])
  // a stays connected, b conclusively signed out is removed, c unknown keeps
  // its own prior connected status; the error is still surfaced.
  _setInventoryProbe(async (cliPath, id) => ({
    id,
    status: id === "a" ? ("connected" as const) : id === "b" ? ("signed-out" as const) : ("unknown" as const),
  }))
  const mixed = await listConnected({ cliPath: "claude", candidates: ["a", "b", "c"], now: Date.now() + 61_000 })
  expect(mixed.connectedIds).toEqual(["a", "c"])
  expect(mixed.error).toMatch(/last known/)
  // Unknown with no prior presence is not connected.
  _resetInventoryForTests()
  _setInventoryProbe(async (cliPath, id) => ({ id, status: "unknown" as const }))
  const fresh = await listConnected({ cliPath: "claude", candidates: ["z"] })
  expect(fresh.connectedIds).toEqual([])
  expect(fresh.error).toMatch(/last known/)
})

test("inventory: brief cache, shared in-flight probes, unknown preserves last known", async () => {
  let calls = 0
  _setInventoryProbe(async (cliPath, id) => {
    calls += 1
    return { id, status: "connected" as const }
  })
  // Concurrent callers share one in-flight probe run: one call per candidate.
  const shared = await Promise.all([
    listConnected({ cliPath: "claude", candidates: ["a", "b"] }),
    listConnected({ cliPath: "claude", candidates: ["a", "b"] }),
    listConnected({ cliPath: "claude", candidates: ["a", "b"] }),
  ])
  expect(shared[0]!.connectedIds).toEqual(["a", "b"])
  expect(calls).toBe(2)
  // A later call within the TTL reuses the cache without probing again.
  await listConnected({ cliPath: "claude", candidates: ["a", "b"] })
  expect(calls).toBe(2)
  // After the TTL one probe fails transiently: the last known account stays,
  // and the error is surfaced instead of equating unknown with signed out.
  _setInventoryProbe(async (cliPath, id) => ({
    id,
    status: id === "a" ? ("connected" as const) : ("unknown" as const),
  }))
  const cached = await listConnected({ cliPath: "claude", candidates: ["a", "b"], now: Date.now() + 61_000 })
  expect(cached.connectedIds).toEqual(["a", "b"])
  expect(cached.error).toMatch(/last known/)
})

test("sender env: subscription pinning strips keys, routing, remaps, and bare mode", () => {
  const previous: Record<string, string | undefined> = {}
  for (const key of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "CLAUDE_CODE_SIMPLE",
  ]) {
    previous[key] = process.env[key]
    process.env[key] = "trap"
  }
  try {
    const env = buildWarmupEnv(undefined)
    for (const key of Object.keys(previous)) expect(env[key]).toBeUndefined()
    expect(env.CLAUDE_CODE_EFFORT_LEVEL).toBe("low")
    const pinned = buildWarmupEnv("/some/dir")
    expect(pinned.CLAUDE_CONFIG_DIR).toBe("/some/dir")
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("sender argv: one minimal pinned invocation, never a shell string", () => {
  const args = buildWarmupArgs()
  expect(args).toEqual([
    "-p",
    "hi",
    "--model",
    "haiku",
    "--effort",
    "low",
    "--max-turns",
    "1",
    "--safe-mode",
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--disallowedTools",
    "*",
    "--system-prompt",
    "Reply with hi only.",
    "--no-session-persistence",
    "--output-format",
    "json",
  ])
  expect(args).not.toContain("--bare")
})

test("cli gate: 2.1.293 floor, unknown fails visibly", async () => {
  expect(cliSupportsWarmup(null)).toBe(false)
  expect(cliSupportsWarmup(undefined)).toBe(false)
  expect(cliSupportsWarmup({ major: 1, minor: 9, patch: 9, raw: "1.9.9" })).toBe(false)
  expect(cliSupportsWarmup({ major: 2, minor: 1, patch: 292, raw: "2.1.292" })).toBe(false)
  expect(cliSupportsWarmup({ major: 2, minor: 0, patch: 9, raw: "2.0.9" })).toBe(false)
  expect(cliSupportsWarmup({ major: 2, minor: 1, patch: 293, raw: "2.1.293" })).toBe(true)
  expect(cliSupportsWarmup({ major: 2, minor: 1, patch: 296, raw: "2.1.296 (Claude Code)" })).toBe(true)
  expect(cliSupportsWarmup({ major: 2, minor: 2, patch: 0, raw: "2.2.0" })).toBe(true)
  expect(cliSupportsWarmup({ major: 3, minor: 0, patch: 0, raw: "3.0.0" })).toBe(true)
  // Installed release passes the gate.
  const installed = await checkWarmupCli("claude")
  expect(installed.available).toBe(true)
  expect(installed.error).toBeUndefined()
  // Missing binary and outdated releases fail with an update requirement.
  const missing = await checkWarmupCli("definitely-not-a-claude-binary")
  expect(missing.available).toBe(false)
  expect(missing.error).toMatch(/not found/)
})

test("tick: an unsupported CLI skips sends without spawning", async () => {
  let spawns = 0
  _setCliRunner(async () => {
    spawns += 1
    return { code: 0, stdout: "{}", stderr: "", timedOut: false }
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "definitely-not-a-claude-binary",
  })
  expect(result).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(spawns).toBe(0)
})

test("tick: queued send-time auth pin skips model when the account signed out after claim", async () => {
  let modelSpawns = 0
  let authProbes = 0
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") {
      authProbes += 1
      return authProbes === 1 ? connectedAuth : signedOutAuth
    }
    modelSpawns += 1
    return sentResult
  })
  const slot = minuteSlot(0)
  await setAccountSchedule({ file: storeFile, accountID: "a", enabled: true, schedule: daily([slot.time]) })
  const result = await tickOnce({
    file: storeFile,
    prevMs: slot.prevMs,
    nowMs: slot.nowMs,
    poolIds: ["a"],
    cliPath: "claude",
  })
  expect(result).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(modelSpawns).toBe(0)
  const read = readStore(storeFile)
  expect(read.status === "ok" && Object.keys(read.state.accounts["a"]?.claims ?? {})).toHaveLength(1)
  expect(read.status === "ok" && read.state.accounts["a"]?.lastAttempt).toBeUndefined()
})

test("inventory: transient nonzero exit with empty stdout keeps last known presence", async () => {
  let calls = 0
  _setCliRunner(async (opts) => {
    if (opts.args[0] !== "auth") return { code: 0, stdout: "{}", stderr: "", timedOut: false }
    calls += 1
    if (calls === 1) return connectedAuth
    return { code: 1, stdout: "", stderr: "", timedOut: false }
  })
  expect((await listConnected({ cliPath: "claude", candidates: ["a"] })).connectedIds).toEqual(["a"])
  const after = await listConnected({ cliPath: "claude", candidates: ["a"], now: Date.now() + 61_000 })
  expect(after.connectedIds).toEqual(["a"])
  expect(after.error).toMatch(/last known/)
})

test("inventory: listener-owned tracker receives auth probe children", async () => {
  const owned: ChildTracker = new Set()
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") {
      expect(opts.tracker).toBe(owned)
      return connectedAuth
    }
    return sentResult
  })
  await listConnected({ cliPath: "claude", candidates: ["a"], tracker: owned })
})

test("view: unconfigured accounts are off with no next run, zone is always present", () => {
  const view = stateView({ poolIds: ["a"], connectedIds: ["a", "zz"], store: { status: "missing" }, available: true })
  expect(view.accounts).toHaveLength(1)
  expect(view.accounts[0]).toMatchObject({ accountID: "a", label: "a", enabled: false })
  expect(view.accounts[0]!.nextAt).toBeUndefined()
  expect(view.accounts[0]!.lastAttempt).toBeUndefined()
  expect(view.timeZone.length).toBeGreaterThan(0)
  expect(view.utcOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
  expect(view.available).toBe(true)
  expect(accountView({ accountID: "default", now: Date.now() }).label).toBe("claude1")
})
