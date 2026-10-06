import { calculateColorIndex, getScannerState, scannerFade, scannerTrail } from "./ui/scanner"

export const logo = {
  left: ["                   ", "█▀▀█ █▀▀█ █▀▀█ █▀▀▄", "█__█ █__█ █^^^ █__█", "▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀~~▀"],
  right: ["             ▄     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"

// Startup intro art, shared by the launcher animation (opencode `cli/intro.ts`) and the TUI's
// loading screen so the handoff between the two processes looks identical.
export const introLogo = ["", "", "", "          █▀▀█ █▀▀▀", "          █  █ █", "          ▀▀▀▀ ▀▀▀▀", "", "", ""]
export const introFrame = [
  "",
  "    █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█ ",
  "    █                   █ ",
  "    █                   █ ",
  "    █                   █ ",
  "    █                   █ ",
  "    █                   █ ",
  "    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ ",
  "",
]

// Scanner colors are blended over `interior` by scaling, so they assume it stays black.
export const introColors = { open: "#a89bba", code: "#5f566d", border: "#3A2D5C", interior: "#000000" }
export const INTRO_TICK_MS = 15

// Hex colors; no `bg` means the terminal background (the bottom border row).
export type IntroCell = { glyph: string; fg: string; bg?: string }

const blank = (value: string | undefined) => value === undefined || value === " "
const firstFilled = (lines: string[]) =>
  Math.min(...lines.map((line) => [...line].findIndex((character) => !blank(character))).filter((index) => index >= 0))
const introLeft = firstFilled(introFrame)
const introRight = Math.max(...introFrame.map((line) => [...line].findLastIndex((character) => !blank(character))))
const introTop = introFrame.findIndex((line) => [...line].some((character) => !blank(character)))
const introBottom = introFrame.findLastIndex((line) => [...line].some((character) => !blank(character)))
// `o` takes the open color and `c` the code color.
const introCodeStart = firstFilled(introLogo) + 5

// Rows x columns of the finished frame.
export const introCells: IntroCell[][] = Array.from({ length: introBottom - introTop + 1 }, (_, rowOffset) => {
  const row = introTop + rowOffset
  return Array.from({ length: introRight - introLeft + 1 }, (_, columnOffset): IntroCell => {
    const column = introLeft + columnOffset
    if (row === introBottom) return { glyph: "▀", fg: introColors.border }
    if (row === introTop || column === introLeft || column === introRight) {
      const glyph = [...introFrame[row]][column]
      return { glyph: blank(glyph) ? "█" : glyph, fg: introColors.border, bg: introColors.interior }
    }
    const glyph = [...introLogo[row]][column]
    if (blank(glyph)) return { glyph: " ", fg: introColors.interior, bg: introColors.interior }
    const fg = column < introCodeStart ? introColors.open : introColors.code
    return { glyph, fg, bg: introColors.interior }
  })
})

// The intro at a given tick: the reveal shows one more column per tick (hidden cells are
// undefined) and a Knight Rider scanner bounces in the row under the logo. Its first forward pass
// rides the reveal edge and its end hold lasts while the reveal finishes the columns to its right;
// later passes step every `_SCANNER_TICKS`. Launcher and TUI both draw this, so the handoff
// (tick passed in OC_INTRO_FRAME) continues the same frame.
export function introCellsAt(tick: number) {
  const late = Math.max(0, tick - _REVEAL_END)
  const step = Math.max(0, tick - late - _SCAN_LEFT + Math.floor(late / _SCANNER_TICKS))
  const scanner = scannerCells(step % _SCAN_CYCLE)
  return introCells.map((row, rowIndex) =>
    row.map((cell, column): IntroCell | undefined => {
      if (column > tick) return undefined
      if (rowIndex !== _SCAN_ROW || column < _SCAN_LEFT || column >= _SCAN_LEFT + _SCAN_WIDTH) return cell
      return scanner[column - _SCAN_LEFT]
    }),
  )
}

// Scanner geometry in `introCells` coordinates: the row under the logo, as wide as the logo.
const _SCANNER_TICKS = 3
const _REVEAL_END = introRight - introLeft
const _SCAN_LEFT = firstFilled(introLogo) - introLeft
const _SCAN_WIDTH =
  Math.max(...introLogo.map((line) => [...line].findLastIndex((character) => !blank(character)))) -
  introLeft -
  _SCAN_LEFT +
  1
const _SCAN_ROW = introLogo.findLastIndex((line) => [...line].some((character) => !blank(character))) + 1 - introTop
const _SCAN_HOLD = _REVEAL_END - _SCAN_LEFT - _SCAN_WIDTH + 1
const _SCAN_OPTIONS = {
  trailLength: 6,
  direction: "bidirectional" as const,
  holdFrames: { start: _SCAN_HOLD, end: _SCAN_HOLD },
}
const _SCAN_CYCLE = 2 * _SCAN_WIDTH - 1 + 2 * _SCAN_HOLD
// Matches the prompt scanner: `scannerTrail` falloff, inactive dots at 0.6 alpha fading to 0.3.
const _SCAN_TRAIL = scannerTrail(_SCAN_OPTIONS.trailLength).map((level) =>
  scale(scale(introColors.open, level.brightness), level.alpha),
)

function scannerCells(frame: number) {
  const state = getScannerState(frame, _SCAN_WIDTH, _SCAN_OPTIONS)
  const inactive = scale(introColors.open, 0.6 * scannerFade(state, 0.3))
  return Array.from({ length: _SCAN_WIDTH }, (_, index): IntroCell => {
    const trail = _SCAN_TRAIL[calculateColorIndex(frame, index, _SCAN_WIDTH, _SCAN_OPTIONS, state)]
    if (trail) return { glyph: "■", fg: trail, bg: introColors.interior }
    return { glyph: "⬝", fg: inactive, bg: introColors.interior }
  })
}

function scale(hex: string, factor: number) {
  const channel = (start: number) =>
    Math.round(Math.min(255, Number.parseInt(hex.slice(start, start + 2), 16) * factor))
      .toString(16)
      .padStart(2, "0")
  return `#${channel(1)}${channel(3)}${channel(5)}`
}
