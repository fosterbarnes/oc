export * as ClaudeUsageCache from "./claude-usage-cache"

import path from "path"
import { Hash } from "./util/hash"

/**
 * Claude config-dir identity and usage-cache paths, shared by the provider
 * runtime and the TUI so both read the same file for the same account.
 * Pure string operations; callers own all filesystem access.
 */

/** Canonical identity for a resolved config dir. Matches TUI `claudeConfigDirId`. */
export function configDirId(resolvedDir: string): string {
  return path.resolve(resolvedDir).replace(/\\/g, "/")
}

export function defaultConfigDir(homeDir: string): string {
  return path.resolve(path.join(homeDir, ".claude"))
}

/**
 * Disk filename: `claude-usage.json` for the actual `~/.claude`, else
 * `claude-usage-<sha256(path.resolve(dir)).slice(0, 16)>.json`.
 * An inherited `CLAUDE_CONFIG_DIR` outside `~/.claude` hashes as nondefault.
 */
export function cacheFileName(homeDir: string, resolvedDir: string): string {
  if (resolvedDir === defaultConfigDir(homeDir)) return "claude-usage.json"
  return `claude-usage-${Hash.sha256(resolvedDir).slice(0, 16)}.json`
}

export function cacheLegacyFileName(resolvedDir: string): string {
  return `claude-usage-${path.basename(resolvedDir).replace(/^\./, "")}.json`
}

/** Basename legacy caches prove nothing unless `_configDir` names this dir or its canonical id. */
export function legacyCacheProvesIdentity(body: unknown, resolvedDir: string): boolean {
  if (typeof body !== "object" || body === null) return false
  const configDir = (body as { _configDir?: unknown })._configDir
  return configDir === resolvedDir || configDir === configDirId(resolvedDir)
}
