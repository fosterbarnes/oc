import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createMemo, createSignal } from "solid-js"

export function DialogSubagentEfforts(props: {
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

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    ...props.efforts.map((effort) => ({
      title: `${selected().has(effort) ? "✓" : " "} ${effort}`,
      value: `effort:${effort}`,
      onSelect: () => toggle(effort),
    })),
    {
      title: `${selected().has("") ? "✓" : " "} No effort`,
      value: "effort:",
      onSelect: () => toggle(""),
    },
    {
      title: `Add ${count()}`,
      value: "confirm",
      disabled: count() === 0,
      onSelect: () => {
        if (count() === 0) return
        const chosen = [...selected()].map((key) => (key === "" ? undefined : key))
        dialog.clear()
        props.onConfirm(chosen)
      },
    },
  ])

  return <DialogSelect title="Select efforts" placeholder="Toggle efforts…" options={options()} />
}
