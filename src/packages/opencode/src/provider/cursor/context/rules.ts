import { lookup } from "node:dns/promises"
import { readFile, readdir, realpath, stat } from "node:fs/promises"
import net from "node:net"
import { homedir } from "node:os"
import path from "node:path"
import { parse as parseJsonc, type ParseError } from "jsonc-parser"
import {
  opencodeConfigFileNames,
  opencodeGlobalConfigDirs,
  opencodeProjectConfigDirs,
  resolveHomeRelative,
} from "./paths.js"

export type CollectedRule = {
  fullPath: string
  content: string
}

export type OpencodeJson = {
  instructions?: string[]
  permission?: unknown
  plugin?: string[]
  plugins?: string[]
  mcp?: Record<string, unknown>
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file)
    return true
  } catch {
    return false
  }
}

async function readJsonConfig(dir: string): Promise<OpencodeJson> {
  for (const name of opencodeConfigFileNames()) {
    const file = path.join(dir, name)
    if (!(await exists(file))) continue
    try {
      const raw = await readFile(file, "utf-8")
      // A real JSONC parser: stripping by regex also cut `/*` inside strings such as URLs.
      const errors: ParseError[] = []
      const parsed = parseJsonc(raw, errors, { allowTrailingComma: true }) as OpencodeJson
      return errors.length ? {} : parsed
    } catch {
      return {}
    }
  }
  return {}
}

export async function findGitWorktree(start: string): Promise<string> {
  let dir = path.resolve(start)
  for (;;) {
    if (await exists(path.join(dir, ".git"))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return path.resolve(start)
    dir = parent
  }
}

async function findUp(name: string, start: string, stop: string): Promise<string | undefined> {
  let dir = path.resolve(start)
  const root = path.resolve(stop)
  for (;;) {
    const candidate = path.join(dir, name)
    if (await exists(candidate)) return candidate
    if (dir === root) return undefined
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

async function readRule(file: string): Promise<CollectedRule | undefined> {
  if (!(await exists(file))) return undefined
  try {
    const content = await readFile(file, "utf-8")
    if (!content.trim()) return undefined
    return { fullPath: path.resolve(file), content }
  } catch {
    return undefined
  }
}

function globToRegExp(glob: string): RegExp {
  const norm = glob.replace(/\\/g, "/")
  let re = "^"
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i]!
    if (c === "*") {
      if (norm[i + 1] === "*") {
        i++
        // `**/` spans whole folders only, so `a/**/b.md` does not match `a/xb.md`.
        const folders = norm[i + 1] === "/"
        re += folders ? "(?:.*/)?" : ".*"
        if (folders) i++
      } else {
        re += "[^/]*"
      }
    } else if (".$^+?()[]{}|".includes(c) || c === "\\") {
      re += "\\" + c
    } else {
      re += c
    }
  }
  return new RegExp(re + "$")
}

async function expandGlob(pattern: string, workspaceRoot: string): Promise<string[]> {
  const abs = path.isAbsolute(pattern) ? pattern : path.join(workspaceRoot, pattern)
  if (!abs.includes("*")) return (await exists(abs)) ? [abs] : []

  const out: string[] = []
  const base = abs.split("*")[0] || workspaceRoot
  const startDir = path.dirname(base.endsWith("/") ? base : base)
  const regex = globToRegExp(abs)

  async function walk(dir: string, depth: number) {
    if (depth > 8) return
    let entries: string[]
    try {
      entries = await readdir(dir)
    } catch {
      return
    }
    entries.sort()
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue
      const full = path.join(dir, name)
      let st
      try {
        st = await stat(full)
      } catch {
        continue
      }
      if (st.isDirectory()) await walk(full, depth + 1)
      else if (regex.test(full.replace(/\\/g, "/"))) out.push(full)
    }
  }

  await walk(startDir, 0)
  return out
}

/** Same truthy rule as OpenCode's Flag.OPENCODE_DISABLE_PROJECT_CONFIG. */
export function isProjectConfigDisabled(): boolean {
  const value = process.env.OPENCODE_DISABLE_PROJECT_CONFIG?.toLowerCase()
  return value === "true" || value === "1"
}

export const MAX_REMOTE_REDIRECTS = 5

function isIPv4Blocked(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false
  const a = parts[0]!
  const b = parts[1]!
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  if (a === 0) return true
  return false
}

