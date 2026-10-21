// Full error for a failed plugin or MCP server (upstream 70853b1e5b, 3d7ba38965): copy it, or
// investigate it in a new session whose prompt is prefilled with the error and where to look.
import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createSignal } from "solid-js"
import { useTuiConfig } from "../config"
import { useClipboard } from "../context/clipboard"
import { useRoute } from "../context/route"
import { useTheme } from "../context/theme"
import { useBindings, useCommandShortcut } from "../keymap"
import { useDialog, type DialogContext } from "../ui/dialog"
import type { ToastContext } from "../ui/toast"

export type ErrorDetails = {
  title: string
  error: string
  /** Extra lines for the investigate prompt and copy, e.g. "Source: ..." */
  context?: string
}

export function errorDetailsText(props: ErrorDetails) {
  return [props.title, props.context, `Error: ${props.error}`].filter(Boolean).join("\n")
}

export function investigatePrompt(props: ErrorDetails) {
  return (
    `Investigate why this oc component failed in the current project.\n\n${errorDetailsText(props)}\n\n` +
    "Inspect the relevant project and global oc configuration, startup or loading behavior, required " +
    "environment variables or credentials, dependencies, and logs. Identify the root cause and recommend a fix."
  )
}

export function DialogErrorDetails(props: ErrorDetails) {
  const dialog = useDialog()
  const route = useRoute()
  const clipboard = useClipboard()
  const config = useTuiConfig()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()
  const investigateKey = useCommandShortcut("dialog.error_details.investigate")
  const copyKey = useCommandShortcut("dialog.error_details.copy")
  const [copied, setCopied] = createSignal<boolean | string>(false)

  const copy = () => {
    void (clipboard.write?.(errorDetailsText(props)) ?? Promise.reject(new Error("Clipboard is not available")))
      .then(() => setCopied(true))
      .catch((error: unknown) => setCopied(error instanceof Error ? error.message : String(error)))
  }
  const investigate = () => {
    dialog.clear()
    route.navigate({ type: "home", prompt: { input: investigatePrompt(props), parts: [] } })
  }

  useBindings(() => ({
    mode: "modal",
    commands: [
      { name: "dialog.error_details.investigate", title: "Investigate error", category: "Dialog", run: investigate },
      { name: "dialog.error_details.copy", title: "Copy error details", category: "Dialog", run: copy },
    ],
    bindings: config.keybinds.gather("dialog.error_details", [
      "dialog.error_details.investigate",
      "dialog.error_details.copy",
    ]),
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
          esc
        </text>
      </box>
      <scrollbox maxHeight={Math.max(3, Math.floor(dimensions().height / 2) - 6)}>
        <text fg={theme.text} wrapMode="word">
          {props.error}
        </text>
        <text fg={theme.textMuted} wrapMode="word">
          {props.context ?? ""}
        </text>
      </scrollbox>
      <box flexDirection="row" gap={3} justifyContent="flex-end">
        <text onMouseUp={investigate}>
          <span style={{ fg: theme.text }}>
            <b>{investigateKey()}</b>
          </span>
          <span style={{ fg: theme.textMuted }}> investigate in new session</span>
        </text>
        <text onMouseUp={copy}>
          <span style={{ fg: copied() === true ? theme.success : theme.text }}>
            <b>{copied() === true ? "copied" : copyKey()}</b>
          </span>
          <span style={{ fg: typeof copied() === "string" ? theme.error : theme.textMuted }}>
            {copied() === true ? "" : typeof copied() === "string" ? ` copy failed: ${copied()}` : " copy details"}
          </span>
        </text>
      </box>
    </box>
  )
}

/** Error toast whose click (or Notices ctrl+r) opens the details dialog. */
export function showFailureToast(toast: ToastContext, dialog: DialogContext, details: ErrorDetails) {
  toast.show({
    variant: "error",
    title: details.title,
    message: details.error,
    action: {
      label: "View details",
      run: () => dialog.replace(() => <DialogErrorDetails {...details} />),
    },
  })
}
