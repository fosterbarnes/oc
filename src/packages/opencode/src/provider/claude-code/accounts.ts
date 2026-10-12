import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { log } from "./logger.js"

export const BASE_PROVIDER_ID = "claude-code"
export const DEFAULT_ACCOUNT = "default"

export function expandHome(value: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE

  if (value === "~") return home ?? value

  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return home ? path.join(home, value.slice(2)) : value
  }

  return value
}

// ---------------------------------------------------------------------------
// Account pool
//
// The `accounts` provider option lists Claude config dirs in order, e.g.
// `["~/.claude", "~/.claudeSecond"]`. Every chat uses the current account
// until the CLI rejects a request for usage, then moves to the next account
// whose limit has not been hit (turnStream.ts). An account's id is its
// resolved config dir, or `default` for the CLI's own `~/.claude`, which
// spawns with the inherited environment.
// ---------------------------------------------------------------------------

/** How long an account sits out when its rejection carried no reset time. */
const UNKNOWN_RESET_MS = 60 * 60 * 1000

const DEFAULT_POOL_FILE = path.join(Global.Path.data, "claude-code", "account-pool.json")
const DEFAULT_USAGE_CACHE_DIR = path.join(expandHome("~/.cache"), "opencode")
const IN_TEST = process.env.BUN_TEST != null

const limitedUntil = new Map<string, number>()
/** opencode session id -> pool account id. A pinned chat ignores the global current account. */
const sessionAccounts = new Map<string, string>()
let currentAccount: string | undefined
let poolFile: string | null = IN_TEST ? null : DEFAULT_POOL_FILE
let cacheDir: string | null = IN_TEST ? null : DEFAULT_USAGE_CACHE_DIR
let loaded = false
let seeded = false

export function poolAccountIds(accounts: string[] | undefined): string[] {
  const defaultDir = path.resolve(expandHome("~/.claude"))
  const inherited = process.env.CLAUDE_CONFIG_DIR ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : undefined
  // Windows paths compare case-insensitively; elsewhere exactly.
  const sameDir = (a: string, b: string) =>
    process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b
  const ids = (accounts ?? []).map((dir) => {
    const resolved = path.resolve(expandHome(dir))
    // The default account spawns with the inherited environment, so an
    // explicit entry for the same dir (however cased, or via an inherited
    // CLAUDE_CONFIG_DIR) is that account, not a second pool entry whose
    // limit marks would never meet the default's.
    if (sameDir(resolved, defaultDir)) return DEFAULT_ACCOUNT
    if (inherited && sameDir(resolved, inherited)) return DEFAULT_ACCOUNT
    return resolved
  })
  return ids.length ? [...new Set(ids)] : [DEFAULT_ACCOUNT]
}

function ensureLoaded(ids?: string[], now = Date.now()): void {
  if (!loaded) {
    loaded = true
    readPersist(now)
  }
  if (ids && cacheDir && !seeded) {
    seeded = true
    seedFromCaches(ids, now)
  }
}

function readPersist(now: number): void {
  if (!poolFile) return
  try {
    const raw = JSON.parse(readFileSync(poolFile, "utf8")) as {
      currentAccount?: unknown
      limitedUntil?: unknown
      sessionAccounts?: unknown
    }
    if (typeof raw.currentAccount === "string" && raw.currentAccount) currentAccount = raw.currentAccount
    if (raw.sessionAccounts && typeof raw.sessionAccounts === "object") {
      for (const [session, id] of Object.entries(raw.sessionAccounts as Record<string, unknown>)) {
        if (typeof id === "string" && id) sessionAccounts.set(session, id)
      }
    }
    if (!raw.limitedUntil || typeof raw.limitedUntil !== "object") return
    for (const [id, until] of Object.entries(raw.limitedUntil as Record<string, unknown>)) {
      if (typeof until !== "number" || !Number.isFinite(until) || until <= now) continue
      limitedUntil.set(id, until)
    }
  } catch {
    // Missing or invalid file: start empty.
  }
}

function persistPool(now = Date.now()): void {
  if (!poolFile) return
  const limited: Record<string, number> = {}
  for (const [id, until] of limitedUntil) {
    if (until > now) limited[id] = until
  }
  try {
    mkdirSync(path.dirname(poolFile), { recursive: true })
    writeFileSync(
      poolFile,
      JSON.stringify({
        ...(currentAccount ? { currentAccount } : {}),
        limitedUntil: limited,
        ...(sessionAccounts.size ? { sessionAccounts: Object.fromEntries(sessionAccounts) } : {}),
      }),
      { encoding: "utf8", mode: 0o600 },
    )
  } catch (error) {
    log.warn("cannot write claude account pool file", { file: poolFile, error: String(error) })
  }
}

/** Cache paths match `tui/.../sidebar-tools/usage.ts` (`claude-usage.json` / `claude-usage-<name>.json`). */
function usageCachePath(id: string): string | undefined {
  if (!cacheDir) return undefined
  if (id === DEFAULT_ACCOUNT) return path.join(cacheDir, "claude-usage.json")
  return path.join(cacheDir, `claude-usage-${path.basename(id).replace(/^\./, "")}.json`)
}

function windowResetMs(value: unknown, now: number): number | undefined {
  const item = value as { utilization?: unknown; resets_at?: unknown } | null
  if (typeof item?.utilization !== "number" || !Number.isFinite(item.utilization)) return undefined
  const usedPercent = Math.round(Math.max(0, Math.min(100, item.utilization)))
  if (usedPercent < 100) return undefined
  const date = typeof item.resets_at === "string" ? new Date(item.resets_at) : undefined
  if (!date || Number.isNaN(date.valueOf()) || date.valueOf() <= now) return undefined
  return date.valueOf()
}

