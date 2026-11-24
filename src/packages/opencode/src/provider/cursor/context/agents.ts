import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { SubagentRef } from "@/agent/subagentRef"
import { ConfigAgent } from "@/config/agent"
import { opencodeGlobalConfigDirs, opencodeProjectConfigDirs } from "./paths.js"

export type CollectedAgent = {
  fullPath: string
  name: string
  description: string
  prompt: string
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

function uniquePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((value) => {
    const normalized = path.resolve(value)
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(child))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function isTrustedPath(target: string, trustedRoots: string[]): boolean {
  const resolved = path.resolve(target)
  return trustedRoots.some((root) => isPathInside(resolved, root))
}

/**
 * Read one host config root's `agent/` and `agents/` trees. Host loaders use
 * both spellings and recurse through nested markdown files. Directory symlinks
 * are followed with realpath cycle detection, matching host behavior without
 * allowing a symlink loop to hang context construction.
 * Symlink targets that resolve outside the trusted project/config roots are
 * rejected to prevent out-of-root disclosure.
 */
async function scanAgentRoot(root: string, out: Map<string, CollectedAgent>, trustedRoots: string[]): Promise<void> {
  if (!(await exists(root))) return
  const visitedDirs = new Set<string>()
  const scanDir = async (dir: string, relativePrefix: string): Promise<void> => {
    let canonical: string
    try {
      canonical = await realpath(dir)
    } catch {
      return
    }
    if (!isTrustedPath(canonical, trustedRoots)) return
    if (visitedDirs.has(canonical)) return
    visitedDirs.add(canonical)

    let entries: Array<import("node:fs").Dirent>
    try {
      entries = await readdir(dir, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
    } catch {
      return
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const relative = path.join(relativePrefix, entry.name)
      let isDirectory = entry.isDirectory()
      let isFile = entry.isFile()
      if (entry.isSymbolicLink()) {
        let realTarget: string
        try {
          realTarget = await realpath(full)
        } catch {
          continue
        }
        if (!isTrustedPath(realTarget, trustedRoots)) continue
        try {
          const target = await stat(realTarget)
          isDirectory = target.isDirectory()
          isFile = target.isFile()
        } catch {
          continue
        }
      }
      if (isDirectory) {
        await scanDir(full, relative)
        continue
      }
      if (!isFile || !entry.name.endsWith(".md")) continue
      // For symlinked files we already validated the target is inside a trusted root;
      // for regular files realpath must also remain inside (defense against TOCTOU).
      try {
        const fileReal = await realpath(full)
        if (!isTrustedPath(fileReal, trustedRoots)) continue
      } catch {
        // If realpath fails for a non-symlink, fall back to resolved path check.
        if (!isTrustedPath(path.resolve(full), trustedRoots)) continue
      }

      try {
        const result = await ConfigAgent.scanFile(root, full)
        for (const [name, config] of Object.entries(result.agents)) {
          if (config.disable) continue
          const levels = SubagentRef.listed(config.reasoning)
          if (config.reasoning && levels.length === 0) continue
          const names = levels.length ? levels.map((level) => `${name}:${level}`) : [name]
          for (const advertised of names) {
            if (out.has(advertised)) continue
            out.set(advertised, {
              fullPath: path.resolve(full),
              name: advertised,
              description: config.description ?? "",
              prompt: config.prompt?.slice(0, 20_000) ?? "",
            })
          }
        }
      } catch {
        /* skip unreadable or malformed files without failing context build */
      }
    }
  }

  // Scan singular before plural, then let root ordering establish host
  // precedence. This is deterministic and mirrors the hosts' brace glob.
  await scanDir(path.join(root, "agent"), "agent")
  await scanDir(path.join(root, "agents"), "agents")
}

/**
 * Custom agents from the active OpenCode-compatible config roots. A host bridge may
 * install a host-neutral bridge before loading this module; without one this
 * remains the direct OpenCode discovery path.
 */
export async function collectAgents(workspaceRoot: string): Promise<CollectedAgent[]> {
  const out = new Map<string, CollectedAgent>()
  const roots = uniquePaths([...opencodeProjectConfigDirs(workspaceRoot), ...opencodeGlobalConfigDirs()])
  for (const root of roots) await scanAgentRoot(root, out, roots)
  return [...out.values()]
}
