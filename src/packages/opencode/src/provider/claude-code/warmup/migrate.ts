import { isScheduleEmpty } from "./schedule"
import { emailOf } from "./identities"
import { readLegacyStore, recordAttempt } from "./store"
import { editClaudeAccounts, type SyncedAccounts } from "./synced"

// One-time move of folder-keyed names (oc.json `claudeAccountNames`) and schedules (the old
// `warmup.json`) into the synced, email-keyed `claudeAccounts`. Only accounts with no entry yet:
// an existing entry (saved here or synced from a peer) is the account's truth, so an upgraded
// machine never overwrites another machine's data and never brings back a name cleared since.
// The caller runs it only after this machine's first sync pull. Legacy sources stay untouched.
export async function migrateLegacy(input: {
  dirs: string[]
  legacyFile: string | null
  runtimeFile: string | null
  nameOf: (dir: string) => string | undefined
  now?: number
}): Promise<void> {
  const legacy = readLegacyStore(input.legacyFile)
  const legacyKey = (dir: string) => (process.platform === "win32" ? dir.toLowerCase() : dir)
  const known = input.dirs.flatMap((dir) => {
    const email = emailOf(dir)
    return email ? [{ dir, email, old: legacy[legacyKey(dir)] }] : []
  })
  if (!known.length) return
  const now = input.now ?? Date.now()
  await editClaudeAccounts((accounts) => {
    let changed = false
    for (const { dir, email, old } of known) {
      if (accounts[email] !== undefined) continue
      const entry: (typeof accounts)[string] = {}
      let touched = false
      const name = input.nameOf(dir)?.trim()
      if (name) {
        entry.name = name
        touched = true
      }
      if (old && !isScheduleEmpty(old.schedule)) {
        // `updatedAt` = now: catch-up never fires a slot from before the move.
        entry.warmup = { enabled: old.enabled, schedule: old.schedule, updatedAt: now }
        touched = true
      }
      if (!touched) continue
      accounts[email] = entry
      changed = true
    }
    return changed ? accounts : undefined
  })
  for (const { email, old } of known) {
    if (!old?.lastAttempt) continue
    await recordAttempt({ file: input.runtimeFile, email, attempt: old.lastAttempt }).catch(() => undefined)
  }
}

const PROBE_RETRY_MS = 5 * 60_000

// Per-tick upkeep in the warm-up loop: one identity probe at start (names and schedules resolve
// without waiting for a due slot), then, once `ready` (sync off, or this machine's first sync
// pull done), migrate newly identified folders and keep `claudeAccountNames` matching synced
// names. Cheap when nothing changed: a stat of oc.json and an in-memory compare.
export function createHousekeeping(deps: {
  ready: () => boolean
  legacyFile: string | null
  runtimeFile: string | null
  probe: (cliPath: string, poolIds: string[], signal?: AbortSignal) => Promise<unknown>
  nameOf: (dir: string) => string | undefined
  /** `syncedName`: the name, `null` when the account is synced without one, `undefined` when unknown. */
  project: (dirs: string[], syncedName: (dir: string) => string | null | undefined) => Promise<void>
  accounts: () => SyncedAccounts
}) {
  let probedAt: number | undefined
  const migrated = new Set<string>()
  return async (cliPath: string, poolIds: string[], signal?: AbortSignal) => {
    // Probe at start, then again every few minutes while no folder has a known account (CLI
    // missing or auth failing at boot), so migration and names never wait for a due slot.
    const now = Date.now()
    const identified = poolIds.some((dir) => emailOf(dir))
    if (probedAt === undefined || (!identified && now - probedAt > PROBE_RETRY_MS)) {
      probedAt = now
      await deps.probe(cliPath, poolIds, signal).catch(() => undefined)
    }
    if (!deps.ready()) return
    const fresh = poolIds.filter((dir) => !migrated.has(dir) && emailOf(dir))
    if (fresh.length) {
      await migrateLegacy({
        dirs: fresh,
        legacyFile: deps.legacyFile,
        runtimeFile: deps.runtimeFile,
        nameOf: deps.nameOf,
      })
      for (const dir of fresh) migrated.add(dir)
    }
    const accounts = deps.accounts()
    await deps.project(poolIds, (dir) => {
      const email = emailOf(dir)
      const entry = email ? accounts[email] : undefined
      return entry ? (entry.name ?? null) : undefined
    })
  }
}
