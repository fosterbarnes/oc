import { expect, test } from "bun:test"
import { introCells, introCellsAt, introColors } from "../src/logo"

const width = introCells[0].length
const scanRow = introCellsAt(width - 1).findIndex((row) => row.some((cell) => cell?.glyph === "■"))
const scanColumns = introCellsAt(width - 1)[scanRow].flatMap((cell, column) =>
  cell?.glyph === "■" || cell?.glyph === "⬝" ? [column] : [],
)

test("intro reveals one column per tick", () => {
  expect(introCellsAt(0).every((row) => row.every((cell, column) => (column === 0 ? cell : !cell)))).toBe(true)
  expect(introCellsAt(width - 1).every((row) => row.every(Boolean))).toBe(true)
})

test("scanner head rides the reveal edge on its first pass", () => {
  expect(scanColumns.length).toBeGreaterThan(1)
  scanColumns.forEach((column) => {
    const cell = introCellsAt(column)[scanRow][column]
    expect(cell).toEqual({ glyph: "■", fg: introColors.open, bg: introColors.interior })
  })
})

test("scanner keeps bouncing after the reveal and leaves other cells untouched", () => {
  const heads = Array.from({ length: 200 }, (_, offset) =>
    introCellsAt(width + offset)[scanRow].findIndex((cell) => cell?.fg === introColors.open),
  )
  expect(heads).toContain(scanColumns[0])
  expect(heads).toContain(scanColumns[scanColumns.length - 1])
  introCellsAt(width + 50).forEach((row, rowIndex) =>
    row.forEach((cell, column) => {
      if (rowIndex !== scanRow || !scanColumns.includes(column)) expect(cell).toBe(introCells[rowIndex][column])
    }),
  )
})
