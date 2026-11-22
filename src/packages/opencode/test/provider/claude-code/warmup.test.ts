/**
 * Claude warm-up (warmup/): schedule validation and windows, the pinned sender, inventory, the
 * machine-local runtime store, and the scheduler's tick rules (pending queue, peers, standby,
 * catch-up, send-time checks). No real CLI is spawned for sends; the fake-model sibling covers
 * the installed binary against TestLLMServer. Synced accounts, identities and migration are in
 * warmupSync.test.ts.
 */
import { afterEach, beforeEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { _resetAccountPool, _setAccountPoolFile } from "@/provider/claude-code/accounts.js"
import {
  accountView,
  createScheduler,
  describeLocal,
  FIRE_ALLOWANCE_MS,
  LOCAL_HOST,
  rankFor,
  sendWarmup,
  STANDBY_MS,
  stateView,
  type TickResult,
} from "@/provider/claude-code/warmup"
import {
  _setCliRunner,
  buildWarmupArgs,
  buildWarmupEnv,
  checkWarmupCli,
  cliSupportsWarmup,
  warmupCwd,
  type ChildTracker,
} from "@/provider/claude-code/warmup/cli"
import { _resetIdentities, emailOf } from "@/provider/claude-code/warmup/identities"
import { materializePoolIds } from "@/provider/claude-code/warmup/identity"
import {
  _resetInventoryForTests,
  _setInventoryProbe,
  listConnected,
  verifyAccountEmail,
} from "@/provider/claude-code/warmup/inventory"
import { parsePeerView, type PeerSource, type PeerView } from "@/provider/claude-code/warmup/peers"
import {
  CATCHUP_MS,
  isScheduleEmpty,
  nextOccurrence,
  normalizeSchedule,
  occurrencesInWindow,
  occurrenceMs,
  parseTimeList,
} from "@/provider/claude-code/warmup/schedule"
import {
  adoptPeer,
  claimOccurrence,
  readLegacyStore,
  readStore,
  recordAttempt,
  type LastAttempt,
} from "@/provider/claude-code/warmup/store"
import type { SyncedAccounts } from "@/provider/claude-code/warmup/synced"

let dir = ""
let storeFile = ""

beforeEach(() => {
  _resetAccountPool()
  _setAccountPoolFile(null)
  _resetInventoryForTests()
  _resetIdentities(null)
  _setCliRunner(null)
  _setInventoryProbe(null)
  dir = mkdtempSync(path.join(tmpdir(), "warmup-"))
  storeFile = path.join(dir, "warmup-state.json")
})

afterEach(() => {
  _resetAccountPool()
  _setAccountPoolFile(null)
  _resetInventoryForTests()
  _resetIdentities(undefined)
  _setCliRunner(null)
  _setInventoryProbe(null)
  rmSync(dir, { recursive: true, force: true })
})

const daily = (times: string[]): { mode: "daily"; times: string[] } => ({ mode: "daily", times })
const weekly = (days: Record<string, string[]>): { mode: "weekly"; days: Record<string, string[]> } => ({
  mode: "weekly",
  days,
})

const connectedAuth = {
  code: 0,
  stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty" }),
  stderr: "",
  timedOut: false,
}

const connectedAs = (email: string) => ({
  ...connectedAuth,
  stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email }),
})

const sentResult = {
  code: 0,
  stdout: JSON.stringify({ type: "result", is_error: false, result: "hi", session_id: "test-session" }),
  stderr: "",
  timedOut: false,
}

// ---- scheduler rig ---------------------------------------------------------------------------

const EMAIL = "a@example.test"
/**
 * A local instant yesterday: slots are daily local wall-clock times, so no real clock is read. The
 * day is yesterday rather than a literal date because the store prunes claims older than 8 days
 * against the real clock (peer claims are adopted with it).
 */
const DAY = new Date(Date.now() - 24 * 60 * 60 * 1000)
const at = (hour: number, minute = 0, second = 0) =>
  new Date(DAY.getFullYear(), DAY.getMonth(), DAY.getDate(), hour, minute, second, 0).getTime()
const SLOT = at(12)
const SEC = 1000

const accountsAt = (times: string[], updatedAt = 0): SyncedAccounts => ({
  [EMAIL]: { warmup: { enabled: true, schedule: daily(times), updatedAt } },
})

function peerView(host: string, input: Partial<PeerView> = {}): PeerView {
  return { host, connected: [EMAIL], claims: {}, last: {}, ...input }
}

/** A fake PeerSource whose views are read live, so a test can have a peer claim mid-sequence. */
function peerSource(self: string, views: () => PeerView[] | Promise<PeerView[]>): PeerSource {
  return { self: async () => self, views: async () => views() }
}

interface TickExtra {
  wall?: number
  poolIds?: string[]
  getPoolIds?: () => string[]
  cliPath?: string
  signal?: AbortSignal
}

interface Rig {
  scheduler: ReturnType<typeof createScheduler>
  state: { accounts: SyncedAccounts; emails: Record<string, string | undefined>; sends: string[]; auth: number }
  clock: { value: number }
  /** One tick at `nowMs`, with the wall clock (send deadlines) at `nowMs` unless `wall` says otherwise. */
  tick(nowMs: number, extra?: TickExtra): Promise<TickResult>
  attempt(email?: string): LastAttempt | undefined
  claims(email?: string): string[]
}

function rig(options: { accounts?: SyncedAccounts; peers?: PeerSource; emails?: Record<string, string> } = {}): Rig {
  const state: Rig["state"] = {
    accounts: options.accounts ?? accountsAt(["12:00"]),
    emails: options.emails ?? { a: EMAIL },
    sends: [],
    auth: 0,
  }
  const clock = { value: 0 }
  _setInventoryProbe(async (_cli, id) => {
    state.auth += 1
    const email = state.emails[id]
    return email ? { id, status: "connected", email } : { id, status: "signed-out" }
  })
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") return connectedAuth
    state.sends.push(opts.env.CLAUDE_CONFIG_DIR ?? "")
    return sentResult
  })
  const scheduler = createScheduler({
    file: storeFile,
    lockDir: path.join(dir, "locks"),
    clock: () => clock.value,
    accounts: () => state.accounts,
    peers: options.peers,
  })
  return {
    scheduler,
    state,
    clock,
    tick(nowMs, extra = {}) {
      clock.value = extra.wall ?? nowMs
      return scheduler.tick({
        nowMs,
        poolIds: extra.poolIds ?? ["a"],
        cliPath: extra.cliPath ?? "claude",
        ...(extra.getPoolIds ? { getPoolIds: extra.getPoolIds } : {}),
        ...(extra.signal ? { signal: extra.signal } : {}),
      })
    },
    attempt: (email = EMAIL) => readStore(storeFile).accounts[email]?.lastAttempt,
    claims: (email = EMAIL) => Object.keys(readStore(storeFile).accounts[email]?.claims ?? {}),
  }
}

