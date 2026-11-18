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

it("upsert inserts entry at end of agents map", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    await SubagentFile.upsert({ name: "beta", model: "cursor/b", description: "Beta." }, file)
    const text = await Bun.file(file).text()
    expect(text).toContain("  beta:")
    expect(text).toContain("  # keep me")
    expect(text.indexOf("beta")).toBeGreaterThan(text.indexOf("alpha"))
  } finally {
    rmSync(file, { force: true })
  }
})

it("upsert writes claudeAccount and reasoning when given", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    await SubagentFile.upsert(
      {
        name: "beta",
        model: "claude-code/claude-opus-5-5",
        reasoning: { high: "on", xhigh: "manual" },
        claudeAccount: "~/.claude4",
      },
      file,
    )
    const text = await Bun.file(file).text()
    expect(matter(text).data.agents.beta).toEqual({
      model: "claude-code/claude-opus-5-5",
      claudeAccount: "~/.claude4",
      reasoning: { high: "on", xhigh: "manual" },
    })
    // Keys in order model, claudeAccount, reasoning; reasoning is one flow-map line
    expect(text).toContain(
      '  beta:\n    model: "claude-code/claude-opus-5-5"\n    claudeAccount: "~/.claude4"\n    reasoning: { high: on, xhigh: manual }\n',
    )
  } finally {
    rmSync(file, { force: true })
  }
})

it("different model or claudeAccount for an existing name is rejected", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  seed(file)
  await SubagentFile.upsert({ name: "beta", model: "x/y", claudeAccount: "~/.a", reasoning: { low: "on" } }, file)
  const text = await Bun.file(file).text()
  await expect(SubagentFile.upsert({ name: "alpha", model: "x/y" }, file)).rejects.toThrow("different model")
  await expect(
    SubagentFile.upsert({ name: "beta", model: "other/y", reasoning: { low: "off" } }, file),
  ).rejects.toThrow("different model")
  await expect(SubagentFile.upsert({ name: "beta", model: "x/y", claudeAccount: "~/.b" }, file)).rejects.toThrow(
    "different claudeAccount",
  )
  expect(await Bun.file(file).text()).toBe(text)
})

it("upsert merges levels into the existing flow map and leaves other lines byte-identical", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  const lines = [
    "---",
    "mode: subagent",
    "agents:",
    "  # keep me",
    "  alpha:",
    "    model: openai/a",
    "    reasoning: {low: on,   high: off}  # old",
    "    description: Alpha.",
    "",
    "  # keep beta comment",
    "  beta:",
    "    model: openai/b",
    "---",
    "",
  ]
  await Bun.write(file, lines.join("\r\n"))
  await SubagentFile.upsert({ name: "alpha", model: "openai/a", reasoning: { high: "manual", max: "on" } }, file)
  const next = lines.slice()
  next[6] = "    reasoning: { low: on, high: manual, max: on }"
  expect(await Bun.file(file).text()).toBe(next.join("\r\n"))
  // Without an existing reasoning line, the key goes at the end of the entry
  await SubagentFile.upsert({ name: "beta", model: "openai/b", reasoning: { low: "off" } }, file)
  expect(matter(await Bun.file(file).text()).data.agents).toEqual({
    alpha: { model: "openai/a", reasoning: { low: "on", high: "manual", max: "on" }, description: "Alpha." },
    beta: { model: "openai/b", reasoning: { low: "off" } },
  })
  const text = await Bun.file(file).text()
  expect(text).toContain("  beta:\r\n    model: openai/b\r\n    reasoning: { low: off }\r\n---")
  expect(text).toContain("  # keep beta comment")
})

it("upsert replaces a block-style reasoning map", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  await Bun.write(
    file,
    "---\nagents:\n  alpha:\n    model: o/a\n    reasoning:\n      low: on\n      high: off\n    description: A.\n---\n",
  )
  await SubagentFile.upsert({ name: "alpha", model: "o/a", reasoning: { high: "on" } }, file)
  expect(await Bun.file(file).text()).toBe(
    "---\nagents:\n  alpha:\n    model: o/a\n    reasoning: { low: on, high: on }\n    description: A.\n---\n",
  )
})

