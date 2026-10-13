import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import launch from "cross-spawn"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { DEFAULT_ACCOUNT, expandHome, poolAccountIds, poolAccountLabel } from "./accounts.js"
import { claudeSpawnEnv } from "./spawnEnv.js"
import { cliCommand } from "./cliExecutable.js"
import { detectCliVersion, type CliVersion } from "./cliVersion.js"
import { log } from "./logger.js"

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun"
export const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export type WarmupSchedule = { mode: "daily"; times: string[] } | { mode: "weekly"; days: Record<DayKey, string[]> }
export type AttemptOutcome = "sent" | "rejected" | "failed" | "timeout" | "missed"
export interface LastAttempt {
  scheduledAt: number
  attemptedAt: number
  outcome: AttemptOutcome
}
export interface AccountRecord {
  enabled: boolean
  schedule: WarmupSchedule
  claims: Record<string, number>
  lastAttempt?: LastAttempt
}
export interface WarmupFile {
  accounts: Record<string, AccountRecord>
}
export interface DueOccurrence {
  key: string
  at: number
  time: string
}
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

export const MAX_TIMES_PER_DAY = 4
export const POLL_MS = 15_000
export const FIRE_ALLOWANCE_MS = 60_000
export const SEND_TIMEOUT_MS = 30_000
export const AUTH_PROBE_TIMEOUT_MS = 15_000
export const SEND_CONCURRENCY = 2
export const CLAIM_RETENTION_DAYS = 8
export const INVENTORY_TTL_MS = 60_000
export const STORE_LOCK_TIMEOUT_MS = 5_000
export const WARMUP_PROMPT = "hi"
export const WARMUP_SYSTEM_PROMPT = "Reply with hi only."

// Minimum CLI for warm-up: Haiku 5.5 needs 2.1.293+, `auth status` reports
// its config directory since 2.1.268, and --safe-mode exists since 2.1.169.
// Gate on the cached detected version, never on --help text (which omits
// flags) and never on a production prompt parse probe.
export const WARMUP_MIN_VERSION = { major: 2, minor: 1, patch: 293 } as const

export function cliSupportsWarmup(version: CliVersion | null | undefined): boolean {
  if (!version) return false
  if (version.major !== WARMUP_MIN_VERSION.major) return version.major > WARMUP_MIN_VERSION.major
  if (version.minor !== WARMUP_MIN_VERSION.minor) return version.minor > WARMUP_MIN_VERSION.minor
  return version.patch >= WARMUP_MIN_VERSION.patch
}

export async function checkWarmupCli(cliPath: string): Promise<{ available: boolean; error?: string }> {
  const version = await detectCliVersion(cliPath).catch(() => null)
  if (!version) return { available: false, error: "Claude CLI not found; install claude to use warm-up" }
  if (!cliSupportsWarmup(version))
    return { available: false, error: `Claude CLI ${version.raw} is too old; warm-up needs 2.1.293 or newer` }
  return { available: true }
}

const TIME_RE = /^(\d{2}):(\d{2})$/
const WEEKDAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

export function parseTimeList(input: string): { times: string[] } | { error: string } {
  const seen = new Set<string>()
  const times: string[] = []
  for (const token of input.split(",")) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const match = TIME_RE.exec(trimmed)
    if (!match) return { error: `invalid time ${JSON.stringify(trimmed)}: expected HH:mm` }
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (hour > 23 || minute > 59) return { error: `invalid time ${JSON.stringify(trimmed)}: expected HH:mm` }
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    times.push(trimmed)
  }
  times.sort()
  if (times.length > MAX_TIMES_PER_DAY) return { error: `too many times: at most ${MAX_TIMES_PER_DAY} per day` }
  return { times }
}

