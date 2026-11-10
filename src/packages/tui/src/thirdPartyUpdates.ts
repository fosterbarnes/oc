import { which } from "@opencode-ai/core/util/which"
import { createSignal } from "solid-js"
import { chatgptDesktopPresent, checkChatgptDesktop, installChatgptDesktop } from "./chatgptDesktopUpdate"
import { errorText, resolveCodexCli, resolveCursorCli, runVersionedCliUpdate } from "./cliUpdate"
import { checkCursorDesktop, cursorDesktopPresent, installCursorDesktop } from "./cursorDesktopUpdate"
import {
  checkClaudeDesktop,
  claudeDesktopPresent,
  installClaudeDesktop,
  type DesktopCheckResult,
  type DesktopInstallResult,
} from "./desktopUpdate"
import { checkPowershell, installPowershell, powershellPresent } from "./pwshUpdate"
import { checkPowershellMac, detectPwshInstall, installPowershellMac, POWERSHELL_MAC_NOTE } from "./pwshUpdateMac"
import type { DialogContext } from "./ui/dialog"
import { DialogConfirm } from "./ui/dialog-confirm"
import type { ToastContext } from "./ui/toast"
import { createUpdateProgress, type UpdatePhase } from "./updateProgress"
import { checkWezterm, installWezterm, weztermPresent, WEZTERM_NOTE } from "./weztermUpdate"

// Third party updates: the programs oc can update for the user. `updateTargets` is the one list;
// the palette entries, "Update all", and its progress rows all come from it, and only targets
// found on this machine are shown.
//
// Every target follows the same steps:
// 1. `installed`: is it on this machine? Local and quick: no network, no PowerShell start.
// 2. `check`: a final result (up to date, update by hand, failed), or a pending update.
// 3. A pending update with `confirm` text asks first (unless `auto_confirm_updates`), because
//    installing closes an app or needs admin approval. The CLIs carry none: they update themselves
//    and interrupt nothing.
// 4. `install` runs the update and reports the result.

type OnLine = (line: string) => void
type UpdateStatus = "updated" | "current" | "notInstalled" | "busy" | "declined" | "manual" | "failed"
// `versions` ("old -> new") is set when something was installed.
type UpdateResult = { label: string; status: UpdateStatus; message: string; versions?: string }
type PendingUpdate = {
  versions?: string
  // Completes "Updating ..." in the confirm prompt.
  confirm?: string
  install: (onLine: OnLine) => Promise<UpdateResult>
}

export type UpdateTarget = {
  // The palette entry is `oc.update_<id>`.
  id: string
  label: string
  desc: string
  installed: () => boolean | Promise<boolean>
  check: () => Promise<UpdateResult | PendingUpdate>
}

const _RESULT_PHASE: Record<Exclude<UpdateStatus, "notInstalled">, UpdatePhase> = {
  updated: "updated",
  current: "up to date",
  busy: "already running",
  declined: "skipped",
  manual: "update by hand",
  failed: "failed",
}

type CliResolved = { executable: string } | { error: string; notInstalled?: true }

// A CLI that updates itself with `<cli> update`. One that is on PATH but unusable (an unrelated
// `agent`, a PowerShell-only codex shim) counts as not installed here.
function cliTarget(id: string, label: string, desc: string, resolve: () => Promise<CliResolved>): UpdateTarget {
  return {
    id,
    label,
    desc,
    installed: async () => "executable" in (await resolve()),
    check: async () => {
      const resolved = await resolve()
      if ("error" in resolved) {
        return { label, status: resolved.notInstalled ? "notInstalled" : "failed", message: resolved.error }
      }
      return {
        install: async (onLine) => {
          const result = await runVersionedCliUpdate(label, resolved.executable, onLine)
          if (result.alreadyRunning) return { label, status: "busy", message: result.message }
          if (!result.ok) return { label, status: "failed", message: result.message }
          return {
            label,
            status: result.versions ? "updated" : "current",
            message: result.message,
            versions: result.versions,
          }
        },
      }
    },
  }
}

// A program oc updates itself: compare installed to latest, then download, verify, and install the
// confirmed version. `note` is the confirm text unless the check supplies its own.
function checkedTarget(input: {
  id: string
  label: string
  desc: string
  note: string
  installed: () => boolean | Promise<boolean>
  check: () => Promise<DesktopCheckResult>
  install: (version: string, onLine?: OnLine) => Promise<DesktopInstallResult>
}): UpdateTarget {
  const { id, label, desc } = input
  return {
    id,
    label,
    desc,
    installed: input.installed,
    check: async () => {
      const checked = await input.check()
      if (checked.alreadyRunning) return { label, status: "busy", message: checked.message }
      if (!checked.ok) {
        const status = checked.notInstalled ? "notInstalled" : checked.manual ? "manual" : "failed"
        return { label, status, message: checked.message }
      }
      if (checked.upToDate) return { label, status: "current", message: checked.message }
      const versions = `${checked.oldVersion} -> ${checked.newVersion}`
      return {
        versions,
        confirm: checked.note ?? input.note,
        install: async (onLine) => {
          const result = await input.install(checked.newVersion, onLine)
          if (result.alreadyRunning) return { label, status: "busy", message: result.message }
          if (!result.ok) return { label, status: "failed", message: result.message }
          return { label, status: "updated", message: result.message, versions }
        },
      }
    },
  }
}

