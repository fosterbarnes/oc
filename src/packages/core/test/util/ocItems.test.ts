import { describe, expect, test } from "bun:test"
import { OcItems } from "../../src/util/ocItems"

// Inline credentials must never leave the serving machine, and the importer must keep its own.
describe("secrets", () => {
  test("redact hides inline keys and keeps references", () => {
    const value = {
      options: { apiKey: "sk-live", baseURL: "https://x" },
      headers: { Authorization: "Bearer abc" },
      env: { apiKey: "{env:KEY}", token: "{file:~/.key}" },
    }
    expect(OcItems.redact(value)).toEqual({
      options: { apiKey: OcItems.REDACTED, baseURL: "https://x" },
      headers: { Authorization: OcItems.REDACTED },
      env: { apiKey: "{env:KEY}", token: "{file:~/.key}" },
    })
  })

  test("restoreRedacted keeps the local value or drops the key", () => {
    const peer = { options: { apiKey: OcItems.REDACTED, baseURL: "u" }, other: { token: OcItems.REDACTED } }
    expect(OcItems.restoreRedacted(peer, { options: { apiKey: "sk-local" } })).toEqual({
      options: { apiKey: "sk-local", baseURL: "u" },
      other: {},
    })
  })
})

describe("rewriteHome", () => {
  test("maps every Windows form to forward slashes", () => {
    const from = "C:\\Users\\Foster"
    expect(OcItems.rewriteHome('"C:\\\\Users\\\\Foster\\\\a\\\\b.md"', from, "/Users/foster")).toBe(
      '"/Users/foster/a/b.md"',
    )
    expect(OcItems.rewriteHome("see c:/users/foster/x y", from, "/Users/foster")).toBe("see /Users/foster/x y")
    expect(OcItems.rewriteHome("/home/fb/.config", "/home/fb", from)).toBe("C:/Users/Foster/.config")
  })

  test("leaves a longer folder name with the same prefix alone", () => {
    expect(OcItems.rewriteHome("C:\\Users\\FosterX\\a", "C:\\Users\\Foster", "/Users/foster")).toBe(
      "C:\\Users\\FosterX\\a",
    )
  })
})

// Sync exclusions: re-including one item inside an excluded group must not re-include its siblings.
describe("exclude tree", () => {
  const item = (id: string): OcItems.Item => {
    const [category, root, label] = id.split(":")
    return {
      kind: "files",
      id,
      category: category as OcItems.Category,
      label,
      code: false,
      root: root as OcItems.Root,
      files: [],
    }
  }
  const items = ["skill:config:a/one", "skill:config:a/two", "skill:config:b", "skill:legacy:c"].map(item)
  const nodes = OcItems.tree(items)
  const excludedIds = (exclude: string[]) =>
    items.filter((entry) => OcItems.excluded(entry.id, [], exclude)).map((entry) => entry.id)

  test("including a leaf under an excluded category brings back only that leaf", () => {
    const category = nodes.find((node) => node.key === "skill:")!
    const leaf = nodes.find((node) => node.key === "skill:config:a/one")!
    const exclude = OcItems.includeNode(OcItems.excludeNode([], category), leaf, nodes)
    expect(excludedIds(exclude)).toEqual(["skill:config:a/two", "skill:config:b", "skill:legacy:c"])
  })

  test("an item key does not cover a longer id with the same start", () => {
    expect(OcItems.excluded("tui:theme_mode", [], ["tui:theme"])).toBe(false)
    expect(OcItems.excluded("tui:theme", [], ["tui:theme"])).toBe(true)
  })
})
