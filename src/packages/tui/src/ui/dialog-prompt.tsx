import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "./dialog"
import { For, Show, createEffect, createSignal, onMount, type JSX } from "solid-js"
import { Spinner } from "../component/spinner"
import { useTuiConfig } from "../config"
import { useBindings, useCommandShortcut } from "../keymap"

export type DialogPromptProps = {
  title: string
  description?: () => JSX.Element
  placeholder?: string
  value?: string
  numeric?: { min: number; max: number; step: number }
  busy?: boolean
  busyText?: string
  // Three wrapped rows for prompt-length text; otherwise a single unwrapped row.
  multiline?: boolean
  onConfirm?: (value: string) => void
  onCancel?: () => void
  onContentChange?: (value: string) => void
  actions?: { command: string; title: string; onTrigger: () => void }[]
}

function ActionHint(props: { command: string; title: string }) {
  const { theme } = useTheme()
  const shortcut = useCommandShortcut(props.command)
  return (
    <Show when={shortcut()}>
      <text fg={theme.text}>
        {shortcut()} <span style={{ fg: theme.textMuted }}>{props.title}</span>
      </text>
    </Show>
  )
}

export function DialogPrompt(props: DialogPromptProps) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const submitShortcut = useCommandShortcut("dialog.prompt.submit")
  const [textareaTarget, setTextareaTarget] = createSignal<TextareaRenderable>()
  let textarea: TextareaRenderable

  function confirm() {
    if (props.busy) return
    props.onConfirm?.(textarea.plainText)
  }

  function step(direction: number) {
    const numeric = props.numeric
    if (!numeric) return
    const text = textarea.plainText.trim()
    const value = Number(text)
    textarea.setText(
      String(
        Math.min(
          numeric.max,
          Math.max(numeric.min, text && Number.isFinite(value) ? value + direction * numeric.step : numeric.min),
        ),
      ),
    )
    textarea.gotoLineEnd()
  }

  useBindings(() => ({
    target: textareaTarget,
    enabled: textareaTarget() !== undefined && !props.busy,
    // Dialog form semantics must win over the global managed textarea input layer.
    priority: 1,
    commands: [
      {
        name: "dialog.prompt.submit",
        title: "Submit dialog prompt",
        category: "Dialog",
        run: confirm,
      },
      ...(props.actions ?? []).map((item) => ({
        name: item.command,
        title: item.title,
        category: "Dialog",
        run: item.onTrigger,
      })),
    ],
    bindings: [
      ...(props.numeric
        ? [
            { key: "up", desc: "Increase value", group: "Dialog", cmd: () => step(1) },
            { key: "down", desc: "Decrease value", group: "Dialog", cmd: () => step(-1) },
          ]
        : []),
      ...tuiConfig.keybinds.gather("dialog.prompt", ["dialog.prompt.submit"]),
      ...(props.actions ?? []).flatMap((item) => tuiConfig.keybinds.get(item.command)),
    ],
  }))

  onMount(() => {
    dialog.setSize("medium")
    setTimeout(() => {
      if (!textarea || textarea.isDestroyed) return
      if (props.busy) return
      textarea.focus()
    }, 1)
    textarea.gotoLineEnd()
    props.onContentChange?.(textarea.plainText)
  })

  createEffect(() => {
    if (!textarea || textarea.isDestroyed) return
    const traits = props.busy
      ? {
          suspend: true,
          status: "BUSY",
        }
      : {}
    textarea.traits = traits
    if (props.busy) {
      textarea.blur()
      return
    }
    textarea.focus()
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {props.title}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
          esc
        </text>
      </box>
      <box gap={1}>
        {props.description?.()}
        <textarea
          height={props.multiline ? 3 : 1}
          wrapMode={props.multiline ? "word" : "none"}
          ref={(val: TextareaRenderable) => {
            textarea = val
            setTextareaTarget(val)
          }}
          initialValue={props.value}
          placeholder={props.placeholder ?? "Enter text"}
          placeholderColor={theme.textMuted}
          textColor={props.busy ? theme.textMuted : theme.text}
          focusedTextColor={props.busy ? theme.textMuted : theme.text}
          cursorColor={props.busy ? theme.backgroundElement : theme.text}
          cursorStyle={tuiConfig.cursor}
          onContentChange={() => props.onContentChange?.(textarea.plainText)}
        />
        <Show when={props.busy}>
          <Spinner color={theme.textMuted}>{props.busyText ?? "Working…"}</Spinner>
        </Show>
      </box>
      <box paddingBottom={1} gap={1} flexDirection="row">
        <Show when={!props.busy} fallback={<text fg={theme.textMuted}>processing…</text>}>
          <Show when={props.numeric}>
            {(numeric) => (
              <text fg={theme.text}>
                ↑ <span style={{ fg: theme.textMuted }}>+{numeric().step}</span>
                {"  "}↓ <span style={{ fg: theme.textMuted }}>-{numeric().step}</span>
              </text>
            )}
          </Show>
          <Show when={submitShortcut()}>
            <text fg={theme.text}>
              {submitShortcut()} <span style={{ fg: theme.textMuted }}>submit</span>
            </text>
          </Show>
          <For each={props.actions}>{(item) => <ActionHint command={item.command} title={item.title} />}</For>
        </Show>
      </box>
    </box>
  )
}

DialogPrompt.show = (dialog: DialogContext, title: string, options?: Omit<DialogPromptProps, "title">) => {
  return new Promise<string | null>((resolve) => {
    dialog.replace(
      () => (
        <DialogPrompt title={title} {...options} onConfirm={(value) => resolve(value)} onCancel={() => resolve(null)} />
      ),
      () => resolve(null),
    )
  })
}
