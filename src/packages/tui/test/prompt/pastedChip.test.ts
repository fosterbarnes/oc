import { afterEach, expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer, type TestRenderer } from "@opentui/core/testing"
import { expandPastedChip, isPastedChipLabel } from "../../src/prompt/part"

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

test("only paste summary chips count as pasted chips", () => {
  expect(isPastedChipLabel("[Pasted ~12 lines]")).toBe(true)
  expect(isPastedChipLabel("[SVG: logo.svg]")).toBe(false)
  expect(isPastedChipLabel("[Image 1]")).toBe(false)
})