function parseDayValue(value: unknown, what: string): { times: string[] } | { error: string } {
  if (typeof value === "string") return parseTimeList(value)
  if (Array.isArray(value)) {
    // At the trust boundary every array entry is its own exact HH:mm value:
    // joined strings like ["07:00,12:00"] or [""] are rejected, not parsed.
    const seen = new Set<string>()
    const times: string[] = []
    for (const entry of value) {
      if (typeof entry !== "string") return { error: `invalid ${what}: expected HH:mm strings` }
      const trimmed = entry.trim()
      const match = TIME_RE.exec(trimmed)
      if (!match || Number(match[1]) > 23 || Number(match[2]) > 59)
        return { error: `invalid time ${JSON.stringify(entry)}: expected HH:mm` }
      if (seen.has(trimmed)) continue
      seen.add(trimmed)
      times.push(trimmed)
    }
    times.sort()
    if (times.length > MAX_TIMES_PER_DAY) return { error: `too many times: at most ${MAX_TIMES_PER_DAY} per day` }
    return { times }
  }
  return { error: `invalid ${what}: expected a comma-separated HH:mm list` }
}

export function normalizeSchedule(input: unknown): { schedule: WarmupSchedule } | { error: string } {
  if (!isRecord(input)) return { error: "invalid schedule: expected an object" }
  if (input.mode === "daily") {
    const parsed = parseDayValue(input.times, "times")
    if ("error" in parsed) return parsed
    return { schedule: { mode: "daily", times: parsed.times } }
  }
  if (input.mode === "weekly") {
    if (!isRecord(input.days)) return { error: "invalid schedule: weekly mode needs a days object" }
    const days = {} as Record<DayKey, string[]>
    for (const day of DAY_KEYS) {
      const parsed = parseDayValue(input.days[day], day)
      if ("error" in parsed) return { error: `${day}: ${parsed.error}` }
      days[day] = parsed.times
    }
    return { schedule: { mode: "weekly", days } }
  }
  return { error: 'invalid schedule: mode must be "daily" or "weekly"' }
}

export function isScheduleEmpty(schedule: WarmupSchedule): boolean {
  if (schedule.mode === "daily") return schedule.times.length === 0
  return DAY_KEYS.every((day) => schedule.days[day].length === 0)
}

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

export function localDateStr(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function weekdayKey(ms: number): DayKey {
  return WEEKDAY_NAMES[new Date(ms).getDay()]!
}

export function serverTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local"
}

