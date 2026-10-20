import { createContext, useContext, type ParentProps, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useTerminalDimensions } from "@opentui/solid"
import { SplitBorder } from "./border"
import { TextAttributes } from "@opentui/core"
export type ToastOptions = {
  title?: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
  // Fixed box width (still capped by the terminal); live redraws use it so the box does not jump.
  width?: number
}
// `log: false` keeps the toast out of Notices (live progress redraws).
type ToastInput = Omit<ToastOptions, "duration"> & { duration?: number; log?: boolean }
export type ToastNotice = Omit<ToastOptions, "duration"> & { time: number }

// Toasts vanish after a few seconds; the oc Notices palette entry lists these.
const _NOTICE_LIMIT = 100
export const TOAST_MAX_WIDTH = 60

export function Toast() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <Show when={toast.currentToast}>
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
          borderColor={current().variant === "info" ? theme.warning : theme[current().variant]}
          border={["left", "right"]}
          customBorderChars={SplitBorder.customBorderChars}
        >
          <Show when={current().title}>
            <text attributes={TextAttributes.BOLD} marginBottom={1} fg={theme.text}>
              {current().title}
            </text>
          </Show>
          <text fg={theme.text} wrapMode="word" width="100%">
            {current().message}
          </text>
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

function init() {
  const [store, setStore] = createStore({
    currentToast: null as ToastOptions | null,
    notices: [] as ToastNotice[],
  })

  let timeoutHandle: NodeJS.Timeout | null = null

  const toast = {
    show({ log = true, ...options }: ToastInput) {
      const toastOptions = { ...options, duration: options.duration ?? 5000 }
      setStore("currentToast", toastOptions)
      if (log) {
        setStore("notices", (notices) =>
          [
            { title: options.title, message: options.message, variant: options.variant, time: Date.now() },
            ...notices,
          ].slice(0, _NOTICE_LIMIT),
        )
      }
      if (timeoutHandle) clearTimeout(timeoutHandle)
      timeoutHandle = setTimeout(() => {
        setStore("currentToast", null)
      }, toastOptions.duration).unref()
    },
    error: (err: any) => {
      if (err instanceof Error)
        return toast.show({
          variant: "error",
          message: err.message,
        })
      toast.show({
        variant: "error",
        message: "An unknown error has occurred",
      })
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
