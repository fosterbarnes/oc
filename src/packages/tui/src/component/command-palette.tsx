import { createMemo } from "solid-js"
import { DialogSelect, type DialogSelectRef } from "../ui/dialog-select"
import { type DialogContext, useDialog } from "../ui/dialog"
import {
  COMMAND_PALETTE_COMMAND,
  formatKeyBindings,
  type OpenTuiKeymap,
  useBindings,
  useKeymapSelector,
  useOpencodeKeymap,
} from "../keymap"
import { useTuiConfig } from "../config"
import { useSync } from "../context/sync"
import { DialogHotkey } from "./dialogHotkey"

type PaletteCommandEntry = ReturnType<OpenTuiKeymap["getCommandEntries"]>[number]

type PaletteCommand = { name: string; category?: string }

function compareConfiguredFirst(left: string, right: string, order: Record<string, number>) {
  const leftOrder = order[left]
  const rightOrder = order[right]
  if (leftOrder === undefined) return rightOrder === undefined ? 0 : 1
  if (rightOrder === undefined) return -1
  return leftOrder - rightOrder
}

export function orderPaletteEntries<T extends { command: PaletteCommand }>(
  entries: readonly T[],
  order: Record<string, number> = {},
) {
  if (Object.keys(order).length === 0) return entries.slice()

  const result = entries.slice()
  const slotsByCategory = new Map<string | undefined, number[]>()
  entries.forEach((entry, index) => {
    const slots = slotsByCategory.get(entry.command.category)
    if (slots) slots.push(index)
    else slotsByCategory.set(entry.command.category, [index])
  })

  for (const slots of slotsByCategory.values()) {
    const sorted = slots
      .map((index) => entries[index])
      .toSorted((left, right) => compareConfiguredFirst(left.command.name, right.command.name, order))
    slots.forEach((slot, index) => {
      result[slot] = sorted[index]
    })
  }
  return result
}

function isVisiblePaletteCommand(command: PaletteCommandEntry["command"]) {
  return command.hidden !== true && command.name !== COMMAND_PALETTE_COMMAND
}

function isSuggestedPaletteCommand(entry: PaletteCommandEntry) {
  const suggested = entry.command.suggested
  if (typeof suggested === "boolean") return suggested
  if (typeof suggested === "function") return suggested() === true
  return false
}

export function CommandPaletteDialog(props: { category?: string } = {}) {
  const config = useTuiConfig()
  const sync = useSync()
  const dialog = useDialog()
  const keymap = useOpencodeKeymap()
  const entries = useKeymapSelector((keymap: OpenTuiKeymap) => {
    const query = {
      namespace: "palette",
    }
    const reachable = keymap.getCommandEntries({
      ...query,
      visibility: "reachable",
      filter: (command) => isVisiblePaletteCommand(command) && (!props.category || command.category === props.category),
    })
    const registeredBindings = keymap.getCommandBindings({
      visibility: "registered",
      commands: reachable.map((entry) => entry.command.name),
    })

    return orderPaletteEntries(reachable, sync.data.config.command_palette?.order).map((entry) => ({
      ...entry,
      bindings: registeredBindings.get(entry.command.name) ?? entry.bindings,
    }))
  })
  const options = createMemo(() =>
    entries().map((entry) => ({
      title: typeof entry.command.title === "string" ? entry.command.title : entry.command.name,
      description: typeof entry.command.desc === "string" ? entry.command.desc : undefined,
      category: typeof entry.command.category === "string" ? entry.command.category : undefined,
      footer: formatKeyBindings(entry.bindings, config),
      value: entry.command.name,
      suggested: isSuggestedPaletteCommand(entry),
      gutter: entry.command.submenu === true ? () => <text>▸</text> : undefined,
      onSelect: (dialog: DialogContext) => {
        dialog.clear()
        keymap.dispatchCommand(entry.command.name)
      },
    })),
  )

  let ref: DialogSelectRef<string>
  useBindings(() => ({
    mode: "modal",
    commands: [
      {
        name: "palette.set_hotkey",
        title: "Set hotkey for selected command",
        category: "Dialog",
        run() {
          const selected = ref?.selected
          if (!selected) return
          const name = selected.value
          if (!name) return
          dialog.replace(() => <DialogHotkey command={name} title={selected.title} />)
        },
      },
    ],
    bindings: config.keybinds.gather("palette", ["palette.set_hotkey"]),
  }))
  const list = () => {
    if (ref?.filter) return options()
    return [
      ...options()
        .filter((option) => option.suggested)
        .map((option) => ({
          ...option,
          category: "Suggested",
        })),
      ...options(),
    ]
  }

  return <DialogSelect ref={(value) => (ref = value)} title="Commands" options={list()} />
}