const NOTHING = { fired: 0, missed: 0, skipped: 0 }

/** Establishes the watermark 30 s before the slot and takes the quiet tick before it. */
async function arm(r: Rig, slot = SLOT) {
  r.scheduler.start(slot - 30 * SEC)
  expect(await r.tick(slot - 15 * SEC)).toEqual(NOTHING)
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
  const hourly = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`)
  expect(parseTimeList(hourly.join(","))).toEqual({ times: hourly })
  expect("error" in parseTimeList([...hourly, "23:30"].join(","))).toBe(true)
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
  const tooMany = [...Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`), "23:30"]
  expect("error" in normalizeSchedule({ mode: "daily", times: tooMany })).toBe(true)
  expect("error" in normalizeSchedule({ mode: "weekly", days: { mon: ["25:00"] } })).toBe(true)
  expect("error" in normalizeSchedule({ mode: "cron", times: [] })).toBe(true)
  expect("error" in normalizeSchedule(null)).toBe(true)
  expect(isScheduleEmpty({ mode: "daily", times: [] })).toBe(true)
  expect(isScheduleEmpty({ mode: "daily", times: ["07:00"] })).toBe(false)
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

// ---- scheduler: on time, claims, peers, standby ------------------------------------------------

test("tick 1: an on-time slot fires once with no peers; repeat ticks and a restarted scheduler do not resend", async () => {
  const r = rig()
  await arm(r)
  // Nothing is due yet: no auth probe, no CLI.
  expect(r.state.auth).toBe(0)
  expect(await r.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toEqual({ scheduledAt: SLOT, attemptedAt: SLOT, outcome: "sent" })
  expect(r.claims()).toEqual([String(SLOT)])
  expect(await r.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(await r.tick(SLOT + 30 * SEC)).toEqual(NOTHING)
  expect(r.state.sends).toEqual(["a"])

  // A restarted process re-crosses the slot from its own watermark; the stored claim stops it.
  const restarted = rig()
  await arm(restarted)
  expect(await restarted.tick(SLOT)).toEqual(NOTHING)
  expect(restarted.state.sends).toEqual([])
})

test("tick 2: a slot a peer already claimed is not sent; the claim and the peer's outcome are copied locally", async () => {
  const peerLast: LastAttempt = { scheduledAt: SLOT, attemptedAt: SLOT + 2 * SEC, outcome: "sent", host: "win" }
  const r = rig({
    peers: peerSource("mac", () => [
      peerView("win", { claims: { [EMAIL]: { [String(SLOT)]: SLOT + SEC } }, last: { [EMAIL]: peerLast } }),
    ]),
  })
  await arm(r)
  expect(await r.tick(SLOT)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
  expect(r.scheduler.pendingCount()).toBe(0)
  expect(readStore(storeFile).accounts[EMAIL]?.claims).toEqual({ [String(SLOT)]: SLOT + SEC })
  expect(r.attempt()).toEqual(peerLast)
  expect(r.attempt()?.host).toBe("win")
  // Later ticks stay quiet.
  expect(await r.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
})

test("tick 2: a peer's outcome for a different slot is not adopted as this slot's", async () => {
  const other: LastAttempt = {
    scheduledAt: SLOT - 24 * 60 * 60 * 1000,
    attemptedAt: SLOT,
    outcome: "sent",
    host: "win",
  }
  const r = rig({
    peers: peerSource("mac", () => [
      peerView("win", { claims: { [EMAIL]: { [String(SLOT)]: SLOT + SEC } }, last: { [EMAIL]: other } }),
    ]),
  })
  await arm(r)
  await r.tick(SLOT)
  expect(r.claims()).toEqual([String(SLOT)])
  expect(r.attempt()).toBeUndefined()
})

test("tick 3: two machines signed in; rank 0 (sorted host) fires on time and records its host", async () => {
  const r = rig({ peers: peerSource("aaa-goon", () => [peerView("zzz-mac")]) })
  await arm(r)
  expect(await r.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, outcome: "sent", host: "aaa-goon" })
})

test("tick 3: rank 1 stands by for STANDBY_MS without claiming, then fires if rank 0 has not claimed", async () => {
  const r = rig({ peers: peerSource("zzz-mac", () => [peerView("aaa-goon")]) })
  await arm(r)
  for (const offset of [0, 15, 30, 45]) {
    expect(await r.tick(SLOT + offset * SEC)).toEqual(NOTHING)
    expect(r.scheduler.pendingCount()).toBe(1)
    // Standby never writes a claim.
    expect(r.claims()).toEqual([])
  }
  expect(r.state.sends).toEqual([])
  expect(await r.tick(SLOT + STANDBY_MS)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, attemptedAt: SLOT + STANDBY_MS, host: "zzz-mac" })
  expect(r.claims()).toEqual([String(SLOT)])
})

test("tick 3: rank 1 skips when rank 0 claimed the slot by the time standby ends", async () => {
  let claimed = false
  const rankZeroLast: LastAttempt = {
    scheduledAt: SLOT,
    attemptedAt: SLOT + 5 * SEC,
    outcome: "sent",
    host: "aaa-goon",
  }
  const r = rig({
    peers: peerSource("zzz-mac", () => [
      peerView(
        "aaa-goon",
        claimed ? { claims: { [EMAIL]: { [String(SLOT)]: SLOT + 5 * SEC } }, last: { [EMAIL]: rankZeroLast } } : {},
      ),
    ]),
  })
  await arm(r)
  expect(await r.tick(SLOT)).toEqual(NOTHING)
  expect(await r.tick(SLOT + 45 * SEC)).toEqual(NOTHING)
  claimed = true
  expect(await r.tick(SLOT + STANDBY_MS)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
  expect(r.scheduler.pendingCount()).toBe(0)
  expect(r.attempt()).toEqual(rankZeroLast)
})

test("tick 3: rank only counts machines signed in to that account", () => {
  expect(rankFor("mac", EMAIL, [])).toBe(0)
  expect(rankFor("mac", EMAIL, [peerView("goon")])).toBe(1)
  expect(rankFor("goon", EMAIL, [peerView("mac")])).toBe(0)
  // A peer without this account never outranks us.
  expect(rankFor("mac", EMAIL, [peerView("goon", { connected: ["other@example.test"] })])).toBe(0)
  expect(rankFor("mid", EMAIL, [peerView("zzz"), peerView("aaa")])).toBe(1)
})

test("tick 4: a failing peer fetch, an omitted (404) peer, and a peer without the account are ignored", async () => {
  const failing = rig({
    peers: {
      self: async () => "zzz-mac",
      views: async () => {
        throw new Error("tailnet down")
      },
    },
  })
  await arm(failing)
  expect(await failing.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(failing.state.sends).toEqual(["a"])
  // Peer lookup failed, so the host is unknown and not recorded.
  expect(failing.attempt()?.host).toBeUndefined()

  rmSync(storeFile, { force: true })
  // The source leaves a 404 peer out: this machine is alone and fires at once, not after standby.
  const omitted = rig({ peers: peerSource("zzz-mac", () => []) })
  await arm(omitted)
  expect(await omitted.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(omitted.attempt()).toMatchObject({ host: "zzz-mac" })

  rmSync(storeFile, { force: true })
  const elsewhere = rig({
    peers: peerSource("zzz-mac", () => [peerView("aaa-goon", { connected: ["other@example.test"] })]),
  })
  await arm(elsewhere)
  expect(await elsewhere.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
})

test("tick 4: peer views parse defensively; a body from an older build is not a view", () => {
  expect(parsePeerView("win", undefined)).toBeUndefined()
  expect(parsePeerView("win", {})).toBeUndefined()
  expect(parsePeerView("win", { connected: "x", claims: {} })).toBeUndefined()
  expect(parsePeerView("win", { connected: [], claims: null })).toBeUndefined()
  const parsed = parsePeerView("win", {
    connected: [EMAIL, 7],
    claims: { [EMAIL]: { "100": 5, "200": "no" }, bad: "x" },
    last: { [EMAIL]: { scheduledAt: 100, attemptedAt: 110, outcome: "sent" }, junk: { scheduledAt: "x" } },
  })
  expect(parsed).toEqual({
    host: "win",
    connected: [EMAIL],
    claims: { [EMAIL]: { "100": 5 } },
    last: { [EMAIL]: { scheduledAt: 100, attemptedAt: 110, outcome: "sent", host: "win" } },
  })
})

// ---- scheduler: gaps, catch-up, clocks ---------------------------------------------------------

test("tick 5: a gap fires nothing; the next normal tick fires only the latest crossed slot", async () => {
  const r = rig({ accounts: accountsAt(["09:00", "12:00"]) })
  r.scheduler.start(at(8))
  expect(await r.tick(at(8, 0, 15))).toEqual(NOTHING)
  // Sleep across both slots: the waking tick itself sends and probes nothing.
  expect(await r.tick(at(12, 30))).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
  expect(r.state.auth).toBe(0)
  expect(r.scheduler.pendingCount()).toBe(0)
  // After one more poll awake, only 12:00 is caught up (09:00 is superseded), and once.
  expect(await r.tick(at(12, 30, 15))).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, attemptedAt: at(12, 30, 15), outcome: "sent" })
  expect(r.claims()).toEqual([String(SLOT)])
  expect(await r.tick(at(12, 30, 30))).toEqual(NOTHING)
  expect(r.state.sends).toEqual(["a"])
})

test("tick 5: catch-up is not sent when a peer claimed the slot", async () => {
  const r = rig({
    accounts: accountsAt(["12:00"]),
    peers: peerSource("mac", () => [peerView("win", { claims: { [EMAIL]: { [String(SLOT)]: SLOT + SEC } } })]),
  })
  r.scheduler.start(at(11))
  await r.tick(at(11, 0, 15))
  expect(await r.tick(at(12, 30))).toEqual(NOTHING)
  expect(await r.tick(at(12, 30, 15))).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
  expect(r.claims()).toEqual([String(SLOT)])
})

test("tick 5: catch-up never sends a slot from before the schedule was saved", async () => {
  const r = rig({ accounts: accountsAt(["12:00"], at(12, 10)) })
  r.scheduler.start(at(11))
  await r.tick(at(11, 0, 15))
  await r.tick(at(12, 30))
  expect(await r.tick(at(12, 30, 15))).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
  expect(r.state.auth).toBe(0)
  // The same applies to an on-time crossing right after saving: slots before updatedAt are not queued.
  const saved = rig({ accounts: accountsAt(["12:00"], SLOT + SEC) })
  await arm(saved)
  expect(await saved.tick(SLOT)).toEqual(NOTHING)
  expect(saved.state.sends).toEqual([])
})

test("tick 5: catch-up covers a slot under 5 h old and not one past it", async () => {
  expect(CATCHUP_MS).toBe(5 * 60 * 60 * 1000)
  // 09:00 caught up at 13:59:30 (4 h 59 m 30 s old) ...
  const inside = rig({ accounts: accountsAt(["09:00"]) })
  inside.scheduler.start(at(8))
  await inside.tick(at(8, 0, 15))
  await inside.tick(at(13, 59, 15))
  expect(await inside.tick(at(13, 59, 30))).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(inside.attempt()?.scheduledAt).toBe(at(9))
  // ... but not at 14:00:30 (5 h 30 s old).
  rmSync(storeFile, { force: true })
  const past = rig({ accounts: accountsAt(["09:00"]) })
  past.scheduler.start(at(8))
  await past.tick(at(8, 0, 15))
  await past.tick(at(14, 0, 15))
  expect(await past.tick(at(14, 0, 30))).toEqual(NOTHING)
  expect(past.state.sends).toEqual([])
  expect(past.state.auth).toBe(0)
})

test("tick 6: start then the first tick catches up a slot crossed 10 min before start", async () => {
  const r = rig()
  r.scheduler.start(at(12, 10))
  // Start itself only sets the watermark.
  expect(r.state.sends).toEqual([])
  expect(r.state.auth).toBe(0)
  expect(await r.tick(at(12, 10, 15))).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, attemptedAt: at(12, 10, 15), outcome: "sent" })
  expect(await r.tick(at(12, 10, 30))).toEqual(NOTHING)
  expect(r.state.sends).toEqual(["a"])
})

test("tick 6: start does not refire a slot already claimed in the store, nor one older than 5 h", async () => {
  await claimOccurrence({ file: storeFile, lockDir: path.join(dir, "locks"), email: EMAIL, at: SLOT, now: SLOT })
  const r = rig()
  r.scheduler.start(at(12, 10))
  expect(await r.tick(at(12, 10, 15))).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])

  const old = rig()
  old.scheduler.start(at(18))
  expect(await old.tick(at(18, 0, 15))).toEqual(NOTHING)
  expect(old.state.sends).toEqual([])
})

