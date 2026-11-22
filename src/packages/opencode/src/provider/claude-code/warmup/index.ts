import { isRecord } from "@/util/record"
import { log } from "../logger.js"
import { buildWarmupArgs, checkWarmupCli, cliRunner, warmupCwd, warmupEnv, type ChildTracker } from "./cli"
import { dirOf, emailOf } from "./identities"
import { listConnected, verifyAccountEmail } from "./inventory"
import type { PeerSource, PeerView } from "./peers"
import {
  CATCHUP_MS,
  nextOccurrence,
  occurrencesInWindow,
  serverTimeZone,
  serverUtcOffset,
  type WarmupSchedule,
} from "./schedule"
import {
  adoptPeer,
  claimOccurrence,
  readStore,
  recordAttempt,
  type AttemptOutcome,
  type LastAttempt,
  type RuntimeFile,
} from "./store"
import { emailKey, readClaudeAccounts, type SyncedAccount, type SyncedAccounts } from "./synced"

export interface AccountView {
  /** The account's email: synced account info is keyed by it. */
  accountID: string
  label: string
  enabled: boolean
  schedule: WarmupSchedule
  nextAt?: number
  lastAttempt?: LastAttempt
  /** Signed in on this machine. */
  here: boolean
}
export interface WarmupStateView {
  accounts: AccountView[]
  timeZone: string
  utcOffset: string
  available: boolean
  error?: string
}

export const POLL_MS = 15_000
export const FIRE_ALLOWANCE_MS = 60_000
/** Each lower-ranked machine waits this much longer for a better-ranked one to claim a slot. */
export const STANDBY_MS = 60_000
export const SEND_TIMEOUT_MS = 30_000
export const SEND_CONCURRENCY = 2
/** Self host name when no peer source is wired (sync off, tests). */
export const LOCAL_HOST = "local"

export interface SendResult {
  outcome: AttemptOutcome
  detail?: string
}

export async function sendWarmup(input: {
  cliPath: string
  accountID: string
  scheduledAt: number
  timeoutMs?: number
  signal?: AbortSignal
  extraEnv?: Record<string, string | undefined>
  tracker?: ChildTracker
}): Promise<SendResult> {
  // Abort gate: never spawn after shutdown was requested.
  if (input.signal?.aborted) return { outcome: "failed", detail: "aborted before spawn" }
  const env = warmupEnv(input.accountID)
  if (input.extraEnv) {
    for (const [key, value] of Object.entries(input.extraEnv)) {
      if (value === undefined) delete env[key]
      else env[key] = value
    }
  }
  const args = buildWarmupArgs()
  // Raw argv: the runner alone resolves the launcher via cliCommand.
  const result = await cliRunner()({
    cliPath: input.cliPath,
    args,
    env,
    cwd: warmupCwd(),
    timeoutMs: input.timeoutMs ?? SEND_TIMEOUT_MS,
    signal: input.signal,
    tracker: input.tracker,
  })
  if (result.timedOut) {
    log.warn("claude warm-up timed out", { accountID: input.accountID })
    return { outcome: "timeout", detail: "timed out waiting for the CLI" }
  }
  if (result.code === 0) {
    let body: unknown
    try {
      body = JSON.parse(result.stdout)
    } catch {
      // No evidence of delivery: fail closed instead of reporting sent.
      log.warn("claude warm-up produced no parseable result", { accountID: input.accountID })
      return { outcome: "failed", detail: "CLI produced no parseable result" }
    }
    // A rejection is a failed warm-up; oc cannot infer a new window from it.
    if (isRecord(body) && body.is_error === true) {
      log.warn("claude warm-up rejected", { accountID: input.accountID })
      return { outcome: "rejected", detail: "rejected by the CLI" }
    }
    // Report sent only on a valid success result, never on malformed output.
    if (isRecord(body) && (typeof body.result === "string" || typeof body.session_id === "string"))
      return { outcome: "sent" }
    log.warn("claude warm-up produced no parseable result", { accountID: input.accountID })
    return { outcome: "failed", detail: "CLI produced no parseable result" }
  }
  // Outcomes and diagnostics stay generic: raw CLI stdout/stderr can carry
  // account identifiers or model text and is never persisted or logged.
  // A requested abort wins over inconclusive exit evidence either way the
  // child reports it (error event vs close race).
  if (input.signal?.aborted) {
    log.warn("claude warm-up aborted", { accountID: input.accountID })
    return { outcome: "failed", detail: "aborted during send" }
  }
  const output = `${result.stdout}\n${result.stderr}`
  if (/limit|quota|rate.?limit|overloaded|usage/i.test(output)) {
    log.warn("claude warm-up rejected", { accountID: input.accountID })
    return { outcome: "rejected", detail: "rejected by the CLI" }
  }
  if (/unknown option|unrecognized|unsupported/i.test(output)) {
    log.warn("claude warm-up CLI unsupported", { accountID: input.accountID })
    return { outcome: "failed", detail: "CLI does not support the warm-up flags; update claude" }
  }
  log.warn("claude warm-up failed", { accountID: input.accountID, code: result.code })
  return { outcome: "failed", detail: "CLI exited before producing a result" }
}

