import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { isRecord } from "@/util/record"
import { CLAIM_RETENTION_DAYS, normalizeSchedule, type WarmupSchedule } from "./schedule"

// Machine-local warm-up runtime state, keyed by lowercased account email: claims (occurrence
// instant -> claim time) and the latest outcome. Schedules live in synced oc.json
// `claudeAccounts` (synced.ts). Runtime state never syncs as a config item: peers read it through
// the sync listener's warm-up route only when a slot is due.

export type AttemptOutcome = "sent" | "rejected" | "failed" | "timeout" | "missed"
const OUTCOMES: readonly AttemptOutcome[] = ["sent", "rejected", "failed", "timeout", "missed"]
export interface LastAttempt {
  scheduledAt: number
  attemptedAt: number
  outcome: AttemptOutcome
  /** Tailnet host that made the attempt; absent for attempts from before cross-machine runs. */
  host?: string
}
export interface RuntimeRecord {
  claims: Record<string, number>
  lastAttempt?: LastAttempt
}
export interface RuntimeFile {
  accounts: Record<string, RuntimeRecord>
}

export const STORE_LOCK_TIMEOUT_MS = 5_000

export function defaultStoreFile(): string | null {
  if (process.env.BUN_TEST != null) return null
  return path.join(Global.Path.data, "claude-code", "warmup-state.json")
}

/** The pre-sync store (folder-keyed schedules); read once by the migration, never written. */
export function legacyStoreFile(): string | null {
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

export class ScheduleValidationError extends Error {
  override readonly name = "ScheduleValidationError"
}

export class WarmupStoreError extends Error {
  override readonly name = "WarmupStoreError"
}

function parseAttempt(value: unknown): LastAttempt | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.scheduledAt !== "number" || typeof value.attemptedAt !== "number") return undefined
  if (!OUTCOMES.includes(value.outcome as AttemptOutcome)) return undefined
  return {
    scheduledAt: value.scheduledAt,
    attemptedAt: value.attemptedAt,
    outcome: value.outcome as AttemptOutcome,
    ...(typeof value.host === "string" && value.host ? { host: value.host } : {}),
  }
}

function parseClaims(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
  )
}

// Runtime state is disposable: a missing, unreadable, or corrupt file reads as empty, and bad
// entries are dropped. The worst case is one repeated greeting.
export function readStore(file: string | null): RuntimeFile {
  if (!file) return { accounts: {} }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return { accounts: {} }
  }
  if (!isRecord(raw) || !isRecord(raw.accounts)) return { accounts: {} }
  const accounts: Record<string, RuntimeRecord> = {}
  for (const [email, value] of Object.entries(raw.accounts)) {
    if (!isRecord(value)) continue
    const lastAttempt = parseAttempt(value.lastAttempt)
    accounts[email] = { claims: parseClaims(value.claims), ...(lastAttempt ? { lastAttempt } : {}) }
  }
  return { accounts }
}

export function writeStoreAtomic(file: string, state: RuntimeFile): void {
  mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, JSON.stringify(state), "utf8")
    renameSync(tmp, file)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

function pruneClaims(claims: Record<string, number>, nowMs: number): Record<string, number> {
  const cutoff = nowMs - CLAIM_RETENTION_DAYS * 24 * 60 * 60 * 1000
  return Object.fromEntries(Object.entries(claims).filter(([key]) => Number(key) >= cutoff))
}

async function update<T>(
  file: string,
  lockDir: string | undefined,
  what: string,
  fn: (state: RuntimeFile) => { result: T; changed: boolean },
): Promise<T> {
  return Flock.withLock(
    `claude-warmup:${file}`,
    async () => {
      const state = readStore(file)
      const { result, changed } = fn(state)
      if (changed) writeStoreAtomic(file, state)
      return result
    },
    { ...(lockDir ? { dir: lockDir } : {}), timeoutMs: STORE_LOCK_TIMEOUT_MS },
  ).catch((error) => {
    throw new WarmupStoreError(`cannot ${what}: ${String(error)}`)
  })
}

function recordFor(state: RuntimeFile, email: string): RuntimeRecord {
  return (state.accounts[email] ??= { claims: {} })
}

// Claim-before-send: at most one attempt per occurrence on this machine (resident and native
// servers share the data dir). Taken only by the machine about to send; the lock is released
// before any CLI work, so a crash after claiming loses that occurrence.
export async function claimOccurrence(input: {
  file: string | null
  lockDir?: string
  email: string
  at: number
  now?: number
}): Promise<boolean> {
  if (!input.file) return false
  const now = input.now ?? Date.now()
  return update(input.file, input.lockDir, "claim warm-up occurrence", (state) => {
    const record = recordFor(state, input.email)
    if (record.claims[String(input.at)] !== undefined) return { result: false, changed: false }
    record.claims = pruneClaims({ ...record.claims, [String(input.at)]: now }, now)
    return { result: true, changed: true }
  })
}

// A peer's claims and newer outcome, copied so this machine stops considering the slot and
// shows where it ran.
export async function adoptPeer(input: {
  file: string | null
  lockDir?: string
  email: string
  claims: Record<string, number>
  lastAttempt?: LastAttempt
  now?: number
}): Promise<void> {
  if (!input.file) return
  const now = input.now ?? Date.now()
  await update(input.file, input.lockDir, "record peer warm-up", (state) => {
    const record = recordFor(state, input.email)
    let changed = false
    for (const [key, stamp] of Object.entries(input.claims)) {
      if (record.claims[key] !== undefined) continue
      record.claims[key] = stamp
      changed = true
    }
    if (input.lastAttempt && newer(input.lastAttempt, record.lastAttempt)) {
      record.lastAttempt = { ...input.lastAttempt }
      changed = true
    }
    if (changed) record.claims = pruneClaims(record.claims, now)
    return { result: undefined, changed }
  })
}

function newer(next: LastAttempt, previous: LastAttempt | undefined) {
  if (!previous) return true
  if (next.scheduledAt !== previous.scheduledAt) return next.scheduledAt > previous.scheduledAt
  return next.attemptedAt > previous.attemptedAt
}

// Concurrent sends can finish out of order: an older occurrence never overwrites a newer outcome.
export async function recordAttempt(input: {
  file: string | null
  lockDir?: string
  email: string
  attempt: LastAttempt
}): Promise<void> {
  if (!input.file) return
  await update(input.file, input.lockDir, "record warm-up attempt", (state) => {
    const record = recordFor(state, input.email)
    if (!newer(input.attempt, record.lastAttempt)) return { result: undefined, changed: false }
    record.lastAttempt = { ...input.attempt }
    return { result: undefined, changed: true }
  })
}

export interface LegacyRecord {
  enabled: boolean
  schedule: WarmupSchedule
  lastAttempt?: LastAttempt
}

/** Folder-keyed records from the pre-sync `warmup.json`; unreadable entries are skipped. */
export function readLegacyStore(file: string | null): Record<string, LegacyRecord> {
  if (!file) return {}
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return {}
  }
  if (!isRecord(raw) || !isRecord(raw.accounts)) return {}
  const out: Record<string, LegacyRecord> = {}
  for (const [dir, value] of Object.entries(raw.accounts)) {
    if (!isRecord(value) || typeof value.enabled !== "boolean") continue
    const normalized = normalizeSchedule(value.schedule)
    if ("error" in normalized) continue
    const lastAttempt = parseAttempt(value.lastAttempt)
    out[dir] = { enabled: value.enabled, schedule: normalized.schedule, ...(lastAttempt ? { lastAttempt } : {}) }
  }
  return out
}
