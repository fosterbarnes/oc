import { TextAttributes } from "@opentui/core"
import { createSignal, For, Show } from "solid-js"
import { Global } from "@opencode-ai/core/global"
import {
  InstallationChannel,
  InstallationDisplayVersion,
  InstallationVersion,
  InstallationVersionTag,
} from "@opencode-ai/core/installation/version"
import { OcRelease } from "@opencode-ai/core/util/ocRelease"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { useClipboard } from "../context/clipboard"
import { useToast } from "../ui/toast"
import { useBindings } from "../keymap"
import { Link } from "../ui/link"
import { describeOS } from "../util/system"

const REPO_URL = `https://github.com/${OcRelease.REPO}`

export function DialogAbout() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const clipboard = useClipboard()
  const toast = useToast()
  const [copied, setCopied] = createSignal(false)

  const ocVersion =
    InstallationDisplayVersion === "local"
      ? "local"
      : `v${InstallationDisplayVersion.split("-")[0]} ${InstallationVersionTag}`.trim()
  const entries: { label: string; value: string; href?: string }[] = [
    { label: "oc", value: ocVersion },
    { label: "OpenCode", value: InstallationVersion === "local" ? "local" : `v${InstallationVersion}` },
    { label: "Build", value: `${Global.native ? "native" : "oc"}, ${InstallationChannel}` },
    { label: "Runtime", value: `Bun ${Bun.version}, ${describeOS()}` },
    { label: "Creator", value: "Foster Barnes (@fosterbarnes)" },
    { label: "Repo", value: REPO_URL, href: REPO_URL },
    { label: "Wiki", value: `${REPO_URL}/wiki`, href: `${REPO_URL}/wiki` },
    { label: "License", value: "MIT, based on OpenCode (anomalyco/opencode)" },
  ]

  const copy = () => {
    void clipboard
      .write?.(entries.map((entry) => `${entry.label}: ${entry.value}`).join("\n"))
      .then(() => {
        setCopied(true)
        toast.show({ message: "About info copied to clipboard", variant: "info" })
      })
      .catch(toast.error)
  }

  useBindings(() => ({
    bindings: [{ key: "return", desc: "Copy about info", group: "Dialog", cmd: copy }],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          About
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <box>
        <For each={entries}>
          {(entry) => (
            <box flexDirection="row" gap={1}>
              <text flexShrink={0} fg={theme.textMuted}>
                {entry.label.padEnd(10)}
              </text>
              <Show
                when={entry.href}
                fallback={
                  <text fg={theme.text} wrapMode="word">
                    {entry.value}
                  </text>
                }
              >
                {(href) => <Link href={href()} fg={theme.primary} wrapMode="none" />}
              </Show>
            </box>
          )}
        </For>
      </box>
      <box flexDirection="row" justifyContent="flex-end">
        <text onMouseUp={copy}>
          <span style={{ fg: copied() ? theme.success : theme.text }}>
            <b>{copied() ? "✓ copied" : "copy"}</b>{" "}
          </span>
          <span style={{ fg: theme.textMuted }}>enter</span>
        </text>
      </box>
    </box>
  )
}
