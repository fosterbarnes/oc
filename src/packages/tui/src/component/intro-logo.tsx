import { RGBA } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createSignal, For, Show } from "solid-js"
import { introCells, introColors } from "../logo"

const fg = {
  border: RGBA.fromHex(introColors.border),
  edge: RGBA.fromHex(introColors.border),
  open: RGBA.fromHex(introColors.open),
  code: RGBA.fromHex(introColors.code),
  space: RGBA.fromHex(introColors.interior),
}
const interior = RGBA.fromHex(introColors.interior)
const width = introCells[0].length
const height = introCells.length

const [done, setDone] = createSignal(false)
export const hideIntroLogo = () => setDone(true)

// Same art and centering as the launcher intro. Mounted above every provider (several hold their
// children until loaded), so it paints on the first frame and stays until App calls hideIntroLogo.
export function IntroLogo() {
  const dimensions = useTerminalDimensions()
  return (
    <Show when={!done()}>
      {(() => {
        return (
          <box
            position="absolute"
            zIndex={10000}
            left={Math.max(0, Math.floor((dimensions().width - width) / 2))}
            top={Math.max(0, Math.floor((dimensions().height - height) / 2))}
            flexDirection="column"
          >
            <For each={introCells}>
              {(row) => (
                <text wrapMode="none">
                  <For each={row}>
                    {(cell) => (
                      <span style={{ fg: fg[cell.kind], bg: cell.kind === "edge" ? undefined : interior }}>
                        {cell.glyph}
                      </span>
                    )}
                  </For>
                </text>
              )}
            </For>
          </box>
        )
      })()}
    </Show>
  )
}