function seedFromCaches(ids: string[], now: number): void {
  for (const id of ids) {
    const file = usageCachePath(id)
    if (!file) continue
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, "utf8"))
    } catch {
      continue
    }
    const body = raw as { five_hour?: unknown; seven_day?: unknown }
    const resets = [windowResetMs(body.five_hour, now), windowResetMs(body.seven_day, now)].filter(
      (value): value is number => value !== undefined,
    )
    if (!resets.length) continue
    markAccountLimited(id, Math.max(...resets), now)
  }
}

/** The current account while usable, else the next usable one after it; undefined when all are limited. */
export function nextUsableAccount(ids: string[], now = Date.now()): string | undefined {
  ensureLoaded(ids, now)
  const usable = (id: string) => (limitedUntil.get(id) ?? 0) <= now
  if (currentAccount && ids.includes(currentAccount) && usable(currentAccount)) return currentAccount
  const start = currentAccount ? ids.indexOf(currentAccount) + 1 : 0
  const next = [...ids.slice(start), ...ids.slice(0, start)].find(usable)
  if (next && next !== currentAccount) {
    currentAccount = next
    persistPool(now)
  }
  return next
}

/** The account new work goes to. With every account limited it stays put, and the CLI reports the limit. */
export function poolAccount(ids: string[], now = Date.now()): string {
  return nextUsableAccount(ids, now) ?? (currentAccount && ids.includes(currentAccount) ? currentAccount : ids[0]!)
}

/** The account a session is pinned to, when it is still in the pool. Outside oc the session is "default": never pinned. */
export function sessionPin(sessionID: string | undefined, ids: string[], now = Date.now()): string | undefined {
  if (!sessionID || sessionID === "default") return undefined
  ensureLoaded(ids, now)
  const id = sessionAccounts.get(sessionID)
  return id && ids.includes(id) ? id : undefined
}

/** Pin a session to a pool account, or clear its pin with `undefined`. The global current account is untouched. */
export function pinSessionAccount(sessionID: string, id: string | undefined, ids: string[], now = Date.now()): boolean {
  if (id !== undefined && !ids.includes(id)) return false
  ensureLoaded(ids, now)
  if (id === undefined) sessionAccounts.delete(sessionID)
  else sessionAccounts.set(sessionID, id)
  persistPool(now)
  return true
}

/** Drop a deleted session's pin so `sessionAccounts` does not grow for the life of the pool file. */
export function forgetSessionPin(sessionID: string, now = Date.now()): void {
  ensureLoaded(undefined, now)
  if (sessionAccounts.delete(sessionID)) persistPool(now)
}

/**
 * Pool accounts with the active one flagged and any live limit. Selection mirrors `poolAccount`;
 * with a session it is that session's pin when set (`pinned`), else the global pick.
 */
export function poolState(ids: string[], now = Date.now(), sessionID?: string) {
  const pin = sessionPin(sessionID, ids, now)
  const active = pin ?? poolAccount(ids, now)
  return ids.map((id) => {
    const until = limitedUntil.get(id) ?? 0
    return {
      id,
      label: poolAccountLabel(id),
      current: id === active,
      ...(id === pin ? { pinned: true } : {}),
      ...(until > now ? { limitedUntil: until } : {}),
    }
  })
}

/**
 * Manual switch. A pick clears that account's limit mark, otherwise `nextUsableAccount` would move
 * straight back off it; a still-limited account fails over again when the CLI rejects the turn.
 */
export function setCurrentAccount(id: string, ids: string[], now = Date.now()): boolean {
  if (!ids.includes(id)) return false
  ensureLoaded(ids, now)
  limitedUntil.delete(id)
  currentAccount = id
  persistPool(now)
  return true
}

export function markAccountLimited(id: string, resetsAtMs: number | undefined, now = Date.now()): void {
  ensureLoaded(undefined, now)
  const until = resetsAtMs !== undefined && resetsAtMs > now ? resetsAtMs : now + UNKNOWN_RESET_MS
  if (until <= (limitedUntil.get(id) ?? 0)) return
  limitedUntil.set(id, until)
  persistPool(now)
}

/** `CLAUDE_CONFIG_DIR` for a pool account; undefined keeps the inherited environment. */
export function poolConfigDir(id: string): string | undefined {
  return id === DEFAULT_ACCOUNT ? undefined : id
}

/** Earliest future `limitedUntil` over the given pool ids (all known ids when omitted). */
export function earliestLimitedUntil(ids?: string[], now = Date.now()): number | undefined {
  ensureLoaded(ids, now)
  let earliest: number | undefined
  for (const [id, until] of limitedUntil) {
    if (until <= now) continue
    if (ids && !ids.includes(id)) continue
    if (earliest === undefined || until < earliest) earliest = until
  }
  return earliest
}

export function poolAccountLabel(id: string): string {
  return id === DEFAULT_ACCOUNT ? ".claude" : path.basename(id)
}

/** Test-only. Disables disk so tests cannot clobber the live pool file. */
export function _resetAccountPool(): void {
  limitedUntil.clear()
  sessionAccounts.clear()
  currentAccount = undefined
  loaded = false
  seeded = false
  poolFile = null
  cacheDir = null
}

/** Test-only. */
export function _setAccountPoolFile(file: string | null): void {
  poolFile = file
  loaded = false
  seeded = false
}

/** Test-only. */
export function _setUsageCacheDir(dir: string | null): void {
  cacheDir = dir
  seeded = false
}
