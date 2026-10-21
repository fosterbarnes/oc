import { TextAttributes, type ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { createEffect, createMemo, createSignal, on, onCleanup, Show } from "solid-js"
import stripAnsi from "strip-ansi"
import { useTuiConfig } from "../config"
import { useTheme } from "../context/theme"
import { useBindings } from "../keymap"
import { useDialog } from "../ui/dialog"
import { getScrollAcceleration } from "../util/scroll"

const LOG_BYTES = 64 * 1024

// Background job fields the bash tool stores in `metadata.background` (tool/shell.ts jobMetadata).
type ShellJob = { jobID: string; status: string; outLog?: string; errLog?: string }

// Follows one bash call: a background job (or a call moved there with Ctrl+B) is read from its log files once a
// second; a foreground call shows the live output the server streams into the part (its last 30,000 characters).
export function DialogShellOutput(props: { part: () => ToolPart | undefined }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const tuiConfig = useTuiConfig()
  const dimensions = useTerminalDimensions()
  const height = () => Math.max(3, Math.floor(dimensions().height * 0.6) - 6)
  let scroll: ScrollBoxRenderable | undefined

  dialog.setSize("xlarge")

  const metadata = createMemo(() => {
    const state = props.part()?.state
    return state && state.status !== "pending" ? (state.metadata ?? {}) : {}
  })
  const job = createMemo(() => shellJob(metadata().background))
  const [logs, setLogs] = createSignal<{ text: string; cut: boolean }>()

  createEffect(
    on(
      () => job()?.outLog,
      (outLog) => {
        setLogs(undefined)
        if (!outLog) return
        const errLog = job()?.errLog
        let disposed = false
        let timer: ReturnType<typeof setTimeout> | undefined
        // Keeps reading after exit while open, so the final flush shows. A missing file (attached to a
        // remote server) leaves the streamed part output in place.
        const poll = async () => {
          const next = await readJobLogs(outLog, errLog)
          if (disposed) return
          if (next) setLogs(next)
          timer = setTimeout(poll, 1000)
        }
        void poll()
        onCleanup(() => {
          disposed = true
          clearTimeout(timer)
        })
      },
    ),
  )

  const streamed = createMemo(() => (typeof metadata().output === "string" ? (metadata().output as string) : ""))
  const text = createMemo(() => stripAnsi(logs()?.text ?? streamed()).replace(/\r\n?/g, "\n"))
  const omitted = createMemo(() => logs()?.cut ?? streamed().startsWith("...\n\n"))
  const command = createMemo(() => {
    const input = props.part()?.state.input as Record<string, unknown> | undefined
    return typeof input?.command === "string" ? input.command : ""
  })

  useBindings(() => ({
    bindings: [
      { key: "up", desc: "Scroll output up", group: "Shell output", cmd: () => scroll?.scrollBy(-1) },
      { key: "down", desc: "Scroll output down", group: "Shell output", cmd: () => scroll?.scrollBy(1) },
      { key: "pageup", desc: "Scroll output up a page", group: "Shell output", cmd: () => scroll?.scrollBy(-height()) },
      {
        key: "pagedown",
        desc: "Scroll output down a page",
        group: "Shell output",
        cmd: () => scroll?.scrollBy(height()),
      },
      { key: "home", desc: "Jump to first output", group: "Shell output", cmd: () => scroll?.scrollTo(0) },
      { key: "end", desc: "Follow new output", group: "Shell output", cmd: () => scroll?.scrollTo(Infinity) },
    ],
  }))

  return (
    <box paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" gap={2}>
        <text fg={theme.text} attributes={TextAttributes.BOLD} flexGrow={1}>
          Shell output
        </text>
        <text fg={theme.textMuted}>{shellOutputStatus(props.part())}</text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.textMuted} maxHeight={3} wrapMode="word">
        {command()}
      </text>
      <Show when={omitted()}>
        <text fg={theme.textMuted}>Earlier output omitted · showing recent output</text>
      </Show>
      <scrollbox
        ref={(value: ScrollBoxRenderable) => (scroll = value)}
        height={height()}
        stickyScroll
        stickyStart="bottom"
        scrollbarOptions={{ visible: false }}
        scrollAcceleration={getScrollAcceleration(tuiConfig)}
      >
        <text fg={theme.text} wrapMode="word">
          {text() || "No output yet"}
        </text>
      </scrollbox>
      <text fg={theme.textMuted}>↑/↓ scroll · end follow · esc close</text>
    </box>
  )
}

export function shellOutputStatus(part: ToolPart | undefined) {
  if (!part) return "Unavailable"
  const state = part.state
  if (state.status === "pending") return "Starting"
  const job = shellJob(state.metadata?.background)
  if (job) return `Background ${job.jobID} · ${job.status.replace("_", " ")}`
  if (state.status === "running") return "Running"
  if (state.status === "error") return "Failed"
  const exit = state.metadata?.exit
  return typeof exit === "number" ? `Exited · code ${exit}` : "Exited"
}

function shellJob(value: unknown): ShellJob | undefined {
  if (!value || typeof value !== "object") return
  const job = value as Partial<ShellJob>
  if (typeof job.jobID !== "string" || typeof job.status !== "string") return
  return job as ShellJob
}

// Last LOG_BYTES of stdout plus stderr (moved calls log both to outLog); undefined when outLog is unreadable.
export async function readJobLogs(outLog: string, errLog?: string, bytes = LOG_BYTES) {
  const out = await readTail(outLog, bytes)
  if (!out) return
  const err = errLog ? await readTail(errLog, bytes) : undefined
  const text = err?.text
    ? `${out.text}${out.text.endsWith("\n") || !out.text ? "" : "\n"}--- stderr ---\n${err.text}`
    : out.text
  return { text, cut: out.cut || Boolean(err?.cut) }
}

async function readTail(path: string, bytes: number) {
  const file = Bun.file(path)
  if (!(await file.exists())) return
  const start = Math.max(0, file.size - bytes)
  const data = new Uint8Array(await file.slice(start).arrayBuffer())
  // Windows PowerShell can write UTF-16LE with a byte order mark.
  const utf16 = start === 0 && data[0] === 0xff && data[1] === 0xfe
  return { text: new TextDecoder(utf16 ? "utf-16le" : "utf-8").decode(data), cut: start > 0 }
}
