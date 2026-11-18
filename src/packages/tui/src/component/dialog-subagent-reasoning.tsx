import { DialogSelect, type DialogSelectOption } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"
import { createMemo, createSignal } from "solid-js"

type State = "on" | "off" | "manual"
const NEXT = { off: "on", on: "manual", manual: "off" } as const

// Add flow: pick the levels a new entry starts with (xhigh and max start `manual`, see `initialReasoning`).
export function DialogSubagentLevels(props: {
  model: string
  levels: string[]
  onConfirm: (selected: string[]) => void
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

  const options = createMemo<DialogSelectOption<string>[]>(() => [
    ...props.levels.map((level) => ({
      title: `[${selected().has(level) ? "✓" : " "}] ${level}`,
      value: `level:${level}`,
      onSelect: () => toggle(level),
    })),
    {
      title: selected().size ? "Add subagent" : "Select at least one level",
      value: "confirm",
      disabled: selected().size === 0,
      onSelect: () => {
        const chosen = props.levels.filter((level) => selected().has(level))
        dialog.clear()
        props.onConfirm(chosen)
      },
    },
  ])

  return <DialogSelect title={`Reasoning for ${props.model}`} renderFilter={false} options={options()} />
}

export function initialReasoning(levels: string[]) {
  return Object.fromEntries(
    levels.map((level) => [level, level === "xhigh" || level === "max" ? "manual" : "on"]),
  ) as Record<string, State>
}

// Existing entry: Enter cycles a level off -> on -> manual and saves it at once. The request carries no
// claudeAccount, so the server keeps the entry's pin.
export function DialogSubagentReasoning(props: {
  name: string
  model: string
  levels: string[]
  reasoning: Record<string, State>
}) {
  const sdk = useSDK()
  const toast = useToast()
  const [states, setStates] = createSignal(props.reasoning)

  async function cycle(level: string) {
    const next = NEXT[states()[level] ?? "off"]
    try {
      await sdk.client.app.agent.sub.add(
        { name: props.name, model: props.model, reasoning: { [level]: next } },
        { throwOnError: true },
      )
      setStates((prev) => ({ ...prev, [level]: next }))
    } catch (error) {
      toast.error(error)
    }
  }

  const options = createMemo<DialogSelectOption<string>[]>(() =>
    props.levels.map((level) => ({
      title: level,
      value: level,
      footer: states()[level] ?? "off",
      onSelect: () => void cycle(level),
    })),
  )

  return (
    <DialogSelect title={`Reasoning for ${props.name}`} renderFilter={false} preserveSelection options={options()} />
  )
}
