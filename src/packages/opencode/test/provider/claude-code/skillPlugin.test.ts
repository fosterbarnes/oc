import { expect, test } from "bun:test"
import { existsSync, mkdirSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { ensureSkillPlugin, poolSkillsDir } from "@/provider/claude-code/skillPlugin"
import { tmpdir } from "../../fixture/fixture"

function skill(root: string, name: string, group = "") {
  const dir = path.join(root, group, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n# ${name}\n`)
  return { name, location: path.join(dir, "SKILL.md") }
}

test("ensureSkillPlugin links oc skills, skips Claude Code's own, and rebuilds on change", async () => {
  await using tmp = await tmpdir()
  const sources = path.join(tmp.path, "ocSkills")
  const claudeSkills = path.join(tmp.path, "claudeSkills")
  const plugin = path.join(tmp.path, "plugin")
  skill(claudeSkills, "shared")
  const notes = skill(sources, "build-notes", "base")
  const models = skill(sources, "available-models")
  const shared = skill(sources, "shared")
  const projectClaude = skill(path.join(tmp.path, "proj", ".claude", "skills"), "local")

  const first = ensureSkillPlugin([notes, models, shared, projectClaude], plugin, claudeSkills)!
  expect(path.dirname(first)).toBe(plugin)
  expect(JSON.parse(readFileSync(path.join(first, ".claude-plugin", "plugin.json"), "utf8"))).toEqual({ name: "oc" })
  expect(readdirSync(path.join(first, "skills")).toSorted()).toEqual(["available-models", "build-notes"])
  expect(readFileSync(path.join(first, "skills", "build-notes", "SKILL.md"), "utf8")).toContain("# build-notes")
  expect(ensureSkillPlugin([notes, models], plugin, claudeSkills)).toBe(first)

  // A changed set gets its own folder; another project's folder stays while it is in use.
  const second = ensureSkillPlugin([models], plugin, claudeSkills)!
  expect(second).not.toBe(first)
  expect(readdirSync(path.join(second, "skills"))).toEqual(["available-models"])
  expect(readdirSync(path.join(first, "skills")).toSorted()).toEqual(["available-models", "build-notes"])

  // A folder unused for over a day is pruned, leaving the skill folders themselves alone.
  const old = new Date(Date.now() - 2 * 24 * 60 * 60_000)
  utimesSync(first, old, old)
  ensureSkillPlugin([notes], plugin, claudeSkills)
  expect(existsSync(first)).toBe(false)
  expect(existsSync(second)).toBe(true)
  expect(existsSync(notes.location)).toBe(true)

  expect(
    ensureSkillPlugin([shared, { name: "customize-opencode", location: "<built-in>" }], plugin, claudeSkills),
  ).toBeUndefined()
})

test("a different same-name Claude skill does not hide oc's version", async () => {
  await using tmp = await tmpdir()
  const claudeSkills = path.join(tmp.path, "claudeSkills")
  const stale = skill(claudeSkills, "build-notes")
  writeFileSync(stale.location, "---\nname: build-notes\n---\n# older\n")
  const current = skill(path.join(tmp.path, "ocSkills"), "build-notes")

  const folder = ensureSkillPlugin([current], path.join(tmp.path, "plugin"), claudeSkills)!
  expect(readFileSync(path.join(folder, "skills", "build-notes", "SKILL.md"), "utf8")).toContain("# build-notes")
})

test("poolSkillsDir points at the spawning account's own skills folder", () => {
  expect(poolSkillsDir("default")).toBe(path.join(homedir(), ".claude", "skills"))
  expect(poolSkillsDir(path.join("home", "me", ".claudeSecond"))).toBe(
    path.join("home", "me", ".claudeSecond", "skills"),
  )
})
