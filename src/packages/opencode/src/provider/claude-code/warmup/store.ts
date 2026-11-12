import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { isRecord } from "@/util/record"
import {
  CLAIM_RETENTION_DAYS,
  isScheduleEmpty,
  localDateStr,
  normalizeSchedule,
  type DueOccurrence,
  type WarmupSchedule,
} from "./schedule"

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
  /** Raw entries this build cannot read. Ignored by the scheduler, written back unchanged. */
  invalid?: Record<string, unknown>
}

export const STORE_LOCK_TIMEOUT_MS = 5_000

export function defaultStoreFile(): string | null {
  if (process.env.BUN_TEST != null) return null
  return path.join(Global.Path.data, "claude-code", "warmup.json")
}

let storeFileOverride: string | null | undefined

export function storeFile(): string | null {
  if (storeFileOverride !== undefined) return storeFileOverride
  return defaultStoreFile()
}

export function _setStoreFile(file: string | null | undefined): void {
  storeFileOverride = file
}

// `unreadable` is an I/O failure (lock, permission): the file is left alone.
// `malformed` is content no build can read: an explicit save replaces it and keeps a `.bad` copy.
export type StoreRead =
  | { status: "ok"; state: WarmupFile }
  | { status: "missing" }
  | { status: "unreadable"; error: string }
  | { status: "malformed"; error: string }

function storeReadError(read: Exclude<StoreRead, { status: "ok" }>): string {
  return read.status === "missing" ? "warm-up store is missing" : read.error
}

export function badStoreFile(file: string): string {
  return `${file}.bad`
}

// User-facing problem with the store, or undefined when every entry is readable.
export function storeProblem(read: StoreRead, file: string | null): string | undefined {
  if (read.status === "unreadable") return read.error
  if (read.status === "malformed") {
    if (!file) return read.error
    return `${read.error}. Saving a schedule starts a new file and keeps the old one as ${badStoreFile(file)}`
  }
  if (read.status !== "ok" || !read.state.invalid) return undefined
  const names = Object.keys(read.state.invalid).map((key) => path.basename(key))
  return `Ignored unreadable warm-up schedule for ${names.join(", ")}; save it again to replace it`
}

// Shape check only; readStore normalizes and validates the schedule itself.
function isRecordValue(value: unknown): value is AccountRecord {
  if (!isRecord(value)) return false
  if (typeof value.enabled !== "boolean") return false
  if (!isRecord(value.schedule)) return false
  if (!isRecord(value.claims)) return false
  for (const stamp of Object.values(value.claims)) {
    if (typeof stamp !== "number" || !Number.isFinite(stamp)) return false
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
  let text: string
  try {
    text = readFileSync(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "missing" }
    return { status: "unreadable", error: `cannot read warm-up store: ${String(error)}` }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { status: "malformed", error: "warm-up store is not valid JSON" }
  }
  if (!isRecord(raw) || !isRecord(raw.accounts)) return { status: "malformed", error: "warm-up store has no accounts" }
  // One bad entry must not stop every account: skip it and keep its raw value.
  const accounts: Record<string, AccountRecord> = {}
  const invalid: Record<string, unknown> = {}
  for (const [id, record] of Object.entries(raw.accounts)) {
    if (!isRecordValue(record)) {
      invalid[id] = record
      continue
    }
    const normalized = normalizeSchedule(record.schedule)
    if ("error" in normalized) {
      invalid[id] = record
      continue
    }
    accounts[id] = {
      enabled: record.enabled,
      schedule: normalized.schedule,
      claims: { ...record.claims },
      ...(record.lastAttempt ? { lastAttempt: { ...record.lastAttempt } } : {}),
    }
  }
  return { status: "ok", state: { accounts, ...(Object.keys(invalid).length ? { invalid } : {}) } }
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
  try {
    writeFileSync(tmp, JSON.stringify({ accounts: { ...state.invalid, ...state.accounts } }), "utf8")
    renameSync(tmp, file)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
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

// Pool ids are already materialized resolved dirs by the time they reach the
// store, so keys only normalize Windows casing. Labels disambiguate
// identical folder basenames with their parent path.
export function storeKeyForAccount(accountID: string): string {
  return process.platform === "win32" ? accountID.toLowerCase() : accountID
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
  const file = input.file
  if (!file) throw new WarmupStoreError("warm-up store is unavailable")
  const now = input.now ?? Date.now()
  return withStoreLock(file, input.lockDir, () => {
    const read = readStore(file)
    if (read.status === "unreadable") throw new WarmupStoreError(read.error)
    // A save is the recovery path for a corrupt store: keep the old file beside it and start fresh.
    if (read.status === "malformed") renameSync(file, badStoreFile(file))
    const state: WarmupFile = read.status === "ok" ? read.state : { accounts: {} }
    const key = storeKeyForAccount(input.accountID)
    const previous = state.accounts[key]
    const empty = isScheduleEmpty(normalized.schedule)
    state.accounts[key] = {
      enabled: empty ? false : input.enabled,
      schedule: normalized.schedule,
      claims: pruneClaims(previous?.claims ?? {}, now),
      ...(previous?.lastAttempt ? { lastAttempt: previous.lastAttempt } : {}),
    }
    delete state.invalid?.[key]
    writeStoreAtomic(file, state)
    return state.accounts[key]!
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
    if (read.status !== "ok") throw new WarmupStoreError(storeReadError(read))
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
    if (read.status !== "ok") throw new WarmupStoreError(storeReadError(read))
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