test("tick 7: a backward clock does no work and re-establishes the watermark", async () => {
  const r = rig({ accounts: accountsAt(["12:00"]) })
  r.scheduler.start(at(11))
  expect(await r.tick(at(11, 0, 15))).toEqual(NOTHING)
  expect(await r.tick(at(10))).toEqual(NOTHING)
  expect(await r.tick(at(10))).toEqual(NOTHING)
  expect(await r.tick(at(10, 0, 15))).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
  expect(r.state.auth).toBe(0)
  expect(r.scheduler.pendingCount()).toBe(0)
})

test("tick: an enabled schedule with no due work never touches the CLI", async () => {
  const r = rig({ accounts: accountsAt(["07:00"]) })
  r.scheduler.start(at(14, 59, 45))
  expect(await r.tick(at(15))).toEqual(NOTHING)
  expect(await r.tick(at(15, 0, 15))).toEqual(NOTHING)
  expect(r.state.auth).toBe(0)
  expect(r.state.sends).toEqual([])
})

// ---- scheduler: checks at send time ------------------------------------------------------------

test("tick 8: a folder re-signed to another account between enqueue and send sends nothing", async () => {
  const r = rig()
  await arm(r)
  let probes = 0
  _setInventoryProbe(async (_cli, id) => {
    probes += 1
    return { id, status: "connected", email: probes === 1 ? EMAIL : "someone-else@example.test" }
  })
  expect(await r.tick(SLOT)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(probes).toBe(2)
  expect(r.state.sends).toEqual([])
  expect(r.claims()).toEqual([])
  expect(r.attempt()).toBeUndefined()
  // The identity map follows the folder: it is now the other account.
  expect(emailOf("a")).toBe("someone-else@example.test")
})

test("tick 8: a send-time probe with no email, or signed out, sends nothing and claims nothing", async () => {
  for (const second of [{ status: "connected" as const }, { status: "signed-out" as const }]) {
    rmSync(storeFile, { force: true })
    const r = rig()
    await arm(r)
    let probes = 0
    _setInventoryProbe(async (_cli, id) => {
      probes += 1
      return probes === 1 ? { id, status: "connected", email: EMAIL } : { id, ...second }
    })
    expect(await r.tick(SLOT)).toEqual({ fired: 0, missed: 0, skipped: 1 })
    expect(r.state.sends).toEqual([])
    expect(r.claims()).toEqual([])
  }
})

test("tick 9: pausing between enqueue and send sends nothing", async () => {
  const r = rig()
  await arm(r)
  let probes = 0
  _setInventoryProbe(async (_cli, id) => {
    probes += 1
    // The user pauses while the send-time probe is running.
    if (probes === 2)
      r.state.accounts = { [EMAIL]: { warmup: { enabled: false, schedule: daily(["12:00"]), updatedAt: 0 } } }
    return { id, status: "connected", email: EMAIL }
  })
  expect(await r.tick(SLOT)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
  expect(r.claims()).toEqual([])
})

test("tick 9: paused before the slot queues nothing; pausing a standby slot drops it", async () => {
  const off = rig({ accounts: { [EMAIL]: { warmup: { enabled: false, schedule: daily(["12:00"]), updatedAt: 0 } } } })
  await arm(off)
  expect(await off.tick(SLOT)).toEqual(NOTHING)
  expect(off.state.auth).toBe(0)

  rmSync(storeFile, { force: true })
  const r = rig({ peers: peerSource("zzz-mac", () => [peerView("aaa-goon")]) })
  await arm(r)
  await r.tick(SLOT)
  expect(r.scheduler.pendingCount()).toBe(1)
  r.state.accounts = { [EMAIL]: { warmup: { enabled: false, schedule: daily(["12:00"]), updatedAt: 0 } } }
  expect(await r.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(r.scheduler.pendingCount()).toBe(0)
  expect(await r.tick(SLOT + STANDBY_MS)).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
})

test("tick 9: an account removed from the pool stops via the current membership callback", async () => {
  const r = rig()
  await arm(r)
  expect(await r.tick(SLOT, { getPoolIds: () => [] })).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
  expect(r.claims()).toEqual([])
})

test("tick 10: a rank-0 slot whose deadline passed before it could run records missed and never sends", async () => {
  const r = rig()
  await arm(r)
  const wall = SLOT + FIRE_ALLOWANCE_MS + 5 * SEC
  expect(await r.tick(SLOT, { wall })).toEqual({ fired: 0, missed: 1, skipped: 0 })
  expect(r.state.sends).toEqual([])
  expect(r.attempt()).toEqual({ scheduledAt: SLOT, attemptedAt: wall, outcome: "missed" })
  expect(r.scheduler.pendingCount()).toBe(0)
  // Missed slots are never retried by later ticks.
  expect(await r.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
})

test("tick: accounts outside the connected inventory queue nothing and burn no outcome", async () => {
  const r = rig({
    accounts: {
      [EMAIL]: { warmup: { enabled: true, schedule: daily(["12:00"]), updatedAt: 0 } },
      "b@example.test": { warmup: { enabled: true, schedule: daily(["12:00"]), updatedAt: 0 } },
    },
    emails: { a: EMAIL },
  })
  r.scheduler.start(SLOT - 30 * SEC)
  await r.tick(SLOT - 15 * SEC, { poolIds: ["a", "b"] })
  expect(await r.tick(SLOT, { poolIds: ["a", "b"] })).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()?.outcome).toBe("sent")
  expect(r.claims("b@example.test")).toEqual([])
  expect(r.attempt("b@example.test")).toBeUndefined()
})

test("tick: two accounts signed in here both send, each to its own folder", async () => {
  const r = rig({
    accounts: {
      [EMAIL]: { warmup: { enabled: true, schedule: daily(["12:00"]), updatedAt: 0 } },
      "b@example.test": { warmup: { enabled: true, schedule: daily(["12:00"]), updatedAt: 0 } },
    },
    emails: { a: EMAIL, b: "b@example.test" },
  })
  r.scheduler.start(SLOT - 30 * SEC)
  await r.tick(SLOT - 15 * SEC, { poolIds: ["a", "b"] })
  expect(await r.tick(SLOT, { poolIds: ["a", "b"] })).toEqual({ fired: 2, missed: 0, skipped: 0 })
  expect(r.state.sends.toSorted()).toEqual(["a", "b"])
})

test("tick: a failing send records its outcome once, with no retry", async () => {
  const r = rig()
  const seen: string[] = []
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") return connectedAuth
    seen.push(opts.env.CLAUDE_CONFIG_DIR ?? "")
    return { code: 1, stdout: "", stderr: "boom", timedOut: false }
  })
  await arm(r)
  expect(await r.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(seen).toEqual(["a"])
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, outcome: "failed" })
  expect(await r.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(await r.tick(SLOT + STANDBY_MS)).toEqual(NOTHING)
  expect(seen).toEqual(["a"])
})

test("tick: a store that cannot be written never sends", async () => {
  const r = rig()
  // A directory at the store path makes every claim write fail.
  mkdirSync(storeFile)
  await arm(r)
  expect(await r.tick(SLOT)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
})

test("tick: an unsupported CLI skips sends without spawning", async () => {
  const r = rig()
  await arm(r)
  const cliPath = "definitely-not-a-claude-binary"
  expect(await r.tick(SLOT, { cliPath })).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(r.state.sends).toEqual([])
  expect(r.state.auth).toBe(0)
  // The slot stays queued (a standby machine's window runs past rank 0's) so a CLI check that
  // failed once can retry; `run` applies the real deadline once the CLI answers.
  expect(r.scheduler.pendingCount()).toBe(1)
  await r.tick(SLOT + 45 * SEC, { cliPath })
  await r.tick(SLOT + 90 * SEC, { cliPath })
  expect(r.scheduler.pendingCount()).toBe(1)
})

test("tick: an already-aborted tick never probes or spawns", async () => {
  const r = rig()
  await arm(r)
  const controller = new AbortController()
  controller.abort()
  expect(await r.tick(SLOT, { signal: controller.signal })).toEqual(NOTHING)
  expect(r.state.auth).toBe(0)
  expect(r.state.sends).toEqual([])
})

test("tick: stopping while send-time auth is pending skips the model and leaves no claim", async () => {
  const r = rig()
  _setInventoryProbe(null)
  let modelSpawns = 0
  let authSpawns = 0
  _setCliRunner(async (opts) => {
    if (opts.args[0] === "auth") {
      authSpawns += 1
      if (authSpawns === 1) return connectedAs(EMAIL)
      await new Promise<void>((resolve) => opts.signal?.addEventListener("abort", () => resolve(), { once: true }))
      return { code: null, stdout: "", stderr: "spawn failed: aborted", timedOut: false }
    }
    modelSpawns += 1
    return sentResult
  })
  await arm(r)
  const controller = new AbortController()
  const pending = r.tick(SLOT, { signal: controller.signal })
  await new Promise((resolve) => setTimeout(resolve, 100))
  controller.abort()
  expect(await pending).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(authSpawns).toBe(2)
  expect(modelSpawns).toBe(0)
  expect(r.claims()).toEqual([])
  expect(r.attempt()).toBeUndefined()
})

test("tick: with no peer source the machine ranks itself first under LOCAL_HOST", async () => {
  expect(LOCAL_HOST).toBe("local")
  const r = rig()
  await arm(r)
  expect(await r.tick(SLOT)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.attempt()?.host).toBeUndefined()
})

// ---- runtime store -------------------------------------------------------------------------------

test("store: claims are exclusive, concurrent claimers see one winner, and accounts do not clobber each other", async () => {
  const file = storeFile
  const lockDir = path.join(dir, "locks")
  const [first, second] = await Promise.all([
    claimOccurrence({ file, lockDir, email: EMAIL, at: SLOT, now: SLOT }),
    claimOccurrence({ file, lockDir, email: EMAIL, at: SLOT, now: SLOT }),
  ])
  expect([first, second].filter(Boolean)).toHaveLength(1)
  expect(await claimOccurrence({ file, lockDir, email: EMAIL, at: SLOT, now: SLOT + 1 })).toBe(false)
  await Promise.all([
    claimOccurrence({ file, lockDir, email: "x@example.test", at: SLOT, now: SLOT }),
    claimOccurrence({ file, lockDir, email: "y@example.test", at: SLOT, now: SLOT }),
  ])
  expect(Object.keys(readStore(file).accounts).toSorted()).toEqual([EMAIL, "x@example.test", "y@example.test"])
  // No store file (test default) means nothing can be claimed, so nothing is sent.
  expect(await claimOccurrence({ file: null, email: EMAIL, at: SLOT })).toBe(false)
})

test("store: old claims are pruned when a new one is taken", async () => {
  const lockDir = path.join(dir, "locks")
  const old = SLOT - 9 * 24 * 60 * 60 * 1000
  const recent = SLOT - 2 * 24 * 60 * 60 * 1000
  await claimOccurrence({ file: storeFile, lockDir, email: EMAIL, at: old, now: old })
  await claimOccurrence({ file: storeFile, lockDir, email: EMAIL, at: recent, now: recent })
  await claimOccurrence({ file: storeFile, lockDir, email: EMAIL, at: SLOT, now: SLOT })
  expect(Object.keys(readStore(storeFile).accounts[EMAIL]!.claims).toSorted()).toEqual([String(recent), String(SLOT)])
})

test("store: a newer scheduled attempt is never overwritten by a slower older occurrence", async () => {
  const lockDir = path.join(dir, "locks")
  const early = SLOT - 3600_000
  await recordAttempt({
    file: storeFile,
    lockDir,
    email: EMAIL,
    attempt: { scheduledAt: SLOT, attemptedAt: SLOT + 1, outcome: "sent", host: "win" },
  })
  await recordAttempt({
    file: storeFile,
    lockDir,
    email: EMAIL,
    attempt: { scheduledAt: early, attemptedAt: SLOT + 2, outcome: "failed" },
  })
  expect(readStore(storeFile).accounts[EMAIL]?.lastAttempt).toEqual({
    scheduledAt: SLOT,
    attemptedAt: SLOT + 1,
    outcome: "sent",
    host: "win",
  })
  // Same occurrence: the later attempt wins.
  await recordAttempt({
    file: storeFile,
    lockDir,
    email: EMAIL,
    attempt: { scheduledAt: SLOT, attemptedAt: SLOT + 9, outcome: "failed" },
  })
  expect(readStore(storeFile).accounts[EMAIL]?.lastAttempt?.outcome).toBe("failed")
})

test("store: adopting a peer copies unknown claims and only a newer outcome", async () => {
  const lockDir = path.join(dir, "locks")
  await claimOccurrence({ file: storeFile, lockDir, email: EMAIL, at: SLOT, now: SLOT + 100 })
  await recordAttempt({
    file: storeFile,
    lockDir,
    email: EMAIL,
    attempt: { scheduledAt: SLOT, attemptedAt: SLOT + 100, outcome: "sent" },
  })
  await adoptPeer({
    file: storeFile,
    lockDir,
    email: EMAIL,
    claims: { [String(SLOT)]: SLOT + 999, [String(SLOT + 1)]: SLOT + 5 },
    lastAttempt: { scheduledAt: SLOT, attemptedAt: SLOT + 50, outcome: "failed", host: "win" },
    now: SLOT + 1000,
  })
  const record = readStore(storeFile).accounts[EMAIL]!
  // The existing claim keeps this machine's stamp; the unknown one is added.
  expect(record.claims).toEqual({ [String(SLOT)]: SLOT + 100, [String(SLOT + 1)]: SLOT + 5 })
  // The peer's outcome is older than ours, so ours stays.
  expect(record.lastAttempt).toEqual({ scheduledAt: SLOT, attemptedAt: SLOT + 100, outcome: "sent" })
})

test("store: unreadable or corrupt state reads as empty and bad entries are dropped", () => {
  expect(readStore(storeFile)).toEqual({ accounts: {} })
  expect(readStore(null)).toEqual({ accounts: {} })
  writeFileSync(storeFile, "not json", "utf8")
  expect(readStore(storeFile)).toEqual({ accounts: {} })
  writeFileSync(
    storeFile,
    JSON.stringify({
      accounts: {
        [EMAIL]: { claims: { "5": 7, x: "no" }, lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "bogus" } },
        "b@example.test": "text",
        "c@example.test": {
          claims: {},
          lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "missed", host: "win" },
        },
      },
    }),
    "utf8",
  )
  expect(readStore(storeFile)).toEqual({
    accounts: {
      [EMAIL]: { claims: { "5": 7 } },
      "c@example.test": { claims: {}, lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "missed", host: "win" } },
    },
  })
})

