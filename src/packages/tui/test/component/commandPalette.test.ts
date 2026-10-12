import { describe, expect, test } from "bun:test"
import { orderPaletteEntries } from "../../src/component/command-palette"

describe("command palette ordering", () => {
  test("keeps source slots when unset and places configured commands first within a category", () => {
    const entries = [
      { command: { name: "oc.default-agent", category: "oc" } },
      { command: { name: "session.new", category: "Session" } },
      { command: { name: "oc.model", category: "oc" } },
      { command: { name: "oc.new", category: "oc" } },
      { command: { name: "oc.agent", category: "oc" } },
      { command: { name: "oc.model-copy", category: "oc" } },
    ]

    expect(orderPaletteEntries(entries).map((entry) => entry.command.name)).toEqual([
      "oc.default-agent",
      "session.new",
      "oc.model",
      "oc.new",
      "oc.agent",
      "oc.model-copy",
    ])

    expect(
      orderPaletteEntries(entries, { "oc.new": 1, "oc.model": 3, "oc.model-copy": 3 }).map(
        (entry) => entry.command.name,
      ),
    ).toEqual(["oc.new", "session.new", "oc.model", "oc.model-copy", "oc.default-agent", "oc.agent"])
  })
})
