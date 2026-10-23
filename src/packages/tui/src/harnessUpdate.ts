import { which } from "@opencode-ai/core/util/which"
import { checkChatgptDesktop, installChatgptDesktop } from "./chatgptDesktopUpdate"
import { resolveCodexCli, resolveCursorCli, runCliUpdate, runVersionedCliUpdate } from "./cliUpdate"
import { checkCursorDesktop, installCursorDesktop } from "./cursorDesktopUpdate"
import {
  checkClaudeDesktop,
  installClaudeDesktop,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"
import { checkPowershell, installPowershell } from "./pwshUpdate"
import type { DialogContext } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import type { ToastContext } from "./ui/toast"
import { createUpdateProgress, type UpdatePhase, type UpdateProgress } from "./updateProgress"

// Every harness updater resolves to one of these so "Update all" can run them in sequence and
// summarize; the single-harness palette entries show the same result as one toast.
type HarnessUpdateStatus = "ok" | "notInstalled" | "busy" | "declined" | "failed"
type HarnessUpdateResult = { label: string; status: HarnessUpdateStatus; message: string }
type OnLine = (line: string) => void

const _STATUS_PHASE: Record<HarnessUpdateStatus, UpdatePhase> = {
  ok: "done",
  notInstalled: "not installed",
  busy: "already running",
  declined: "skipped",
  failed: "failed",
}

function harnessResult(label: string, status: HarnessUpdateStatus, message: string): HarnessUpdateResult {
  return { label, status, message }
}

function showHarnessResult(toast: ToastContext, result: HarnessUpdateResult) {
  if (result.status === "declined") return
  if (result.status === "ok") return toast.show({ message: result.message, variant: "success" })
  if (result.status === "busy") return toast.show({ message: result.message, variant: "info" })
  toast.show({ message: result.message, variant: "error", duration: 15_000 })
}

// `claude update` updates whichever install `cliPath` resolves to. A chat's live `claude` process
// keeps its old binary; the next process oc starts uses the update. The shell resolves npm's
// `claude.cmd` shim on Windows.
async function runClaudeCodeUpdate(cliPath: string, onLine?: OnLine): Promise<HarnessUpdateResult> {
  const label = "Claude Code"
  if (!which(cliPath)) return harnessResult(label, "notInstalled", `${label} not found: ${cliPath}`)
  const result = await runCliUpdate(cliPath, onLine)
  if (result.alreadyRunning) return harnessResult(label, "busy", `${label} update already running`)
  if (result.error && result.code === null && !result.lastLine) {
    return harnessResult(label, "failed", `Failed to update ${label}: ${result.error}`)
  }
  if (result.ok) return harnessResult(label, "ok", result.lastLine || `${label} is up to date`)
  const detail = result.lastLine || result.error || `exit code ${result.code}`
  return harnessResult(label, "failed", `Failed to update ${label}: ${detail}`)
}

async function runVersionedHarnessUpdate(
  label: string,
  resolve: () => Promise<{ executable: string } | { error: string; notInstalled?: true }>,
  onLine?: OnLine,
): Promise<HarnessUpdateResult> {
  const resolved = await resolve()
  if ("error" in resolved) {
    return harnessResult(label, resolved.notInstalled ? "notInstalled" : "failed", resolved.error)
  }
  const result = await runVersionedCliUpdate(label, resolved.executable, onLine)
  if (result.alreadyRunning) return harnessResult(label, "busy", result.message)
  return harnessResult(label, result.ok ? "ok" : "failed", result.message)
}

// Single palette entries: a one-line progress toast, then the result toast replaces it.
async function runSingleUpdate(
  toast: ToastContext,
  label: string,
  run: (progress: UpdateProgress) => Promise<HarnessUpdateResult>,
) {
  const progress = createUpdateProgress(toast, `Update ${label}`, [label])
  let result: HarnessUpdateResult
  try {
    result = await run(progress)
    progress.set(label, _STATUS_PHASE[result.status])
  } finally {
    progress.stop()
  }
  showHarnessResult(toast, result)
}

function updateCli(toast: ToastContext, label: string, run: (onLine: OnLine) => Promise<HarnessUpdateResult>) {
  void runSingleUpdate(toast, label, (progress) => {
    progress.set(label, "updating")
    return run(progress.onLine(label))
  })
}

export function updateClaudeCode(cliPath: string, toast: ToastContext) {
  updateCli(toast, "Claude Code", (onLine) => runClaudeCodeUpdate(cliPath, onLine))
}

export function updateCursorCli(toast: ToastContext) {
  updateCli(toast, "Cursor CLI", (onLine) => runVersionedHarnessUpdate("Cursor CLI", resolveCursorCli, onLine))
}

export function updateCodexCli(toast: ToastContext) {
  updateCli(toast, "Codex CLI", (onLine) => runVersionedHarnessUpdate("Codex CLI", resolveCodexCli, onLine))
}

type DesktopHarness = {
  label: string
  check: () => Promise<DesktopCheckResult>
  install: (version: string, onLine?: OnLine) => Promise<DesktopInstallResult>
  // Completes "Updating ..." in the confirm prompt.
  closes: string
}

export const CLAUDE_DESKTOP: DesktopHarness = {
  label: "Claude Desktop",
  check: checkClaudeDesktop,
  install: installClaudeDesktop,
  closes: "closes Claude Desktop and any Claude Code sessions started from it",
}
export const CURSOR_DESKTOP: DesktopHarness = {
  label: "Cursor Desktop",
  check: checkCursorDesktop,
  install: installCursorDesktop,
  closes: "closes Cursor and any terminals or agents running inside it",
}
export const CHATGPT_DESKTOP: DesktopHarness = {
  label: "ChatGPT Desktop",
  check: checkChatgptDesktop,
  install: installChatgptDesktop,
  closes: "closes ChatGPT/Codex Desktop and any sessions running inside it",
}
export const POWERSHELL: DesktopHarness = {
  label: "PowerShell",
  check: checkPowershell,
  install: installPowershell,
  closes: "asks for admin approval and leaves open PowerShell windows on the old version until reopened",
}

type PendingDesktopUpdate = { harness: DesktopHarness; oldVersion: string; newVersion: string }

async function checkDesktopHarness(harness: DesktopHarness): Promise<HarnessUpdateResult | PendingDesktopUpdate> {
  const checked = await harness.check()
  if (checked.alreadyRunning) return harnessResult(harness.label, "busy", checked.message)
  if (!checked.ok) {
    return harnessResult(harness.label, checked.notInstalled ? "notInstalled" : "failed", checked.message)
  }
  if (checked.upToDate) return harnessResult(harness.label, "ok", checked.message)
  return { harness, oldVersion: checked.oldVersion, newVersion: checked.newVersion }
}

async function installDesktopHarness(pending: PendingDesktopUpdate, onLine?: OnLine): Promise<HarnessUpdateResult> {
  const result = await pending.harness.install(pending.newVersion, onLine)
  if (result.alreadyRunning) return harnessResult(pending.harness.label, "busy", result.message)
  return harnessResult(pending.harness.label, result.ok ? "ok" : "failed", result.message)
}

// `autoConfirm` is the `auto_confirm_updates` TUI setting: install without the confirm dialog.
export function updateDesktopHarness(
  harness: DesktopHarness,
  toast: ToastContext,
  dialog: DialogContext,
  autoConfirm: boolean,
) {
  const label = harness.label
  void runSingleUpdate(toast, label, async (progress) => {
    progress.set(label, "checking")
    const checked = await checkDesktopHarness(harness)
    if ("status" in checked) return checked
    const versions = `${checked.oldVersion} -> ${checked.newVersion}`
    if (!autoConfirm) {
      progress.set(label, "awaiting confirm", versions)
      const confirmed = await DialogConfirm.show(
        dialog,
        `Update ${label}`,
        `Updating ${harness.closes}. Update ${versions}?`,
      )
      if (confirmed !== true) return harnessResult(label, "declined", "skipped")
    }
    progress.set(label, "updating", versions)
    return installDesktopHarness(checked, progress.onLine(label))
  })
}

// CLIs first since updating them interrupts nothing; desktop apps and PowerShell last because
// installing closes apps or asks for admin approval. Their checks all run before one combined
// confirm so the run never stalls on several prompts.
let updateAllRunning = false
export async function updateAllHarnesses(
  cliPath: string,
  toast: ToastContext,
  dialog: DialogContext,
  autoConfirm: boolean,
) {
  if (updateAllRunning) return toast.show({ message: "Update all already running", variant: "info" })
  updateAllRunning = true
  const clis: [string, (onLine: OnLine) => Promise<HarnessUpdateResult>][] = [
    ["Claude Code", (onLine) => runClaudeCodeUpdate(cliPath, onLine)],
    ["Cursor CLI", (onLine) => runVersionedHarnessUpdate("Cursor CLI", resolveCursorCli, onLine)],
    ["Codex CLI", (onLine) => runVersionedHarnessUpdate("Codex CLI", resolveCodexCli, onLine)],
  ]
  const desktops = process.platform === "win32" ? [CLAUDE_DESKTOP, CURSOR_DESKTOP, CHATGPT_DESKTOP, POWERSHELL] : []
  const progress = createUpdateProgress(toast, autoConfirm ? "Update all (auto confirm)" : "Update all", [
    ...clis.map(([label]) => label),
    ...desktops.map((harness) => harness.label),
  ])
  try {
    const results: HarnessUpdateResult[] = []
    const record = (result: HarnessUpdateResult) => {
      results.push(result)
      progress.set(result.label, _STATUS_PHASE[result.status])
    }
    for (const [label, run] of clis) {
      progress.set(label, "updating")
      record(await run(progress.onLine(label)))
    }
    const pending: PendingDesktopUpdate[] = []
    for (const harness of desktops) {
      progress.set(harness.label, "checking")
      const checked = await checkDesktopHarness(harness)
      if ("status" in checked) record(checked)
      else pending.push(checked)
    }
    const versions = (item: PendingDesktopUpdate) => `${item.oldVersion} -> ${item.newVersion}`
    if (pending.length > 0) {
      for (const item of pending)
        progress.set(item.harness.label, autoConfirm ? "waiting" : "awaiting confirm", versions(item))
      const list = pending.map((item) => `${item.harness.label} ${versions(item)} (${item.harness.closes})`).join("; ")
      const confirmed =
        autoConfirm || (await DialogConfirm.show(dialog, "Confirm updates", `Updating: ${list}. Continue?`)) === true
      if (confirmed) for (const item of pending) progress.set(item.harness.label, "waiting", versions(item))
      for (const item of pending) {
        if (!confirmed) {
          record(harnessResult(item.harness.label, "declined", "skipped"))
          continue
        }
        progress.set(item.harness.label, "updating", versions(item))
        record(await installDesktopHarness(item, progress.onLine(item.harness.label)))
      }
    }
    progress.stop()
    showUpdateAllSummary(toast, results)
  } finally {
    progress.stop()
    updateAllRunning = false
  }
}

function showUpdateAllSummary(toast: ToastContext, results: HarnessUpdateResult[]) {
  const groups: [HarnessUpdateStatus, string][] = [
    ["ok", "Updated or current"],
    ["notInstalled", "Not installed"],
    ["declined", "Skipped"],
    ["busy", "Already running"],
    ["failed", "Failed"],
  ]
  const lines = groups.flatMap(([status, title]) => {
    const matched = results.filter((result) => result.status === status)
    if (matched.length === 0) return []
    const names = matched.map((result) => (status === "failed" ? `${result.label} (${result.message})` : result.label))
    return [`${title}: ${names.join(", ")}`]
  })
  const failed = results.some((result) => result.status === "failed")
  toast.show({
    message: lines.join("\n"),
    variant: failed ? "error" : "success",
    duration: failed ? 30_000 : 10_000,
  })
}
