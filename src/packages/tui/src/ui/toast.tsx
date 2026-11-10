import { createContext, useContext, type ParentProps, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useTerminalDimensions } from "@opentui/solid"
import { SplitBorder } from "./border"
import { TextAttributes } from "@opentui/core"
import { errorMessage } from "../util/error"
export type ToastOptions = {
  title?: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
  // Fixed box width (still capped by the terminal); live redraws use it so the box does not jump.
  width?: number
  // Clicking the toast runs it; Notices keeps it so the action stays reachable after the toast is gone.
  action?: ToastAction
}
export type ToastAction = {
  label: string
  run: () => void
}
// `log: false` keeps the toast out of Notices (live progress redraws).
type ToastInput = Omit<ToastOptions, "duration"> & { duration?: number; log?: boolean }
export type ToastNotice = Omit<ToastOptions, "duration"> & { time: number }

// Toasts vanish after a few seconds; the oc Notices palette entry lists these.
const _NOTICE_LIMIT = 100
export const TOAST_MAX_WIDTH = 60
// Longer prompt notice messages are cut; Notices keeps the full text.
const _NOTICE_MESSAGE_ROWS = 6
// "floating" keeps the floating box; any other value (default "prompt") docks toasts above the prompt.
export const TOAST_DISPLAY_KEY = "toast_display"

type Theme = ReturnType<typeof useTheme>["theme"]

function variantColor(theme: Theme, variant: ToastOptions["variant"]) {
  return variant === "info" ? theme.warning : theme[variant]
}

export function Toast() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <Show when={!toast.docked && toast.currentToast}>
      {(current) => (
        <box
          position="absolute"
          justifyContent="center"
          alignItems="flex-start"
          top={2}
          right={2}
          width={current().width ?? "auto"}
          maxWidth={Math.min(TOAST_MAX_WIDTH, dimensions().width - 6)}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme.backgroundToast}
          borderColor={variantColor(theme, current().variant)}
          border={["left", "right"]}
          customBorderChars={SplitBorder.customBorderChars}
          onMouseOver={toast.pause}
          onMouseOut={toast.resume}
          onMouseUp={toast.activate}
        >
          <Show when={current().title}>
            <text attributes={TextAttributes.BOLD} marginBottom={1} fg={theme.text}>
              {current().title}
            </text>
          </Show>
          <text fg={theme.text} wrapMode="word" width="100%">
            {current().message}
          </text>
          <Show when={current().action}>
            {(action) => (
              <text fg={theme.accent} attributes={TextAttributes.BOLD} marginTop={1}>
                › {action().label} (click)
              </text>
            )}
          </Show>
          <Show when={current().variant === "warning" || current().variant === "error"}>
            <text fg={theme.textMuted} marginTop={1}>
              /notices to read again
            </text>
          </Show>
        </box>
      )}
    </Show>
  )
}

// The current toast as a rail right above the prompt box, where the user is already looking. The
// prompt docks it with toast.dock(); click runs the action, hover pauses dismissal.
export function PromptNotice(props: { indent: number }) {
  const toast = useToast()
  const { theme } = useTheme()

  return (
    <Show when={toast.currentToast}>
      {(current) => (
        <box
          flexShrink={0}
          paddingLeft={props.indent}
          paddingRight={props.indent}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme.backgroundPanel}
          borderColor={variantColor(theme, current().variant)}
          border={["left"]}
          customBorderChars={SplitBorder.customBorderChars}
          onMouseOver={toast.pause}
          onMouseOut={toast.resume}
          onMouseUp={toast.activate}
        >
          <Show when={current().title}>
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              {current().title}
            </text>
          </Show>
          {/* Only the message is capped, so the title and action rows always show. */}
          <box maxHeight={_NOTICE_MESSAGE_ROWS} overflow="hidden">
            <text flexShrink={0} fg={current().title ? theme.textMuted : theme.text} wrapMode="word" width="100%">
              {current().message}
            </text>
          </box>
          <Show when={current().action || current().variant === "warning" || current().variant === "error"}>
            <text>
              <Show when={current().action}>
                {(action) => <span style={{ fg: theme.secondary }}>&gt; {action().label} </span>}
              </Show>
              <Show when={current().variant === "warning" || current().variant === "error"}>
                <span style={{ fg: theme.textMuted }}> /notices to read again</span>
              </Show>
            </text>
          </Show>
        </box>
      )}
    </Show>
  )
}

function init() {
  const [store, setStore] = createStore({
    currentToast: null as ToastOptions | null,
    notices: [] as ToastNotice[],
    // Mounted prompts showing the toast; a count because a keyed remount briefly overlaps two.
    docks: 0,
  })

  let timeoutHandle: NodeJS.Timeout | null = null
  // Hover pauses the dismiss timer so an action toast can be clicked
  let startedAt = 0
  let remaining = 0
  let paused = false

  const start = (duration: number) => {
    if (timeoutHandle) clearTimeout(timeoutHandle)
    remaining = duration
    startedAt = Date.now()
    timeoutHandle = setTimeout(() => toast.dismiss(), duration).unref()
  }

  const toast = {
    show({ log = true, ...options }: ToastInput) {
      const toastOptions = { ...options, duration: options.duration ?? 5000 }
      setStore("currentToast", toastOptions)
      if (log) {
        setStore("notices", (notices) =>
          [
            {
              title: options.title,
              message: options.message,
              variant: options.variant,
              action: options.action,
              time: Date.now(),
            },
            ...notices,
          ].slice(0, _NOTICE_LIMIT),
        )
      }
      paused = false
      start(toastOptions.duration)
    },
    error: (err: unknown) => {
      toast.show({ variant: "error", message: errorMessage(err) })
    },
    dismiss() {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      timeoutHandle = null
      paused = false
      setStore("currentToast", null)
    },
    pause() {
      if (!store.currentToast || paused) return
      paused = true
      remaining = Math.max(0, remaining - (Date.now() - startedAt))
      if (timeoutHandle) clearTimeout(timeoutHandle)
      timeoutHandle = null
    },
    resume() {
      if (!store.currentToast || !paused) return
      paused = false
      start(remaining)
    },
    /** Click on the toast: dismisses it and runs its action, if any. */
    activate() {
      const action = store.currentToast?.action
      toast.dismiss()
      action?.run()
    },
    /** Shows toasts in the caller instead of floating; call the returned function to undock. */
    dock() {
      setStore("docks", (count) => count + 1)
      return () => setStore("docks", (count) => count - 1)
    },
    get docked() {
      return store.docks > 0
    },
    get currentToast(): ToastOptions | null {
      return store.currentToast
    },
    /** Every toast this TUI showed, newest first. */
    get notices(): readonly ToastNotice[] {
      return store.notices
    },
  }
  return toast
}

export type ToastContext = ReturnType<typeof init>

const ctx = createContext<ToastContext>()

export function ToastProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useToast() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}
