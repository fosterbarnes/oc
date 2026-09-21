import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { ScrollBoxRenderable } from "@opentui/core"
import { addDefaultParsers } from "@opentui/core"
import { readFile } from "node:fs/promises"
import { DEFAULT_THEMES, generateSubtleSyntax, resolveTheme } from "../src/theme/index"
import parsers from "../src/parsers-config"

// DEBUG_TEMP_SPOOKY: headless repro of the spooky blank. Temporary, delete at cleanup.
addDefaultParsers(parsers.parsers)
const syntax = generateSubtleSyntax(resolveTheme(DEFAULT_THEMES["tokyonight"]!, "dark"))

// DEBUG_TEMP_SPOOKY: headless repro of the spooky blank. Temporary, delete at cleanup.
const content = await readFile(
  "C:\\Users\\user\\AppData\\Local\\Temp\\opencode-debug\\msg22-text.md",
  "utf8",
).then((t) => t.trim())

// Logged heights of scroll children idx0..40 in the death run (idx41+ built live below).
const prefixHeights = [
  1, 11, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 21, 23, 24, 23, 28, 1, 1, 1, 1, 1,
  11, 10, 21, 1,
]

for (const width of [100, 140]) {
  test(`DEBUG_TEMP_SPOOKY width=${width}`, async () => {
    let scroll!: ScrollBoxRenderable
    const app = await testRender(
      () => (
        <scrollbox
          ref={(r) => (scroll = r)}
          stickyScroll={true}
          stickyStart="bottom"
          flexGrow={1}
          height={77}
        >
          <box height={1} />
          {prefixHeights.slice(1).map((h) => (
            <box height={h} />
          ))}
          <box height={10} />
          <box height={14} />
          <box height={1} />
          <box paddingLeft={3}>
            <markdown
              syntaxStyle={syntax}
              streaming={true}
              internalBlockMode="top-level"
              tableOptions={{ style: "grid" }}
              content={content}
              conceal={true}
            />
          </box>
          <box height={2} />
          <box height={4} />
          <box height={1} />
        </scrollbox>
      ),
      { width, height: 80 },
    )
    try {
      await app.renderOnce()
      await app.flush()
      await app.waitForVisualIdle({ maxFrames: 60 }).catch(() => undefined)
      scroll.scrollTo(scroll.scrollHeight)
      await app.renderOnce()
      await app.flush()
      const mdHeight = scroll.getChildren().at(-6)?.height
      console.log(`DEBUG_TEMP_SPOOKY width=${width} markdownH=${mdHeight} scrollH=${scroll.scrollHeight}`)
      for (let tick = 1; tick <= 15; tick++) {
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
        const nonEmpty = rows.filter((r) => r.trim().length > 0).length
        const hasInvestigation = frame.includes("Investigation")
        console.log(
          `DEBUG_TEMP_SPOOKY width=${width} tick=${tick} top=${scroll.scrollTop} error=${error ?? "none"} nonEmptyRows=${nonEmpty} hasInvestigation=${hasInvestigation}`,
        )
      }
      expect(true).toBe(true)
    } finally {
      app.renderer.destroy()
    }
  })
}
