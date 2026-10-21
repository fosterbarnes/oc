import { Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useKV } from "../context/kv"
import type { JSX } from "@opentui/solid"
import type { RGBA } from "@opentui/core"
import { registerOpencodeSpinner } from "./register-spinner"

registerOpencodeSpinner()

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function Spinner(props: { children?: JSX.Element; color?: RGBA; selectable?: boolean }) {
  const { theme } = useTheme()
  const kv = useKV()
  const color = () => props.color ?? theme.textMuted
  // A bare spinner beside a long sibling shrinks to a fractional width that rounds to 0, so the
  // glyph paints on top of the row gap. Only a labeled spinner may shrink (to wrap its text).
  return (
    <Show
      when={kv.get("animations_enabled", true)}
      fallback={
        <text selectable={props.selectable} fg={color()}>
          ⋯ {props.children}
        </text>
      }
    >
      <box flexDirection="row" gap={1} flexShrink={props.children ? 1 : 0}>
        <box flexShrink={0}>
          <spinner frames={SPINNER_FRAMES} interval={80} color={color()} />
        </box>
        <Show when={props.children}>
          <text selectable={props.selectable} fg={color()}>
            {props.children}
          </text>
        </Show>
      </box>
    </Show>
  )
}
