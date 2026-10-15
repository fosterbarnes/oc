import { isRecord } from "@/util/record"
import { DEFAULT_ACCOUNT, poolAccountLabel } from "../accounts.js"
import { log } from "../logger.js"
import {
  buildWarmupArgs,
  buildWarmupEnv,
  checkWarmupCli,
  cliRunner,
  warmupConfigDir,
  warmupCwd,
  type ChildTracker,
} from "./cli"
import { accountLabel } from "./identity"
import { listConnected, verifyAccountConnected } from "./inventory"
import {
  nextOccurrence,
  occurrencesInWindow,
  isScheduleEmpty,
  serverTimeZone,
  serverUtcOffset,
  type DueOccurrence,
  type WarmupSchedule,
} from "./schedule"
import {
  claimDueOccurrences,
  readStore,
  recordAttempt,
  storeKeyForAccount,
  type AccountRecord,
  type AttemptOutcome,
  type LastAttempt,
  type StoreRead,
} from "./store"

export interface AccountView {
  accountID: string
  label: string
  enabled: boolean
  schedule: WarmupSchedule
  nextAt?: number
  lastAttempt?: LastAttempt
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
export const SEND_TIMEOUT_MS = 30_000
export const SEND_CONCURRENCY = 2

// Send boundary re-check: pausing or removing an account cancels unstarted
// work, and a request already sent cannot be recalled.
export function isStillSendable(input: {
  store: StoreRead
  accountID: string
  poolIds: string[]
  connectedIds: string[]
}): boolean {
  if (input.store.status !== "ok") return false
  if (!input.poolIds.includes(input.accountID)) return false
  if (!input.connectedIds.includes(input.accountID)) return false
  const record = input.store.state.accounts[storeKeyForAccount(input.accountID)]
  return !!record && record.enabled && !isScheduleEmpty(record.schedule)
}

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
  const configDir = warmupConfigDir(input.accountID)
  const env = buildWarmupEnv(input.accountID === DEFAULT_ACCOUNT ? undefined : input.accountID)
  env.CLAUDE_CONFIG_DIR = configDir
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

export async function tickOnce(input: {
  file: string | null
  lockDir?: string
  prevMs: number
  nowMs: number
  poolIds: string[]
  cliPath: string
  signal?: AbortSignal
  tracker?: ChildTracker
  /** Wall clock for send deadlines; defaults to `Date.now`. The listener passes its loop clock. */
  clock?: () => number
  /** Current membership reader from the listener; defaults to the tick's pool snapshot. */
  getPoolIds?: () => Promise<string[]> | string[]
}): Promise<TickResult> {
  const zero: TickResult = { fired: 0, missed: 0, skipped: 0 }
  if (input.signal?.aborted) return zero
  // A gap larger than the firing allowance means suspend or a stall:
  // advance the watermark and skip all crossed slots, no catch-up burst.
  // A clock move backward re-establishes the watermark.
  if (input.nowMs <= input.prevMs || input.nowMs - input.prevMs > FIRE_ALLOWANCE_MS) return zero
  const stored = readStore(input.file)
  if (stored.status === "missing") return zero
  if (stored.status === "malformed") {
    log.warn("claude warm-up store unreadable; sends stopped", { error: stored.error })
    return zero
  }
  const enabledIds = input.poolIds.filter((id) => {
    const record = stored.state.accounts[storeKeyForAccount(id)]
    return !!record && record.enabled && !isScheduleEmpty(record.schedule)
  })
  if (!enabledIds.length) return zero
  // Due work first: with no occurrences in this window there is nothing to
  // probe or spawn for. The 15s loop stays a tiny file read; no periodic
  // CLI discovery, version check, or auth probe happens all day for idle
  // schedules.
  const dueIds = enabledIds.filter((id) => {
    const record = stored.state.accounts[storeKeyForAccount(id)]!
    return occurrencesInWindow(record.schedule, input.prevMs, input.nowMs).length > 0
  })
  if (!dueIds.length) return zero
  const cli = await checkWarmupCli(input.cliPath)
  if (!cli.available) {
    log.warn("claude warm-up CLI unavailable; sends skipped", { error: cli.error })
    return { ...zero, skipped: enabledIds.length }
  }
  const inventory = await listConnected({
    cliPath: input.cliPath,
    candidates: input.poolIds,
    signal: input.signal,
    tracker: input.tracker,
  }).catch(() => ({ at: Date.now(), connectedIds: [] as string[] }))
  if (input.signal?.aborted) return zero
  const dueConnected = dueIds.filter((id) => inventory.connectedIds.includes(id))
  const work: Array<{ accountID: string; occurrence: DueOccurrence }> = []
  for (const id of dueConnected) {
    if (input.signal?.aborted) break
    const record = stored.state.accounts[storeKeyForAccount(id)]!
    const occurrences = occurrencesInWindow(record.schedule, input.prevMs, input.nowMs)
    if (!occurrences.length) continue
    let claimed: DueOccurrence[]
    try {
      claimed = await claimDueOccurrences({ file: input.file, lockDir: input.lockDir, accountID: id, occurrences })
    } catch (error) {
      log.warn("claude warm-up claim failed; occurrence skipped", { accountID: id, error: String(error) })
      continue
    }
    for (const occurrence of claimed) work.push({ accountID: id, occurrence })
  }
  const result: TickResult = { ...zero }
  const wall = input.clock ?? Date.now
  await eachLimit(work, SEND_CONCURRENCY, async ({ accountID, occurrence }) => {
    if (input.signal?.aborted) {
      result.skipped += 1
      return
    }
    const queuedMs = wall() - occurrence.at
    const attemptBase = { scheduledAt: occurrence.at, attemptedAt: wall() }
    if (queuedMs > FIRE_ALLOWANCE_MS) {
      await recordAttempt({
        file: input.file,
        lockDir: input.lockDir,
        accountID,
        attempt: { ...attemptBase, outcome: "missed" },
      }).catch((error) => log.warn("claude warm-up outcome write failed", { accountID, error: String(error) }))
      result.missed += 1
      return
    }
    const connected = await verifyAccountConnected(input.cliPath, accountID, input.signal, input.tracker).catch(
      () => false,
    )
    if (input.signal?.aborted) {
      result.skipped += 1
      return
    }
    if (!connected) {
      result.skipped += 1
      return
    }
    const poolIds = (await Promise.resolve(input.getPoolIds?.()).catch(() => undefined)) ?? input.poolIds
    if (!isStillSendable({ store: readStore(input.file), accountID, poolIds, connectedIds: [accountID] })) {
      result.skipped += 1
      return
    }
    if (wall() - occurrence.at > FIRE_ALLOWANCE_MS) {
      await recordAttempt({
        file: input.file,
        lockDir: input.lockDir,
        accountID,
        attempt: { ...attemptBase, outcome: "missed" },
      }).catch((error) => log.warn("claude warm-up outcome write failed", { accountID, error: String(error) }))
      result.missed += 1
      return
    }
    const send = await sendWarmup({
      cliPath: input.cliPath,
      accountID,
      scheduledAt: occurrence.at,
      signal: input.signal,
      tracker: input.tracker,
    }).catch((): SendResult => ({ outcome: "failed", detail: "send threw" }))
    // A shutdown that raced the send leaves no outcome noise behind.
    if (input.signal?.aborted) {
      result.skipped += 1
      return
    }
    await recordAttempt({
      file: input.file,
      lockDir: input.lockDir,
      accountID,
      attempt: { ...attemptBase, attemptedAt: wall(), outcome: send.outcome },
    }).catch((error) => log.warn("claude warm-up outcome write failed", { accountID, error: String(error) }))
    // Delivery success is observable only; a new window requires reading
    // Claude's real reset time, so say Prompt sent, never Window started.
    if (send.outcome === "sent") log.info("claude warm-up prompt sent", { accountID })
    result.fired += 1
  })
  return result
}

export function accountView(input: {
  accountID: string
  record?: AccountRecord
  now: number
  clashes?: boolean
}): AccountView {
  const schedule = input.record?.schedule ?? { mode: "daily", times: [] as string[] }
  const enabled = input.record?.enabled ?? false
  const next = nextOccurrence(schedule, enabled, input.now)
  return {
    accountID: input.accountID,
    label: accountLabel(input.accountID, input.clashes ?? false),
    enabled,
    schedule,
    ...(next !== undefined ? { nextAt: next } : {}),
    ...(input.record?.lastAttempt ? { lastAttempt: { ...input.record.lastAttempt } } : {}),
  }
}

export function stateView(input: {
  poolIds: string[]
  connectedIds: string[]
  store: StoreRead
  available: boolean
  error?: string
  now?: number
}): WarmupStateView {
  const now = input.now ?? Date.now()
  const counts = new Map<string, number>()
  for (const id of input.connectedIds) {
    if (!input.poolIds.includes(id)) continue
    counts.set(poolAccountLabel(id), (counts.get(poolAccountLabel(id)) ?? 0) + 1)
  }
  return {
    accounts: input.connectedIds
      .filter((id) => input.poolIds.includes(id))
      .map((id) =>
        accountView({
          accountID: id,
          record: input.store.status === "ok" ? input.store.state.accounts[storeKeyForAccount(id)] : undefined,
          now,
          clashes: (counts.get(poolAccountLabel(id)) ?? 0) > 1,
        }),
      ),
    timeZone: serverTimeZone(),
    utcOffset: serverUtcOffset(),
    available: input.available,
    ...(input.error ? { error: input.error } : {}),
  }
}
