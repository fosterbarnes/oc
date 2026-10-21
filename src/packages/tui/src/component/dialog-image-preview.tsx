import { NativeImage, TextAttributes } from "@opentui/core"
import { useRenderer, useTerminalDimensions } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"

export function imageSizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// Pixel size from the image header; undefined when the format cannot be decoded.
export function imageDimensions(bytes: Uint8Array) {
  try {
    const image = NativeImage.decode(bytes)
    try {
      return { width: image.width, height: image.height }
    } finally {
      image.dispose()
    }
  } catch {
    return undefined
  }
}

export function imagePreviewDetails(filename: string, bytes: Uint8Array) {
  const size = imageDimensions(bytes)
  return [filename, imageSizeLabel(bytes.length), size && `${size.width}×${size.height}`].filter(Boolean).join(" · ")
}

// Shown after an image is pasted into the prompt. Terminals without Kitty or Sixel graphics get the
// file details only.
export function DialogImagePreview(props: { label: string; filename: string; data: string }) {
  const dialog = useDialog()
  const renderer = useRenderer()
  const dimensions = useTerminalDimensions()
  const { theme } = useTheme()
  const bytes = Buffer.from(props.data, "base64")
  const details = imagePreviewDetails(props.filename, bytes)
  const graphics = renderer.capabilities?.kitty_graphics === true || renderer.capabilities?.sixel === true
  const [failed, setFailed] = createSignal(false)

  dialog.setSize("xlarge")

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" gap={2}>
        <text fg={theme.text} attributes={TextAttributes.BOLD} flexGrow={1}>
          {props.label} attached
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={graphics && !failed()}>
        <image
          source={bytes}
          fit="fit"
          protocol="auto"
          width="100%"
          height={Math.max(3, Math.floor(dimensions().height * 0.6) - 6)}
          onError={() => setFailed(true)}
        />
      </Show>
      <text fg={failed() ? theme.error : theme.textMuted} wrapMode="none" truncate>
        {failed() ? `Preview failed · ${details}` : details}
      </text>
    </box>
  )
}
