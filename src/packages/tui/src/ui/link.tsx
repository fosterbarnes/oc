import type { JSX } from "solid-js"
import type { RGBA } from "@opentui/core"
import { useKV } from "../context/kv"
import { openLink } from "../util/browser"
import { useToast } from "./toast"

export interface LinkProps {
  href: string
  children?: JSX.Element | string
  fg?: RGBA
  bg?: RGBA
  width?: number | "auto" | `${number}%`
  wrapMode?: "word" | "none"
}

/**
 * Link component that renders clickable hyperlinks.
 * Clicking anywhere on the link text opens the URL in the browser picked in the oc palette.
 */
export function Link(props: LinkProps) {
  const kv = useKV()
  const toast = useToast()
  const displayText = props.children ?? props.href

  return (
    <text
      selectable={false}
      fg={props.fg}
      bg={props.bg}
      width={props.width}
      wrapMode={props.wrapMode}
      onMouseUp={() => {
        openLink(kv, props.href).catch(toast.error)
      }}
    >
      {displayText}
    </text>
  )
}
