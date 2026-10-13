import { RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, Index, onCleanup, Show } from "solid-js"
import { INTRO_PAINT_MS, INTRO_TICK_MS, introCells, introCellsAt, introPace } from "../logo"

const width = introCells[0].length
const height = introCells.length
const colors = new Map<string, RGBA>()
const rgba = (hex: string | undefined) => {
  if (!hex) return undefined
  const cached = colors.get(hex) ?? RGBA.fromHex(hex)
  colors.set(hex, cached)
  return cached
}

// The launcher passes its clock and last painted tick so the reveal and scanner continue that frame.
// Without them (stable, plain opencode) start fully revealed, as before the scanner existed.
const handoffStart = Number(process.env.OC_INTRO_START)
const handoffTick = Number(process.env.OC_INTRO_FRAME)
const handoff = Number.isInteger(handoffStart) && Number.isInteger(handoffTick) && handoffTick >= 0
let start = handoff ? handoffStart : Date.now() - (width - 1) * INTRO_TICK_MS
const [tick, setTick] = createSignal(handoff ? handoffTick : width - 1)
const [done, setDone] = createSignal(false)
export const hideIntroLogo = () => setDone(true)

// Same art and centering as the launcher intro. Mounted above every provider (several hold their
// children until loaded), so it paints on the first frame and stays until App calls hideIntroLogo.
export function IntroLogo() {
  const dimensions = useTerminalDimensions()
  const cells = createMemo(() => introCellsAt(tick()))
  const timer = setInterval(() => {
    if (done()) return clearInterval(timer)
    const next = introPace(start, tick())
    start = next.start
    setTick(next.tick)
  }, INTRO_PAINT_MS)
  onCleanup(() => clearInterval(timer))
  return (
    <Show when={!done()}>
      <box
        position="absolute"
        zIndex={10000}
        left={Math.max(0, Math.floor((dimensions().width - width) / 2))}
        top={Math.max(0, Math.floor((dimensions().height - height) / 2))}
        flexDirection="column"
      >
        <Index each={cells()}>
          {(row) => (
            <text wrapMode="none">
              <Index each={row()}>
                {(cell) => <span style={{ fg: rgba(cell()?.fg), bg: rgba(cell()?.bg) }}>{cell()?.glyph ?? " "}</span>}
              </Index>
            </text>
          )}
        </Index>
      </box>
    </Show>
  )
}