const _WINDOWS_APPS = [
  checkedTarget({
    id: "claude_desktop",
    label: "Claude Desktop",
    desc: "Install the latest Claude Desktop app",
    note: "closes Claude Desktop and any Claude Code sessions started from it",
    installed: claudeDesktopPresent,
    check: checkClaudeDesktop,
    install: installClaudeDesktop,
  }),
  checkedTarget({
    id: "cursor_desktop",
    label: "Cursor Desktop",
    desc: "Install the latest Cursor app",
    note: "closes Cursor and any terminals or agents running inside it",
    installed: cursorDesktopPresent,
    check: checkCursorDesktop,
    install: installCursorDesktop,
  }),
  checkedTarget({
    id: "chatgpt_desktop",
    label: "ChatGPT Desktop",
    desc: "Install the latest ChatGPT app",
    note: "closes ChatGPT/Codex Desktop and any sessions running inside it",
    installed: chatgptDesktopPresent,
    check: checkChatgptDesktop,
    install: installChatgptDesktop,
  }),
  checkedTarget({
    id: "powershell",
    label: "PowerShell",
    desc: "Install the latest PowerShell 7",
    note: "asks for admin approval and leaves open PowerShell windows on the old version until reopened",
    installed: powershellPresent,
    check: checkPowershell,
    install: installPowershell,
  }),
]

const _MAC_APPS = [
  checkedTarget({
    id: "powershell",
    label: "PowerShell",
    desc: "Update PowerShell 7 the way it was installed",
    note: POWERSHELL_MAC_NOTE,
    installed: async () => (await detectPwshInstall()) !== undefined,
    check: checkPowershellMac,
    install: installPowershellMac,
  }),
]

const _WEZTERM = checkedTarget({
  id: "wezterm",
  label: "WezTerm",
  desc: "Install the latest WezTerm nightly",
  note: WEZTERM_NOTE,
  installed: weztermPresent,
  check: checkWezterm,
  install: installWezterm,
})

// Update all runs in this order: the CLIs first, then the programs whose install closes an app or
// asks for admin approval.
export function updateTargets(claudeCliPath: () => string): UpdateTarget[] {
  const clis = [
    cliTarget("claude_code", "Claude Code", "Update the Claude Code CLI oc runs", async () => {
      // The shell resolves npm's `claude.cmd` shim on Windows, so the configured path is run as is.
      const cliPath = claudeCliPath()
      if (which(cliPath)) return { executable: cliPath }
      return { error: `Claude Code not found: ${cliPath}`, notInstalled: true }
    }),
    cliTarget("cursor_cli", "Cursor CLI", "Update the Cursor agent CLI", resolveCursorCli),
    cliTarget("codex_cli", "Codex CLI", "Update the Codex CLI", resolveCodexCli),
  ]
  if (process.platform === "win32") return [...clis, ..._WINDOWS_APPS, _WEZTERM]
  if (process.platform === "darwin") return [...clis, ..._MAC_APPS, _WEZTERM]
  return clis
}

// Ids of the targets found on this machine; the palette hides the rest. Empty until the first
// `detectInstalled` settles.
const [installedIds, setInstalledIds] = createSignal<ReadonlySet<string>>(new Set())

export function isInstalled(target: UpdateTarget) {
  return installedIds().has(target.id)
}

/** Detects every target at once, publishes the result to the palette, and returns the found ones. */
export async function detectInstalled(targets: UpdateTarget[]) {
  const found = await Promise.all(
    targets.map((target) =>
      Promise.resolve()
        .then(target.installed)
        .catch(() => false),
    ),
  )
  const installed = targets.filter((target, index) => found[index] && !_gone.has(target.id))
  setInstalledIds(new Set(installed.map((target) => target.id)))
  return installed
}

// Targets whose check said "not installed" although `installed()` found them (an uninstalled Appx
// leaves its folder). They stay hidden until oc restarts instead of reappearing on every refresh.
const _gone = new Set<string>()

function forget(target: UpdateTarget) {
  _gone.add(target.id)
  setInstalledIds(new Set([...installedIds()].filter((id) => id !== target.id)))
}

// A thrown check or install becomes a failed result, so one target never ends Update all.
function attempt<T>(label: string, run: () => Promise<T>): Promise<T | UpdateResult> {
  return run().catch((cause): UpdateResult => ({ label, status: "failed", message: errorText(cause) }))
}

function showResult(toast: ToastContext, result: UpdateResult) {
  if (result.status === "declined") return
  if (result.status === "updated" || result.status === "current") {
    return toast.show({ message: result.message, variant: "success" })
  }
  if (result.status === "busy" || result.status === "notInstalled") {
    return toast.show({ message: result.message, variant: "info" })
  }
  if (result.status === "manual") return toast.show({ message: result.message, variant: "info", duration: 15_000 })
  toast.show({ message: result.message, variant: "error", duration: 15_000 })
}

