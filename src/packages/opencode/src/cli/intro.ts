import { INTRO_TICK_MS, introCells, introCellsAt } from "@opencode-ai/tui/logo"

function color(hex: string, plane = 38) {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return `\x1b[${plane};2;${red};${green};${blue}m`
}

// Returns stop(clear). stop returns the last painted tick so the TUI can continue the same frame.
export function startIntro(mode: "terminal" | "black" = "terminal") {
  if (!process.stdout.isTTY) return (_clear = true): number | undefined => undefined

  const output = process.stdout
  const frameWidth = introCells[0].length
  const frameHeight = introCells.length
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
  const background = mode === "black" ? "\x1b[48;2;0;0;0m" : "\x1b[49m"
  const reset = `\x1b[0m${background}`
  const write = (value: string) => output.write(value)
  // Writes only cells that differ from `previous` (everything when it is undefined).
  const paint = (cells: ReturnType<typeof introCellsAt>, previous?: ReturnType<typeof introCellsAt>) =>
    cells.forEach((row, rowIndex) =>
      row.forEach((cell, column) => {
        if (!cell) return
        const old = previous?.[rowIndex][column]
        if (old && old.glyph === cell.glyph && old.fg === cell.fg && old.bg === cell.bg) return
        const bg = cell.bg ? color(cell.bg, 48) : background
        write(
          `\x1b[${placed.startRow + rowIndex + 1};${placed.center + column + 1}H${bg}${color(cell.fg)}${cell.glyph}${reset}`,
        )
      }),
    )

  let tick = 0
  let shown: ReturnType<typeof introCellsAt> | undefined
  let stopped = false
  let timer: ReturnType<typeof setInterval> | undefined
  // Drawn on the alternate screen so a main-screen clear by the attach child is never visible.
  write(`\x1b[?1049h${background}\x1b[2J\x1b[H\x1b[?25l`)
  const step = () => {
    if (stopped) return
    const next = size()
    if (next.columns !== current.columns || next.rows !== current.rows) {
      // Clear the whole new area and repaint the current frame at the new center.
      current = next
      placed = position()
      write(`${background}\x1b[2J`)
      shown = undefined
    }
    const cells = introCellsAt(tick++)
    paint(cells, shown)
    shown = cells
  }
  step()
  timer = setInterval(step, INTRO_TICK_MS)

  // clear=false hands the alternate screen to the TUI with the frame still up; the TUI leaves it
  // on exit, so a later stop() only restores the cursor. Without a handoff, stop() leaves it here.
  let handedOff = false
  let done = false
  return (clear = true): number | undefined => {
    if (!stopped) {
      stopped = true
      if (timer) clearInterval(timer)
      if (holdInput) {
        input.setRawMode(false)
        input.pause()
      }
    }
    if (!clear) handedOff = true
    if (clear && !done) {
      done = true
      write(`\x1b[0m\x1b[?25h${handedOff ? "" : "\x1b[?1049l"}`)
    }
    return tick - 1
  }
}
