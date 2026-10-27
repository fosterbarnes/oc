import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { ClaudeUsageCache } from "@opencode-ai/core/claude-usage-cache"
import { log } from "./logger.js"

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
// until the CLI rejects a request for usage, then moves to the usable account
// with the least 5-hour use per the TUI's usage caches, or the one the operator
// picks when oc.json `claudeFailover` is `ask` (turnStream.ts). An
// account's id is its resolved config dir, or `default` for the CLI's own
// `~/.claude`, which spawns with the inherited environment.
// ---------------------------------------------------------------------------

/** How long an account sits out when its rejection carried no reset time. */
const UNKNOWN_RESET_MS = 60 * 60 * 1000

const DEFAULT_POOL_FILE = path.join(Global.Path.data, "claude-code", "account-pool.json")
const DEFAULT_USAGE_CACHE_DIR = path.join(expandHome("~/.cache"), "opencode")
const IN_TEST = process.env.BUN_TEST != null

const limitedUntil = new Map<string, number>()
/** opencode session id -> pool account id. A pinned chat ignores the global current account. */
const sessionAccounts = new Map<string, string>()
/** `claudeAccount` dirs already warned about as missing from the pool. */
const unknownPreferred = new Set<string>()
let currentAccount: string | undefined
let poolFile: string | null = IN_TEST ? null : DEFAULT_POOL_FILE
let cacheDir: string | null = IN_TEST ? null : DEFAULT_USAGE_CACHE_DIR
let loaded = false
let seeded = false

export function poolAccountIds(accounts: string[] | undefined): string[] {
  // The default account spawns with the inherited environment, so its dir is the
  // inherited CLAUDE_CONFIG_DIR, else ~/.claude. With CLAUDE_CONFIG_DIR set
  // elsewhere, ~/.claude is a separate account.
  const defaultDir = path.resolve(expandHome(process.env.CLAUDE_CONFIG_DIR || "~/.claude"))
  // Windows paths compare case-insensitively; elsewhere exactly.
  const sameDir = (a: string, b: string) =>
    process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b
  const ids = (accounts ?? []).map((dir) => {
    const resolved = path.resolve(expandHome(dir))
    // An explicit entry for the default dir (however cased) is that account,
    // not a second pool entry whose limit marks would never meet the default's.
    return sameDir(resolved, defaultDir) ? DEFAULT_ACCOUNT : resolved
  })
  return ids.length ? [...new Set(ids)] : [DEFAULT_ACCOUNT]
}

/** The `accounts` entry, as the user wrote it, that resolves to a pool id. */
export function accountConfigEntry(id: string, accounts: string[] | undefined): string | undefined {
  return accounts?.find((dir) => poolAccountIds([dir])[0] === id)
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

/**
 * Seed file for an account: the hashed write path when present, else a
 * basename legacy file whose `_configDir` proves it belongs to this account.
 * Unproven legacy files never seed, so one account cannot inherit another's
 * limits through a shared basename.
 */
function seedCachePath(id: string): string | undefined {
  if (!cacheDir) return undefined
  const home = expandHome("~")
  const resolved = id === DEFAULT_ACCOUNT ? path.resolve(expandHome(process.env.CLAUDE_CONFIG_DIR ?? "~/.claude")) : id
  const writePath = path.join(cacheDir, ClaudeUsageCache.cacheFileName(home, resolved))
  try {
    readFileSync(writePath, "utf8")
    return writePath
  } catch {
    // Fall through to the legacy basename file.
  }
  const legacyPath = path.join(cacheDir, ClaudeUsageCache.cacheLegacyFileName(resolved))
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(legacyPath, "utf8"))
  } catch {
    return undefined
  }
  if (!ClaudeUsageCache.legacyCacheProvesIdentity(raw, resolved)) return undefined
  return legacyPath
}

function windowResetMs(value: unknown, now: number): number | undefined {
  const item = value as { utilization?: unknown; resets_at?: unknown } | null
  if (typeof item?.utilization !== "number" || !Number.isFinite(item.utilization)) return undefined
  const usedPercent = Math.max(0, Math.min(100, item.utilization))
  if (usedPercent < 100) return undefined
  const date = typeof item.resets_at === "string" ? new Date(item.resets_at) : undefined
  if (!date || Number.isNaN(date.valueOf()) || date.valueOf() <= now) return undefined
  return date.valueOf()
}

/** A window's used percent; a window whose reset has passed reads 0. Undefined without a number. */
function windowUsedPercent(value: unknown, now: number): number | undefined {
  const item = value as { utilization?: unknown; resets_at?: unknown } | null
  if (typeof item?.utilization !== "number" || !Number.isFinite(item.utilization)) return undefined
  const reset = typeof item.resets_at === "string" ? Date.parse(item.resets_at) : Number.NaN
  return reset <= now ? 0 : Math.max(0, Math.min(100, item.utilization))
}

