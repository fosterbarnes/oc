import path from "node:path"
import { DEFAULT_ACCOUNT, expandHome, poolAccountIds, poolAccountLabel } from "../accounts.js"

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

export function accountLabel(accountID: string, clashes: boolean): string {
  const base = poolAccountLabel(accountID)
  if (!clashes) return base
  return `${base} (${path.dirname(accountID)})`
}
