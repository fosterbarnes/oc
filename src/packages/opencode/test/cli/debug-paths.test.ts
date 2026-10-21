import { describe, expect, test } from "bun:test"
import { selectDebugPaths } from "@/cli/cmd/debug"

const paths = { data: "/home/u/.local/share/opencode", config: "/home/u/.config/opencode", db: "/data/opencode.db" }

describe("debug paths", () => {
  test("no name prints every path as an aligned table", () => {
    expect(selectDebugPaths(paths)).toEqual({
      ok: true,
      text: [
        "data       /home/u/.local/share/opencode",
        "config     /home/u/.config/opencode",
        "db         /data/opencode.db",
      ].join("\n"),
    })
  })

  test("a name prints only that path", () => {
    expect(selectDebugPaths(paths, "db")).toEqual({ ok: true, text: "/data/opencode.db" })
  })

  test("an unknown name lists the valid names", () => {
    expect(selectDebugPaths(paths, "toString")).toEqual({
      ok: false,
      error: 'Unknown path "toString". Valid names: data, config, db',
    })
  })
})
