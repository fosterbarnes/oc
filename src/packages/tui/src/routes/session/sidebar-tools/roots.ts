// File-root paths for the sidebar tree and root picker, plus Everything (es.exe) search.
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

export const MAX_RECENT_ROOTS = 8

export type RootSections = { recentRoots: string[]; favoriteRoots: string[] }
export function isDirectory(value: string): boolean {
  try {
    return fs.statSync(value).isDirectory()
  } catch {
    return false
  }
}

export function normalizeRootPath(value: string): string {
  const normalized = path.normalize(value)
  if (process.platform === "win32" && /^[a-zA-Z]:/.test(normalized)) {
    return normalized.slice(0, 1).toUpperCase() + normalized.slice(1)
  }
  return normalized
}

export function rootPathKey(value: string): string {
  const normalized = normalizeRootPath(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

export function sameRootPath(first: string, second: string): boolean {
  return rootPathKey(first) === rootPathKey(second)
}

export function dedupeRootPaths(paths: readonly string[], isValid: (root: string) => boolean = isDirectory): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of paths) {
    if (typeof item !== "string" || !item.trim()) continue
    const canonical = normalizeRootPath(item)
    if (!isValid(canonical)) continue
    const key = rootPathKey(canonical)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(canonical)
  }
  return result
}

export type EverythingSearchEntry = { path: string; directory: boolean }
export type EverythingSearchResult =
  | { ok: true; entries: EverythingSearchEntry[] }
  | { ok: false; error: "missing-es" | "ipc-unavailable" | "failed" | "aborted" }

export type EverythingSpawnResult = { stdout: string; code: number | null; error?: Error }

export function everythingSearchQuery(roots: readonly string[], query: string): string {
  const scoped = dedupeRootPaths(roots).map((root) => {
    const folder = normalizeRootPath(root)
    const withSep = folder.endsWith(path.sep) ? folder : `${folder}${path.sep}`
    return /[\s<>|"]/.test(withSep) ? `"${withSep.replaceAll('"', "")}"` : withSep
  })
  const scope = scoped.length === 0 ? "" : scoped.length === 1 ? scoped[0] : `<${scoped.join("|")}>`
  const trimmed = query.trim()
  if (scope && trimmed) return `${scope} ${trimmed}`
  return trimmed || scope
}

export function everythingSearchArgs(search: string, maxResults = 80): string[] {
  // es.exe matches only when the query is a separate -search argv; wrapping the query in quotes yields zero hits.
  return ["-n", String(maxResults), "-timeout", "2000", "-hide-empty-search-results", "-search", search]
}

function defaultEverythingSpawn(
  executable: string,
  args: string[],
  signal?: AbortSignal,
): Promise<EverythingSpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(executable, args, { windowsHide: true })
    let stdout = ""
    const onAbort = () => {
      child.kill()
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })
    child.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort)
      resolve({ stdout, code: null, error })
    })
    child.on("close", (code) => {
      signal?.removeEventListener("abort", onAbort)
      resolve({ stdout, code })
    })
  })
}

export async function runEverythingSearch(options: {
  query: string
  roots: readonly string[]
  maxResults?: number
  signal?: AbortSignal
  executable?: string
  spawnImpl?: (executable: string, args: string[], signal?: AbortSignal) => Promise<EverythingSpawnResult>
}): Promise<EverythingSearchResult> {
  const executable = options.executable ?? (process.platform === "win32" ? "es.exe" : "es")
  const spawnImpl = options.spawnImpl ?? defaultEverythingSpawn
  const search = everythingSearchQuery(options.roots, options.query)
  const args = everythingSearchArgs(search, options.maxResults)
  if (options.signal?.aborted) return { ok: false, error: "aborted" }
  const spawned = await spawnImpl(executable, args, options.signal)
  if (options.signal?.aborted) return { ok: false, error: "aborted" }
  if (spawned.error) {
    const code = (spawned.error as NodeJS.ErrnoException).code
    if (code === "ENOENT") return { ok: false, error: "missing-es" }
    return { ok: false, error: "failed" }
  }
  if (spawned.code === 8) return { ok: false, error: "ipc-unavailable" }
  if (spawned.code !== 0 && spawned.code !== 9) return { ok: false, error: "failed" }
  const entries: EverythingSearchEntry[] = []
  for (const line of spawned.stdout.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const canonical = normalizeRootPath(trimmed)
    let directory = false
    try {
      directory = fs.statSync(canonical).isDirectory()
    } catch {
      continue
    }
    entries.push({ path: canonical, directory })
    if (entries.length >= (options.maxResults ?? 80)) break
  }
  return { ok: true, entries }
}

export function displayPath(value: string, homeDirectory: string): string {
  const normalized = value.replaceAll("\\", "/")
  const home = homeDirectory.replaceAll("\\", "/").replace(/\/$/, "")
  return normalized === home
    ? "/~"
    : normalized.startsWith(`${home}/`)
      ? `/~${normalized.slice(home.length + 1)}`
      : normalized
}

export function rootSections(
  customRoots: readonly string[],
  favoriteRoots: readonly string[],
  isValid: (root: string) => boolean = isDirectory,
): RootSections {
  const favorites = dedupeRootPaths(favoriteRoots, isValid)
  const favoriteKeys = new Set(favorites.map(rootPathKey))
  const recentRoots = dedupeRootPaths(customRoots, isValid)
    .filter((root) => !favoriteKeys.has(rootPathKey(root)))
    .slice(0, MAX_RECENT_ROOTS)
  return { recentRoots, favoriteRoots: favorites }
}