/** An account's cached usage: 5-hour percent used, and when a full window frees it. Undefined without a cache. */
function readUsageCache(id: string, now: number): { fiveHourUsed?: number; fullUntil?: number } | undefined {
  const file = seedCachePath(id)
  if (!file) return undefined
  let body: { five_hour?: unknown; seven_day?: unknown } | null
  try {
    body = JSON.parse(readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
  const resets = [windowResetMs(body?.five_hour, now), windowResetMs(body?.seven_day, now)].filter(
    (value): value is number => value !== undefined,
  )
  return {
    fiveHourUsed: windowUsedPercent(body?.five_hour, now),
    ...(resets.length ? { fullUntil: Math.max(...resets) } : {}),
  }
}

function seedFromCaches(ids: string[], now: number): void {
  for (const id of ids) {
    const fullUntil = readUsageCache(id, now)?.fullUntil
    if (fullUntil) markAccountLimited(id, fullUntil, now)
  }
}

/** A usable pool account and its cached 5-hour use in percent (undefined without a cache). */
export type FailoverCandidate = { id: string; used?: number }

/**
 * Usable accounts, least 5-hour use first, read from the usage caches now so limit marks are fresh
 * too. Ties and accounts without a cache keep rotation order after `from`.
 */
function rankUsable(ids: string[], from: string, now: number): FailoverCandidate[] {
  const start = ids.indexOf(from) + 1
  const ranked = [...ids.slice(start), ...ids.slice(0, start)].flatMap((id) => {
    const cache = readUsageCache(id, now)
    if (cache?.fullUntil) markAccountLimited(id, cache.fullUntil, now)
    return (limitedUntil.get(id) ?? 0) <= now ? [{ id, used: cache?.fiveHourUsed }] : []
  })
  // Unknown use ranks last; two unknowns subtract to NaN, and `|| 0` keeps them in rotation order.
  return ranked.sort((a, b) => (a.used ?? Infinity) - (b.used ?? Infinity) || 0)
}

/** The current account while usable, else the usable one with the least 5-hour use; undefined when all are limited. */
export function nextUsableAccount(ids: string[], now = Date.now()): string | undefined {
  ensureLoaded(ids, now)
  const usable = (id: string) => (limitedUntil.get(id) ?? 0) <= now
  if (currentAccount && ids.includes(currentAccount) && usable(currentAccount)) return currentAccount
  // A fresh pool starts at the first usable account; only a move off a limited one is ranked.
  const next =
    currentAccount && ids.includes(currentAccount) ? rankUsable(ids, currentAccount, now)[0]?.id : ids.find(usable)
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

/** The pool id for a config dir as written in `accounts` (`~/.claude4`), while it is usable. */
export function preferredAccount(dir: string, ids: string[], now = Date.now()): string | undefined {
  ensureLoaded(ids, now)
  const wanted = canonicalAccountId(path.resolve(expandHome(dir)))
  const same = (id: string) =>
    process.platform === "win32"
      ? canonicalAccountId(id).toLowerCase() === wanted.toLowerCase()
      : canonicalAccountId(id) === wanted
  const id = ids.find(same)
  if (!id) {
    if (!unknownPreferred.has(dir)) {
      unknownPreferred.add(dir)
      log.warn("claudeAccount is not in the claude-code accounts pool; ignoring it", { claudeAccount: dir })
    }
    return undefined
  }
  return (limitedUntil.get(id) ?? 0) <= now ? id : undefined
}

/**
 * The account a turn runs on: the session's pin, else the agent's preferred account (`claudeAccount`)
 * when usable, pinned so failover can move the session off it, else the pool's pick.
 */
export function turnAccount(
  sessionID: string | undefined,
  preferredDir: string | undefined,
  ids: string[],
  now = Date.now(),
): string {
  const pin = sessionPin(sessionID, ids, now)
  if (pin) return pin
  const preferred =
    sessionID && sessionID !== "default" && preferredDir ? preferredAccount(preferredDir, ids, now) : undefined
  if (!preferred) return poolAccount(ids, now)
  pinSessionAccount(sessionID!, preferred, ids, now)
  return preferred
}

/** Accounts a usage-rejected turn on `from` can move to, best first. Changes no pin or current account. */
export function failoverCandidates(from: string, ids: string[], now = Date.now()): FailoverCandidate[] {
  ensureLoaded(ids, now)
  return rankUsable(ids, from, now).filter((candidate) => candidate.id !== from)
}

/** Move a failed-over turn's chat to `id`: a pinned chat's pin moves, otherwise the global current account. */
export function applyFailoverChoice(sessionID: string | undefined, id: string, ids: string[], now = Date.now()) {
  if (sessionPin(sessionID, ids, now)) pinSessionAccount(sessionID!, id, ids, now)
  else setCurrentAccount(id, ids, now)
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
 * with a session it is that session's pin when set (`pinned`), else the global pick. `running`,
 * the account the session's work is still on (`sessionWorkingAccount`), wins until that work ends.
 */
export function poolState(ids: string[], now = Date.now(), sessionID?: string, running?: string) {
  const pin = sessionPin(sessionID, ids, now)
  const active = running && ids.includes(running) ? running : (pin ?? poolAccount(ids, now))
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

/**
 * Canonical quota identity: the full resolved config dir with normalized
 * slashes. Matches TUI `claudeConfigDirId`. Never a display basename.
 */
export function canonicalAccountId(id: string): string {
  if (id !== DEFAULT_ACCOUNT) return ClaudeUsageCache.configDirId(id)
  return ClaudeUsageCache.configDirId(expandHome(process.env.CLAUDE_CONFIG_DIR ?? "~/.claude"))
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
