/**
 * oc skills reach Claude Code as native skills: a generated plugin folder
 * (`--plugin-dir`) whose `skills/<name>` entries are directory junctions to
 * each oc skill folder. Claude Code lists only names and descriptions and
 * loads a skill's body when it is used, so nothing is copied and nothing is
 * pasted into the prompt. Skills Claude Code already loads itself (anything
 * under a `.claude/skills` folder, or a name in `~/.claude/skills`) are left
 * out so they never appear twice.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { log } from "./logger.js"
import { rawOpencodeClient } from "./runtime-status.js"

export type SkillSource = { name: string; location: string }

const PLUGIN_NAME = "oc"
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/** Hash of the linked set, so an unchanged skill set is never rebuilt. */
let builtHash: string | undefined

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
 * Build (or reuse) the plugin folder for `skills` and return its path, or
 * undefined when no skill needs linking. `root` is a seam for checks.
 */
export function ensureSkillPlugin(
  skills: readonly SkillSource[],
  root = path.join(Global.Path.data, "claude-code", "skill-plugin"),
  claudeSkillsDir = path.join(homedir(), ".claude", "skills"),
): string | undefined {
  const native = new Set(existsSync(claudeSkillsDir) ? readdirSync(claudeSkillsDir) : [])
  const links = skills
    .filter((skill) => SAFE_NAME.test(skill.name) && !native.has(skill.name))
    .filter((skill) => path.isAbsolute(skill.location) && !isClaudeSkill(skill.location))
    .map((skill) => ({ name: skill.name, target: path.dirname(skill.location) }))
    .toSorted((a, b) => a.name.localeCompare(b.name))
  if (links.length === 0) return undefined

  const hash = Bun.hash(JSON.stringify([root, links])).toString(36)
  const skillsDir = path.join(root, "skills")
  if (builtHash === hash && existsSync(skillsDir)) return root

  // Junctions are removed without touching the skill folders they point at.
  rmSync(skillsDir, { recursive: true, force: true })
  mkdirSync(skillsDir, { recursive: true })
  mkdirSync(path.join(root, ".claude-plugin"), { recursive: true })
  writeFileSync(path.join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name: PLUGIN_NAME }))
  for (const link of links) symlinkSync(link.target, path.join(skillsDir, link.name), "junction")
  builtHash = hash
  log.info("linked oc skills for claude code", { root, skills: links.length })
  return root
}

function isClaudeSkill(location: string) {
  return location.split(/[\\/]/).some((part, index, parts) => part === ".claude" && parts[index + 1] === "skills")
}
