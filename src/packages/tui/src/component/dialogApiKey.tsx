import { decodePasteBytes, TextAttributes, type KeyEvent, type PasteEvent, type Renderable } from "@opentui/core"
import type { CommandContext } from "@opentui/keymap"
import { usePaste } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { useTuiConfig } from "../config"
import { useClipboard } from "../context/clipboard"
import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import { useDialog } from "../ui/dialog"

const KEY_PATTERN = /^sk-ant-\S+$/

// Takes a Console API key from the user's paste only: no text field, typed keys do nothing, and only the
// last 4 characters are shown. Bracketed paste carries the bytes; the paste key (WezTerm oc panes send
// Cmd+V / Ctrl+V as a key) reads the clipboard with that key event as the trigger.
export function DialogApiKey(props: { onSave: (key: string) => Promise<void> }) {
  const dialog = useDialog()
  const config = useTuiConfig()
  const clipboard = useClipboard()
  const { theme } = useTheme()
  const [key, setKey] = createSignal("")
  const [invalid, setInvalid] = createSignal(false)

  function accept(text: string) {
    const value = text.trim()
    setInvalid(!KEY_PATTERN.test(value))
    if (KEY_PATTERN.test(value)) setKey(value)
  }

  async function save() {
    if (!key()) return setInvalid(true)
    dialog.clear()
    await props.onSave(key())
  }

  async function pasteKey(trigger: KeyEvent | PasteEvent) {
    const content = await clipboard.read?.(trigger)
    accept(content?.mime === "text/plain" ? content.data : "")
  }

  useBindings(() => ({
    mode: "modal",
    priority: 1,
    bindings: [
      { key: "return", desc: "Save Claude API key", group: "Dialog", cmd: () => void save() },
      ...config.keybinds.get("prompt.paste").map((binding) => ({
        ...binding,
        preventDefault: true,
        cmd: (ctx: CommandContext<Renderable, KeyEvent>) => void pasteKey(ctx.event),
      })),
    ],
  }))
  usePaste((event) => {
    event.preventDefault()
    event.stopPropagation()
    accept(decodePasteBytes(event.bytes))
  })

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Set Claude API key
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
          esc
        </text>
      </box>
      <box flexDirection="row" gap={1}>
        <text fg={theme.textMuted}>Key</text>
        <text fg={key() ? theme.text : theme.textMuted}>{key() ? `sk-ant-…${key().slice(-4)}` : "none"}</text>
      </box>
      <Show when={invalid()}>
        <text fg={theme.error}>Not a Console API key (sk-ant-…)</text>
      </Show>
    </box>
  )
}
