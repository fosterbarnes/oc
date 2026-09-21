import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import { addDefaultParsers } from "@opentui/core"
import { readFile } from "node:fs/promises"
import { DEFAULT_THEMES, generateSubtleSyntax, resolveTheme } from "../src/theme/index"
import parsers from "../src/parsers-config"

// DEBUG_TEMP_SPOOKY2: exact-geometry repro. Temporary, delete at cleanup.
addDefaultParsers(parsers.parsers)
const syntax = generateSubtleSyntax(resolveTheme(DEFAULT_THEMES["tokyonight"]!, "dark"))
const dir = "C:\\Users\\user\\AppData\\Local\\Temp\\opencode-debug"
const md22 = await readFile(`${dir}\\msg22-text.md`, "utf8").then((t) => t.trim())
const md21 = await readFile(`${dir}\\msg21-text.md`, "utf8").then((t) => t.trim())

// Exact logged heights idx0..idx40 (idx0 = spacer).
const head = [1, 11, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 21, 23, 24, 23, 28, 1, 1, 1, 1, 1, 11, 10, 21, 1]
// Tail idx45..idx54 exact heights.
const tail = [2, 4, 1, 1, 1, 13, 19, 1, 8, 2]

test("DEBUG_TEMP_SPOOKY2 exact", async () => {
  let scroll!: ScrollBoxRenderable
  const app = await testRender(
    () => (
      <box flexDirection="row" flexGrow={1} width={150} height={80}>
        <box flexGrow={1} paddingLeft={2} paddingRight={2} flexDirection="column">
          <scrollbox ref={(r) => (scroll = r)} stickyScroll={true} stickyStart="bottom" flexGrow={1} height={77}>
            {head.map((h) => (
              <box height={h} />
            ))}
            <box paddingLeft={2}>
              <text>{md21}</text>
            </box>
            <box height={1} />
            <box paddingLeft={3}>
              <markdown
                syntaxStyle={syntax}
                streaming={true}
                internalBlockMode="top-level"
                tableOptions={{ style: "grid" }}
                content={md22}
                conceal={true}
              />
            </box>
            {tail.map((h) => (
              <box height={h} />
            ))}
          </scrollbox>
        </box>
        <box width={42}>
          <text>sidebar</text>
        </box>
      </box>
    ),
    { width: 150, height: 80 },
  )
  try {
    await app.renderOnce()
    await app.flush()
    await app.waitForVisualIdle({ maxFrames: 60 }).catch(() => undefined)
    scroll.scrollTo(scroll.scrollHeight)
    await app.renderOnce()
    await app.flush()
    await app.waitForVisualIdle({ maxFrames: 60 }).catch(() => undefined)
    const kids = scroll.getChildren()
    const md = kids.find((c) => c.height > 20)
    console.log(`KIDS=${kids.length} mdH=${md?.height} viewportScreenX=${scroll.viewport.screenX} sh=${scroll.scrollHeight}`)
    for (let tick = 1; tick <= 16; tick++) {
      let error: string | undefined
      try {
        scroll.scrollBy(-4)
        await app.renderOnce()
        await app.flush()
      } catch (e) {
        error = e instanceof Error ? e.message : String(e)
      }
      const frame = app.captureCharFrame()
      const rows = frame.split("\n")
      const viewportRows = rows.slice(0, 77)
      const blank = viewportRows.filter((r) => r.trim().length === 0).length
      console.log(
        `tick=${tick} top=${scroll.scrollTop} error=${error ?? "none"} blankRows=${blank}/77 hasInvestigation=${frame.includes("Investigation")}`,
      )
    }
    expect(true).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})