test("store: the legacy folder-keyed warmup.json is read-only input, bad entries skipped", () => {
  expect(readLegacyStore(null)).toEqual({})
  expect(readLegacyStore(path.join(dir, "missing.json"))).toEqual({})
  const legacy = path.join(dir, "warmup.json")
  writeFileSync(
    legacy,
    JSON.stringify({
      accounts: {
        "/home/a/.claude": {
          enabled: true,
          schedule: { mode: "daily", times: ["12:00", "07:00"] },
          lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "sent" },
        },
        "/home/b/.claude": { enabled: "yes", schedule: { mode: "daily", times: ["07:00"] } },
        "/home/c/.claude": { enabled: false, schedule: { mode: "daily", times: ["25:00"] } },
      },
    }),
    "utf8",
  )
  expect(readLegacyStore(legacy)).toEqual({
    "/home/a/.claude": {
      enabled: true,
      schedule: { mode: "daily", times: ["07:00", "12:00"] },
      lastAttempt: { scheduledAt: 1, attemptedAt: 2, outcome: "sent" },
    },
  })
})

// ---- identity, inventory emails, views -----------------------------------------------------------

test("identity: every candidate materializes before use and keeps distinct folders", () => {
  const previous = process.env.CLAUDE_CONFIG_DIR
  delete process.env.CLAUDE_CONFIG_DIR
  try {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? ""
    const expected = path.resolve(path.join(home, ".claude"))
    expect(materializePoolIds(undefined)).toEqual([expected])
    const second = path.join(dir, "second")
    expect(materializePoolIds(["~/.claude", second, second])).toEqual([expected, path.resolve(second)])
    // A later shell change moves the inherited default; saved state is keyed by email, not this.
    const moved = path.join(dir, "moved-home", ".claude")
    process.env.CLAUDE_CONFIG_DIR = moved
    expect(materializePoolIds(undefined)).toEqual([path.resolve(moved)])
    const first = path.join(dir, "one", ".claude")
    const other = path.join(dir, "two", ".claude")
    expect(materializePoolIds([first, other])).toEqual([path.resolve(first), path.resolve(other)])
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
  }
})

