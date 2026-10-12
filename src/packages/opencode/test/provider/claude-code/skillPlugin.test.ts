import { expect, test } from "bun:test"
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
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
  mkdirSync(path.join(claudeSkills, "shared"), { recursive: true })
  const notes = skill(sources, "build-notes", "base")
  const models = skill(sources, "available-models")
  const shared = skill(sources, "shared")
  const projectClaude = skill(path.join(tmp.path, "proj", ".claude", "skills"), "local")

  expect(ensureSkillPlugin([notes, models, shared, projectClaude], plugin, claudeSkills)).toBe(plugin)
  expect(JSON.parse(readFileSync(path.join(plugin, ".claude-plugin", "plugin.json"), "utf8"))).toEqual({ name: "oc" })
  expect(readdirSync(path.join(plugin, "skills")).toSorted()).toEqual(["available-models", "build-notes"])
  expect(readFileSync(path.join(plugin, "skills", "build-notes", "SKILL.md"), "utf8")).toContain("# build-notes")

  // A changed set replaces the links and leaves the skill folders themselves alone.
  expect(ensureSkillPlugin([models], plugin, claudeSkills)).toBe(plugin)
  expect(readdirSync(path.join(plugin, "skills"))).toEqual(["available-models"])
  expect(existsSync(notes.location)).toBe(true)

  expect(
    ensureSkillPlugin([shared, { name: "customize-opencode", location: "<built-in>" }], plugin, claudeSkills),
  ).toBeUndefined()
})

test("poolSkillsDir points at the spawning account's own skills folder", () => {
  expect(poolSkillsDir("default")).toBe(path.join(homedir(), ".claude", "skills"))
  expect(poolSkillsDir(path.join("home", "me", ".claudeSecond"))).toBe(
    path.join("home", "me", ".claudeSecond", "skills"),
  )
})