function isIPv6Blocked(ip: string): boolean {
  const lower = ip.toLowerCase()
  if (lower === "::1" || lower === "::") return true
  if (lower.startsWith("fe80:")) return true
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true
  if (lower.startsWith("ff")) return true
  if (lower.includes(".")) {
    const lastColon = lower.lastIndexOf(":")
    const v4 = lower.slice(lastColon + 1)
    if (net.isIP(v4) === 4 && isIPv4Blocked(v4)) return true
  }
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice("::ffff:".length)
    if (net.isIP(v4) === 4 && isIPv4Blocked(v4)) return true
  }
  // URL parsing rewrites `::ffff:127.0.0.1` to this hex form, which still connects to the IPv4 address.
  const embedded = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower)
  if (embedded) {
    const [high, low] = [parseInt(embedded[1]!, 16), parseInt(embedded[2]!, 16)]
    if (isIPv4Blocked(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)) return true
  }
  return false
}

export function isIPBlocked(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isIPv4Blocked(ip)
  if (family === 6) return isIPv6Blocked(ip)
  return false
}

export function isHostnameBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (h === "localhost" || h.endsWith(".localhost")) return true
  const family = net.isIP(h)
  if (family !== 0) return isIPBlocked(h)
  return false
}

/**
 * The address to connect to for `hostname`: undefined when any resolved address
 * is blocked or DNS fails, the hostname itself for IP literals and reserved test
 * names (nothing to pin), else a validated public IP.
 */
async function resolvePublicHost(hostname: string): Promise<string | undefined> {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (net.isIP(h) !== 0) return hostname
  if (h === "localhost" || h.endsWith(".localhost")) return undefined
  // Reserved/example TLDs never resolve externally and never map to private
  // ranges. Skip DNS to keep tests deterministic and fast (no external network).
  if (
    h.endsWith(".invalid") ||
    h.endsWith(".test") ||
    h.endsWith(".example") ||
    h === "example.com" ||
    h === "example.net" ||
    h === "example.org"
  )
    return hostname
  try {
    const results = await Promise.race([
      lookup(h, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), 800)),
    ])
    if (results.length === 0 || results.some((r) => isIPBlocked(r.address))) return undefined
    return results[0]!.address
  } catch {
    // A failed or timed-out lookup is not proof that the destination is public.
    return undefined
  }
}

/**
 * Fetch one hop on the validated address so a rebinding resolver cannot swap
 * in a private one after the check. Host and SNI keep the real name, so TLS
 * still verifies the certificate against it.
 */
function fetchPinned(url: URL, address: string, signal: AbortSignal): Promise<Response> {
  if (address === url.hostname) return fetch(url.toString(), { signal, redirect: "manual" })
  const pinned = new URL(url)
  pinned.hostname = net.isIP(address) === 6 ? `[${address}]` : address
  return fetch(pinned.toString(), {
    signal,
    redirect: "manual",
    headers: { host: url.host },
    tls: { serverName: url.hostname },
  })
}

/**
 * Fetch a remote instruction with manual per-hop validation.
 * Every hop must remain HTTPS and resolve to public destinations;
 * loopback, link-local, private, and cloud-metadata ranges are rejected.
 * Redirects are capped at MAX_REMOTE_REDIRECTS.
 */
export async function fetchRemoteInstruction(url: string, timeoutMs = 5000): Promise<string | undefined> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, timeoutMs))
  try {
    let current = url
    for (let hop = 0; hop <= MAX_REMOTE_REDIRECTS; hop++) {
      let parsed: URL
      try {
        parsed = new URL(current)
      } catch {
        return undefined
      }
      if (parsed.protocol !== "https:") return undefined
      if (isHostnameBlocked(parsed.hostname)) return undefined
      const address = await resolvePublicHost(parsed.hostname)
      if (!address) return undefined

      let res: Response
      try {
        res = await fetchPinned(parsed, address, ctrl.signal)
      } catch {
        return undefined
      }

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location")
        if (!loc) return undefined
        if (hop === MAX_REMOTE_REDIRECTS) return undefined
        let next: string
        try {
          next = new URL(loc, current).toString()
        } catch {
          return undefined
        }
        let nextParsed: URL
        try {
          nextParsed = new URL(next)
        } catch {
          return undefined
        }
        if (nextParsed.protocol !== "https:") return undefined
        if (isHostnameBlocked(nextParsed.hostname)) return undefined
        current = next
        continue
      }

      if (!res.ok) return undefined
      return await res.text()
    }
    return undefined
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

