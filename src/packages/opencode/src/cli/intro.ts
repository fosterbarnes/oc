const logo = [
  "",
  "",
  "",
  "          █▀▀█ █▀▀▀",
  "          █  █ █",
  "          ▀▀▀▀ ▀▀▀▀",
  "",
  "",
  "",
]

const frame = [
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

function color(hex: string, plane = 38) {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return `\x1b[${plane};2;${red};${green};${blue}m`
}

function expandTabs(value: string) {
  let column = 0
  let result = ""
  for (const character of value) {
    if (character === "\t") {
      const spaces = 4 - (column % 4)
      result += " ".repeat(spaces)
      column += spaces
      continue
    }
    result += character
    column++
  }
  return result
}

function blank(value: string | undefined) {
  return value === undefined || value === " " || value === "⠀"
}

export function startIntro(mode: "terminal" | "black" = "terminal") {
  if (!process.stdout.isTTY) return () => {}

  const output = process.stdout
  const logoGrid = logo.map(expandTabs)
  const frameGrid = frame.map(expandTabs)
  const left = frameGrid.reduce((value, line) => {
    const first = [...line].findIndex((character) => !blank(character))
    return first === -1 ? value : Math.min(value, first)
  }, Number.POSITIVE_INFINITY)
  const right = frameGrid.reduce(
    (value, line) =>
      Math.max(
        value,
        [...line].findLastIndex((character) => !blank(character)),
      ),
    -1,
  )
  const top = frameGrid.findIndex((line) => [...line].some((character) => !blank(character)))
  const bottom = frameGrid.findLastIndex((line) => [...line].some((character) => !blank(character)))
  const logoLeft = logoGrid.reduce((value, line) => {
    const first = [...line].findIndex((character) => !blank(character))
    return first === -1 ? value : Math.min(value, first)
  }, Number.POSITIVE_INFINITY)
  const codeStart = logoLeft + 5
  const frameWidth = right - left + 1
  const frameHeight = bottom - top + 1
  // Window managers (FancyZones) resize the window right after launch. Bun on Windows keeps
  // reporting the launch size (even from getWindowSize) until stdin is read, so the intro
  // reads stdin in raw mode (discarding keys) and releases it in stop before the TUI starts.
  const input = process.stdin
  const holdInput = input.isTTY
  if (holdInput) {
    input.setRawMode(true)
    input.resume()
  }
  const size = () => {
    const [columns, rows] = output.getWindowSize()
    return { columns: columns || 80, rows: rows || 24 }
  }
  let current = size()
  const position = () => ({
    center: Math.max(0, Math.floor((current.columns - frameWidth) / 2)),
    startRow: Math.max(0, Math.floor((current.rows - frameHeight) / 2)),
  })
  let placed = position()
  const openColor = color("#a89bba")
  const codeColor = color("#5f566d")
  const borderColor = color("#3A2D5C")
  const background = mode === "black" ? "\x1b[48;2;0;0;0m" : "\x1b[49m"
  const interior = color("#000000", 48)
  const reset = `\x1b[0m${background}`
  const write = (value: string) => output.write(value)
  const at = (column: number, row: number) =>
    write(`\x1b[${placed.startRow + row - top + 1};${placed.center + column - left + 1}H`)
  const paintColumn = (column: number) => {
    for (let row = top; row <= bottom; row++) {
      at(column, row)
      const border = row === top || row === bottom || column === left || column === right
      if (border) {
        const glyph = row === bottom ? "▀" : blank(frameGrid[row][column]) ? "█" : frameGrid[row][column]
        write(`${row === bottom ? background : interior}${borderColor}${glyph}${reset}`)
        continue
      }
      const glyph = logoGrid[row][column]
      write(`${interior}${blank(glyph) ? " " : column < codeStart ? openColor : codeColor}${glyph || " "}${reset}`)
    }
  }

  let column = left
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  write(`${background}\x1b[2J\x1b[H\x1b[?25l`)
  const tick = () => {
    if (stopped) return
    const next = size()
    if (next.columns !== current.columns || next.rows !== current.rows) {
      // Clear the whole new area and redraw the columns painted so far at the new center.
      current = next
      placed = position()
      write(`${background}\x1b[2J`)
      for (let painted = left; painted < column; painted++) paintColumn(painted)
    }
    if (column <= right) paintColumn(column++)
  }
  tick()
  timer = setInterval(tick, 15)

  return () => {
    if (stopped) return
    stopped = true
    if (timer) clearInterval(timer)
    if (holdInput) {
      input.setRawMode(false)
      input.pause()
    }
    write("\x1b[0m\x1b[?25h\x1b[2J\x1b[H")
  }
}
