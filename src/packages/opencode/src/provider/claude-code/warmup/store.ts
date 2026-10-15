import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
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
