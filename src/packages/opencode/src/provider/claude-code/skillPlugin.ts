/**
 * oc skills reach Claude Code as native skills: a generated plugin folder
 * (`--plugin-dir`) whose `skills/<name>` entries are directory junctions to
 * each oc skill folder. Claude Code lists only names and descriptions and
 * loads a skill's body when it is used, so nothing is copied and nothing is
 * pasted into the prompt. Skills the spawning account's own config dir already
 * loads itself (anything under a `<configDir>/skills` folder) are left out so
 * they never appear twice.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { poolConfigDir } from "./accounts.js"
import { log } from "./logger.js"
import { rawOpencodeClient } from "./runtimeStatus.js"

export type SkillSource = { name: string; location: string }

const PLUGIN_NAME = "oc"
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** A link-set folder unused this long is pruned; a live `claude` may still read a younger one. */
const STALE_FOLDER_MS = 24 * 60 * 60_000

/** oc's live skill list for a directory, or undefined when opencode did not answer. */
export async function fetchOpencodeSkills(directory: string): Promise<SkillSource[] | undefined> {
  const client = rawOpencodeClient()
  if (!client) return undefined
  const response = await client.get({ url: "/skill", query: { directory } }).catch((error: unknown) => ({
    data: undefined,
    error,
  }))
  if (response.error !== undefined || !Array.isArray(response.data)) {
    log.warn("failed to read opencode skills", { error: String(response.error) })
    return undefined
  }
  return response.data.flatMap((item: unknown) => {
    const skill = item as Partial<SkillSource> | null
    return typeof skill?.name === "string" && typeof skill.location === "string"
      ? [{ name: skill.name, location: skill.location }]
      : []
  })
}

/**
 * Skills folder the spawning pool account's CLI reads: its own
 * `CLAUDE_CONFIG_DIR`, or the default `~/.claude` when it spawns with the
 * inherited environment. Pool ids are resolved config dirs (accounts.ts).
 */
export function poolSkillsDir(account: string): string {
  const dir = poolConfigDir(account)
  return dir ? path.join(dir, "skills") : path.join(homedir(), ".claude", "skills")
}

/**
 * Build (or reuse) the plugin folder for `skills` and return its path, or
 * undefined when no skill needs linking. `root` is a seam for checks.
 * `accountSkillsDir` is the spawning account's own skills folder
 * (poolSkillsDir); skills it already loads are left out.
 *
 * One folder per link set under `root`: projects on one resident server can
 * link different skills, and a running `claude` keeps reading its folder, so
 * a build never replaces another set's folder in place.
 */
export function ensureSkillPlugin(
  skills: readonly SkillSource[],
  root = path.join(Global.Path.data, "claude-code", "skillPlugin"),
  claudeSkillsDir = path.join(homedir(), ".claude", "skills"),
): string | undefined {
  const native = new Set(existsSync(claudeSkillsDir) ? readdirSync(claudeSkillsDir) : [])
  const links = skills
    .filter((skill) => SAFE_NAME.test(skill.name) && !native.has(skill.name))
    .filter((skill) => path.isAbsolute(skill.location) && !isClaudeSkill(skill.location))
    .map((skill) => ({ name: skill.name, target: path.dirname(skill.location) }))
    .toSorted((a, b) => a.name.localeCompare(b.name))
  if (links.length === 0) return undefined

  const hash = Bun.hash(JSON.stringify(links)).toString(36)
  const folder = path.join(root, hash)
  // Written last, so a folder without it is a build that died partway.
  const manifest = path.join(folder, ".claude-plugin", "plugin.json")
  const now = new Date()
  if (existsSync(manifest)) {
    // Marks the folder in use, so the prune below spares it.
    utimesSync(folder, now, now)
    return folder
  }

  // Junctions are removed without touching the skill folders they point at.
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(path.join(folder, "skills"), { recursive: true })
  for (const link of links) symlinkSync(link.target, path.join(folder, "skills", link.name), "junction")
  mkdirSync(path.dirname(manifest), { recursive: true })
  writeFileSync(manifest, JSON.stringify({ name: PLUGIN_NAME }))
  for (const entry of readdirSync(root)) {
    const stale = path.join(root, entry)
    const mtimeMs = statSync(stale, { throwIfNoEntry: false })?.mtimeMs ?? now.getTime()
    if (entry !== hash && now.getTime() - mtimeMs > STALE_FOLDER_MS) rmSync(stale, { recursive: true, force: true })
  }
  log.info("linked oc skills for claude code", { folder, skills: links.length })
  return folder
}

function isClaudeSkill(location: string) {
  return location.split(/[\\/]/).some((part, index, parts) => part === ".claude" && parts[index + 1] === "skills")
}
