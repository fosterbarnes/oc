// oc patches to OpenTUI (`patches/@opentui%2Fcore@0.5.14.patch`): streaming code blocks paint
// new text before the async highlight lands (CodeRenderable; markdown-filetype blocks keep the
// upstream behavior), and a markdown stream that ends with a last-moment append keeps its last
// paragraph whole (`parseMarkdownIncremental`).
import { afterEach, expect, test } from "bun:test"
import { CodeRenderable, MarkdownRenderable, RGBA, SyntaxStyle } from "@opentui/core"
import { MockTreeSitterClient, createTestRenderer, type TestRenderer } from "@opentui/core/testing"

const KEYWORD = RGBA.fromHex("#ff0000")
const active: TestRenderer[] = []

afterEach(() => {
  for (const renderer of active.splice(0)) renderer.destroy()
})

// Same options the markdown renderer gives a fenced code block while streaming.
async function setup(filetype: string, content: string) {
  const app = await createTestRenderer({ width: 40, height: 8 })
  active.push(app.renderer)
  const treeSitterClient = new MockTreeSitterClient()
  treeSitterClient.setMockResult({ highlights: [[0, 5, "keyword"]] })
  const code = new CodeRenderable(app.renderer, {
    content,
    filetype,
    syntaxStyle: SyntaxStyle.fromStyles({ keyword: { fg: KEYWORD } }),
    drawUnstyledText: false,
    streaming: true,
    treeSitterClient,
    width: "100%",
  })
  app.renderer.root.add(code)
  await app.renderOnce()
  return { ...app, code, treeSitterClient }
}

// Resolves every pending highlight, including reruns queued by content changes.
async function finishHighlights(app: Awaited<ReturnType<typeof setup>>) {
  for (let i = 0; i < 10 && app.treeSitterClient.isHighlighting(); i++) {
    app.treeSitterClient.resolveAllHighlightOnce()
    await Bun.sleep(1)
  }
  await app.code.highlightingDone
  await app.renderOnce()
}

function firstSpan(app: Awaited<ReturnType<typeof setup>>) {
  return app.captureSpans().lines[0]!.spans[0]!
}

test("first and appended code text show before the highlight resolves", async () => {
  const app = await setup("typescript", "const a = 1")
  expect(app.treeSitterClient.isHighlighting()).toBe(true)
  expect(app.captureCharFrame()).toContain("const a = 1")

  app.code.content = "const a = 1\nconst b = 2"
  await app.renderOnce()
  expect(app.treeSitterClient.isHighlighting()).toBe(true)
  expect(app.captureCharFrame()).toContain("const b = 2")
})

test("the resolved highlight restyles the whole block", async () => {
  const app = await setup("typescript", "const a = 1")
  app.code.content = "const a = 1\nconst b = 2"
  await app.renderOnce()
  expect(firstSpan(app).fg.equals(KEYWORD)).toBe(false)

  await finishHighlights(app)
  expect(firstSpan(app).text).toBe("const")
  expect(firstSpan(app).fg.equals(KEYWORD)).toBe(true)
  expect(app.captureCharFrame()).toContain("const b = 2")
})

test("a change that is not an append waits for the highlight", async () => {
  const app = await setup("typescript", "const a = 1")
  app.code.content = "const x = 1"
  await app.renderOnce()
  expect(app.captureCharFrame()).toContain("const a = 1")
  expect(app.captureCharFrame()).not.toContain("const x = 1")

  await finishHighlights(app)
  expect(app.captureCharFrame()).toContain("const x = 1")
})

test("a markdown-filetype block does not take the append path", async () => {
  const app = await setup("markdown", "Title text")
  expect(app.captureCharFrame()).not.toContain("Title text")

  app.code.content = "Title text more"
  await app.renderOnce()
  expect(app.captureCharFrame()).not.toContain("more")

  await finishHighlights(app)
  expect(app.captureCharFrame()).toContain("Title text more")
})

test("ending the stream keeps the styled block until the final highlight", async () => {
  const app = await setup("typescript", "const a = 1")
  await finishHighlights(app)
  expect(firstSpan(app).fg.equals(KEYWORD)).toBe(true)

  // MarkdownRenderable's order when its stream ends (`applyCodeBlockRenderable`).
  app.code.drawUnstyledText = true
  app.code.streaming = false
  await app.renderOnce()
  expect(app.treeSitterClient.isHighlighting()).toBe(true)
  expect(firstSpan(app).fg.equals(KEYWORD)).toBe(true)

  await finishHighlights(app)
  expect(firstSpan(app).fg.equals(KEYWORD)).toBe(true)
})

// TextPart sets `streaming` and `content` in one update when a part ends, so the stream can end
// before its last characters are applied.
test("a markdown stream that ends before its last append keeps the last paragraph whole", async () => {
  const app = await createTestRenderer({ width: 40, height: 8 })
  active.push(app.renderer)
  const markdown = new MarkdownRenderable(app.renderer, {
    content: "First paragraph.\n\nEND_MARK",
    syntaxStyle: SyntaxStyle.fromStyles({}),
    streaming: true,
    internalBlockMode: "top-level",
    treeSitterClient: new MockTreeSitterClient({ autoResolveTimeout: 0 }),
    width: "100%",
  })
  app.renderer.root.add(markdown)
  await app.renderOnce()

  markdown.streaming = false
  markdown.content = "First paragraph.\n\nEND_MARKER"
  await app.renderOnce()
  expect(markdown._blockStates.length).toBe(2)
  // A finalized paragraph repaints when its (mock, instant) highlight lands.
  for (let i = 0; i < 10 && !app.captureCharFrame().includes("END_MARKER"); i++) {
    await Bun.sleep(5)
    await app.renderOnce()
  }
  expect(app.captureCharFrame()).toContain("END_MARKER")
})
