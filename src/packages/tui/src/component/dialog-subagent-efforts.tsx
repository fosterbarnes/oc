import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createMemo, createSignal } from "solid-js"

export function DialogSubagentEfforts(props: {
  model: string
  efforts: string[]
  onConfirm: (selected: Array<string | undefined>) => void
}) {
  const dialog = useDialog()
  const [selected, setSelected] = createSignal<Set<string>>(new Set())

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const count = createMemo(() => selected().size)

  // "" stands for no effort (provider default); efforts keep the model's variant order
  const keys = [...props.efforts, ""]
  const options = createMemo<DialogSelectOption<string>[]>(() => [
    ...keys.map((effort) => ({
      title: `[${selected().has(effort) ? "✓" : " "}] ${effort || "No effort"}`,
      value: `effort:${effort}`,
      onSelect: () => toggle(effort),
    })),
    {
      title: `Add ${count()} ${count() === 1 ? "subagent" : "subagents"}`,
      value: "confirm",
      disabled: count() === 0,
      onSelect: () => {
        const chosen = keys.filter((key) => selected().has(key)).map((key) => key || undefined)
        dialog.clear()
        props.onConfirm(chosen)
      },
    },
  ])

  return <DialogSelect title={`Efforts for ${props.model}`} renderFilter={false} options={options()} />
}