test("inventory: probes carry the email into the identity map; verifyAccountEmail honours the probe override", async () => {
  _setInventoryProbe(async (_cli, id) => ({
    id,
    status: id === "c" ? "signed-out" : "connected",
    ...(id === "a" ? { email: "A@Example.test" } : {}),
  }))
  expect((await listConnected({ cliPath: "claude", candidates: ["a", "b", "c"] })).connectedIds).toEqual(["a", "b"])
  // Emails are stored lowercased; a connected probe without one maps nothing.
  expect(emailOf("a")).toBe("a@example.test")
  expect(emailOf("b")).toBeUndefined()
  expect(emailOf("c")).toBeUndefined()

  expect(await verifyAccountEmail("claude", "a")).toBe("A@Example.test")
  // Connected without an email, and signed out, are not sendable.
  expect(await verifyAccountEmail("claude", "b")).toBeUndefined()
  expect(await verifyAccountEmail("claude", "c")).toBeUndefined()
  _setInventoryProbe(async (_cli, id) => ({ id, status: "unknown" }))
  expect(await verifyAccountEmail("claude", "a")).toBeUndefined()
  // Unknown keeps what was learned.
  expect(emailOf("a")).toBe("a@example.test")
})

test("inventory: the real auth probe reads the email from `auth status --json`", async () => {
  _setCliRunner(async () => connectedAs("Real@Example.test"))
  expect((await listConnected({ cliPath: "claude", candidates: ["a"] })).connectedIds).toEqual(["a"])
  expect(emailOf("a")).toBe("real@example.test")
  _setCliRunner(async () => ({
    code: 0,
    stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: null }),
    stderr: "",
    timedOut: false,
  }))
  expect(await verifyAccountEmail("claude", "a")).toBeUndefined()
})

