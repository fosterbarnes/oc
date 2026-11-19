import { TextareaRenderable, type KeyEvent, type Renderable } from "@opentui/core"
import type { CommandContext } from "@opentui/keymap"
import { useRenderer } from "@opentui/solid"
import { useTuiConfig } from "./config"
import { useClipboard } from "./context/clipboard"
import { useBindings } from "./keymap"

// The paste key (input_paste, ctrl+v; Cmd+V in WezTerm oc panes sends it too) inserts clipboard text into
// any focused text field: dialog prompts, the palette filter, question and permission replies. The main
// prompt binds the same key to its own target (`prompt.paste`, images too) and wins on priority.
// Without this, ctrl+v in a dialog is a bare control byte and nothing is pasted.
export function useEditorPaste() {
  const renderer = useRenderer()
  const tuiConfig = useTuiConfig()
  const clipboard = useClipboard()
  useBindings(() => ({
    // Below the default 0, so the prompt's targeted paste layer runs instead of this one.
    priority: -1,
    enabled: () => renderer.currentFocusedEditor instanceof TextareaRenderable,
    bindings: tuiConfig.keybinds.get("prompt.paste").map((binding) => ({
      ...binding,
      preventDefault: true,
      cmd: async (ctx: CommandContext<Renderable, KeyEvent>) => {
        const editor = renderer.currentFocusedEditor
        const content = await clipboard.read?.(ctx.event)
        if (content?.mime !== "text/plain" || !content.data) return
        if (!(editor instanceof TextareaRenderable) || editor.isDestroyed) return
        // InputRenderable.insertText strips newlines and enforces maxLength for single-line fields.
        editor.insertText(content.data.replace(/\r\n?/g, "\n"))
      },
    })),
  }))
}
