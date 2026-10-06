import { MouseButton, type MouseEvent } from "@opentui/core"
import type { ClipboardService } from "../context/clipboard"
import type { OpenTuiKeymap } from "../keymap"

export const COPY_ON_SELECT_KEY = "copy_on_select"

export function defaultCopyOnSelect(): boolean {
  const seeded = envCopyOnSelectSeed()
  if (seeded !== undefined) return seeded
  return true
}

export function envCopyOnSelectSeed(): boolean | undefined {
  const raw = process.env["OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  if (raw === undefined) return undefined
  const value = raw.toLowerCase()
  return !(value === "true" || value === "1")
}

type Toast = {
  show: (input: { message: string; variant: "info" | "success" | "warning" | "error" }) => void
  error: (err: unknown) => void
}

type FocusableSelectionTarget = {
  hasSelection: () => boolean
  getClipboardText?: (text: string) => string
}

type Renderer = {
  getSelection: () => { getSelectedText: () => string; selectedRenderables: FocusableSelectionTarget[] } | null
  clearSelection: () => void
  currentFocusedRenderable?: FocusableSelectionTarget | null
}

type SelectionKeyEvent = {
  ctrl?: boolean
  name: string
  preventDefault: () => void
  stopPropagation: () => void
}

export function copy(renderer: Renderer, toast: Toast, clipboard: ClipboardService): boolean {
  if (!clipboard.write) return false
  const selection = renderer.getSelection()
  if (!selection) return false

  const text = selection.getSelectedText()
  if (!text) return false

  const focus = renderer.currentFocusedRenderable
  const clipboardText =
    focus?.getClipboardText && selection.selectedRenderables.includes(focus) ? focus.getClipboardText(text) : text

  // Native clipboard processes can finish out of order during double/triple clicks.
  const pending = (copies.get(clipboard) ?? Promise.resolve())
    .then(() => clipboard.write!(clipboardText))
    .then(() => toast.show({ message: "Copied to clipboard", variant: "info" }), toast.error)
  copies.set(clipboard, pending)

  return true
}

const copies = new WeakMap<ClipboardService, Promise<void>>()

export function registerKeys(keymap: OpenTuiKeymap, renderer: Renderer, toast: Toast, clipboard: ClipboardService) {
  return keymap.intercept("key", ({ event }) => handleSelectionKey(renderer, toast, event, clipboard), { priority: 1 })
}

export function copyOnMouseUp(
  renderer: Renderer,
  toast: Toast,
  event: Pick<MouseEvent, "button" | "isDragging">,
  clipboard: ClipboardService,
) {
  if (event.button !== MouseButton.LEFT || !event.isDragging) return false
  return copy(renderer, toast, clipboard)
}

export function copyOnMouseDown(
  renderer: Renderer,
  toast: Toast,
  event: Pick<MouseEvent, "button" | "preventDefault" | "stopPropagation">,
  clipboard: ClipboardService,
) {
  if (event.button !== MouseButton.RIGHT || !copy(renderer, toast, clipboard)) return
  event.preventDefault()
  event.stopPropagation()
}

export function handleSelectionKey(
  renderer: Renderer,
  toast: Toast,
  event: SelectionKeyEvent,
  clipboard: ClipboardService,
) {
  const selection = renderer.getSelection()
  if (!selection) return
  if (!selection.getSelectedText()) {
    renderer.clearSelection()
    return
  }

  if (event.ctrl && event.name === "c") {
    copy(renderer, toast, clipboard)

    event.preventDefault()
    event.stopPropagation()
    return
  }

  if (event.name === "escape") {
    renderer.clearSelection()
    event.preventDefault()
    event.stopPropagation()
    return
  }

  const focus = renderer.currentFocusedRenderable
  if (focus?.hasSelection() && selection.selectedRenderables.includes(focus)) return

  renderer.clearSelection()
}

export * as Selection from "./selection"
