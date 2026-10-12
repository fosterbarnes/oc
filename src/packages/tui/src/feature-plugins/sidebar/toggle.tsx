import type { MouseEvent, RGBA } from "@opentui/core"

// Section collapse marker: "-" when open, "+" when closed. Not selectable, so double-click or drag
// over a header never highlights it. Click handlers belong to the caller.
export function SidebarToggle(props: {
  open: boolean
  fg: RGBA | string
  onMouseDown?: (event: MouseEvent) => void
  onMouseUp?: (event: MouseEvent) => void
}) {
  return (
    <text fg={props.fg} selectable={false} onMouseDown={props.onMouseDown} onMouseUp={props.onMouseUp}>
      {props.open ? "-" : "+"}
    </text>
  )
}