async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index]!
      index += 1
      await fn(item)
    }
  })
  await Promise.all(workers)
}

export interface TickResult {
  fired: number
  missed: number
  skipped: number
}

export interface TickInput {
  nowMs: number
  poolIds: string[]
  cliPath: string
  signal?: AbortSignal
  /** Current membership reader; defaults to the tick's pool snapshot. */
  getPoolIds?: () => Promise<string[]> | string[]
}

export interface SchedulerOptions {
  file: string | null
  lockDir?: string
  tracker?: ChildTracker
  /** Wall clock for send deadlines; defaults to `Date.now`. */
  clock?: () => number
  /** Synced account reader; defaults to oc.json `claudeAccounts`. */
  accounts?: () => SyncedAccounts
  /** Live peers for cross-machine run-once; none means this machine runs alone. */
  peers?: PeerSource
}

interface Pending {
  email: string
  at: number
  /** When rank 0 may fire: the slot itself, or the moment a catch-up was detected. */
  base: number
  /** Highest rank seen: the deadline never shrinks when a better-ranked peer drops out. */
  rank?: number
}

const ZERO: TickResult = { fired: 0, missed: 0, skipped: 0 }

/** The occurrence is still enabled, still one of the account's times, and not before its last save. */
function stillScheduled(account: SyncedAccount | undefined, at: number): boolean {
  const warmup = account?.warmup
  if (!warmup?.enabled || at < warmup.updatedAt) return false
  return occurrencesInWindow(warmup.schedule, at - 1, at).some((occurrence) => occurrence.at === at)
}

/** Rank of `self` among the machines that have `email` signed in: 0 fires first. */
export function rankFor(self: string, email: string, views: readonly PeerView[]): number {
  const hosts = new Set([self, ...views.filter((view) => view.connected.includes(email)).map((view) => view.host)])
  return [...hosts].sort().indexOf(self)
}

