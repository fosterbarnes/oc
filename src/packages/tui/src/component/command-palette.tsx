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
import { toggleSidebarButton } from "../sidebarButtons"
import { useToast } from "../ui/toast"

type PaletteCommandEntry = ReturnType<OpenTuiKeymap["getCommandEntries"]>[number]

type PaletteCommand = { name: string; category?: unknown; group?: unknown; title?: unknown }

// Keymap entries come newest layer first, so any re-registration would reshuffle the list.
// The palette sorts on its own: these categories first, then unlisted ones A-Z.
const PALETTE_CATEGORY_ORDER = ["Session", "Prompt", "Agent", "Provider", "Workspace", "VCS", "oc", "System"]
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

// oc palette groups and commands in order of use, not A-Z. Unlisted groups follow A-Z; unlisted
// commands (per-account warm-ups, per-app updates, new entries) follow the listed ones in their group A-Z.
const _GROUP_RANK = rankOf([
  "Session",
  "Claude",
  "Subagents",
  "Defaults",
  "Updates",
  "Prompt",
  "Appearance",
  "Sidebar",
  "Folders",
  "Server and processes",
  "Tools",
  "About",
])
// One row per group, in _GROUP_RANK order.
const _COMMAND_RANK = rankOf(
  [
    ["oc.new_session", "oc.notices", "oc.session_cleanup", "oc.clear_saved_images"],
    [
      "claude.account",
      "claude.sessionAccount",
      "sidebar.usage",
      "claude.accounts",
      "claude.failover",
      "claude.apiRollover",
      "claude.autoResume",
    ],
    [
      "oc.view_subagents",
      "oc.session_subagents",
      "oc.stop_session_subagents",
      "agent.default_subagent_model",
      "agent.default_subagent",
      "oc.subagent_card_rows",
      "oc.subagent_tabs",
      "oc.subagent_usage",
    ],
    ["model.default", "agent.session", "oc.context_limit", "oc.todos.toggle", "oc.agent_push_auto_delete"],
    ["oc.update_all_harnesses", "oc.update_models"],
    [
      "app.toggle.paste_summary",
      "oc.image_paste_preview",
      "oc.prompt_tab_action",
      "oc.keybind_preset",
      "oc.link_click",
      "oc.link_browser",
    ],
    ["oc.font", "oc.time", "oc.toast_display", "oc.daily_theme", "oc.smooth_streaming"],
    [
      "oc.sidebar_position",
      "oc.sidebar_mode",
      "oc.sidebar_width",
      "oc.sidebar_button_style",
      "oc.sidebar_buttons_reset",
    ],
    ["oc.home_dir", "oc.home_dir_sort", "oc.oc_dir"],
    ["server.restart", "server.shutdown", "oc.server_startup", "oc.killall", "oc.process_report"],
    ["oc.import", "oc.allow_import", "oc.import_undo", "oc.jev_key", "oc.bgrun"],
    ["oc.about"],
  ].flat(),
)

function rankOf(names: string[]) {
  return Object.fromEntries(names.map((name, index) => [name, index]))
}

function compareConfiguredFirst(left: string, right: string, order: Record<string, number>) {
  const leftOrder = order[left]
  const rightOrder = order[right]
  if (leftOrder === undefined) return rightOrder === undefined ? 0 : 1
  if (rightOrder === undefined) return -1
  return leftOrder - rightOrder
}

function text(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function categoryRank(category: string | undefined) {
  if (category === undefined) return PALETTE_CATEGORY_ORDER.length + 1
  const rank = PALETTE_CATEGORY_ORDER.indexOf(category)
  return rank < 0 ? PALETTE_CATEGORY_ORDER.length : rank
}

function compareOptional(left: string | undefined, right: string | undefined) {
  if (left === right) return 0
  if (left === undefined) return -1
  if (right === undefined) return 1
  return collator.compare(left, right)
}

// Ungrouped commands lead their category; groups go by _GROUP_RANK, then A-Z.
function compareGroups(left: string | undefined, right: string | undefined) {
  if (left === undefined || right === undefined) return compareOptional(left, right)
  return compareConfiguredFirst(left, right, _GROUP_RANK) || collator.compare(left, right)
}

export function orderPaletteEntries<T extends { command: PaletteCommand }>(
  entries: readonly T[],
  order: Record<string, number> = {},
) {
  return entries.toSorted(({ command: left }, { command: right }) => {
    const leftCategory = text(left.category)
    const rightCategory = text(right.category)
    return (
      categoryRank(leftCategory) - categoryRank(rightCategory) ||
      compareOptional(leftCategory, rightCategory) ||
      compareGroups(text(left.group), text(right.group)) ||
      compareConfiguredFirst(left.name, right.name, order) ||
      compareConfiguredFirst(left.name, right.name, _COMMAND_RANK) ||
      collator.compare(text(left.title) ?? left.name, text(right.title) ?? right.name) ||
      collator.compare(left.name, right.name)
    )
  })
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

// A command's `group` becomes its own heading under its category ("oc Defaults"),
// or just the group name when the palette already shows one category.
export function CommandPaletteDialog(props: { category?: string } = {}) {
  const config = useTuiConfig()
  const sync = useSync()
  const dialog = useDialog()
  const toast = useToast()
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
  const options = createMemo(() => {
    const pinned = new Set(config.sidebar_buttons)
    return entries().map((entry) => ({
      title: typeof entry.command.title === "string" ? entry.command.title : entry.command.name,
      description: typeof entry.command.desc === "string" ? entry.command.desc : undefined,
      category: paletteHeading(entry.command, props.category),
      // ◆ marks commands pinned to the sidebar.
      footer: [pinned.has(entry.command.name) ? "◆" : "", formatKeyBindings(entry.bindings, config)]
        .filter(Boolean)
        .join(" "),
      value: entry.command.name,
      suggested: isSuggestedPaletteCommand(entry),
      onSelect: (dialog: DialogContext) => {
        const previous = dialog.stack.at(-1)
        keymap.dispatchCommand(entry.command.name)
        if (dialog.stack.at(-1) === previous) dialog.clear()
      },
    }))
  })

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
          dialog.replace(() => <DialogHotkey command={name} title={selected.title} />, undefined, {
            back: () => dialog.replace(() => <CommandPaletteDialog category={props.category} />),
          })
        },
      },
      {
        name: "palette.toggle_sidebar",
        title: "Add or remove the selected command from the sidebar",
        category: "Dialog",
        run() {
          const selected = ref?.selected
          if (!selected?.value) return
          toggleSidebarButton(config, toast, selected.value, selected.title)
        },
      },
    ],
    bindings: config.keybinds.gather("palette", ["palette.set_hotkey", "palette.toggle_sidebar"]),
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

  return <DialogSelect ref={(value) => (ref = value)} title="Commands" options={list()} preserveSelection />
}

function paletteHeading(command: PaletteCommandEntry["command"], shown: string | undefined) {
  const category = typeof command.category === "string" ? command.category : undefined
  if (typeof command.group !== "string") return category
  return shown ? command.group : `${category} ${command.group}`
}