test("view: accounts signed in here list first, synced accounts signed in elsewhere follow, email is the id", () => {
  const lastAttempt: LastAttempt = { scheduledAt: at(6), attemptedAt: at(6), outcome: "sent", host: "win" }
  const view = stateView({
    accounts: {
      "b@example.test": { name: "Team", warmup: { enabled: true, schedule: daily(["07:00"]), updatedAt: 1 } },
    },
    connectedEmails: ["A@Example.test"],
    store: { accounts: { "b@example.test": { claims: {}, lastAttempt } } },
    available: true,
    now: at(6, 30),
  })
  expect(view.accounts).toEqual([
    {
      accountID: "a@example.test",
      label: "a@example.test",
      enabled: false,
      schedule: { mode: "daily", times: [] },
      here: true,
    },
    {
      accountID: "b@example.test",
      label: "Team",
      enabled: true,
      schedule: { mode: "daily", times: ["07:00"] },
      here: false,
      nextAt: at(7),
      lastAttempt,
    },
  ])
  expect(view.timeZone.length).toBeGreaterThan(0)
  expect(view.utcOffset).toMatch(/^UTC[+-]\d{2}:\d{2}$/)
  expect(view.available).toBe(true)
  expect(view.error).toBeUndefined()
  expect(
    stateView({ accounts: {}, connectedEmails: [], store: { accounts: {} }, available: false, error: "no cli" }),
  ).toMatchObject({
    accounts: [],
    available: false,
    error: "no cli",
  })
  expect(accountView({ email: "z@example.test", here: false, now: at(6) })).toEqual({
    accountID: "z@example.test",
    label: "z@example.test",
    enabled: false,
    schedule: { mode: "daily", times: [] },
    here: false,
  })
})

