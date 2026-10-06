import { RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, Index, onCleanup, Show } from "solid-js"
import { INTRO_TICK_MS, introCells, introCellsAt } from "../logo"

const width = introCells[0].length
const height = introCells.length
const colors = new Map<string, RGBA>()
const rgba = (hex: string | undefined) => {
  if (!hex) return undefined
  const cached = colors.get(hex) ?? RGBA.fromHex(hex)
  colors.set(hex, cached)
  return cached
}

// The launcher passes its last painted tick so the reveal and scanner continue that frame. Without
// it (stable, plain opencode) start fully revealed, as before the scanner existed.
const handoff = Number(process.env.OC_INTRO_FRAME)
const [tick, setTick] = createSignal(Number.isInteger(handoff) && handoff >= 0 ? handoff : width - 1)
const [done, setDone] = createSignal(false)
export const hideIntroLogo = () => setDone(true)

// Same art and centering as the launcher intro. Mounted above every provider (several hold their
// children until loaded), so it paints on the first frame and stays until App calls hideIntroLogo.
export function IntroLogo() {
  const dimensions = useTerminalDimensions()
  const cells = createMemo(() => introCellsAt(tick()))
  const timer = setInterval(() => (done() ? clearInterval(timer) : setTick((value) => value + 1)), INTRO_TICK_MS)
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
