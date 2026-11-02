import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { For } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useDialog } from "./dialog"

const _PARTS = ["minus", "value", "plus"] as const
type Part = (typeof _PARTS)[number]

export type DialogStepperProps = {
  title: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}

// [ - ] value [ + ]: Left/Right move between parts, Enter steps by 1 on -/+ and applies typed digits on the value
export function DialogStepper(props: DialogStepperProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const [store, setStore] = createStore({ active: "value" as Part, draft: undefined as string | undefined })

  const apply = (value: number) => props.onChange(Math.min(props.max, Math.max(props.min, value)))

  const activate = (part: Part) => {
    if (part === "minus") return apply(props.value - 1)
    if (part === "plus") return apply(props.value + 1)
    if (store.draft) apply(Number(store.draft))
    setStore("draft", undefined)
  }

  const move = (direction: number) => {
    const index = Math.min(_PARTS.length - 1, Math.max(0, _PARTS.indexOf(store.active) + direction))
    setStore({ active: _PARTS[index], draft: undefined })
  }

  useKeyboard((evt) => {
    const typing = store.active === "value"
    if (evt.name === "return") activate(store.active)
    else if (evt.name === "left") move(-1)
    else if (evt.name === "right") move(1)
    else if (typing && evt.name === "backspace") setStore("draft", store.draft?.slice(0, -1) || undefined)
    else if (typing && /^[0-9]$/.test(evt.name)) {
      if ((store.draft?.length ?? 0) < String(props.max).length) setStore("draft", (store.draft ?? "") + evt.name)
    } else return
    evt.preventDefault()
    evt.stopPropagation()
  })

  const label = (part: Part) => (part === "minus" ? "-" : part === "plus" ? "+" : (store.draft ?? String(props.value)))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
          esc
        </text>
      </box>
      <box flexDirection="row" gap={1} paddingBottom={1}>
        <For each={_PARTS}>
          {(part) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={part === store.active ? theme.primary : undefined}
              onMouseUp={() => {
                setStore("active", part)
                activate(part)
              }}
            >
              <text fg={part === store.active ? theme.selectedListItemText : theme.text}>{label(part)}</text>
            </box>
          )}
        </For>
        <text fg={theme.textMuted}>
          {props.min}-{props.max}
        </text>
      </box>
    </box>
  )
}
