import { describe, expect, test } from "bun:test"
import { orderPaletteEntries } from "../../src/component/command-palette"

describe("command palette ordering", () => {
  const entries = [
    { command: { name: "system.help", title: "Help", category: "System" } },
    { command: { name: "oc.model", title: "Model", category: "oc" } },
    { command: { name: "plugin.run", title: "Run", category: "Plugin" } },
    { command: { name: "oc.default", title: "Agent", category: "oc", group: "Defaults" } },
    { command: { name: "session.share", title: "Share session", category: "Session" } },
    { command: { name: "oc.new", title: "New session", category: "oc" } },
    { command: { name: "session.list", title: "Switch session", category: "Session" } },
  ]
  const names = (list: readonly { command: { name: string } }[]) => list.map((entry) => entry.command.name)

  // Keymap entries arrive newest layer first, so re-registration must not change the result.
  test("orders by category rank, group, then title regardless of input order", () => {
    const expected = ["session.share", "session.list", "oc.model", "oc.new", "oc.default", "system.help", "plugin.run"]
    expect(names(orderPaletteEntries(entries))).toEqual(expected)
    expect(names(orderPaletteEntries(entries.toReversed()))).toEqual(expected)
  })

  test("places configured commands first within their category", () => {
    expect(names(orderPaletteEntries(entries, { "session.list": 1, "oc.new": 2 }))).toEqual([
      "session.list",
      "session.share",
      "oc.new",
      "oc.model",
      "oc.default",
      "system.help",
      "plugin.run",
    ])
  })
})
