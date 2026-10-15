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
import type { DialogContext } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import type { ToastContext } from "./ui/toast"

// Every harness updater resolves to one of these so "Update all" can run them in sequence and
// summarize; the single-harness palette entries show the same result as one toast.
type HarnessUpdateStatus = "ok" | "notInstalled" | "busy" | "declined" | "failed"
type HarnessUpdateResult = { label: string; status: HarnessUpdateStatus; message: string }

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
async function runClaudeCodeUpdate(cliPath: string): Promise<HarnessUpdateResult> {
  const label = "Claude Code"
  if (!which(cliPath)) return harnessResult(label, "notInstalled", `${label} not found: ${cliPath}`)
  const result = await runCliUpdate(cliPath)
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
): Promise<HarnessUpdateResult> {
  const resolved = await resolve()
  if ("error" in resolved) {
    return harnessResult(label, resolved.notInstalled ? "notInstalled" : "failed", resolved.error)
  }
  const result = await runVersionedCliUpdate(label, resolved.executable)
  if (result.alreadyRunning) return harnessResult(label, "busy", result.message)
  return harnessResult(label, result.ok ? "ok" : "failed", result.message)
}

export function updateClaudeCode(cliPath: string, toast: ToastContext) {
  toast.show({ message: "Updating Claude Code...", variant: "info", duration: 120_000 })
  void runClaudeCodeUpdate(cliPath).then((result) => showHarnessResult(toast, result))
}

export function updateCursorCli(toast: ToastContext) {
  toast.show({ message: "Updating Cursor CLI...", variant: "info", duration: 120_000 })
  void runVersionedHarnessUpdate("Cursor CLI", resolveCursorCli).then((result) => showHarnessResult(toast, result))
}

export function updateCodexCli(toast: ToastContext) {
  toast.show({ message: "Updating Codex CLI...", variant: "info", duration: 120_000 })
  void runVersionedHarnessUpdate("Codex CLI", resolveCodexCli).then((result) => showHarnessResult(toast, result))
}

type DesktopHarness = {
  label: string
  check: () => Promise<DesktopCheckResult>
  install: (version: string) => Promise<DesktopInstallResult>
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

async function installDesktopHarness(pending: PendingDesktopUpdate): Promise<HarnessUpdateResult> {
  const result = await pending.harness.install(pending.newVersion)
  if (result.alreadyRunning) return harnessResult(pending.harness.label, "busy", result.message)
  return harnessResult(pending.harness.label, result.ok ? "ok" : "failed", result.message)
}

export function updateDesktopHarness(harness: DesktopHarness, toast: ToastContext, dialog: DialogContext) {
  void (async () => {
    toast.show({ message: `Checking ${harness.label}...`, variant: "info" })
    const checked = await checkDesktopHarness(harness)
    if ("status" in checked) return showHarnessResult(toast, checked)
    const confirmed = await DialogConfirm.show(
      dialog,
      `Update ${harness.label}`,
      `Updating ${harness.closes}. Update ${checked.oldVersion} -> ${checked.newVersion}?`,
    )
    if (confirmed !== true) return
    toast.show({ message: `Updating ${harness.label}...`, variant: "info", duration: 120_000 })
    showHarnessResult(toast, await installDesktopHarness(checked))
  })()
}

// CLIs first since updating them interrupts nothing; desktop apps last because installing closes
// them. Desktop checks all run before one combined confirm so the run never stalls on several
// prompts.
let updateAllRunning = false
export async function updateAllHarnesses(cliPath: string, toast: ToastContext, dialog: DialogContext) {
  if (updateAllRunning) return toast.show({ message: "Update all already running", variant: "info" })
  updateAllRunning = true
  try {
    const progress = (message: string) => toast.show({ message, variant: "info", duration: 600_000 })
    const results: HarnessUpdateResult[] = []
    const clis: [string, () => Promise<HarnessUpdateResult>][] = [
      ["Claude Code", () => runClaudeCodeUpdate(cliPath)],
      ["Cursor CLI", () => runVersionedHarnessUpdate("Cursor CLI", resolveCursorCli)],
      ["Codex CLI", () => runVersionedHarnessUpdate("Codex CLI", resolveCodexCli)],
    ]
    for (const [label, run] of clis) {
      progress(`Update all: updating ${label}...`)
      results.push(await run())
    }
    const desktops = process.platform === "win32" ? [CLAUDE_DESKTOP, CURSOR_DESKTOP, CHATGPT_DESKTOP] : []
    const pending: PendingDesktopUpdate[] = []
    for (const harness of desktops) {
      progress(`Update all: checking ${harness.label}...`)
      const checked = await checkDesktopHarness(harness)
      if ("status" in checked) results.push(checked)
      else pending.push(checked)
    }
    if (pending.length > 0) {
      toast.show({ message: "Update all: waiting for desktop app confirmation", variant: "info", duration: 600_000 })
      const list = pending.map((item) => `${item.harness.label} ${item.oldVersion} -> ${item.newVersion}`).join(", ")
      const confirmed = await DialogConfirm.show(
        dialog,
        "Update desktop apps",
        `Updating closes these apps and any sessions running inside them: ${list}. Continue?`,
      )
      for (const item of pending) {
        if (confirmed !== true) {
          results.push(harnessResult(item.harness.label, "declined", "skipped"))
          continue
        }
        progress(`Update all: updating ${item.harness.label}...`)
        results.push(await installDesktopHarness(item))
      }
    }
    showUpdateAllSummary(toast, results)
  } finally {
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
