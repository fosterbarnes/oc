import { readFileSync, statSync } from "node:fs"
import { OcConfig } from "@/config/oc"
import { isRecord } from "@/util/record"
import { isScheduleEmpty, normalizeSchedule, type WarmupSchedule } from "./schedule"
import { ScheduleValidationError } from "./store"

// Synced Claude account info: oc.json `claudeAccounts`, keyed by lowercased email, carried to
// every machine by tailnet sync as the `oc:claudeAccounts` item. Basic info only (friendly name,
// warm-up schedule); never credentials or folder paths, since folders map to different accounts
// on each machine (identities.ts maps them locally).

export interface SyncedWarmup {
  enabled: boolean
  schedule: WarmupSchedule
  /** When the schedule was last saved; catch-up never fires a slot from before it. */
  updatedAt: number
}
export interface SyncedAccount {
  name?: string
  warmup?: SyncedWarmup
}
export type SyncedAccounts = Record<string, SyncedAccount>

export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

export function parseClaudeAccounts(raw: unknown): SyncedAccounts {
  if (!isRecord(raw)) return {}
  const out: SyncedAccounts = {}
  for (const [email, value] of Object.entries(raw)) {
    if (!email.includes("@") || !isRecord(value)) continue
    const entry: SyncedAccount = {}
    if (typeof value.name === "string" && value.name.trim()) entry.name = value.name.trim()
    if (isRecord(value.warmup) && typeof value.warmup.enabled === "boolean") {
      const normalized = normalizeSchedule(value.warmup.schedule)
      if (!("error" in normalized)) {
        entry.warmup = {
          enabled: value.warmup.enabled && !isScheduleEmpty(normalized.schedule),
          schedule: normalized.schedule,
          updatedAt: typeof value.warmup.updatedAt === "number" ? value.warmup.updatedAt : 0,
        }
      }
    }
    out[emailKey(email)] = entry
  }
  return out
}

let override: SyncedAccounts | undefined
let cached: { mtimeMs: number; size: number; value: SyncedAccounts } | undefined

/** Test seam: a fixed account map instead of oc.json (`undefined` restores the file). */
export function _setClaudeAccounts(value: SyncedAccounts | undefined): void {
  override = value
  cached = undefined
}

// Read every scheduler tick: a stat, and a parse only when oc.json changed.
export function readClaudeAccounts(): SyncedAccounts {
  if (override) return override
  const file = OcConfig.filePath()
  try {
    const stat = statSync(file)
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.value
    const raw = JSON.parse(readFileSync(file, "utf8").replace(/^\s*\/\/.*$/gm, "")) as { claudeAccounts?: unknown }
    const value = parseClaudeAccounts(raw.claudeAccounts)
    cached = { mtimeMs: stat.mtimeMs, size: stat.size, value }
    return value
  } catch {
    return {}
  }
}

/** Applies `change` to the account map under the oc.json lock; returns the new map. */
export async function editClaudeAccounts(
  change: (accounts: SyncedAccounts) => SyncedAccounts | undefined,
): Promise<SyncedAccounts> {
  if (override) {
    const next = change(structuredClone(override))
    if (next) override = next
    return override
  }
  let result: SyncedAccounts = {}
  await OcConfig.edit((settings) => {
    const current = parseClaudeAccounts(settings.claudeAccounts)
    result = current
    const next = change(structuredClone(current))
    if (!next || JSON.stringify(next) === JSON.stringify(current)) return undefined
    result = next
    return { claudeAccounts: Object.keys(next).length ? next : undefined }
  })
  cached = undefined
  return result
}

export async function saveWarmup(input: {
  email: string
  enabled: boolean
  schedule: unknown
  now?: number
}): Promise<SyncedAccount> {
  const normalized = normalizeSchedule(input.schedule)
  if ("error" in normalized) throw new ScheduleValidationError(normalized.error)
  const email = emailKey(input.email)
  const accounts = await editClaudeAccounts((accounts) => {
    const previous = accounts[email]?.warmup
    const enabled = input.enabled && !isScheduleEmpty(normalized.schedule)
    // A pause or resume with the same times keeps `updatedAt`, so catch-up still covers it.
    const sameTimes = previous && JSON.stringify(previous.schedule) === JSON.stringify(normalized.schedule)
    accounts[email] = {
      ...accounts[email],
      warmup: {
        enabled,
        schedule: normalized.schedule,
        updatedAt: sameTimes && previous ? previous.updatedAt : (input.now ?? Date.now()),
      },
    }
    return accounts
  })
  return accounts[email] ?? {}
}

/**
 * Sets or clears (blank) the shared friendly name of an account. A cleared account keeps its
 * entry: an entry without a name tells every machine to drop its local copy of the old name.
 */
export async function saveName(email: string, name: string | undefined): Promise<void> {
  const key = emailKey(email)
  await editClaudeAccounts((accounts) => {
    const trimmed = name?.trim()
    const entry = { ...accounts[key] }
    if (trimmed) entry.name = trimmed
    else delete entry.name
    accounts[key] = entry
    return accounts
  })
}
