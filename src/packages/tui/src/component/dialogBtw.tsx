import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { createSignal, Match, onCleanup, Show, Switch } from "solid-js"
import { useTuiConfig } from "../config"
import { useClipboard } from "../context/clipboard"
import { useSDK } from "../context/sdk"
import { createSyntaxStyleMemo, generateSubtleSyntax, useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogPrompt } from "../ui/dialog-prompt"
import { useToast } from "../ui/toast"
import { errorMessage } from "../util/error"
import { getScrollAcceleration } from "../util/scroll"
import { Spinner } from "./spinner"

export type BtwTarget = {
  sessionID: string
  model: { providerID: string; modelID: string }
  agent: string
  variant: string | undefined
}

// One side question. Asks when no question is given. Closing the dialog (Esc) aborts only this
// request; the session itself keeps running.
export function DialogBtw(props: { target: BtwTarget; question?: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const toast = useToast()
  const clipboard = useClipboard()
  const tuiConfig = useTuiConfig()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const syntax = createSyntaxStyleMemo(() => generateSubtleSyntax(theme))
  const maxHeight = () => Math.max(3, Math.floor(dimensions().height / 2))
  const controller = new AbortController()
  const [question, setQuestion] = createSignal(props.question)
  const [answer, setAnswer] = createSignal<string>()
  const [failure, setFailure] = createSignal<string>()
  const [copied, setCopied] = createSignal(false)
  let scroll: ScrollBoxRenderable | undefined
  onCleanup(() => controller.abort())

  function ask(text: string) {
    setQuestion(text)
    const target = props.target
    sdk.client.session
      .generate(
        {
          sessionID: target.sessionID,
          prompt: text,
          model: target.model,
          agent: target.agent,
          variant: target.variant,
        },
        { signal: controller.signal, throwOnError: true },
      )
      .then((result) => {
        if (controller.signal.aborted) return
        dialog.setSize("large")
        setAnswer(result.data.text)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setFailure(errorMessage(error))
      })
  }

  if (props.question) ask(props.question)

  function copy() {
    const text = answer()
    if (text === undefined || !clipboard.write) return
    clipboard
      .write(text)
      .then(() => setCopied(true))
      .catch((error: unknown) => toast.show({ message: errorMessage(error), variant: "error" }))
  }

  useKeyboard((evt) => {
    if (answer() === undefined) return
    if (evt.name === "c") return copy()
    if (evt.name === "up") return scroll?.scrollBy(-1)
    if (evt.name === "down") return scroll?.scrollBy(1)
    if (evt.name === "pageup") return scroll?.scrollBy(-maxHeight())
    if (evt.name === "pagedown") return scroll?.scrollBy(maxHeight())
  })

  return (
    <Show
      when={question()}
      fallback={
        <DialogPrompt
          title="/btw"
          placeholder="Ask a side question"
          onConfirm={(value) => {
            const text = value.trim()
            if (text) ask(text)
          }}
        />
      }
    >
      {(text) => (
        <box gap={1}>
          <box paddingLeft={2} paddingRight={2}>
            <box flexDirection="row" justifyContent="space-between">
              <text attributes={TextAttributes.BOLD} fg={theme.text}>
                /btw
              </text>
              <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
                esc
              </text>
            </box>
            <text fg={theme.textMuted} wrapMode="word">
              {text()}
            </text>
          </box>
          <Switch>
            <Match when={failure()}>
              {(message) => (
                <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
                  <text fg={theme.error} wrapMode="word">
                    {message()}
                  </text>
                </box>
              )}
            </Match>
            <Match when={answer()}>
              {(markdown) => (
                <scrollbox
                  ref={(element: ScrollBoxRenderable) => (scroll = element)}
                  maxHeight={maxHeight()}
                  scrollbarOptions={{ visible: false }}
                  scrollAcceleration={getScrollAcceleration(tuiConfig)}
                >
                  <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1}>
                    <markdown
                      syntaxStyle={syntax()}
                      content={markdown()}
                      conceal
                      internalBlockMode="top-level"
                      tableOptions={{ style: "grid", cellPaddingX: 1 }}
                      fg={theme.markdownText}
                      bg={theme.background}
                    />
                  </box>
                </scrollbox>
              )}
            </Match>
            <Match when={true}>
              <box paddingLeft={2} paddingRight={2} paddingBottom={1}>
                <Spinner color={theme.textMuted}>Waiting for the answer</Spinner>
              </box>
            </Match>
          </Switch>
          <Show when={answer() !== undefined && failure() === undefined}>
            <box flexDirection="row" gap={3} paddingLeft={2} paddingRight={2} paddingBottom={1}>
              <text fg={copied() ? theme.success : theme.text} onMouseUp={copy}>
                {copied() ? "✓ copied" : "c copy"}
              </text>
              <text fg={theme.textMuted}>↑/↓ scroll</text>
            </box>
          </Show>
        </box>
      )}
    </Show>
  )
}
