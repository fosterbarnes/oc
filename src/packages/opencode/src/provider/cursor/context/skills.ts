import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { homedir } from "node:os"
import { Glob } from "@opencode-ai/core/util/glob"
import { opencodeGlobalConfigDirs, opencodeProjectConfigDirs } from "./paths.js"

export type CollectedSkill = {
  fullPath: string
  name: string
  description: string
  content: string
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

function parseFrontmatter(raw: string): { name?: string; description?: string; body: string } {
  if (!raw.startsWith("---")) return { body: raw }
  const end = raw.indexOf("\n---", 3)
  if (end < 0) return { body: raw }
  const fm = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\n/, "")
  let name: string | undefined
  let description: string | undefined
  for (const line of fm.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const key = m[1]!
    const trimmed = m[2]!.trim()
    const quoted =
      (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    const val = quoted ? trimmed.slice(1, -1) : trimmed
    if (key === "name") name = val
    if (key === "description") description = val
  }
  return { name, description, body }
}

async function loadSkillFile(file: string): Promise<CollectedSkill | undefined> {
  try {
    const raw = await readFile(file, "utf-8")
    const { name, description, body } = parseFrontmatter(raw)
    const dirName = path.basename(path.dirname(file))
    return {
      fullPath: path.resolve(file),
      name: name || dirName,
      description: description || "",
      content: body.slice(0, 20_000),
    }
  } catch {
    return undefined
  }
}

async function scanSkillsRoot(root: string, out: Map<string, CollectedSkill>): Promise<void> {
  if (!(await exists(root))) return
  // Same `**/SKILL.md` scan as the host skill loader (util/fingerprint.ts), so nested and linked skills
  // count the same way on both sides.
  const files = await Glob.scan("**/SKILL.md", {
    cwd: root,
    absolute: true,
    include: "file",
    symlink: true,
    dot: true,
  }).catch(() => [] as string[])
  for (const skillMd of files.toSorted()) {
    const skill = await loadSkillFile(skillMd)
    // Later roots win, like the host loader.
    if (skill) out.set(skill.name, skill)
  }
}

/** `dir` and its ancestors up to `stop`, nearest first. */
function ancestors(dir: string, stop: string): string[] {
  const out: string[] = []
  let cur = path.resolve(dir)
  const root = path.resolve(stop)
  for (;;) {
    out.push(cur)
    if (cur === root) break
    const parent = path.dirname(cur)
    if (parent === cur) break
    cur = parent
  }
  return out
}

/**
 * Discover skills the way OpenCode does: `.opencode/skills`, global opencode,
 * plus `.claude/skills` and `.agents/skills` (project + home). Root order and
 * later-wins precedence match the host loader (src/skill/index.ts discoverRoots).
 */
export async function collectSkills(workspaceRoot: string, worktree: string): Promise<CollectedSkill[]> {
  const out = new Map<string, CollectedSkill>()
  const home = homedir()
  const dirs = ancestors(workspaceRoot, worktree)
  const external = (dir: string) => [path.join(dir, ".claude", "skills"), path.join(dir, ".agents", "skills")]

  const roots = [
    ...external(home),
    // Outer directories first, .claude before .agents within each.
    ...dirs.toReversed().flatMap(external),
    ...opencodeGlobalConfigDirs().map((dir) => path.join(dir, "skills")),
    // Host config.directories() lists `.opencode` dirs nearest first, so the outermost wins.
    ...opencodeProjectConfigDirs(workspaceRoot).flatMap((projectDir) => {
      const relative = path.relative(workspaceRoot, projectDir)
      return dirs.map((dir) => path.join(dir, relative, "skills"))
    }),
  ]
  for (const root of roots) await scanSkillsRoot(root, out)

  return [...out.values()]
}
