import { describe, expect, test } from "bun:test"
import path from "path"
import { ConfigAgent } from "@/config/agent"
import { Filesystem } from "@/util/filesystem"
import { tmpdir } from "../fixture/fixture"

// plain helper for scan: write markdown under dir/{agent,agents}/...
async function writeAgent(dir: string, file: string, content: string) {
  await Filesystem.write(path.join(dir, file), content)
}

describe("ConfigAgent.scan", () => {
  test("discovers valid agents and nested names", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/helper.md", `---\nmodel: test/model\nmode: subagent\n---\nHelper prompt`)
    await writeAgent(tmp.path, "agents/nested/child.md", `---\nmodel: test/model\nmode: subagent\n---\nNested prompt`)
    await writeAgent(tmp.path, "agent/legacy.md", `---\nmodel: test/model\n---\nLegacy singular`)
    const { agents, diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(diagnostics.length).toBe(0)
    expect(agents["helper"]).toMatchObject({ name: "helper", mode: "subagent", prompt: "Helper prompt" })
    expect(agents["nested/child"]).toMatchObject({ name: "nested/child", mode: "subagent" })
    expect(agents["legacy"]).toMatchObject({ name: "legacy" })
  })

  test("resilient to malformed YAML sibling", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/valid.md", `---\nmodel: test/model\nmode: subagent\n---\nValid`)
    // invalid yaml: unclosed quote
    await writeAgent(tmp.path, "agents/bad-yaml.md", `---\nmodel: "unclosed\nmode: subagent\n---\nbad`)
    const { agents, diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(agents["valid"]).toBeDefined()
    expect(agents["bad-yaml"]).toBeUndefined()
    expect(diagnostics.length).toBe(1)
    expect(diagnostics[0].path).toBe(path.join(tmp.path, "agents/bad-yaml.md"))
    expect(diagnostics[0].message.length).toBeGreaterThan(0)
  })

  test("resilient to invalid schema sibling", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/valid.md", `---\nmodel: test/model\n---\nValid`)
    await writeAgent(tmp.path, "agents/bad-schema.md", `---\nmodel: 123\nmode: subagent\n---\nbad schema`)
    const { agents, diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(agents["valid"]).toBeDefined()
    expect(agents["bad-schema"]).toBeUndefined()
    expect(diagnostics.length).toBe(1)
    expect(diagnostics[0].path).toContain("bad-schema.md")
  })

  test("resilient to missing {file:...} include", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/valid.md", `---\nmodel: test/model\n---\nValid`)
    await writeAgent(
      tmp.path,
      "agents/bad-include.md",
      `---\nmodel: test/model\nprompt: "{file:missing.txt}"\n---\nbody`,
    )
    const { agents, diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(agents["valid"]).toBeDefined()
    expect(agents["bad-include"]).toBeUndefined()
    expect(diagnostics[0].path).toContain("bad-include.md")
    expect(diagnostics[0].message).toContain("bad file reference")
  })

  test("scan is deterministic and exposes absolute paths", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/b.md", `---\nmode: subagent\n---\nB`)
    await writeAgent(tmp.path, "agents/a.md", `---\nmodel: 123\n---\nbad`)
    const { diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(diagnostics.length).toBe(1)
    expect(path.isAbsolute(diagnostics[0].path)).toBe(true)
    // run twice gives same order/message
    const second = await ConfigAgent.scan(tmp.path)
    expect(second.diagnostics[0].path).toBe(diagnostics[0].path)
    expect(second.diagnostics[0].message).toBe(diagnostics[0].message)
  })

  test("valid {file:...} include resolves", async () => {
    await using tmp = await tmpdir()
    await Filesystem.write(path.join(tmp.path, "shared.txt"), "shared prompt")
    await writeAgent(
      tmp.path,
      "agents/with-include.md",
      `---\nmodel: test/model\nprompt: "{file:../shared.txt}"\n---\nbody`,
    )
    const { agents, diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(diagnostics.length).toBe(0)
    expect(agents["with-include"].prompt).toContain("shared prompt")
    expect(agents["with-include"].prompt).toContain("body")
  })
})

describe("ConfigAgent.scan - global/project", () => {
  test("discovers global and project agents together via scan", async () => {
    await using g = await tmpdir()
    await using p = await tmpdir()
    await writeAgent(g.path, "agents/global-agent.md", `---\nmodel: test/model\nmode: subagent\n---\nGlobal`)
    await writeAgent(p.path, "agents/project-agent.md", `---\nmodel: test/model\nmode: subagent\n---\nProject`)
    const gre = await ConfigAgent.scan(g.path)
    const pre = await ConfigAgent.scan(p.path)
    const merged = { ...gre.agents, ...pre.agents }
    expect(merged["global-agent"].prompt).toBe("Global")
    expect(merged["project-agent"].prompt).toBe("Project")
  })

  test("nested names stable via scan", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/a/b/deep.md", `---\nmodel: test/model\nmode: subagent\n---\nDeep`)
    const { agents } = await ConfigAgent.scan(tmp.path)
    expect(agents["a/b/deep"]).toBeDefined()
    expect(agents["a/b/deep"].prompt).toBe("Deep")
  })

  test("startup diagnostics expose per-file path and reason", async () => {
    await using tmp = await tmpdir()
    await writeAgent(tmp.path, "agents/valid.md", `---\nmodel: test/model\n---\nValid`)
    await writeAgent(
      tmp.path,
      "agents/bad-include.md",
      `---\nmodel: test/model\nprompt: "{file:missing.txt}"\n---\nbody`,
    )
    await writeAgent(tmp.path, "agents/bad-schema.md", `---\nmodel: 123\n---\nbad`)
    const { agents, diagnostics } = await ConfigAgent.scan(tmp.path)
    expect(agents["valid"]).toBeDefined()
    expect(agents["bad-include"]).toBeUndefined()
    expect(agents["bad-schema"]).toBeUndefined()
    expect(diagnostics.length).toBe(2)
    const byPath = Object.fromEntries(diagnostics.map((d) => [path.basename(d.path), d.message]))
    expect(byPath["bad-include.md"]).toContain("bad file reference")
    expect(byPath["bad-schema.md"].length).toBeGreaterThan(0)
    // deterministic absolute paths
    for (const d of diagnostics) expect(path.isAbsolute(d.path)).toBe(true)
    diagnostics.sort((a, b) => a.path.localeCompare(b.path))
    const sorted = [...diagnostics].sort((a, b) => a.path.localeCompare(b.path))
    expect(diagnostics.map((d) => d.path)).toEqual(sorted.map((d) => d.path))
  })
})
