import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { chmod, lstat, mkdir, readlink, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { log } from "./logger.js"

export const BASE_PROVIDER_ID = "claude-code"
export const DEFAULT_ACCOUNT = "default"

const SHARED_CAPABILITY_ITEMS = [
  "CLAUDE.md",
  "settings.json",
  "skills",
  "agents",
  "commands",
  "plugins",
]

export function normalizeAccountName(account: string): string {
  return account
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export function accountConfigDir(account: string): string | undefined {
  const normalized = normalizeAccountName(account)

  if (!normalized || normalized === DEFAULT_ACCOUNT) return undefined

  return `~/.claude-${normalized}`
}

/**
 * Absolute `CLAUDE_CONFIG_DIR` for an account, or undefined for the default
 * account, which leaves the CLI on its own `~/.claude`. Used where a caller
 * needs to know what the *spawn* will read (skills, plugins) rather than to
 * set the variable itself.
 */
export function accountConfigDirPath(account: string): string | undefined {
  const dir = accountConfigDir(account)
  return dir ? expandHome(dir) : undefined
}

export function expandHome(value: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE

  if (value === "~") return home ?? value

  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return home ? path.join(home, value.slice(2)) : value
  }

  return value
}

export async function ensureAccountRuntime(
  account: string,
  baseCliPath: string,
): Promise<{ cliPath: string; configDir?: string }> {
  const configDir = accountConfigDir(account)

  if (!configDir) return { cliPath: baseCliPath }

  const expandedConfigDir = expandHome(configDir)
  await mkdir(expandedConfigDir, { recursive: true })

  try {
    await ensureSharedCapabilities(expandedConfigDir)
  } catch (err) {
    log.warn("failed to symlink shared capabilities; continuing anyway", {
      account,
      configDir: expandedConfigDir,
      error: String(err),
    })
  }

  const cliPath = await writeAccountWrapper(
    normalizeAccountName(account),
    baseCliPath,
    expandedConfigDir,
  )

  return { cliPath, configDir: expandedConfigDir }
}

async function ensureSharedCapabilities(targetRoot: string): Promise<void> {
  const sourceRoot = expandHome("~/.claude")

  for (const item of SHARED_CAPABILITY_ITEMS) {
    await ensureSharedCapabilityItem(sourceRoot, targetRoot, item)
  }
}

async function ensureSharedCapabilityItem(
  sourceRoot: string,
  targetRoot: string,
  item: string,
): Promise<void> {
  const source = path.join(sourceRoot, item)
  const target = path.join(targetRoot, item)

  let sourceStat
  try {
    sourceStat = await lstat(source)
  } catch {
    return
  }

  try {
    const targetStat = await lstat(target)

    if (targetStat.isSymbolicLink()) {
      const current = await readlink(target)
      const resolvedCurrent = path.resolve(path.dirname(target), current)
      const resolvedSource = path.resolve(source)

      if (resolvedCurrent === resolvedSource) return
    }

    log.warn("shared Claude capability already exists; leaving untouched", {
      item,
      target,
      source,
    })

    return
  } catch {
    // Missing target is expected.
  }

  const type = sourceStat.isDirectory()
    ? process.platform === "win32"
      ? "junction"
      : "dir"
    : "file"

  await symlink(source, target, type)
}

// The wrapper is a bash script, so extra accounts are Mac/Linux only; Windows cannot exec it.
async function writeAccountWrapper(
  account: string,
  baseCliPath: string,
  configDir: string,
): Promise<string> {
  const cacheRoot = path.join(
    process.env.XDG_CACHE_HOME ?? expandHome("~/.cache"),
    "opencode-claude-code-plugin",
  )
  const wrapperPath = path.join(cacheRoot, `claude-${account}`)
  const suffix = `@${account}`

  await mkdir(cacheRoot, { recursive: true })

  const script = `#!/usr/bin/env bash
set -euo pipefail

args=()
while [[ $# -gt 0 ]]; do
  if [[ "$1" == "--model" && $# -ge 2 ]]; then
    model="$2"
    if [[ "$model" == *${shellDoubleQuote(suffix)} ]]; then
      model="\${model%${shellDoubleQuote(suffix)}}"
    fi
    args+=("$1" "$model")
    shift 2
  else
    args+=("$1")
    shift
  fi
done

export CLAUDE_CONFIG_DIR=${shellSingleQuote(configDir)}
# \${args[@]+...} keeps an empty array legal under \`set -u\` on bash 3.2,
# which is the bash macOS ships and \`/usr/bin/env bash\` usually finds.
exec ${shellSingleQuote(baseCliPath)} \${args[@]+"\${args[@]}"}
`

  await writeFile(wrapperPath, script, "utf8")
  await chmod(wrapperPath, 0o755)

  return wrapperPath
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`
}

function shellDoubleQuote(value: string): string {
  return value.replace(/[$`"\\]/g, "\\$&")
}


// ---------------------------------------------------------------------------
// Account pool
//
// The `accounts` provider option lists Claude config dirs in order, e.g.
// `["~/.claude", "~/.claudeSecond"]`. Every chat uses the current account
// until the CLI rejects a request for usage, then moves to the next account
// whose limit has not been hit (turn-stream.ts). An account's id is its
// resolved config dir, or `default` for the CLI's own `~/.claude`, which
// spawns with the inherited environment.
// ---------------------------------------------------------------------------

/** How long an account sits out when its rejection carried no reset time. */
const UNKNOWN_RESET_MS = 60 * 60 * 1000

const DEFAULT_POOL_FILE = path.join(Global.Path.data, "claude-code", "account-pool.json")
const DEFAULT_USAGE_CACHE_DIR = path.join(expandHome("~/.cache"), "opencode")
const IN_TEST = process.env.BUN_TEST != null

const limitedUntil = new Map<string, number>()
let currentAccount: string | undefined
let poolFile: string | null = IN_TEST ? null : DEFAULT_POOL_FILE
let cacheDir: string | null = IN_TEST ? null : DEFAULT_USAGE_CACHE_DIR
let loaded = false
let seeded = false

export function poolAccountIds(accounts: string[] | undefined): string[] {
  const defaultDir = path.resolve(expandHome("~/.claude"))
  const ids = (accounts ?? []).map((dir) => {
    const resolved = path.resolve(expandHome(dir))
    return resolved === defaultDir ? DEFAULT_ACCOUNT : resolved
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
    }
    if (typeof raw.currentAccount === "string" && raw.currentAccount) currentAccount = raw.currentAccount
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

export function poolAccountLabel(id: string): string {
  return id === DEFAULT_ACCOUNT ? ".claude" : path.basename(id)
}

/** Test-only. Disables disk so tests cannot clobber the live pool file. */
export function _resetAccountPool(): void {
  limitedUntil.clear()
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