// One palette entry: a one-line progress toast, then the result toast replaces it.
// `autoConfirm` is the `auto_confirm_updates` TUI setting: install without the confirm dialog.
export async function updateOne(
  target: UpdateTarget,
  toast: ToastContext,
  dialog: DialogContext,
  autoConfirm: boolean,
) {
  const label = target.label
  const progress = createUpdateProgress(toast, `Update ${label}`, [label])
  const run = async (): Promise<UpdateResult> => {
    progress.set(label, "checking")
    const checked = await attempt(label, target.check)
    if ("status" in checked) return checked
    if (checked.confirm && !autoConfirm) {
      progress.set(label, "awaiting confirm", checked.versions)
      const prompt = `Updating ${checked.confirm}. Update ${checked.versions}?`
      if ((await DialogConfirm.show(dialog, `Update ${label}`, prompt)) !== true) {
        return { label, status: "declined", message: "skipped" }
      }
    }
    progress.set(label, "updating", checked.versions)
    return attempt(label, () => checked.install(progress.onLine(label)))
  }
  let result: UpdateResult
  try {
    result = await run()
    if (result.status === "notInstalled") forget(target)
    else progress.set(label, _RESULT_PHASE[result.status])
  } finally {
    progress.stop()
  }
  showResult(toast, result)
}

// Each installed target is checked in list order. Updates that need no confirmation (the CLIs, or
// everything under auto confirm) install as soon as their check ends; the rest wait for one
// combined confirm after every check, so the run never stalls on several prompts.
let updateAllRunning = false
export async function updateAll(
  targets: UpdateTarget[],
  toast: ToastContext,
  dialog: DialogContext,
  autoConfirm: boolean,
) {
  if (updateAllRunning) return toast.show({ message: "Update all already running", variant: "info" })
  updateAllRunning = true
  try {
    const installed = await detectInstalled(targets)
    const results = installed.length > 0 ? await runAll(installed, toast, dialog, autoConfirm) : []
    if (results.length === 0) return toast.show({ message: "Nothing oc can update is installed", variant: "info" })
    showSummary(toast, results)
  } finally {
    updateAllRunning = false
  }
}

async function runAll(installed: UpdateTarget[], toast: ToastContext, dialog: DialogContext, autoConfirm: boolean) {
  const title = autoConfirm ? "Update all (auto confirm)" : "Update all"
  const progress = createUpdateProgress(
    toast,
    title,
    installed.map((target) => target.label),
  )
  const results: UpdateResult[] = []
  const record = (target: UpdateTarget, result: UpdateResult) => {
    if (result.status === "notInstalled") {
      forget(target)
      return progress.remove(target.label)
    }
    results.push(result)
    progress.set(target.label, _RESULT_PHASE[result.status])
  }
  const install = async (target: UpdateTarget, pending: PendingUpdate) => {
    progress.set(target.label, "updating", pending.versions)
    record(target, await attempt(target.label, () => pending.install(progress.onLine(target.label))))
  }
  try {
    const waiting: { target: UpdateTarget; pending: PendingUpdate }[] = []
    for (const target of installed) {
      progress.set(target.label, "checking")
      const checked = await attempt(target.label, target.check)
      if ("status" in checked) record(target, checked)
      else if (!checked.confirm || autoConfirm) await install(target, checked)
      else {
        waiting.push({ target, pending: checked })
        progress.set(target.label, "awaiting confirm", checked.versions)
      }
    }
    if (waiting.length === 0) return results
    const list = waiting
      .map(({ target, pending }) => `${target.label} ${pending.versions} (${pending.confirm})`)
      .join("; ")
    const confirmed = (await DialogConfirm.show(dialog, "Confirm updates", `Updating: ${list}. Continue?`)) === true
    if (!confirmed) {
      for (const { target } of waiting) record(target, { label: target.label, status: "declined", message: "skipped" })
      return results
    }
    for (const { target, pending } of waiting) progress.set(target.label, "waiting", pending.versions)
    for (const { target, pending } of waiting) await install(target, pending)
    return results
  } finally {
    progress.stop()
  }
}

const _SUMMARY_GROUPS: [UpdateStatus, string][] = [
  ["updated", "Updated"],
  ["current", "Up to date"],
  ["declined", "Skipped"],
  ["busy", "Already running"],
  ["manual", "Update by hand"],
  ["failed", "Failed"],
]

function showSummary(toast: ToastContext, results: UpdateResult[]) {
  const lines = _SUMMARY_GROUPS.flatMap(([status, title]) => {
    const matched = results.filter((result) => result.status === status)
    if (matched.length === 0) return []
    const names = matched.map((result) => {
      if (status === "updated") return `${result.label} ${result.versions}`
      if (status === "failed" || status === "manual") return `${result.label} (${result.message})`
      return result.label
    })
    return [`${title}: ${names.join(", ")}`]
  })
  const failed = results.some((result) => result.status === "failed")
  toast.show({
    message: lines.join("\n"),
    variant: failed ? "error" : "success",
    duration: failed ? 30_000 : 10_000,
  })
}
