import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { ClaudeUsageCache } from "@opencode-ai/core/claude-usage-cache"
import { OcConfig } from "@/config/oc.js"
import { emailOf } from "./warmup/identities"
import { materializeAccountId } from "./warmup/identity"
import { saveName } from "./warmup/synced"
import { log } from "./logger.js"
import { createAccountDir } from "./accountManage.js"

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
// picks when oc.json `claudeFailover` is `ask` (turnStream.ts). Only a real
// rejection (or a manual pick) moves the current account: a cache reading of
// 100% does not, since the CLI may still serve the account. An
// account's id is its resolved config dir, or `default` for the CLI's own
// `~/.claude`, which spawns with the inherited environment.
// ---------------------------------------------------------------------------

/** How long an account sits out when its rejection carried no reset time. */
const UNKNOWN_RESET_MS = 60 * 60 * 1000

const DEFAULT_POOL_FILE = path.join(Global.Path.data, "claude-code", "account-pool.json")
const DEFAULT_USAGE_CACHE_DIR = path.join(expandHome("~/.cache"), "opencode")
const IN_TEST = process.env.BUN_TEST != null

const limitedUntil = new Map<string, number>()
/**
 * opencode session id -> pinned account id (a pool account or the API account), or `UNPINNED` once the
 * operator chose the global account, so an agent's `claudeAccount` does not pin the chat again.
 */
const sessionAccounts = new Map<string, string>()
/** Sessions on API credits only because every pool account was limited (`pinApiRollover`). */
const apiRollover = new Set<string>()
const UNPINNED = "global"
/** `claudeAccount` dirs already warned about as missing from the pool. */
const unknownPreferred = new Set<string>()
let currentAccount: string | undefined
let poolFile: string | null = IN_TEST ? null : DEFAULT_POOL_FILE
let cacheDir: string | null = IN_TEST ? null : DEFAULT_USAGE_CACHE_DIR
/** `fileStamp` of the pool file as this process last read or wrote it. */
let poolStamp: string | undefined

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

/**
 * Size and mtime of a file, or "" when it is missing. Resident oc, native opencode, and test windows
 * share the pool and session files, so a changed stamp means another process wrote it. Limit: two
 * same-size writes inside one file-time tick (about 16 ms on Windows) look alike, and the later reader keeps its copy.
 */
export function fileStamp(file: string): string {
  const stat = statSync(file, { throwIfNoEntry: false })
  return stat ? `${stat.mtimeMs}:${stat.size}` : ""
}

/** The file is the source of truth: reload it whenever another process changed it since this one last saw it. */
function ensureLoaded(now = Date.now()): void {
  if (!poolFile) return
  const stamp = fileStamp(poolFile)
  if (stamp === poolStamp) return
  poolStamp = stamp
  readPersist(now)
}

function readPersist(now: number): void {
  if (!poolFile) return
  limitedUntil.clear()
  sessionAccounts.clear()
  apiRollover.clear()
  currentAccount = undefined
  try {
    const raw = JSON.parse(readFileSync(poolFile, "utf8")) as {
      currentAccount?: unknown
      limitedUntil?: unknown
      sessionAccounts?: unknown
      apiRollover?: unknown
    }
    if (typeof raw.currentAccount === "string" && raw.currentAccount) currentAccount = raw.currentAccount
    if (raw.sessionAccounts && typeof raw.sessionAccounts === "object") {
      for (const [session, id] of Object.entries(raw.sessionAccounts as Record<string, unknown>)) {
        if (typeof id === "string" && id) sessionAccounts.set(session, id)
      }
    }
    if (Array.isArray(raw.apiRollover))
      for (const session of raw.apiRollover) if (typeof session === "string") apiRollover.add(session)
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
        ...(apiRollover.size ? { apiRollover: [...apiRollover] } : {}),
      }),
      { encoding: "utf8", mode: 0o600 },
    )
    poolStamp = fileStamp(poolFile)
  } catch (error) {
    log.warn("cannot write claude account pool file", { file: poolFile, error: String(error) })
  }
}