// The 15 s loop's scheduler. Crossed slots go into `pending` and stay there until they fire, a
// peer claims them, or their deadline passes: a lower-ranked machine waits STANDBY_MS per rank
// for a better-ranked one to claim. A gap larger than FIRE_ALLOWANCE_MS (sleep, stall) and the
// first tick after start skip on-time firing; the next normal tick catches up the latest slot of
// each account from the last CATCHUP_MS (not before its schedule was saved), unless a peer
// already ran it. With nothing scheduled the tick is a stat of oc.json and no network or CLI.
export function createScheduler(options: SchedulerOptions) {
  let prev: number | undefined
  let catchupFrom: number | undefined
  const pending = new Map<string, Pending>()
  const accounts = () => (options.accounts ?? readClaudeAccounts)()

  function add(item: Pending) {
    const key = `${item.email}|${item.at}`
    const existing = pending.get(key)
    // A catch-up after sleeping through a standby wait restarts the wait from the wake.
    if (!existing || item.base > existing.base) pending.set(key, item)
  }

  /** Establishes the watermark; slots from the last CATCHUP_MS are caught up on the next tick. */
  function start(nowMs: number) {
    prev = nowMs
    catchupFrom = nowMs - CATCHUP_MS
  }

  async function tick(input: TickInput): Promise<TickResult> {
    if (input.signal?.aborted) return { ...ZERO }
    const now = input.nowMs
    if (prev === undefined) {
      start(now)
      return { ...ZERO }
    }
    // A clock move backward re-establishes the watermark.
    if (now <= prev) {
      prev = now
      return { ...ZERO }
    }
    const from = prev
    prev = now
    // Suspend or stall: fire nothing now; the next normal tick catches up once the machine has
    // stayed awake for a poll (short maintenance wakes never send).
    if (now - from > FIRE_ALLOWANCE_MS) {
      catchupFrom = Math.min(catchupFrom ?? from, from)
      return { ...ZERO }
    }
    const synced = accounts()
    const scheduled = Object.entries(synced).flatMap(([email, account]) =>
      account.warmup?.enabled ? [{ email, warmup: account.warmup }] : [],
    )
    for (const { email, warmup } of scheduled) {
      for (const occurrence of occurrencesInWindow(warmup.schedule, from, now)) {
        if (occurrence.at >= warmup.updatedAt) add({ email, at: occurrence.at, base: occurrence.at })
      }
    }
    if (catchupFrom !== undefined) {
      // Slots still waiting when the machine slept restart their wait from the wake.
      for (const item of pending.values()) {
        if (item.at < now - CATCHUP_MS || item.base >= now) continue
        item.base = now
        item.rank = undefined
      }
      const since = Math.max(catchupFrom, now - CATCHUP_MS)
      for (const { email, warmup } of scheduled) {
        const missed = occurrencesInWindow(warmup.schedule, since, from)
          .filter((occurrence) => occurrence.at >= warmup.updatedAt)
          .at(-1)
        if (missed) add({ email, at: missed.at, base: now })
      }
      catchupFrom = undefined
    }
    if (!pending.size) return { ...ZERO }
    return run(input, now, synced)
  }

  async function run(input: TickInput, now: number, synced: SyncedAccounts): Promise<TickResult> {
    const result = { ...ZERO }
    const local = readStore(options.file)
    for (const [key, item] of pending) {
      if (local.accounts[item.email]?.claims[String(item.at)] !== undefined) pending.delete(key)
    }
    if (!pending.size) return result
    const cli = await checkWarmupCli(input.cliPath)
    if (!cli.available) {
      // Ticks only add new occurrences, so a cleared slot would never come back: keep it, so a CLI
      // check that fails once (PATH, antivirus) retries. The send deadline needs this machine's
      // standby rank, which comes from peers read only once the CLI works, so `run` judges it
      // then; the catch-up horizon bounds what waits here.
      log.warn("claude warm-up CLI unavailable; sends skipped", { error: cli.error })
      for (const [key, item] of pending) if (now - item.base > CATCHUP_MS) pending.delete(key)
      result.skipped += pending.size
      return result
    }
    const inventory = await listConnected({
      cliPath: input.cliPath,
      candidates: input.poolIds,
      signal: input.signal,
      tracker: options.tracker,
    }).catch(() => ({ connectedIds: [] as string[] }))
    if (input.signal?.aborted) return { ...ZERO }
    const [self, views] = options.peers
      ? await Promise.all([options.peers.self(), options.peers.views()]).catch((): [string, PeerView[]] => [
          LOCAL_HOST,
          [],
        ])
      : [LOCAL_HOST, [] as PeerView[]]

    const work: Array<{ key: string; item: Pending; dir: string; deadline: number; rank: number }> = []
    for (const [key, item] of pending) {
      const slot = String(item.at)
      const claimedBy = views.filter((view) => view.claims[item.email]?.[slot] !== undefined)
      if (claimedBy.length) {
        pending.delete(key)
        const last = claimedBy
          .map((view) => view.last[item.email])
          .filter((attempt): attempt is LastAttempt => !!attempt && attempt.scheduledAt === item.at)[0]
        await adoptPeer({
          file: options.file,
          lockDir: options.lockDir,
          email: item.email,
          claims: { [slot]: claimedBy[0]!.claims[item.email]![slot]! },
          lastAttempt: last,
          now: (options.clock ?? Date.now)(),
        }).catch((error) => log.warn("claude warm-up peer record failed", { error: String(error) }))
        result.skipped += 1
        continue
      }
      const dir = dirOf(item.email, inventory.connectedIds)
      if (!stillScheduled(synced[item.email], item.at) || !dir) {
        // Not runnable here (paused, time removed, or signed in only on another machine).
        pending.delete(key)
        continue
      }
      const rank = rankFor(self, item.email, views)
      item.rank = Math.max(item.rank ?? 0, rank)
      const due = item.base + rank * STANDBY_MS
      const deadline = item.base + item.rank * STANDBY_MS + FIRE_ALLOWANCE_MS
      if (now > deadline) {
        pending.delete(key)
        if (rank === 0) {
          await record(item, "missed", now, self)
          result.missed += 1
        }
        continue
      }
      if (now < due) continue
      pending.delete(key)
      work.push({ key, item, dir, deadline, rank })
    }

    const wall = options.clock ?? Date.now
    await eachLimit(work, SEND_CONCURRENCY, async ({ key, item, dir, deadline, rank }) => {
      const late = () => wall() > deadline
      if (input.signal?.aborted) {
        result.skipped += 1
        return
      }
      if (late()) {
        await record(item, "missed", wall(), self)
        result.missed += 1
        return
      }
      const email = await verifyAccountEmail(input.cliPath, dir, input.signal, options.tracker).catch(() => undefined)
      if (input.signal?.aborted) {
        result.skipped += 1
        return
      }
      // No answer (timeout, CLI hiccup) is transient: requeue so a later tick retries until the
      // deadline. Ticks only add new occurrences, so a dropped slot would never send.
      if (!email) {
        pending.set(key, item)
        result.skipped += 1
        return
      }
      // Send only to the scheduled account: a folder signed in to another one meanwhile never sends.
      if (emailKey(email) !== item.email) {
        result.skipped += 1
        return
      }
      const poolIds = (await Promise.resolve(input.getPoolIds?.()).catch(() => undefined)) ?? input.poolIds
      if (!poolIds.includes(dir) || !stillScheduled(accounts()[item.email], item.at)) {
        result.skipped += 1
        return
      }
      if (late()) {
        await record(item, "missed", wall(), self)
        result.missed += 1
        return
      }
      // A standby machine re-reads peers right before claiming: a better-ranked one may have
      // claimed since this tick's snapshot.
      if (rank > 0 && options.peers) {
        const fresh = await options.peers.views().catch(() => [] as PeerView[])
        if (fresh.some((view) => view.claims[item.email]?.[String(item.at)] !== undefined)) {
          result.skipped += 1
          return
        }
      }
      const claimed = await claimOccurrence({
        file: options.file,
        lockDir: options.lockDir,
        email: item.email,
        at: item.at,
        now: wall(),
      }).catch((error) => {
        log.warn("claude warm-up claim failed; occurrence skipped", { error: String(error) })
        return false
      })
      if (!claimed) {
        result.skipped += 1
        return
      }
      const send = await sendWarmup({
        cliPath: input.cliPath,
        accountID: dir,
        scheduledAt: item.at,
        signal: input.signal,
        tracker: options.tracker,
      }).catch((): SendResult => ({ outcome: "failed", detail: "send threw" }))
      // A shutdown that raced the send leaves no outcome noise behind, but a prompt that went out
      // is still recorded: its claim stays, so nothing would ever send or record it again.
      if (input.signal?.aborted && send.outcome !== "sent") {
        result.skipped += 1
        return
      }
      await record(item, send.outcome, wall(), self)
      // Delivery success is observable only; a new window requires reading
      // Claude's real reset time, so say Prompt sent, never Window started.
      if (send.outcome === "sent") log.info("claude warm-up prompt sent", { host: self })
      result.fired += 1
    })
    return result
  }

  function record(item: Pending, outcome: AttemptOutcome, attemptedAt: number, host: string) {
    return recordAttempt({
      file: options.file,
      lockDir: options.lockDir,
      email: item.email,
      attempt: { scheduledAt: item.at, attemptedAt, outcome, ...(host !== LOCAL_HOST ? { host } : {}) },
    }).catch((error) => log.warn("claude warm-up outcome write failed", { error: String(error) }))
  }

  return { start, tick, pendingCount: () => pending.size }
}

