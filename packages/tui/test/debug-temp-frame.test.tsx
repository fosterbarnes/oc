import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { readFile } from "node:fs/promises"
import { DEFAULT_THEMES, generateSubtleSyntax, resolveTheme } from "../src/theme/index"
import { addDefaultParsers } from "@opentui/core"
import parsers from "../src/parsers-config"

// DEBUG_TEMP_FRAME: inspect raw markdown frame. Temporary, delete at cleanup.
addDefaultParsers(parsers.parsers)
const syntax = generateSubtleSyntax(resolveTheme(DEFAULT_THEMES["tokyonight"]!, "dark"))

// DEBUG_TEMP_FRAME: inspect raw markdown frame. Temporary, delete at cleanup.
const content = await readFile(
  "C:\\Users\\user\\AppData\\Local\\Temp\\opencode-debug\\msg22-text.md",
  "utf8",
).then((t) => t.trim())

test("DEBUG_TEMP_FRAME", async () => {
  for (const [label, text] of [
    ["trivial", "# hello\n\nworld\n"],
    ["real-streaming", content],
  ] as const) {
    const app = await testRender(
      () => (
        <box width={100}>
          <markdown
            syntaxStyle={syntax}
            streaming={label === "real-streaming"}
            internalBlockMode="top-level"
            tableOptions={{ style: "grid" }}
            content={text}
            conceal={true}
          />
        </box>
      ),
      { width: 100, height: 100 },
    )
    try {
      await app.renderOnce()
      await app.flush()
      await app.waitForVisualIdle().catch(() => undefined)
      const frame = app.captureCharFrame()
      const rows = frame.split("\n").filter((r) => r.trim().length > 0)
      console.log(`CASE=${label} ROWS=${rows.length}`)
      console.log(rows.slice(0, 10).join("\n"))
    } finally {
      app.renderer.destroy()
    }
  }
  expect(true).toBe(true)
})