function mergeConfig(base: OpencodeJson, overlay: OpencodeJson): OpencodeJson {
  return {
    ...base,
    ...overlay,
    instructions: [...(base.instructions ?? []), ...(overlay.instructions ?? [])],
    plugin: [...new Set([...(base.plugin ?? []), ...(overlay.plugin ?? [])])],
    plugins: [...new Set([...(base.plugins ?? []), ...(overlay.plugins ?? [])])],
    mcp: { ...(base.mcp ?? {}), ...(overlay.mcp ?? {}) },
    permission: overlay.permission ?? base.permission,
  }
}

function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export async function loadMergedConfig(workspaceRoot: string): Promise<OpencodeJson> {
  const globalConfig = await readJsonConfig(opencodeGlobalConfigDirs()[0] ?? "")
  if (isProjectConfigDisabled()) return mergeConfig({}, globalConfig)

  // The bridge supplies native project config roots for an unchanged plugin:
  // The active host's project config directories are supplied by the path bridge; OpenCode defaults to .opencode.
  // Later roots have higher precedence, matching the host's native ordering.
  let projectConfig = await readJsonConfig(workspaceRoot)
  for (const configDir of opencodeProjectConfigDirs(workspaceRoot)) {
    projectConfig = mergeConfig(projectConfig, await readJsonConfig(configDir))
  }
  return mergeConfig(globalConfig, projectConfig)
}

/**
 * Collect OpenCode instruction files.
 */
export async function collectRules(workspaceRoot: string): Promise<{
  rules: CollectedRule[]
  config: OpencodeJson
  worktree: string
}> {
  const worktree = await findGitWorktree(workspaceRoot)
  const rules: CollectedRule[] = []
  const seen = new Set<string>()
  const config = await loadMergedConfig(workspaceRoot)
  const trustedRoots = await Promise.all(
    [
      workspaceRoot,
      ...opencodeProjectConfigDirs(workspaceRoot),
      ...opencodeGlobalConfigDirs(),
      path.join(homedir(), ".claude"),
    ].map(async (root) => {
      try {
        return await realpath(root)
      } catch {
        return path.resolve(root)
      }
    }),
  )

  const add = async (file: string | undefined) => {
    if (!file) return
    let canonical: string
    try {
      canonical = await realpath(path.resolve(file))
    } catch {
      return
    }
    // `seen` holds real paths, so a symlinked AGENTS.md and its target dedupe.
    if (seen.has(canonical)) return
    if (!trustedRoots.some((root) => isPathInside(canonical, root))) return
    const rule = await readRule(canonical)
    if (!rule) return
    seen.add(canonical)
    rules.push(rule)
  }

  // Match OpenCode: OPENCODE_DISABLE_PROJECT_CONFIG skips project AGENTS/CLAUDE/CONTEXT
  // discovery and project opencode.json (see loadMergedConfig).
  if (!isProjectConfigDisabled()) {
    for (const name of ["AGENTS.md", "CLAUDE.md", "CONTEXT.md"]) {
      const hit = await findUp(name, workspaceRoot, worktree)
      if (hit) {
        await add(hit)
        break
      }
    }
  }

  for (const globalDir of opencodeGlobalConfigDirs()) {
    await add(path.join(globalDir, "AGENTS.md"))
  }
  await add(path.join(homedir(), ".claude", "CLAUDE.md"))

  for (const raw of config.instructions ?? []) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      // HTTPS-only with manual per-hop validation. Every redirect must remain
      // HTTPS and resolve to public destinations; loopback, link-local, private,
      // and cloud-metadata ranges are rejected. Redirects are capped at
      // MAX_REMOTE_REDIRECTS (fetch uses redirect: manual).
      let remoteUrl: URL
      try {
        remoteUrl = new URL(raw)
      } catch {
        continue
      }
      if (remoteUrl.protocol !== "https:") continue
      const content = await fetchRemoteInstruction(remoteUrl.href)
      if (!content?.trim() || seen.has(raw)) continue
      seen.add(raw)
      rules.push({ fullPath: raw, content })
      continue
    }
    const expanded = resolveHomeRelative(raw)
    for (const m of await expandGlob(expanded, workspaceRoot)) await add(m)
  }

  return { rules, config, worktree }
}
