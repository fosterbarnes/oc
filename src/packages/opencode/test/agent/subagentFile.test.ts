import { expect, it } from "bun:test"
import matter from "gray-matter"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { SubagentFile } from "../../src/agent/subagentFile"
import { tmpdir } from "../fixture/fixture"

function seed(file: string) {
  const dir = path.dirname(file)
  mkdirSync(dir, { recursive: true })
  const text = [
    "---",
    "mode: subagent",
    "agents:",
    "  # keep me",
    "  alpha:",
    "    model: openai/a",
    "    description: Alpha.",
    "---",
    "",
  ].join("\n")
  writeFileSync(file, text)
}

it("add inserts entry at end of agents map", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    await SubagentFile.add({ name: "beta", model: "cursor/b", description: "Beta." }, file)
    const text = await Bun.file(file).text()
    expect(text).toContain("  beta:")
    expect(text).toContain("  # keep me")
    expect(text.indexOf("beta")).toBeGreaterThan(text.indexOf("alpha"))
  } finally {
    rmSync(file, { force: true })
  }
})

it("duplicate name is rejected", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    let err: Error | undefined
    try {
      await SubagentFile.add({ name: "alpha", model: "x/y", description: "dup" }, file)
    } catch (e) {
      err = e as Error
    }
    expect(err?.message).toContain("already exists")
  } finally {
    rmSync(file, { force: true })
  }
})

it("remove deletes entry block", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    await SubagentFile.add({ name: "beta", model: "cursor/b", variant: "low", description: "Beta." }, file)
    await SubagentFile.remove("beta", file)
    const text = await Bun.file(file).text()
    expect(text).not.toContain("  beta:")
    expect(text).toContain("  # keep me")
    expect(text).toContain("  alpha:")
  } finally {
    rmSync(file, { force: true })
  }
})

it("remove missing file and name throw", async () => {
  const missing = path.join(os.tmpdir(), `no-${Date.now()}.md`)
  let fileErr: Error | undefined
  try {
    await SubagentFile.remove("alpha", missing)
  } catch (e) {
    fileErr = e as Error
  }
  expect(fileErr?.message).toContain("not found")

  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    let nameErr: Error | undefined
    try {
      await SubagentFile.remove("zzz", file)
    } catch (e) {
      nameErr = e as Error
    }
    expect(nameErr?.message).toContain("not found")
  } finally {
    rmSync(file, { force: true })
  }
})

it("invalid name rejected", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    let err: Error | undefined
    try {
      await SubagentFile.add({ name: "BAD NAME", model: "x/y", description: "x" }, file)
    } catch (e) {
      err = e as Error
    }
    expect(err?.message).toContain("invalid")
  } finally {
    rmSync(file, { force: true })
  }
})

it("quotes YAML scalars and preserves header comments, CRLF and body", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  const body = "agents:\r\n  beta:\r\n    description: body only\r\n"
  await Bun.write(file, `---\r\nmode: subagent\r\nagents: {} # keep header\r\n---\r\n${body}`)
  const entry = { name: "beta", model: "test/model", variant: "null", description: 'Model: "Test" # tag\nnext' }
  await SubagentFile.add(entry, file)
  const text = await Bun.file(file).text()
  expect(matter(text).data.agents.beta).toEqual({
    model: entry.model,
    variant: entry.variant,
    description: entry.description,
  })
  expect(text).toContain("# keep header")
  expect(text.endsWith(body)).toBe(true)
  expect(text.replaceAll("\r\n", "")).not.toContain("\n")
  expect(await SubagentFile.names(file)).toEqual(["beta"])
  await SubagentFile.remove("beta", file)
  expect(matter(await Bun.file(file).text()).data.agents).toEqual({})
  await SubagentFile.add({ name: "again", model: "test/model" }, file)
  expect(await SubagentFile.names(file)).toEqual(["again"])
})

it("removes complete entries with internal blanks without touching other maps or body", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  const text = [
    "---",
    "other:",
    "  alpha:",
    "    keep: true",
    "agents:",
    '  "alpha":',
    "    model: test/a",
    "",
    "    description: |",
    "      first",
    "",
    "      second",
    "      # literal content",
    "",
    "  # keep beta comment",
    "  beta:",
    "    model: test/b",
    "---",
    "agents:",
    "  alpha:",
    "    body: true",
    "",
  ].join("\n")
  await Bun.write(file, text)
  await SubagentFile.remove("alpha", file)
  const next = await Bun.file(file).text()
  expect(matter(next).data).toEqual({ other: { alpha: { keep: true } }, agents: { beta: { model: "test/b" } } })
  expect(next).toContain("  # keep beta comment")
  expect(next.endsWith("agents:\n  alpha:\n    body: true\n")).toBe(true)
  await expect(SubagentFile.remove("alpha", file)).rejects.toThrow("not found")
  expect(await Bun.file(file).text()).toBe(next)
})

it("refuses malformed YAML and ambiguous edits without changing the file", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  for (const text of ["---\nagents:\n  alpha: [\n---\n", "---\nagents: {alpha: {model: test/a}}\n---\n"]) {
    await Bun.write(file, text)
    await expect(SubagentFile.add({ name: "beta", model: "test/b" }, file)).rejects.toThrow()
    await expect(SubagentFile.remove("alpha", file)).rejects.toThrow()
    expect(await Bun.file(file).text()).toBe(text)
  }
  expect(await SubagentFile.names(path.join(tmp.path, "missing.md"))).toEqual([])
})
