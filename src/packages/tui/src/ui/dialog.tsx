import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { batch, createContext, createEffect, onCleanup, Show, useContext, type JSX, type ParentProps } from "solid-js"
import { useTheme } from "../context/theme"
import { MouseButton, Renderable, RGBA } from "@opentui/core"
import { createStore } from "solid-js/store"
import { useToast } from "./toast"
import { useBindings, useOpencodeModeStack } from "../keymap"
import { useClipboard } from "../context/clipboard"
import { useKV } from "../context/kv"
import { Selection } from "../util/selection"

export function Dialog(
  props: ParentProps<{
    size?: "medium" | "large" | "xlarge"
    onClose: () => void
  }>,
) {
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const renderer = useRenderer()

  let dismiss = false
  const width = () => {
    if (props.size === "xlarge") return 116
    if (props.size === "large") return 88
    return 60
  }

  return (
    <box
      onMouseDown={(evt) => {
        dismiss = evt.target !== evt.currentTarget && !!renderer.getSelection()
      }}
      onMouseUp={(evt) => {
        if (evt.button !== MouseButton.LEFT) return
        if (dismiss) {
          dismiss = false
          return
        }
        props.onClose?.()
      }}
      width={dimensions().width}
      height={dimensions().height}
      alignItems="center"
      position="absolute"
      zIndex={3000}
      paddingTop={dimensions().height / 4}
      left={0}
      top={0}
      backgroundColor={RGBA.fromInts(0, 0, 0, 150)}
    >
      <box
        onMouseUp={(e: { stopPropagation(): void }) => {
          // A selection release must bubble up to the copy-on-select handler in
          // DialogProvider; the backdrop's dismiss flag keeps it from closing the dialog.
          if (renderer.getSelection()?.getSelectedText()) return
          dismiss = false
          e.stopPropagation()
        }}
        width={width()}
        maxWidth={dimensions().width - 2}
        backgroundColor={theme.backgroundPanel}
        paddingTop={1}
      >
        {props.children}
      </box>
    </box>
  )
}

function init() {
  const [store, setStore] = createStore({
    stack: [] as {
      element: JSX.Element
      onClose?: () => void
    }[],
    size: "medium" as "medium" | "large" | "xlarge",
  })

  const renderer = useRenderer()
  const modeStack = useOpencodeModeStack()

  createEffect(() => {
    if (store.stack.length === 0) return
    const popMode = modeStack.push("modal")
    onCleanup(popMode)
  })

  let focus: Renderable | null
  let refocusTimer: ReturnType<typeof setTimeout> | undefined
  let refocusEpoch = 0
  function refocus() {
    const epoch = refocusEpoch
    if (refocusTimer) {
      clearTimeout(refocusTimer)
      refocusTimer = undefined
    }
    refocusTimer = setTimeout(() => {
      refocusTimer = undefined
      if (epoch !== refocusEpoch) return
      if (renderer.isDestroyed) return
      if (!focus) return
      if (focus.isDestroyed) return
      function find(item: Renderable) {
        for (const child of item.getChildren()) {
          if (child === focus) return true
          if (find(child)) return true
        }
        return false
      }
      let found = false
      try {
        found = find(renderer.root)
      } catch {
        found = false
      }
      if (!found) return
      // stale renderable protection
      if (focus.isDestroyed || renderer.isDestroyed) return
      focus.focus()
    }, 1)
  }
  onCleanup(() => {
    if (refocusTimer) {
      clearTimeout(refocusTimer)
      refocusTimer = undefined
    }
    refocusEpoch++
  })

  useBindings(() => ({
    enabled: store.stack.length > 0 && !renderer.getSelection()?.getSelectedText(),
    bindings: [
      {
        key: "escape",
        desc: "Close dialog",
        group: "Dialog",
        cmd: () => {
          require("node:fs").appendFileSync("C:/Users/Foster/AppData/Local/Temp/opencode/tuiDiag.txt", `${new Date().toISOString()} dialog escape\n`)
          if (renderer.getSelection()) {
            renderer.clearSelection()
          }
          const current = store.stack.at(-1)
          current?.onClose?.()
          setStore("stack", store.stack.slice(0, -1))
          refocus()
        },
      },
      {
        key: "ctrl+c",
        desc: "Close dialog",
        group: "Dialog",
        cmd: () => {
          if (renderer.getSelection()) {
            renderer.clearSelection()
          }
          const current = store.stack.at(-1)
          current?.onClose?.()
          setStore("stack", store.stack.slice(0, -1))
          refocus()
        },
      },
    ],
  }))

  return {
    clear() {
      require("node:fs").appendFileSync("C:/Users/Foster/AppData/Local/Temp/opencode/tuiDiag.txt", `${new Date().toISOString()} dialog.clear ${store.stack.length} ${new Error().stack?.split("\n").slice(2, 5).join(" | ")}\n`)
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      batch(() => {
        setStore("size", "medium")
        setStore("stack", [])
      })
      refocus()
    },
    replace(input: any, onClose?: () => void) {
      refocusEpoch++
      if (refocusTimer) {
        clearTimeout(refocusTimer)
        refocusTimer = undefined
      }
      if (store.stack.length === 0) {
        focus = renderer.currentFocusedRenderable
        // stale renderable protection: only blur if still in tree and not destroyed
        if (focus && !focus.isDestroyed && !renderer.isDestroyed) {
          try {
            focus.blur()
          } catch {}
        }
      }
      for (const item of store.stack) {
        if (item.onClose) item.onClose()
      }
      setStore("size", "medium")
      setStore("stack", [
        {
          element: input,
          onClose,
        },
      ])
      require("node:fs").appendFileSync("C:/Users/Foster/AppData/Local/Temp/opencode/tuiDiag.txt", `${new Date().toISOString()} dialog.replace done ${store.stack.length}\n`)
    },
    // Stacks over the current dialog so escape returns to it
    push(input: any) {
      setStore("stack", [...store.stack, { element: input }])
    },
    get stack() {
      return store.stack
    },
    get size() {
      return store.size
    },
    setSize(size: "medium" | "large" | "xlarge") {
      setStore("size", size)
    },
  }
}

export type DialogContext = ReturnType<typeof init>

const ctx = createContext<DialogContext>()

export function DialogProvider(props: ParentProps) {
  const value = init()
  const renderer = useRenderer()
  const toast = useToast()
  const clipboard = useClipboard()
  const kv = useKV()
  const copyOnSelect = () => kv.get(Selection.COPY_ON_SELECT_KEY, Selection.defaultCopyOnSelect()) as boolean

  return (
    <ctx.Provider value={value}>
      {props.children}
      <box
        position="absolute"
        zIndex={3000}
        onMouseDown={(evt: { button: number; preventDefault(): void; stopPropagation(): void }) => {
          if (copyOnSelect()) return
          Selection.copyOnMouseDown(renderer, toast, evt, clipboard)
        }}
        onMouseUp={copyOnSelect() ? (evt) => Selection.copyOnMouseUp(renderer, toast, evt, clipboard) : undefined}
      >
        <Show when={value.stack.length}>
          <Dialog onClose={() => value.clear()} size={value.size}>
            {value.stack.at(-1)!.element}
          </Dialog>
        </Show>
      </box>
    </ctx.Provider>
  )
}

export function useDialog() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useDialog must be used within a DialogProvider")
  }
  return value
}
