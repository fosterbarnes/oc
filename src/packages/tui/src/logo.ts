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

export const introColors = { open: "#a89bba", code: "#5f566d", border: "#3A2D5C", interior: "#000000" }

// "edge" is the bottom border row, drawn over the terminal background instead of the interior.
export type IntroCell = { glyph: string; kind: "border" | "edge" | "open" | "code" | "space" }

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
    if (row === introBottom) return { glyph: "▀", kind: "edge" }
    if (row === introTop || column === introLeft || column === introRight) {
      const glyph = [...introFrame[row]][column]
      return { glyph: blank(glyph) ? "█" : glyph, kind: "border" }
    }
    const glyph = [...introLogo[row]][column]
    if (blank(glyph)) return { glyph: " ", kind: "space" }
    return { glyph, kind: column < introCodeStart ? "open" : "code" }
  })
})