export type Scheduler = ReturnType<typeof createScheduler>

/** What this machine tells peers: emails signed in here, recent claims, and latest outcomes. */
export async function describeLocal(input: {
  cliPath: string
  poolIds: string[]
  file: string | null
  now?: number
}): Promise<Omit<PeerView, "host">> {
  const inventory = await listConnected({ cliPath: input.cliPath, candidates: input.poolIds }).catch(() => ({
    connectedIds: [] as string[],
  }))
  const connected = [...new Set(inventory.connectedIds.flatMap((dir) => emailOf(dir) ?? []))]
  const since = (input.now ?? Date.now()) - 24 * 60 * 60 * 1000
  const store = readStore(input.file)
  const claims: PeerView["claims"] = {}
  const last: PeerView["last"] = {}
  for (const [email, record] of Object.entries(store.accounts)) {
    const recent = Object.entries(record.claims).filter(([slot]) => Number(slot) >= since)
    if (recent.length) claims[email] = Object.fromEntries(recent)
    if (record.lastAttempt) last[email] = record.lastAttempt
  }
  return { connected, claims, last }
}

export function accountView(input: {
  email: string
  account?: SyncedAccount
  runtime?: RuntimeFile
  here: boolean
  now: number
}): AccountView {
  const warmup = input.account?.warmup
  const schedule = warmup?.schedule ?? { mode: "daily", times: [] as string[] }
  const enabled = warmup?.enabled ?? false
  const next = nextOccurrence(schedule, enabled, input.now)
  const lastAttempt = input.runtime?.accounts[input.email]?.lastAttempt
  return {
    accountID: input.email,
    label: input.account?.name ?? input.email,
    enabled,
    schedule,
    here: input.here,
    ...(next !== undefined ? { nextAt: next } : {}),
    ...(lastAttempt ? { lastAttempt: { ...lastAttempt } } : {}),
  }
}

/** Accounts signed in here first (pool order), then synced accounts signed in elsewhere only. */
export function stateView(input: {
  accounts: SyncedAccounts
  connectedEmails: string[]
  store: RuntimeFile
  available: boolean
  error?: string
  now?: number
}): WarmupStateView {
  const now = input.now ?? Date.now()
  const here = [...new Set(input.connectedEmails.map(emailKey))]
  const elsewhere = Object.keys(input.accounts)
    .filter((email) => !here.includes(email))
    .sort()
  return {
    accounts: [...here, ...elsewhere].map((email) =>
      accountView({
        email,
        account: input.accounts[email],
        runtime: input.store,
        here: here.includes(email),
        now,
      }),
    ),
    timeZone: serverTimeZone(),
    utcOffset: serverUtcOffset(),
    available: input.available,
    ...(input.error ? { error: input.error } : {}),
  }
}
