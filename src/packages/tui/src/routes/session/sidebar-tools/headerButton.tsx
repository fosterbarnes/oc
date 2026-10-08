import { Show, createSignal } from "solid-js"
import type { ColorInput } from "@opentui/core"

export function HeaderButton(props: {
  value: string
  outlined: boolean
  secondary?: boolean
  color: ColorInput
  hoverColor: ColorInput
  onClick: () => void
}) {
  const [hovered, setHovered] = createSignal(false)
  const color = () => (hovered() ? props.hoverColor : props.color)
  return (
    <box
      width={props.outlined ? "100%" : "auto"}
      maxWidth="100%"
      flexShrink={props.outlined || props.secondary ? 0 : 1}
      minWidth={0}
      flexDirection="row"
      justifyContent="flex-start"
      // OpenTUI re-enables false borders on color updates; empty sides stay borderless.
      border={props.outlined ? true : []}
      borderStyle="single"
      borderColor={color()}
      paddingLeft={props.outlined ? 1 : 0}
      paddingRight={props.outlined ? 1 : 0}
      onMouseOver={() => setHovered(true)}
      onMouseOut={() => setHovered(false)}
      onMouseUp={(event) => {
        if (event.button === 0) props.onClick()
      }}
    >
      <Show when={!props.outlined}>
        <text selectable={false} flexShrink={0} fg={color()}>
          {props.secondary ? ">> " : "> "}
        </text>
      </Show>
      <text selectable={false} minWidth={0} flexShrink={1} wrapMode="none" fg={color()}>
        {props.value}
      </text>
    </box>
  )
}
