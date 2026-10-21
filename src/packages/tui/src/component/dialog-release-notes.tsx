// Release notes for the oc version just installed (upstream 2bf145b931 highlights, combined with
// oc's own updater): the body of the oc GitHub release, shown once per version after an update.
import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useKeyboard, useTerminalDimensions } from "@opentui/solid"
import { InstallationDisplayVersion, InstallationLocal } from "@opencode-ai/core/installation/version"
import { OcRelease } from "@opencode-ai/core/util/ocRelease"
import { useTuiConfig } from "../config"
import type { useKV } from "../context/kv"
import { createSyntaxStyleMemo, generateSubtleSyntax, useTheme } from "../context/theme"
import { useDialog, type DialogContext } from "../ui/dialog"
import type { ToastContext } from "../ui/toast"
import { getScrollAcceleration } from "../util/scroll"

// Last oc version this machine ran; a newer installed version means an update just happened.
export const RELEASE_NOTES_SHOWN = "release_notes_shown"

/** True when `installed` is newer than the version notes were last recorded for (not on first run). */
export function releaseNotesDue(shown: string | undefined, installed: string) {
  return shown !== undefined && OcRelease.isNewer(installed, shown)
}

export async function releaseNotesAfterUpdate(
  kv: ReturnType<typeof useKV>,
  dialog: DialogContext,
  toast: ToastContext,
) {
  if (InstallationLocal) return
  const shown: string | undefined = kv.get(RELEASE_NOTES_SHOWN)
  if (shown === InstallationDisplayVersion) return
  kv.set(RELEASE_NOTES_SHOWN, InstallationDisplayVersion)
  if (!releaseNotesDue(shown, InstallationDisplayVersion)) return
  const release = await OcRelease.lookup(InstallationDisplayVersion).catch(() => undefined)
  if (!release?.notes) {
    toast.show({
      variant: "info",
      message: `Updated to oc v${InstallationDisplayVersion} (no release notes published)`,
    })
    return
  }
  const notes = release.notes
  dialog.replace(() => <DialogReleaseNotes version={InstallationDisplayVersion} notes={notes} />)
}

export function DialogReleaseNotes(props: { version: string; notes: string }) {
  const dialog = useDialog()
  const config = useTuiConfig()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const syntax = createSyntaxStyleMemo(() => generateSubtleSyntax(theme))
  const maxHeight = () => Math.max(3, Math.floor(dimensions().height / 2))
  let scroll: ScrollBoxRenderable | undefined

  useKeyboard((evt) => {
    if (evt.name === "up") return scroll?.scrollBy(-1)
    if (evt.name === "down") return scroll?.scrollBy(1)
    if (evt.name === "pageup") return scroll?.scrollBy(-maxHeight())
    if (evt.name === "pagedown") return scroll?.scrollBy(maxHeight())
  })

  return (
    <box paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between" paddingLeft={2} paddingRight={2}>
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          oc v{props.version} release notes
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.escape()}>
          esc
        </text>
      </box>
      <scrollbox
        ref={(element: ScrollBoxRenderable) => (scroll = element)}
        maxHeight={maxHeight()}
        scrollbarOptions={{ visible: false }}
        scrollAcceleration={getScrollAcceleration(config)}
      >
        <box paddingLeft={2} paddingRight={2}>
          <markdown
            syntaxStyle={syntax()}
            content={props.notes}
            conceal
            internalBlockMode="top-level"
            tableOptions={{ style: "grid", cellPaddingX: 1 }}
            fg={theme.markdownText}
            bg={theme.background}
          />
        </box>
      </scrollbox>
    </box>
  )
}
