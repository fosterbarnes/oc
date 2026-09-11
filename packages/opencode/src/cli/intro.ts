const logo = [
  "            ⠀                                               ",
  "            ⠀                                               ",
  "            ⠀                                ▄              ",
  "            █▀▀█ █▀▀█ █▀▀█ █▀▀▄ █▀▀▀ █▀▀█ █▀▀█ █▀▀█         ",
  "            █  █ █  █ █▀▀▀ █  █ █    █  █ █  █ █▀▀▀         ",
  "            ▀▀▀▀ █▀▀▀ ▀▀▀▀ ▀  ▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀         ",
  "            ⠀                                               ",
  "                                                            ",
  "                ⠀                                           ",
]

const frame = [
  "            ⠀                                               ",
  "    █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█ ",
  "    █       ⠀                                             █ ",
  "    █                                                     █ ",
  "    █                                                     █ ",
  "    █                                                     █ ",
  "    █       ⠀                                             █ ",
  "    ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ ",
  "                ⠀                                           ",
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
  return value === undefined || value === " " || value === "\u2800"
}

export function startIntro() {
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
  const codeStart = logoLeft + 20
  const frameWidth = right - left + 1
  const center = Math.max(0, Math.floor(((output.columns || 80) - frameWidth) / 2))
  const startRow = Math.max(0, Math.floor(((output.rows || 24) - (bottom - top + 1)) / 2))
  const openColor = color("#a89bba")
  const codeColor = color("#5f566d")
  const borderColor = color("#3A2D5C")
  const background = "\x1b[48;2;0;0;0m"
  const interior = color("#1c1c1c", 48)
  const reset = `\x1b[0m${background}`
  const write = (value: string) => output.write(value)
  const at = (column: number, row: number) => write(`\x1b[${startRow + row - top + 1};${center + column - left + 1}H`)
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
    if (stopped || column > right) return
    paintColumn(column++)
  }
  tick()
  timer = setInterval(tick, 15)

  return () => {
    if (stopped) return
    stopped = true
    if (timer) clearInterval(timer)
    for (let row = top; row <= bottom; row++) {
      at(left, row)
      write(`${background}${" ".repeat(frameWidth)}${reset}`)
    }
    write("\x1b[0m\x1b[?25h")
  }
}