test("view: a paused or empty schedule has no next run", () => {
  const paused = accountView({
    email: EMAIL,
    account: { warmup: { enabled: false, schedule: daily(["07:00"]), updatedAt: 1 } },
    here: true,
    now: at(6),
  })
  expect(paused.nextAt).toBeUndefined()
  expect(paused.schedule).toEqual({ mode: "daily", times: ["07:00"] })
})

test("peer view: describeLocal reports emails signed in here, claims of the last day, and latest outcomes", async () => {
  const lockDir = path.join(dir, "locks")
  _setInventoryProbe(async (_cli, id) =>
    id === "c"
      ? { id, status: "signed-out" }
      : { id, status: "connected", email: id === "a" || id === "b" ? EMAIL : "d@example.test" },
  )
  const dayAgo = SLOT - 25 * 60 * 60 * 1000
  await claimOccurrence({ file: storeFile, lockDir, email: EMAIL, at: dayAgo, now: dayAgo })
  await claimOccurrence({ file: storeFile, lockDir, email: EMAIL, at: SLOT, now: SLOT })
  const attempt: LastAttempt = { scheduledAt: SLOT, attemptedAt: SLOT, outcome: "sent", host: "mac" }
  await recordAttempt({ file: storeFile, lockDir, email: EMAIL, attempt })
  const view = await describeLocal({
    cliPath: "claude",
    poolIds: ["a", "b", "c", "d"],
    file: storeFile,
    now: SLOT + 1000,
  })
  expect(view.connected.toSorted()).toEqual([EMAIL, "d@example.test"])
  expect(view.claims).toEqual({ [EMAIL]: { [String(SLOT)]: SLOT } })
  expect(view.last).toEqual({ [EMAIL]: attempt })
})

// ---- scheduler: standby, replacement, schedule edits, late claims ---------------------------------

test("tick (a): a rank-1 machine whose better-ranked peer drops out mid-standby still fires", async () => {
  let peers: PeerView[] = [peerView("aaa-goon")]
  const r = rig({ peers: peerSource("zzz-mac", () => peers) })
  await arm(r)
  // Rank 1: this tick and the next only wait. The pending item remembers the highest rank seen.
  expect(await r.tick(SLOT)).toEqual(NOTHING)
  expect(await r.tick(SLOT + 45 * SEC)).toEqual(NOTHING)
  expect(r.scheduler.pendingCount()).toBe(1)
  // The peer disappears: this machine is rank 0 now and due at once. Its deadline is still the
  // rank-1 one (SLOT + 120 s); a deadline recomputed from the current rank (SLOT + 60 s) would
  // already have passed at +75 s and recorded `missed`.
  peers = []
  expect(await r.tick(SLOT + 75 * SEC)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, attemptedAt: SLOT + 75 * SEC, outcome: "sent" })
})

