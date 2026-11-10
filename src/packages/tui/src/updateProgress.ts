import { PROGRESS_PREFIX, STEP_PREFIX } from "./desktopUpdate"
import { TOAST_MAX_WIDTH, type ToastContext } from "./ui/toast"

// Live progress for Third party updates: one toast with a line per item, redrawn on each change
// and every second while an item shows elapsed time. Redraws stay out of Notices; the caller's
// result or summary toast is the logged record.
export type UpdatePhase =
  | "waiting"
  | "checking"
  | "awaiting confirm"
  | "updating"
  | "downloading"
  | "verifying"
  | "installing"
  | "updated"
  | "up to date"
  | "already running"
  | "skipped"
  | "update by hand"
  | "failed"

export type UpdateRow = {
  label: string
  phase: UpdatePhase
  detail: string
  since: number
  received: number
  total: number
}

const _TIMED = new Set<UpdatePhase>(["checking", "updating", "downloading", "verifying", "installing"])
// Phases the update scripts announce with Write-OcStep.
const _STEPS = new Set<string>(["downloading", "verifying", "installing"])
// Updater output can be long; the toast or prompt notice word-wraps whatever is left.
const _DETAIL_WIDTH = 80
const _MB = 1024 * 1024

function megabytes(bytes: number) {
  return (bytes / _MB).toFixed(bytes < 10 * _MB ? 1 : 0)
}

function rowStatus(row: UpdateRow, now: number) {
  if (row.phase === "downloading" && row.total > 0) {
    const percent = Math.floor((100 * row.received) / row.total)
    return `downloading ${percent}% (${megabytes(row.received)}/${megabytes(row.total)} MB)`
  }
  if (row.phase === "downloading" && row.received > 0) return `downloading ${megabytes(row.received)} MB`
  const base = _TIMED.has(row.phase) ? `${row.phase} ${Math.floor((now - row.since) / 1000)}s` : row.phase
  return row.detail ? `${base}: ${clip(row.detail, _DETAIL_WIDTH)}` : base
}

function clip(text: string, width: number) {
  return text.length > width ? `${text.slice(0, width - 3)}...` : text
}

// One line per row; the renderer wraps it to the toast or prompt notice width.
export function formatUpdateRow(row: UpdateRow, now: number) {
  return `${row.label}: ${rowStatus(row, now)}`
}

// OCSTEP starts a phase, OCPROGRESS updates the byte count, and any other output line (CLI
// updater text) becomes the row's detail.
export function applyUpdateLine(row: UpdateRow, line: string, now: number): UpdateRow {
  if (line.startsWith(STEP_PREFIX)) {
    const [phase = "", ...detail] = line.slice(STEP_PREFIX.length).trim().split(/\s+/)
    if (!_STEPS.has(phase)) return row
    return { ...row, phase: phase as UpdatePhase, detail: detail.join(" "), since: now, received: 0, total: 0 }
  }
  if (line.startsWith(PROGRESS_PREFIX)) {
    const [received, total] = line.slice(PROGRESS_PREFIX.length).trim().split(/\s+/).map(Number)
    if (!Number.isFinite(received) || !Number.isFinite(total)) return row
    return { ...row, received, total }
  }
  return { ...row, detail: line }
}

export type UpdateProgress = ReturnType<typeof createUpdateProgress>

export function createUpdateProgress(toast: ToastContext, title: string, labels: string[]) {
  let rows = labels.map(
    (label): UpdateRow => ({
      label,
      phase: "waiting",
      detail: "",
      since: Date.now(),
      received: 0,
      total: 0,
    }),
  )
  let stopped = false
  const render = (duration = 600_000) => {
    const now = Date.now()
    const message = rows.map((row) => formatUpdateRow(row, now)).join("\n")
    toast.show({ title, message, variant: "info", duration, log: false, width: TOAST_MAX_WIDTH })
  }
  const update = (label: string, change: (row: UpdateRow) => UpdateRow) => {
    if (stopped) return
    rows = rows.map((row) => (row.label === label ? change(row) : row))
    render()
  }
  const timer = setInterval(() => {
    if (rows.some((row) => _TIMED.has(row.phase))) render()
  }, 1000)
  timer.unref()
  render()
  return {
    set(label: string, phase: UpdatePhase, detail = "") {
      update(label, (row) => ({ ...row, phase, detail, since: Date.now(), received: 0, total: 0 }))
    },
    // A row whose check found the app gone (an uninstalled Appx leaves its folder behind).
    remove(label: string) {
      if (stopped) return
      rows = rows.filter((row) => row.label !== label)
      render()
    },
    onLine(label: string) {
      return (line: string) => update(label, (row) => applyUpdateLine(row, line, Date.now()))
    },
    // The last redraw fades after 5 s; a result toast shown next replaces it.
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      render(5_000)
    },
  }
}
