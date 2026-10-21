import { expect, test } from "bun:test"
import { Selection } from "../../src/util/selection"

test("ctrl+c copies when Kitty reports a non-Latin key name with a Latin base-layout C", async () => {
  const writes: string[] = []
  const renderer = {
    getSelection: () => ({ getSelectedText: () => "beta", selectedRenderables: [] }),
    clearSelection() {},
  }
  const toast = { show() {}, error() {} }
  const clipboard = {
    read: async () => undefined,
    write: async (text: string) => {
      writes.push(text)
    },
  }
  let prevented = 0
  for (const baseCode of [99, 67]) {
    Selection.handleSelectionKey(
      renderer,
      toast,
      { ctrl: true, name: "с", baseCode, preventDefault: () => prevented++, stopPropagation() {} },
      clipboard,
    )
  }
  await Bun.sleep(0)
  expect(writes).toEqual(["beta", "beta"])
  expect(prevented).toBe(2)
})
