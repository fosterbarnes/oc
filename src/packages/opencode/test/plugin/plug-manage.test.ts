import { describe, expect, test } from "bun:test"
import path from "path"
import { parse as parseJsonc } from "jsonc-parser"
import { pluginInventory } from "../../src/cli/cmd/plug"
import { removePluginConfig } from "../../src/plugin/install"
import { tmpdir } from "../fixture/fixture"

describe("oc plug inventory", () => {
  test("merges server and tui origins of one package into one row", () => {
    const rows = pluginInventory([
      { kind: "server", origin: { spec: "oc-demo@1.2.0", source: "/g/opencode.json", scope: "global" } },
      {
        kind: "server",
        origin: { spec: ["oc-opts", { a: 1 }], source: "/p/.opencode/opencode.jsonc", scope: "local" },
      },
      { kind: "tui", origin: { spec: "oc-demo", source: "/g/tui.json", scope: "global" } },
      {
        kind: "server",
        origin: { spec: "file:///C:/p/.opencode/plugin/x.ts", source: "/p/.opencode", scope: "local" },
      },
    ])
    expect(rows).toEqual([
      {
        name: "oc-demo",
        spec: "oc-demo@1.2.0",
        kinds: ["server", "tui"],
        scope: "global",
        sources: ["/g/opencode.json", "/g/tui.json"],
      },
      { name: "oc-opts", spec: "oc-opts", kinds: ["server"], scope: "local", sources: ["/p/.opencode/opencode.jsonc"] },
      {
        name: "file:///C:/p/.opencode/plugin/x.ts",
        spec: "file:///C:/p/.opencode/plugin/x.ts",
        kinds: ["server"],
        scope: "local",
        sources: ["/p/.opencode"],
      },
    ])
  })
})

describe("removePluginConfig", () => {
  test("removes every entry for the package and keeps comments and other plugins", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "opencode.jsonc")
    await Bun.write(
      file,
      `{
  // keep me
  "plugin": ["oc-demo", "oc-other", ["oc-demo@1.2.0", { "a": 1 }]],
}
`,
    )
    expect(await removePluginConfig(file, "oc-demo@2.0.0")).toBe(true)
    const text = await Bun.file(file).text()
    expect(text).toContain("// keep me")
    expect(parseJsonc(text, [], { allowTrailingComma: true }).plugin).toEqual(["oc-other"])
  })

  test("returns false when the file does not list it or does not exist", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "tui.json")
    await Bun.write(file, `{ "plugin": ["oc-other"] }`)
    expect(await removePluginConfig(file, "oc-demo")).toBe(false)
    expect(await removePluginConfig(path.join(tmp.path, "missing.json"), "oc-demo")).toBe(false)
  })
})