it("toggling a pinned entry without claudeAccount keeps the pin", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "general.md")
  seed(file)
  await SubagentFile.upsert(
    { name: "pinned", model: "claude-code/m", claudeAccount: "~/.claude2", reasoning: { low: "on", high: "on" } },
    file,
  )
  await SubagentFile.upsert({ name: "pinned", model: "claude-code/m", reasoning: { high: "manual" } }, file)
  expect(matter(await Bun.file(file).text()).data.agents.pinned).toEqual({
    model: "claude-code/m",
    claudeAccount: "~/.claude2",
    reasoning: { low: "on", high: "manual" },
  })
})

it("owner, list, upsert and remove work across files in the config dir", async () => {
  await using tmp = await tmpdir()
  const entries = (name: string) => `---\nagents:\n  ${name}:\n    model: o/${name}\n    reasoning: { low: on }\n---\n`
  const first = path.join(tmp.path, "agents", "sub", "one.md")
  const second = path.join(tmp.path, "agent", "two.md")
  await Bun.write(first, entries("one"))
  await Bun.write(second, entries("two"))
  await Bun.write(path.join(tmp.path, "agents", "plain.md"), "---\nmode: subagent\n---\nbody\n")
  await Bun.write(path.join(tmp.path, "agents", "flow.md"), "---\nagents: {x: {model: o/x}}\n---\n")

  expect(await SubagentFile.owner("one", tmp.path)).toBe(first)
  expect(await SubagentFile.owner("two", tmp.path)).toBe(second)
  expect(await SubagentFile.owner("zzz", tmp.path)).toBeUndefined()
  expect(await SubagentFile.list(tmp.path)).toEqual([
    { name: "two", file: second },
    { name: "one", file: first },
  ])

  // An existing entry is edited in its owner even when another file is the default target
  await SubagentFile.upsert({ name: "two", model: "o/two", reasoning: { high: "manual" } }, first, tmp.path)
  expect(matter(await Bun.file(second).text()).data.agents.two.reasoning).toEqual({ low: "on", high: "manual" })
  expect(await Bun.file(first).text()).toBe(entries("one"))

  // A new entry goes to the passed file
  await SubagentFile.upsert({ name: "three", model: "o/three" }, first, tmp.path)
  expect(await SubagentFile.owner("three", tmp.path)).toBe(first)

  // Remove finds the owner, not the fallback file
  await SubagentFile.remove("two", first, tmp.path)
  expect(await SubagentFile.owner("two", tmp.path)).toBeUndefined()
  expect(matter(await Bun.file(second).text()).data.agents).toEqual({})
  expect((await SubagentFile.list(tmp.path)).map((item) => item.name)).toEqual(["one", "three"])
})

it("remove deletes entry block", async () => {
  const file = path.join(os.tmpdir(), `sub-${Date.now()}.md`)
  try {
    seed(file)
    await SubagentFile.upsert({ name: "beta", model: "cursor/b", reasoning: { low: "on" }, description: "Beta." }, file)
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
      await SubagentFile.upsert({ name: "BAD NAME", model: "x/y", description: "x" }, file)
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
  const entry = { name: "beta", model: "test/model", description: 'Model: "Test" # tag\nnext' }
  await SubagentFile.upsert(entry, file)
  const text = await Bun.file(file).text()
  expect(matter(text).data.agents.beta).toEqual({
    model: entry.model,
    description: entry.description,
  })
  expect(text).toContain("# keep header")
  expect(text.endsWith(body)).toBe(true)
  expect(text.replaceAll("\r\n", "")).not.toContain("\n")
  expect(await SubagentFile.names(file)).toEqual(["beta"])
  await SubagentFile.remove("beta", file)
  expect(matter(await Bun.file(file).text()).data.agents).toEqual({})
  await SubagentFile.upsert({ name: "again", model: "test/model" }, file)
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
    await expect(SubagentFile.upsert({ name: "beta", model: "test/b" }, file)).rejects.toThrow()
    await expect(SubagentFile.remove("alpha", file)).rejects.toThrow()
    expect(await Bun.file(file).text()).toBe(text)
  }
  expect(await SubagentFile.names(path.join(tmp.path, "missing.md"))).toEqual([])
})
