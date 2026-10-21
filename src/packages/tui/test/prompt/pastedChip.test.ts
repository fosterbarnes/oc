import { afterEach, expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer, type TestRenderer } from "@opentui/core/testing"
import { expandPastedChip, isPastedChipLabel, offsetAtCell } from "../../src/prompt/part"

const active: TestRenderer[] = []

afterEach(() => {
  for (const renderer of active.splice(0)) renderer.destroy()
})

// Same chip shape the prompt's pasteText creates: a virtual extmark over the label, then a space.
async function setup(before: string, label: string) {
  const app = await createTestRenderer({ width: 60, height: 6 })
  active.push(app.renderer)
  const input = new TextareaRenderable(app.renderer, { width: "100%", height: 4 })
  app.renderer.root.add(input)
  const typeId = input.extmarks.registerType("prompt-part")
  input.insertText(before)
  const start = input.cursorOffset
  input.insertText(label + " ")
  const id = input.extmarks.create({ start, end: start + label.length, virtual: true, typeId })
  return { input, id, typeId }
}

test("expands a pasted chip into its text and drops the chip", async () => {
  const { input, id, typeId } = await setup("see ", "[Pasted ~3 lines]")
  expect(expandPastedChip(input, id, "one\ntwo\nthree")).toBe(true)
  expect(input.plainText).toBe("see one\ntwo\nthree ")
  expect(input.extmarks.getAllForTypeId(typeId)).toEqual([])
})

test("returns false for a chip that no longer exists", async () => {
  const { input, id } = await setup("", "[Pasted ~3 lines]")
  input.extmarks.delete(id)
  expect(expandPastedChip(input, id, "x")).toBe(false)
  expect(input.plainText).toBe("[Pasted ~3 lines] ")
})

// Narrow, short textarea at (0, 0) so text wraps and scrolls, like a long prompt draft.
async function textarea(text: string) {
  const app = await createTestRenderer({ width: 12, height: 6 })
  active.push(app.renderer)
  const input = new TextareaRenderable(app.renderer, { width: "100%", height: 3 })
  app.renderer.root.add(input)
  input.insertText(text)
  await app.renderOnce()
  return input
}

test("maps a cell to its text offset across wrapped lines and newlines", async () => {
  const input = await textarea("abcdefghijklmnopqrstuvwxyz\nhello world")
  input.editorView.setViewport(0, 0, 12, 3)
  expect(offsetAtCell(input, 3, 0)).toBe(3)
  expect(offsetAtCell(input, 1, 2)).toBe(25)
  expect(offsetAtCell(input, 2, 2)).toBeUndefined()
})

test("maps a cell through the scrolled viewport", async () => {
  const input = await textarea("abcdefghijklmnopqrstuvwxyz\nhello world")
  input.editorView.setViewport(0, 2, 12, 3)
  expect(offsetAtCell(input, 0, 1)).toBe(27)
  expect(offsetAtCell(input, 0, 3)).toBeUndefined()
})

// Wraps as "some words [" / "Image 1] ": the chip (offsets 11-19) splits across both rows.
test("finds an image chip that wraps across rows by cell", async () => {
  const input = await textarea("some words ")
  const typeId = input.extmarks.registerType("prompt-part")
  input.insertText("[Image 1] ")
  const id = input.extmarks.create({ start: 11, end: 20, virtual: true, typeId })
  input.editorView.setViewport(0, 0, 12, 3)
  const hit = (x: number, y: number) => {
    const offset = offsetAtCell(input, x, y)
    if (offset === undefined) return undefined
    return input.extmarks.getAtOffset(offset).find((mark) => mark.typeId === typeId)?.id
  }
  expect(hit(11, 0)).toBe(id)
  expect(hit(0, 1)).toBe(id)
  expect(hit(7, 1)).toBe(id)
  expect(hit(8, 1)).toBeUndefined()
  expect(hit(10, 0)).toBeUndefined()
})

test("only paste summary chips count as pasted chips", () => {
  expect(isPastedChipLabel("[Pasted ~12 lines]")).toBe(true)
  expect(isPastedChipLabel("[SVG: logo.svg]")).toBe(false)
  expect(isPastedChipLabel("[Image 1]")).toBe(false)
})
