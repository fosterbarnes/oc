import { expect, test } from "bun:test"
import { WeztermWindow } from "../../src/util/weztermWindow"

const screens = [
  { x: 0, y: 0, width: 1728, height: 1117, scale: 2 },
  { x: 1728, y: -200, width: 1920, height: 1080, scale: 1 },
]

test("placement converts points to the containing screen's pixels and spots full screen", () => {
  const size = { cols: 214, rows: 77 }
  expect(WeztermWindow.placement({ x: 0, y: 38, width: 1728, height: 1079 }, screens, size)).toEqual({
    x: 0,
    y: 76,
    ...size,
  })
  expect(WeztermWindow.placement({ x: 1800, y: 0, width: 800, height: 600 }, screens, size)).toEqual({
    x: 1800,
    y: 0,
    ...size,
  })
  expect(WeztermWindow.placement({ x: 0, y: 0, width: 1728, height: 1117 }, screens, undefined)).toEqual({
    fullScreen: true,
  })
  expect(WeztermWindow.placement({ x: 0, y: 38, width: 1728, height: 1079 }, screens, undefined)).toBeUndefined()
})

test("tabSize spans the split panes of the pane's tab only", () => {
  const pane = (pane_id: number, tab_id: number, left_col: number, top_row: number, cols: number, rows: number) => ({
    window_id: 0,
    tab_id,
    pane_id,
    left_col,
    top_row,
    size: { cols, rows },
  })
  const list = JSON.stringify([pane(0, 0, 0, 0, 100, 40), pane(1, 0, 101, 0, 60, 40), pane(2, 1, 0, 0, 300, 90)])
  expect(WeztermWindow.tabSize(list, "1")).toEqual({ cols: 161, rows: 40 })
  expect(WeztermWindow.tabSize(list, "9")).toBeUndefined()
})
