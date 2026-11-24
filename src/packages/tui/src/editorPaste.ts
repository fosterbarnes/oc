import { TextareaRenderable, type KeyEvent, type PasteEvent, type Renderable } from "@opentui/core"
import type { CommandContext } from "@opentui/keymap"
import { useRenderer } from "@opentui/solid"
import { useTuiConfig } from "./config"
import { useClipboard } from "./context/clipboard"
import { useBindings } from "./keymap"
import { useToast } from "./ui/toast"
import type { read } from "./clipboard"

export type PastedImage = { data: string; mime: string }

// Text fields outside the prompt that accept images (question answers) register a handler here.
// The prompt has its own paste path and attachment chips.
export const imagePasteTargets = new WeakMap<TextareaRenderable, (image: PastedImage) => void>()

// Some terminals send an image-only clipboard as an empty bracketed paste. Read the clipboard
// instead and hand an image to the field's registered handler; any text paste keeps its default.
export function pasteImageFromEvent(
  event: PasteEvent,
  editor: TextareaRenderable | undefined,
  clipboard: { read?: typeof read },
) {
  if (event.bytes.length) return
  const handler = editor && imagePasteTargets.get(editor)
  if (!handler) return
  event.preventDefault()
  void clipboard
    .read?.(event)
    .then((content) => {
      if (content?.mime.startsWith("image/") && !editor.isDestroyed) handler(content)
    })
    .catch(() => {})
}

// The paste key (input_paste, ctrl+v; Cmd+V in WezTerm oc panes sends it too) inserts clipboard text into
// any focused text field: dialog prompts, the palette filter, question and permission replies. The main
// prompt binds the same key to its own target (`prompt.paste`, images too) and wins on priority.
// Without this, ctrl+v in a dialog is a bare control byte and nothing is pasted.
export function useEditorPaste() {
  const renderer = useRenderer()
  const tuiConfig = useTuiConfig()
  const clipboard = useClipboard()
  const toast = useToast()
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
        if (!content?.data) return
        // Focus may have moved during the read (Tab to another field): paste only where the key was pressed.
        if (!(editor instanceof TextareaRenderable) || editor.isDestroyed || renderer.currentFocusedEditor !== editor) {
          return
        }
        if (content.mime.startsWith("image/")) {
          const handler = imagePasteTargets.get(editor)
          if (handler) handler(content)
          else toast.show({ message: "Images paste only into the prompt and question answers", variant: "info" })
          return
        }
        if (content.mime !== "text/plain") return
        // InputRenderable.insertText strips newlines and enforces maxLength for single-line fields.
        editor.insertText(content.data.replace(/\r\n?/g, "\n"))
      },
    })),
  }))
}