export function serverUtcOffset(): string {
  const minutes = -new Date().getTimezoneOffset()
  const sign = minutes < 0 ? "-" : "+"
  const abs = Math.abs(minutes)
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

// A spring-forward gap rolls forward when constructed, so the round-trip
// check skips nonexistent local times. A fall-back repeat maps to one
// local date + HH:mm key, so it fires once per day.
export function occurrenceMs(year: number, month: number, day: number, time: string): number | undefined {
  const match = TIME_RE.exec(time)
  if (!match) return undefined
  const date = new Date(year, month, day, Number(match[1]), Number(match[2]), 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== Number(match[1]) ||
    date.getMinutes() !== Number(match[2])
  )
    return undefined
  return date.getTime()
}

function timesForDate(schedule: WarmupSchedule, ms: number): string[] {
  if (schedule.mode === "daily") return schedule.times
  return schedule.days[weekdayKey(ms)]
}

export function occurrencesInWindow(
  schedule: WarmupSchedule,
  fromExclusiveMs: number,
  toInclusiveMs: number,
): DueOccurrence[] {
  if (toInclusiveMs <= fromExclusiveMs) return []
  const out: DueOccurrence[] = []
  const seen = new Set<string>()
  // Walk local calendar days by date parts, never by fixed milliseconds: a
  // +24h step across a fall-back boundary can land inside the repeated hour
  // and revisit (or skip) a date. Noon always exists exactly once per date,
  // so it is the day representative; occurrenceMs round-trips each HH:mm.
  const from = new Date(fromExclusiveMs)
  const lastStr = localDateStr(toInclusiveMs)
  let year = from.getFullYear()
  let month = from.getMonth()
  let day = from.getDate()
  for (let i = 0; i < 16; i++) {
    const dayMs = new Date(year, month, day, 12, 0, 0, 0).getTime()
    for (const time of timesForDate(schedule, dayMs)) {
      const at = occurrenceMs(year, month, day, time)
      if (at === undefined || at <= fromExclusiveMs || at > toInclusiveMs) continue
      const key = `${localDateStr(at)}|${time}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ key, at, time })
    }
    if (`${year}-${pad(month + 1)}-${pad(day)}` === lastStr) break
    const next = new Date(year, month, day + 1, 12, 0, 0, 0)
    year = next.getFullYear()
    month = next.getMonth()
    day = next.getDate()
  }
  return out.sort((a, b) => a.at - b.at)
}

export function nextOccurrence(schedule: WarmupSchedule, enabled: boolean, nowMs: number): number | undefined {
  if (!enabled || isScheduleEmpty(schedule)) return undefined
  const horizon = nowMs + CLAIM_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const upcoming = occurrencesInWindow(schedule, nowMs, horizon)
  return upcoming.length ? upcoming[0]!.at : undefined
}

export function defaultStoreFile(): string | null {
  if (process.env.BUN_TEST != null) return null
  return path.join(Global.Path.data, "claude-code", "warmup.json")
}

export type StoreRead =
  | { status: "ok"; state: WarmupFile }
  | { status: "missing" }
  | { status: "malformed"; error: string }

function isScheduleValue(value: unknown): value is WarmupSchedule {
  const normalized = normalizeSchedule(value)
  return !("error" in normalized)
}

function isRecordValue(value: unknown): value is AccountRecord {
  if (!isRecord(value)) return false
  if (typeof value.enabled !== "boolean") return false
  if (!isRecord(value.schedule) || !isScheduleValue(value.schedule)) return false
  if (!isRecord(value.claims)) return false
  for (const [key, stamp] of Object.entries(value.claims)) {
    if (typeof key !== "string" || typeof stamp !== "number" || !Number.isFinite(stamp)) return false
  }
  if (value.lastAttempt !== undefined) {
    if (!isRecord(value.lastAttempt)) return false
    if (typeof value.lastAttempt.scheduledAt !== "number" || typeof value.lastAttempt.attemptedAt !== "number")
      return false
    if (!["sent", "rejected", "failed", "timeout", "missed"].includes(value.lastAttempt.outcome as string)) return false
  }
  return true
}

export function readStore(file: string | null): StoreRead {
  if (!file) return { status: "missing" }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" }
    return { status: "malformed", error: `cannot read warm-up store: ${String(error)}` }
  }
  if (!isRecord(raw) || !isRecord(raw.accounts)) return { status: "malformed", error: "warm-up store has no accounts" }
  const accounts: Record<string, AccountRecord> = {}
  for (const [id, record] of Object.entries(raw.accounts)) {
    if (!isRecordValue(record)) return { status: "malformed", error: `warm-up store entry ${id} is invalid` }
    const normalized = normalizeSchedule(record.schedule)
    if ("error" in normalized) return { status: "malformed", error: `warm-up store entry ${id} is invalid` }
    accounts[id] = {
      enabled: record.enabled,
      schedule: normalized.schedule,
      claims: { ...record.claims },
      ...(record.lastAttempt ? { lastAttempt: { ...record.lastAttempt } } : {}),
    }
  }
  return { status: "ok", state: { accounts } }
}

function pruneClaims(claims: Record<string, number>, nowMs: number): Record<string, number> {
  const cutoff = localDateStr(nowMs - CLAIM_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const kept: Record<string, number> = {}
  for (const [key, stamp] of Object.entries(claims)) {
    if (key.slice(0, 10) >= cutoff) kept[key] = stamp
  }
  return kept
}

export function writeStoreAtomic(file: string, state: WarmupFile): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(state), "utf8")
  renameSync(tmp, file)
}

function lockKey(file: string | null): string {
  return `claude-warmup:${file ?? "memory"}`
}

async function withStoreLock<T>(
  file: string | null,
  lockDir: string | undefined,
  fn: () => Promise<T> | T,
): Promise<T> {
  return Flock.withLock(lockKey(file), async () => fn(), {
    ...(lockDir ? { dir: lockDir } : {}),
    timeoutMs: STORE_LOCK_TIMEOUT_MS,
  })
}

export class ScheduleValidationError extends Error {
  override readonly name = "ScheduleValidationError"
}

export class WarmupStoreError extends Error {
  override readonly name = "WarmupStoreError"
}

export function materializeDefaultDir(): string {
  if (process.env.CLAUDE_CONFIG_DIR) return path.resolve(process.env.CLAUDE_CONFIG_DIR)
  return path.resolve(expandHome("~/.claude"))
}

// Stable account identity: every candidate, including `default`, is
// materialized to its actual resolved config directory BEFORE any API,
// store, or claim use. A schedule saved today never retargets when a later
// shell change moves the inherited config dir. Windows compares
// case-insensitively; duplicate basenames keep distinct identities here and
// are disambiguated in labels.
export function materializeAccountId(poolId: string): string {
  if (poolId === DEFAULT_ACCOUNT) return materializeDefaultDir()
  return path.resolve(poolId)
}

export function materializePoolIds(accounts: unknown): string[] {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of poolAccountIds(
    Array.isArray(accounts) ? accounts.filter((dir) => typeof dir === "string") : undefined,
  )) {
    const materialized = materializeAccountId(id)
    const key = process.platform === "win32" ? materialized.toLowerCase() : materialized
    if (seen.has(key)) continue
    seen.add(key)
    ids.push(materialized)
  }
  return ids
}

export function poolIdsForConfig(accounts: unknown): string[] {
  return materializePoolIds(accounts)
}

// Pool ids are already materialized resolved dirs by the time they reach the
// store, so keys only normalize Windows casing. Labels disambiguate
// identical folder basenames with their parent path.
export function storeKeyForAccount(accountID: string): string {
  return process.platform === "win32" ? accountID.toLowerCase() : accountID
}

export function accountLabel(accountID: string, clashes: boolean): string {
  const base = poolAccountLabel(accountID)
  if (!clashes) return base
  return `${base} (${path.dirname(accountID)})`
}

export async function setAccountSchedule(input: {
  file: string | null
  lockDir?: string
  accountID: string
  enabled: boolean
  schedule: unknown
  now?: number
}): Promise<AccountRecord> {
  const normalized = normalizeSchedule(input.schedule)
  if ("error" in normalized) throw new ScheduleValidationError(normalized.error)
  if (!input.file) throw new WarmupStoreError("warm-up store is unavailable")
  const now = input.now ?? Date.now()
  return withStoreLock(input.file, input.lockDir, () => {
    const read = readStore(input.file)
    if (read.status === "malformed") throw new WarmupStoreError(read.error)
    const state: WarmupFile = read.status === "ok" ? read.state : { accounts: {} }
    const previous = state.accounts[storeKeyForAccount(input.accountID)]
    const empty = isScheduleEmpty(normalized.schedule)
    state.accounts[storeKeyForAccount(input.accountID)] = {
      enabled: empty ? false : input.enabled,
      schedule: normalized.schedule,
      claims: pruneClaims(previous?.claims ?? {}, now),
      ...(previous?.lastAttempt ? { lastAttempt: previous.lastAttempt } : {}),
    }
    writeStoreAtomic(input.file!, state)
    return state.accounts[storeKeyForAccount(input.accountID)]!
  }).catch((error) => {
    if (error instanceof ScheduleValidationError || error instanceof WarmupStoreError) throw error
    throw new WarmupStoreError(`cannot save warm-up schedule: ${String(error)}`)
  })
}

// Claim-before-send gives at-most-once attempts across resident/native
// servers sharing the data directory. The lock is released before any CLI
// work; a crash after claiming loses that occurrence, which matches the
// skip-missed-times policy.
export async function claimDueOccurrences(input: {
  file: string | null
  lockDir?: string
  accountID: string
  occurrences: DueOccurrence[]
  now?: number
}): Promise<DueOccurrence[]> {
  if (!input.file || !input.occurrences.length) return []
  const now = input.now ?? Date.now()
  return withStoreLock(input.file, input.lockDir, () => {
    const read = readStore(input.file)
    if (read.status !== "ok")
      throw new WarmupStoreError(read.status === "malformed" ? read.error : "warm-up store is missing")
    const record = read.state.accounts[storeKeyForAccount(input.accountID)]
    if (!record || !record.enabled || isScheduleEmpty(record.schedule)) return []
    const claimed: DueOccurrence[] = []
    for (const occurrence of input.occurrences) {
      if (record.claims[occurrence.key] === undefined) {
        record.claims[occurrence.key] = now
        claimed.push(occurrence)
      }
    }
    if (!claimed.length) return []
    record.claims = pruneClaims(record.claims, now)
    writeStoreAtomic(input.file!, read.state)
    return claimed
  }).catch((error) => {
    if (error instanceof WarmupStoreError) throw error
    throw new WarmupStoreError(`cannot claim warm-up occurrence: ${String(error)}`)
  })
}

// Latest-outcome updates merge into the current record without resurrecting
// removed schedules or overwriting a newer attempt. Concurrent sends can
// complete out of order, so a completion for an older scheduled occurrence
// never overwrites the outcome of a newer one; only the enabled flag and
// schedule from saves change state, never an outcome write.
export async function recordAttempt(input: {
  file: string | null
  lockDir?: string
  accountID: string
  attempt: LastAttempt
}): Promise<boolean> {
  if (!input.file) return false
  return withStoreLock(input.file, input.lockDir, () => {
    const read = readStore(input.file)
    if (read.status !== "ok")
      throw new WarmupStoreError(read.status === "malformed" ? read.error : "warm-up store is missing")
    const record = read.state.accounts[storeKeyForAccount(input.accountID)]
    if (!record) return false
    const previous = record.lastAttempt
    if (
      previous &&
      (previous.scheduledAt > input.attempt.scheduledAt ||
        (previous.scheduledAt === input.attempt.scheduledAt && previous.attemptedAt >= input.attempt.attemptedAt))
    )
      return true
    record.lastAttempt = { ...input.attempt }
    writeStoreAtomic(input.file!, read.state)
    return true
  }).catch((error) => {
    if (error instanceof WarmupStoreError) throw error
    throw new WarmupStoreError(`cannot record warm-up attempt: ${String(error)}`)
  })
}

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

export function buildWarmupArgs(): string[] {
  // One-shot greeting with no tools. --max-turns 1 bounds the CLI's own
  // agent turn machinery to a single turn; --safe-mode keeps authentication
  // working while disabling customizations. Admin-managed policy settings
  // still apply and are respected, never bypassed.
  return [
    "-p",
    WARMUP_PROMPT,
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
    WARMUP_SYSTEM_PROMPT,
    "--no-session-persistence",
    "--output-format",
    "json",
  ]
}

// Stored subscription auth for every account, including the default: shell
// API keys, token overrides, third-party base URLs, Haiku remapping, and a
// bare-mode switch would all redirect or reshape the greeting.
export function buildWarmupEnv(configDir: string | undefined): Record<string, string | undefined> {
  const env = claudeSpawnEnv({ effort: "low", configDir })
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  delete env.CLAUDE_CODE_SIMPLE
  return env
}

export function warmupConfigDir(accountID: string): string {
  if (accountID === DEFAULT_ACCOUNT) return materializeDefaultDir()
  return accountID
}

export interface CliRunOpts {
  cliPath: string
  args: string[]
  env: Record<string, string | undefined>
  cwd: string
  timeoutMs: number
  signal?: AbortSignal
  /** Child set the spawned process is tracked in; defaults to the shared one. Loops pass their own. */
  tracker?: ChildTracker
}

export interface CliRunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export type CliRunner = (opts: CliRunOpts) => Promise<CliRunResult>

/** Structural child handle; cross-spawn's ChildProcess satisfies it. */
export type ChildTracker = Set<{ kill(signal?: NodeJS.Signals): unknown }>

const sharedChildren: ChildTracker = new Set()

export function killTracker(tracker: ChildTracker): void {
  for (const child of tracker) {
    try {
      child.kill("SIGKILL")
    } catch {
      // Already exited; nothing to stop.
    }
  }
  tracker.clear()
}

export function killOwnedChildren(): void {
  killTracker(sharedChildren)
}

function redact(text: string, limit = 200): string {
  const single = text.replace(/\s+/g, " ").trim()
  return single.length > limit ? `${single.slice(0, limit)}...` : single
}

export function defaultCliRunner(opts: CliRunOpts): Promise<CliRunResult> {
  return new Promise((resolve) => {
    const tracker = opts.tracker ?? sharedChildren
    const command = cliCommand(opts.cliPath, opts.args)
    let child: ReturnType<typeof launch>
    try {
      child = launch(command.command, command.args, {
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: opts.env as Record<string, string>,
        windowsHide: true,
        signal: opts.signal,
      })
    } catch (error) {
      resolve({ code: null, stdout: "", stderr: `spawn failed: ${redact(String(error))}`, timedOut: false })
      return
    }
    tracker.add(child)
    let stdout = ""
    let stderr = ""
    let done = false
    const finish = (result: CliRunResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      tracker.delete(child)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {
        // Already exited.
      }
      finish({ code: null, stdout, stderr, timedOut: true })
    }, opts.timeoutMs)
    timer.unref?.()
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < 64 * 1024) stdout += String(chunk).slice(0, 64 * 1024 - stdout.length)
    })
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 64 * 1024) stderr += String(chunk).slice(0, 64 * 1024 - stderr.length)
    })
    child.on("error", (error) => {
      finish({ code: null, stdout, stderr: `spawn failed: ${redact(String(error))}`, timedOut: false })
    })
    child.on("close", (code) => {
      finish({ code: code ?? null, stdout, stderr, timedOut: false })
    })
    opts.signal?.addEventListener(
      "abort",
      () => {
        try {
          child.kill("SIGKILL")
        } catch {
          // Already exited.
        }
      },
      { once: true },
    )
  })
}

let cliRunnerOverride: CliRunner | null = null

export function _setCliRunner(runner: CliRunner | null): void {
  cliRunnerOverride = runner
}

function cliRunner(): CliRunner {
  return cliRunnerOverride ?? defaultCliRunner
}

export interface InventoryProbe {
  id: string
  status: "connected" | "signed-out" | "unknown"
}

function parseAuthStatus(stdout: string): InventoryProbe["status"] {
  let body: unknown
  try {
    body = JSON.parse(stdout)
  } catch {
    return "unknown"
  }
  if (!isRecord(body)) return "unknown"
  if (body.loggedIn !== true) return "signed-out"
  // Accept authenticated claude.ai subscription accounts, not API-key or
  // third-party-provider authentication.
  if (body.authMethod === "claude.ai" && (body.apiProvider === "firstParty" || body.apiProvider === undefined))
    return "connected"
  return "unknown"
}

async function probeAccount(
  cliPath: string,
  accountID: string,
  timeoutMs = AUTH_PROBE_TIMEOUT_MS,
  signal?: AbortSignal,
  tracker?: ChildTracker,
): Promise<InventoryProbe> {
  const configDir = warmupConfigDir(accountID)
  const env = buildWarmupEnv(accountID === DEFAULT_ACCOUNT ? undefined : accountID)
  env.CLAUDE_CONFIG_DIR = configDir
  let result: CliRunResult
  try {
    // Raw argv: the runner alone resolves the launcher via cliCommand, so a
    // configured bun/node launcher is never wrapped twice.
    // --json is explicit though default: the installed `auth status --help`
    // lists it, and explicit output selection survives default changes.
    result = await cliRunner()({
      cliPath,
      args: ["auth", "status", "--json"],
      env,
      cwd: warmupCwd(),
      timeoutMs,
      signal,
      tracker,
    })
  } catch {
    return { id: accountID, status: "unknown" }
  }
  // Never log full auth-status output; it can carry account email addresses.
  if (result.timedOut || result.code === null) return { id: accountID, status: "unknown" }
  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.toLowerCase()
    if (/not logged in|login|unauthenticated|no auth/.test(output)) return { id: accountID, status: "signed-out" }
    if (result.stdout.trim()) return { id: accountID, status: parseAuthStatus(result.stdout) }
    return { id: accountID, status: "unknown" }
  }
  return { id: accountID, status: parseAuthStatus(result.stdout) }
}

let inventoryProbeOverride:
  | ((cliPath: string, accountID: string, signal?: AbortSignal) => Promise<InventoryProbe>)
  | null = null

export function _setInventoryProbe(
  probe: ((cliPath: string, accountID: string, signal?: AbortSignal) => Promise<InventoryProbe>) | null,
): void {
  inventoryProbeOverride = probe
  inventoryCache.clear()
  inflightInventory.clear()
}

interface InventorySnapshot {
  at: number
  connectedIds: string[]
  error?: string
}

const inventoryCache = new Map<string, InventorySnapshot>()
const inflightInventory = new Map<string, Promise<InventorySnapshot>>()
// Per-account last-known presence: connected logins stay until a probe
// conclusively signs them out; unknown never flips another account.
const lastKnownPresence = new Map<string, boolean>()

export function _resetInventoryForTests(): void {
  inventoryCache.clear()
  inflightInventory.clear()
  lastKnownPresence.clear()
  inventoryProbeOverride = null
}

function inventoryKey(cliPath: string, candidates: string[]): string {
  return `${cliPath}\n${[...candidates].sort().join("\n")}`
}

async function probeAll(
  cliPath: string,
  candidates: string[],
  signal?: AbortSignal,
  tracker?: ChildTracker,
): Promise<InventorySnapshot> {
  const probe =
    inventoryProbeOverride ??
    ((path: string, id: string, probeSignal?: AbortSignal, probeTracker?: ChildTracker) =>
      probeAccount(path, id, AUTH_PROBE_TIMEOUT_MS, probeSignal, probeTracker))
  const now = Date.now()
  const results = await Promise.all(candidates.map((id) => probe(cliPath, id, signal, tracker)))
  // Per-account merge: connected logins retain/add, conclusively signed-out
  // logins are removed, and an unknown probe keeps only that account's own
  // prior status. A stale whole-list fallback would both hide newly
  // connected accounts and resurrect signed-out ones.
  let unknown = 0
  for (const result of results) {
    if (result.status === "connected") lastKnownPresence.set(result.id, true)
    else if (result.status === "signed-out") lastKnownPresence.delete(result.id)
    else unknown += 1
  }
  for (const [id] of lastKnownPresence) {
    if (!candidates.includes(id)) lastKnownPresence.delete(id)
  }
  const connectedIds = candidates.filter((id) => lastKnownPresence.get(id) === true)
  if (!unknown) return { at: now, connectedIds }
  // Preserve last-known presence during a transient probe error and surface
  // the error; unknown is not signed out.
  return {
    at: now,
    connectedIds,
    error: `could not verify ${unknown} account${unknown === 1 ? "" : "s"}; showing last known accounts`,
  }
}

// Candidate directories come from the existing account-pool normalization,
// which always supplies a materialized default when nothing is configured,
// so candidate count is not connected-account count. Results are cached
// briefly per cliPath + candidate set and in-flight probes are shared per
// key: a changed config starts fresh instead of reusing a stale inventory.
// The palette never blocks on a fresh probe.
export function listConnected(input: {
  cliPath: string
  candidates: string[]
  now?: number
  signal?: AbortSignal
  tracker?: ChildTracker
}): Promise<InventorySnapshot> {
  if (input.signal?.aborted) return Promise.reject(input.signal.reason ?? new Error("Aborted"))
  const key = inventoryKey(input.cliPath, input.candidates)
  const now = input.now ?? Date.now()
  const cached = inventoryCache.get(key)
  if (cached && now - cached.at < INVENTORY_TTL_MS) return Promise.resolve(cached)
  const inflight = inflightInventory.get(key)
  if (inflight) return inflight
  const pending = probeAll(input.cliPath, input.candidates, input.signal, input.tracker).then((snapshot) => {
    inventoryCache.set(key, snapshot)
    if (inflightInventory.get(key) === pending) inflightInventory.delete(key)
    return snapshot
  })
  inflightInventory.set(key, pending)
  return pending
}

// Neutral owned working directory for auth probes and greetings: a data-dir
// folder oc owns, never a user repository. No repo config, agent prompts,
// skills, memory, or hooks can leak into the request; --safe-mode already
// disables instruction discovery, and the owned dir adds isolation. Auth and
// send share it and the same pinned environment.
export function warmupCwd(): string {
  const dir = path.join(Global.Path.data, "claude-code", "warmup-cwd")
  mkdirSync(dir, { recursive: true })
  return dir
}

// Fresh per-account recheck immediately before sending: true only for a
// currently connected subscription login. Unknown (timeout, unparseable,
// unexpected method) is not signed out, but it is not sendable either.
export async function verifyAccountConnected(
  cliPath: string,
  accountID: string,
  signal?: AbortSignal,
  tracker?: ChildTracker,
): Promise<boolean> {
  return (await probeAccount(cliPath, accountID, AUTH_PROBE_TIMEOUT_MS, signal, tracker)).status === "connected"
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

let storeFileOverride: string | null | undefined

export function storeFile(): string | null {
  if (storeFileOverride !== undefined) return storeFileOverride
  return defaultStoreFile()
}

export function _setStoreFile(file: string | null | undefined): void {
  storeFileOverride = file
}

export * as ClaudeWarmup from "./warmup"