test("tick (b): a catch-up re-covering a pending slot restarts the standby wait from the wake", async () => {
  const r = rig({ peers: peerSource("zzz-mac", () => [peerView("aaa-goon")]) })
  await arm(r)
  await r.tick(SLOT)
  await r.tick(SLOT + 15 * SEC)
  expect(r.scheduler.pendingCount()).toBe(1)
  // The clock steps back before the slot, then a long gap jumps forward over it again: the gap
  // sets the catch-up origin to the earlier time, so the settle tick queues SLOT a second time.
  expect(await r.tick(SLOT - 600 * SEC)).toEqual(NOTHING)
  expect(await r.tick(SLOT + 600 * SEC)).toEqual(NOTHING)
  const wake = SLOT + 615 * SEC
  // The original item (base SLOT) is long past its SLOT + 120 s deadline; the re-queued one has
  // base = wake, so rank 1 waits a fresh STANDBY_MS from there instead of being dropped.
  expect(await r.tick(wake)).toEqual(NOTHING)
  expect(r.scheduler.pendingCount()).toBe(1)
  for (const offset of [15, 30, 45]) expect(await r.tick(wake + offset * SEC)).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
  expect(await r.tick(wake + STANDBY_MS)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.attempt()).toMatchObject({ scheduledAt: SLOT, attemptedAt: wake + STANDBY_MS, outcome: "sent" })
})

test("tick (c): a pending slot whose time was removed, or that predates a newer save, is dropped", async () => {
  const both: SyncedAccounts = accountsAt(["12:00", "18:00"])
  const standby = () => rig({ accounts: both, peers: peerSource("zzz-mac", () => [peerView("aaa-goon")]) })

  // Queue processing: 12:00 is removed during the standby wait while 18:00 stays enabled, so
  // the account is still "enabled" but the slot is no longer one of its times.
  const removed = standby()
  await arm(removed)
  await removed.tick(SLOT)
  expect(removed.scheduler.pendingCount()).toBe(1)
  removed.state.accounts = accountsAt(["18:00"])
  expect(await removed.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(removed.scheduler.pendingCount()).toBe(0)
  expect(await removed.tick(SLOT + STANDBY_MS)).toEqual(NOTHING)
  expect(removed.state.sends).toEqual([])

  // Queue processing: a save newer than the slot (updatedAt after SLOT) drops it too.
  rmSync(storeFile, { force: true })
  const resaved = standby()
  await arm(resaved)
  await resaved.tick(SLOT)
  resaved.state.accounts = accountsAt(["12:00", "18:00"], SLOT + SEC)
  expect(await resaved.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(resaved.scheduler.pendingCount()).toBe(0)
  expect(await resaved.tick(SLOT + STANDBY_MS)).toEqual(NOTHING)
  expect(resaved.state.sends).toEqual([])

  // Send boundary: the time is removed while the send-time probe runs, after the slot was
  // already taken off the queue.
  rmSync(storeFile, { force: true })
  const late = rig({ accounts: both })
  await arm(late)
  let probes = 0
  _setInventoryProbe(async (_cli, id) => {
    probes += 1
    if (probes === 2) late.state.accounts = accountsAt(["18:00"])
    return { id, status: "connected", email: EMAIL }
  })
  expect(await late.tick(SLOT)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(late.state.sends).toEqual([])
  expect(late.claims()).toEqual([])
})

test("tick (d): a standby machine re-reads peers right before claiming and skips a slot claimed meanwhile", async () => {
  let claimed = false
  let fetches = 0
  const r = rig({
    peers: peerSource("zzz-mac", () => {
      fetches += 1
      return [peerView("aaa-goon", claimed ? { claims: { [EMAIL]: { [String(SLOT)]: SLOT + 50 * SEC } } } : {})]
    }),
  })
  await arm(r)
  for (const offset of [0, 15, 30, 45]) expect(await r.tick(SLOT + offset * SEC)).toEqual(NOTHING)
  // At the standby deadline the tick's own peer snapshot still shows no claim; rank 0 claims
  // while this machine's send-time probe runs.
  let probes = 0
  _setInventoryProbe(async (_cli, id) => {
    probes += 1
    if (probes === 2) claimed = true
    return { id, status: "connected", email: EMAIL }
  })
  const before = fetches
  expect(await r.tick(SLOT + STANDBY_MS)).toEqual({ fired: 0, missed: 0, skipped: 1 })
  expect(fetches - before).toBe(2)
  expect(r.state.sends).toEqual([])
  // No local claim either: only the sender claims.
  expect(r.claims()).toEqual([])
  expect(r.attempt()).toBeUndefined()
})

test("tick (b2): a pending standby slot restarts its wait from the wake after sleeping through it", async () => {
  // Rank 1: the better-ranked peer is connected and never claims.
  const r = rig({ peers: peerSource("zzz-mac", () => [peerView("aaa-goon")]) })
  await arm(r)
  expect(await r.tick(SLOT)).toEqual(NOTHING)
  expect(await r.tick(SLOT + 15 * SEC)).toEqual(NOTHING)
  expect(r.scheduler.pendingCount()).toBe(1)
  // Sleep, forward time only: the gap tick sends nothing and leaves the pending item alone.
  const gap = SLOT + 600 * SEC
  expect(gap - (SLOT + 15 * SEC)).toBeGreaterThan(FIRE_ALLOWANCE_MS)
  expect(await r.tick(gap)).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
  // The settle tick restarts the wait: the original item (deadline SLOT + 120 s) would be long
  // dead, but it is kept with base = wake and its rank forgotten.
  const wake = gap + 15 * SEC
  expect(await r.tick(wake)).toEqual(NOTHING)
  expect(r.scheduler.pendingCount()).toBe(1)
  expect(await r.tick(wake + 15 * SEC)).toEqual(NOTHING)
  expect(r.state.sends).toEqual([])
  // STANDBY_MS after the wake (plus a poll): due, and still inside the restarted deadline.
  expect(await r.tick(wake + STANDBY_MS + 15 * SEC)).toEqual({ fired: 1, missed: 0, skipped: 0 })
  expect(r.state.sends).toEqual(["a"])
  expect(r.attempt()).toMatchObject({
    scheduledAt: SLOT,
    attemptedAt: wake + STANDBY_MS + 15 * SEC,
    outcome: "sent",
    host: "zzz-mac",
  })
  expect(await r.tick(wake + STANDBY_MS + 30 * SEC)).toEqual(NOTHING)
  expect(r.state.sends).toEqual(["a"])
})