/**
 * Usage cache file for an account: the hashed write path when present, else a
 * basename legacy file whose `_configDir` proves it belongs to this account.
 * Unproven legacy files are never read, so one account cannot inherit another's
 * limits through a shared basename.
 */
function usageCachePath(id: string): string | undefined {
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
  const file = usageCachePath(id)
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
  ensureLoaded(now)
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

/** A pool account, or the API account: the ids a manual or agent pin may name. Automatic picks use `ids` only. */
function known(id: string, ids: string[]): boolean {
  return ids.includes(id) || (!!apiAccount && id === apiAccount.id)
}

/** The account a session is pinned to, when it still exists. Outside oc the session is "default": never pinned. */
export function sessionPin(sessionID: string | undefined, ids: string[], now = Date.now()): string | undefined {
  if (!sessionID || sessionID === "default") return undefined
  ensureLoaded(now)
  const id = sessionAccounts.get(sessionID)
  return id && known(id, ids) ? id : undefined
}

/** The account id for a config dir as written in `accounts` (`~/.claude4`) or the API account's dir, while usable. */
export function preferredAccount(dir: string, ids: string[], now = Date.now()): string | undefined {
  ensureLoaded(now)
  const wanted = canonicalAccountId(path.resolve(expandHome(dir)))
  const same = (id: string) =>
    process.platform === "win32"
      ? canonicalAccountId(id).toLowerCase() === wanted.toLowerCase()
      : canonicalAccountId(id) === wanted
  const id = [...ids, ...(apiAccount ? [apiAccount.id] : [])].find(same)
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
 * The account a turn runs on: API credits while a rolled-over chat's pool is limited, else the
 * session's pin, else the agent's preferred account (`claudeAccount`) when usable, pinned so failover
 * can move the session off it, unless the operator unpinned the chat, else the pool's pick.
 */
export function turnAccount(
  sessionID: string | undefined,
  preferredDir: string | undefined,
  ids: string[],
  now = Date.now(),
): string {
  const rollover = apiRolloverTurn(sessionID, ids, now)
  if (rollover) return rollover
  const pin = sessionPin(sessionID, ids, now)
  if (pin) return pin
  const unpinned = !!sessionID && sessionAccounts.get(sessionID) === UNPINNED
  const preferred =
    sessionID && sessionID !== "default" && preferredDir && !unpinned
      ? preferredAccount(preferredDir, ids, now)
      : undefined
  if (!preferred) return poolAccount(ids, now)
  pinSessionAccount(sessionID!, preferred, ids, now)
  return preferred
}

/** Accounts a usage-rejected turn on `from` can move to, best first. Changes no pin or current account. */
export function failoverCandidates(from: string, ids: string[], now = Date.now()): FailoverCandidate[] {
  ensureLoaded(now)
  return rankUsable(ids, from, now).filter((candidate) => candidate.id !== from)
}

/** Move a failed-over turn's chat to `id`: a pinned chat's pin moves, otherwise the global current account. */
export function applyFailoverChoice(sessionID: string | undefined, id: string, ids: string[], now = Date.now()) {
  // API credits are per chat: never the global current account.
  if (id === apiAccount?.id) return pinApiRollover(sessionID, now)
  if (sessionPin(sessionID, ids, now)) pinSessionAccount(sessionID!, id, ids, now)
  else setCurrentAccount(id, ids, now)
}

/**
 * Pin a session to a pool account or the API account, or with `undefined` put it on the global account
 * for good (an agent's `claudeAccount` no longer pins it). Any pick ends an API rollover. A pick of the
 * API account clears its limit mark: an empty balance fails fast and costs nothing. The global current
 * account is untouched.
 */
export function pinSessionAccount(sessionID: string, id: string | undefined, ids: string[], now = Date.now()): boolean {
  if (id !== undefined && !known(id, ids)) return false
  ensureLoaded(now)
  sessionAccounts.set(sessionID, id ?? UNPINNED)
  apiRollover.delete(sessionID)
  if (id !== undefined && id === apiAccount?.id) limitedUntil.delete(id)
  persistPool(now)
  return true
}

/** Drop a deleted session's pin so `sessionAccounts` does not grow for the life of the pool file. */
export function forgetSessionPin(sessionID: string, now = Date.now()): void {
  ensureLoaded(now)
  const pinned = sessionAccounts.delete(sessionID)
  if (apiRollover.delete(sessionID) || pinned) persistPool(now)
}

/**
 * Pool accounts with the active one flagged and any live limit. Selection mirrors `turnAccount`;
 * with a session it is its API rollover, else its pin when set (`pinned`), else the global pick.
 * `running`, the account the session's work is still on (`sessionWorkingAccount`), wins until that
 * work ends. `withApi` appends the API account as a `kind: "api"` row for the session pickers.
 */
export function poolState(
  ids: string[],
  now = Date.now(),
  sessionID?: string,
  running?: string,
  options?: { withApi?: boolean },
) {
  const pin = sessionPin(sessionID, ids, now)
  const active =
    running && known(running, ids) ? running : (apiRolloverTurn(sessionID, ids, now) ?? pin ?? poolAccount(ids, now))
  const row = (id: string) => {
    const until = limitedUntil.get(id) ?? 0
    return {
      id,
      label: poolAccountLabel(id),
      current: id === active,
      ...(id === pin ? { pinned: true } : {}),
      ...(until > now ? { limitedUntil: until } : {}),
    }
  }
  const rows: (ReturnType<typeof row> & { kind?: "api" })[] = ids.map(row)
  if (options?.withApi && apiAccount) rows.push({ ...row(apiAccount.id), kind: "api" })
  return rows
}

/**
 * Manual switch. A pick clears that account's limit mark, otherwise `nextUsableAccount` would move
 * straight back off it; a still-limited account fails over again when the CLI rejects the turn.
 */
export function setCurrentAccount(id: string, ids: string[], now = Date.now()): boolean {
  if (!ids.includes(id)) return false
  ensureLoaded(now)
  limitedUntil.delete(id)
  currentAccount = id
  persistPool(now)
  return true
}

export function markAccountLimited(id: string, resetsAtMs: number | undefined, now = Date.now()): void {
  ensureLoaded(now)
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
 * True when two pool accounts read one `projects` folder (a junction to `~/.claude/projects`), so a
 * Claude conversation started on one resumes on the other under the same session id.
 */
export function sharesTranscripts(a: string, b: string): boolean {
  if (a === b) return true
  const projects = (id: string) => {
    const dir = path.join(
      id === DEFAULT_ACCOUNT ? expandHome(process.env.CLAUDE_CONFIG_DIR || "~/.claude") : id,
      "projects",
    )
    if (!existsSync(dir)) return undefined
    const real = realpathSync.native(dir)
    return process.platform === "win32" ? real.toLowerCase() : real
  }
  const first = projects(a)
  return first !== undefined && first === projects(b)
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
  ensureLoaded(now)
  let earliest: number | undefined
  for (const [id, until] of limitedUntil) {
    if (until <= now) continue
    if (ids && !ids.includes(id)) continue
    if (earliest === undefined || until < earliest) earliest = until
  }
  return earliest
}

// ---------------------------------------------------------------------------
// API-credit profile
//
// The `apiAccount` provider option (`{ dir, apiKey }` or `{ dir, keychain: true }`) adds a Console
// API key as one more Claude profile. It is not a pool member: rotation, the global current account, failover ranking, warm-up
// and the account manager never pick it. A chat runs on it only when pinned there (a session pick,
// Home's next-session pick, or an agent's `claudeAccount`), or as a last resort once every pool
// account is limited and the operator agrees (turnStream.ts). A rolled-over chat (`apiRollover`)
// returns to the pool once one account is usable; a pinned one stays until its credits run out.
// ---------------------------------------------------------------------------

export const API_ACCOUNT_DIR = "~/.claudeApi"
let apiAccount: { id: string; apiKey: string } | undefined
let warnedApiKeyMissing = false
let warnedApiOverlap = false
/** The API account dir already given its shared links by this process. */
let preparedDir: string | undefined

/** Where `apiAccount.keychain` keeps the key: macOS Keychain, Windows Credential Manager, or libsecret. */
export const API_KEY_SECRET = { service: "oc", name: "claudeCredit" } as const
let readKeychain = (): Promise<string | null> => Bun.secrets.get(API_KEY_SECRET)
/** The key read from the keychain; once found it stays for the life of the process. */
let keychainKey: string | undefined
let keychainRead: Promise<void> | undefined
let warnedKeychain = false
let lastApiOption: Parameters<typeof configureApiAccount> | undefined

/** Read the keychain key unless it is known or a read is running. A miss lets a later call try again. */
function loadKeychainKey(): void {
  if (keychainKey !== undefined || keychainRead) return
  const warn = (reason: string) => {
    if (warnedKeychain) return
    warnedKeychain = true
    log.warn(`claude-code apiAccount keychain key ${reason}; API credits are off until it is set`, API_KEY_SECRET)
  }
  keychainRead = readKeychain()
    .then(
      (value) => {
        const key = value?.trim()
        if (!key) return warn("is not set (palette: Set Claude API key)")
        keychainKey = key
        if (lastApiOption) configureApiAccount(...lastApiOption)
      },
      (error) => warn(`cannot be read (${String(error)})`),
    )
    .finally(() => {
      keychainRead = undefined
    })
}

/** Settles once a running keychain read has finished, so a turn or picker sees the API profile. */
export function apiKeyReady(): Promise<void> {
  return keychainRead ?? Promise.resolve()
}

/**
 * Set from the provider options; cheap to call on every read. A non-blank `apiKey` wins; with
 * `keychain: true` the key comes from the OS keychain (`API_KEY_SECRET`), read in the background.
 * No key (an unset `{env:...}` resolves to "", or the keychain read has not found one yet) leaves the
 * profile off. So does a dir that is also a pool account, which would hand the key to automatic
 * picks. The dir gets its shared links (`projects` above all) once per process, before any switch
 * checks `sharesTranscripts`.
 */
export function configureApiAccount(
  option: { dir?: unknown; apiKey?: unknown; keychain?: unknown } | undefined,
  accounts: string[] | undefined,
): void {
  lastApiOption = [option, accounts]
  const fromKeychain = option?.keychain === true
  const explicit = typeof option?.apiKey === "string" ? option.apiKey.trim() : ""
  if (fromKeychain && !explicit) loadKeychainKey()
  const key = explicit || (fromKeychain ? (keychainKey ?? "") : "")
  if (option && !fromKeychain && !key && !warnedApiKeyMissing) {
    warnedApiKeyMissing = true
    log.warn("claude-code apiAccount has no apiKey (is its env var set for this process?); API credits are off")
  }
  const dir = typeof option?.dir === "string" && option.dir.trim() ? option.dir.trim() : API_ACCOUNT_DIR
  const id = path.resolve(expandHome(dir))
  const sameDir = (a: string, b: string) =>
    process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b
  const asPool = poolAccountIds([id])[0]!
  if (key && poolAccountIds(accounts).some((pool) => sameDir(pool, asPool))) {
    if (!warnedApiOverlap) {
      warnedApiOverlap = true
      log.warn("claude-code apiAccount dir is also in accounts; API credits are off", { dir })
    }
    apiAccount = undefined
    return
  }
  apiAccount = key ? { id, apiKey: key } : undefined
  // No pool file means disk is off (tests): leave folders alone too.
  if (!apiAccount || !poolFile || preparedDir === id) return
  preparedDir = id
  try {
    createAccountDir(id)
  } catch (error) {
    log.warn("cannot prepare the claude-code apiAccount dir", { dir: id, error: String(error) })
  }
}

export function apiAccountId(): string | undefined {
  return apiAccount?.id
}

/** The API key a spawn on `id` authenticates with; undefined for every pool account. */
export function apiAccountKey(id: string | undefined): string | undefined {
  return apiAccount && id === apiAccount.id ? apiAccount.apiKey : undefined
}

/** The API account when it can take a chat whose pool accounts are all limited. */
export function apiRolloverCandidate(now = Date.now()): string | undefined {
  if (!apiAccount) return undefined
  ensureLoaded(now)
  return (limitedUntil.get(apiAccount.id) ?? 0) <= now ? apiAccount.id : undefined
}

/** Keep a chat on API credits for its next turns; `apiRolloverTurn` lets it go. Its pin stays underneath. */
export function pinApiRollover(sessionID: string | undefined, now = Date.now()): void {
  if (!apiAccount || !sessionID || sessionID === "default") return
  ensureLoaded(now)
  apiRollover.add(sessionID)
  persistPool(now)
}

/** True while a chat is on API credits by rollover rather than a pin. */
export function isApiRollover(sessionID: string | undefined, now = Date.now()): boolean {
  if (!sessionID) return false
  ensureLoaded(now)
  return apiRollover.has(sessionID)
}

/**
 * A pinned chat's API credits ran out: unless a newer pick replaced the API pin, put the chat on the
 * global account. True when it was unpinned.
 */
export function releaseApiPin(sessionID: string | undefined, now = Date.now()): boolean {
  if (!apiAccount || !sessionID || sessionID === "default") return false
  ensureLoaded(now)
  if (sessionAccounts.get(sessionID) !== apiAccount.id) return false
  sessionAccounts.set(sessionID, UNPINNED)
  persistPool(now)
  return true
}

/** A rolled-over chat stays on API credits while every pool account is limited; otherwise it leaves the rollover. */
function apiRolloverTurn(sessionID: string | undefined, ids: string[], now: number): string | undefined {
  if (!apiAccount || !sessionID || sessionID === "default") return undefined
  ensureLoaded(now)
  if (!apiRollover.has(sessionID)) return undefined
  const usable = (id: string) => (limitedUntil.get(id) ?? 0) <= now
  if (usable(apiAccount.id) && !ids.some(usable)) return apiAccount.id
  apiRollover.delete(sessionID)
  persistPool(now)
  return undefined
}

// ---------------------------------------------------------------------------
// Display names
//
// oc.json `claudeAccountNames` maps an `accounts` entry as written
// (`"~/.claude2": "Pro"`) to a label. Names are labels only: every pool key
// stays the config dir, so a rename moves no limit, pin, or usage cache.
// ---------------------------------------------------------------------------

const namesFile: string | null = IN_TEST ? null : OcConfig.filePath()
let accountNames: Map<string, string> | undefined

function nameKey(id: string): string {
  const canonical = canonicalAccountId(id)
  return process.platform === "win32" ? canonical.toLowerCase() : canonical
}

function readNames(): Record<string, string> {
  if (!namesFile) return {}
  try {
    const raw = JSON.parse(readFileSync(namesFile, "utf8").replace(/^\s*\/\/.*$/gm, "")) as {
      claudeAccountNames?: unknown
    }
    const names = raw.claudeAccountNames
    if (!names || typeof names !== "object") return {}
    return Object.fromEntries(
      Object.entries(names as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "",
      ),
    )
  } catch {
    // Missing or invalid oc.json: no names.
    return {}
  }
}

/** Re-read names from oc.json; the account manager calls this so hand edits show up. */
export function reloadAccountNames(): void {
  accountNames = new Map(
    Object.entries(readNames()).map(([entry, name]) => [nameKey(poolAccountIds([entry])[0]!), name.trim()]),
  )
}

/** The configured name for a pool account, if any. */
export function accountName(id: string): string | undefined {
  if (!accountNames) reloadAccountNames()
  return accountNames!.get(nameKey(id))
}

// Writes `claudeAccountNames` under the shared oc.json lock, from a fresh read.
async function editNames(change: (names: Record<string, string>) => Record<string, string> | undefined) {
  if (!namesFile) return
  await OcConfig.edit((settings) => {
    const current = Object.fromEntries(
      Object.entries(settings.claudeAccountNames ?? {}).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "",
      ),
    )
    const next = change({ ...current })
    if (!next || JSON.stringify(next) === JSON.stringify(current)) return undefined
    return { claudeAccountNames: Object.keys(next).length ? next : undefined }
  })
  reloadAccountNames()
}

function withoutEntry(names: Record<string, string>, entry: string): Record<string, string> {
  const key = nameKey(poolAccountIds([entry])[0]!)
  // Drop any other spelling of the same dir, so one account never has two names.
  return Object.fromEntries(Object.entries(names).filter(([other]) => nameKey(poolAccountIds([other])[0]!) !== key))
}

/**
 * Set or clear (`undefined`/blank) the name of an `accounts` entry. With the folder's email known,
 * the name goes to synced `claudeAccounts` (every machine shows it); `claudeAccountNames` is this
 * machine's folder-keyed copy, updated at once so labels change without waiting for a tick.
 */
export async function setAccountName(entry: string, name: string | undefined): Promise<void> {
  if (!namesFile) return
  const email = emailOf(materializeAccountId(poolAccountIds([entry])[0]!))
  if (email) await saveName(email, name)
  const trimmed = name?.trim()
  await editNames((names) => {
    const next = withoutEntry(names, entry)
    if (trimmed) next[entry] = trimmed
    return next
  })
}

/** Drops this machine's name for a removed folder; the synced name stays for other machines. */
export async function forgetAccountName(entry: string): Promise<void> {
  await editNames((names) => withoutEntry(names, entry))
}

/**
 * Brings `claudeAccountNames` in line with synced names for `dirs` (materialized folders): a folder
 * whose account has a synced name gets it, one whose synced account has no name (cleared) loses
 * its local name, and folders of unknown or unsynced accounts keep theirs. Writes only on change.
 */
export async function projectAccountNames(dirs: string[], syncedName: (dir: string) => string | null | undefined) {
  if (!namesFile) return
  const wanted = dirs.flatMap((dir) => {
    const name = syncedName(dir)
    return name === undefined ? [] : [{ dir, name }]
  })
  if (wanted.every(({ dir, name }) => (accountName(poolAccountIds([dir])[0]!) ?? null) === name)) return
  await editNames((names) => {
    let next = names
    for (const { dir, name } of wanted) {
      const key = nameKey(poolAccountIds([dir])[0]!)
      const entry = Object.keys(next).find((other) => nameKey(poolAccountIds([other])[0]!) === key) ?? dir
      if ((next[entry] ?? null) === name) continue
      next = withoutEntry(next, entry)
      if (name !== null) next[entry] = name
    }
    return next
  })
}

/** The account's name, else its shell launcher name: `~/.claude` is `claude1`, `~/.claudeN` is `claudeN`. */
export function poolAccountLabel(id: string): string {
  const name = accountName(id)
  if (name) return name
  if (id === apiAccount?.id) return "API credits"
  const base = id === DEFAULT_ACCOUNT ? ".claude" : path.basename(id)
  return base === ".claude" ? "claude1" : base.replace(/^\./, "")
}

/**
 * Drop everything the pool remembers about an account: its limit mark, session pins, the current
 * pick, and its usage cache. Used after a sign-in (it may be a different person now) and on removal.
 */
export function forgetAccount(id: string, now = Date.now()): void {
  ensureLoaded(now)
  limitedUntil.delete(id)
  for (const [session, pinned] of sessionAccounts) if (pinned === id) sessionAccounts.delete(session)
  if (currentAccount === id) currentAccount = undefined
  persistPool(now)
  // usageCachePath finds the hashed file first, then a legacy one proven to be this account's.
  for (let pass = 0; pass < 2; pass++) {
    const file = usageCachePath(id)
    if (!file) return
    try {
      rmSync(file, { force: true })
    } catch (error) {
      log.warn("cannot delete claude usage cache", { file, error: String(error) })
      return
    }
  }
}

/** Test-only. Disables disk so tests cannot clobber the live pool file. */
export function _resetAccountPool(): void {
  limitedUntil.clear()
  sessionAccounts.clear()
  apiRollover.clear()
  currentAccount = undefined
  poolStamp = undefined
  poolFile = null
  cacheDir = null
  apiAccount = undefined
  keychainKey = undefined
  keychainRead = undefined
  lastApiOption = undefined
  readKeychain = () => Promise.resolve(null)
}

/** Test-only. Replaces the OS keychain read. */
export function _setKeychainReader(read: () => Promise<string | null>): void {
  readKeychain = read
}

/** Test-only. */
export function _setAccountPoolFile(file: string | null): void {
  poolFile = file
  poolStamp = undefined
}

/** Test-only. */
export function _setUsageCacheDir(dir: string | null): void {
  cacheDir = dir
}
