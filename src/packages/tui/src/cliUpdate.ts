import { spawn, type ChildProcess } from "node:child_process"
import { existsSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import stripAnsi from "strip-ansi"
import { which } from "@opencode-ai/core/util/which"

export const CURSOR_CLI_INSTALL_URL = "https://cursor.com/docs/cli/installation"
export const CODEX_CLI_INSTALL_HINT = "npm install -g @openai/codex"
export const UPDATE_ARG = "update"

const OUTPUT_CAP = 64 * 1024
// Bounds a hung updater so its inflight key is released; the palette otherwise reports "already running" until restart.
const CLI_TIMEOUT_MS = 10 * 60 * 1000
const inflight = new Set<string>()

export type CliCommandResult = {
  ok: boolean
  code: number | null
  output: string
  lastLine: string
  error?: string
}

export type CliUpdateResult = CliCommandResult & {
  alreadyRunning: boolean
}

function inflightKey(executable: string) {
  return path.normalize(executable)
}

export function resetCliUpdateState() {
  inflight.clear()
}

function needsShell(executable: string) {
  if (process.platform !== "win32") return false
  const ext = path.extname(executable).toLowerCase()
  if (ext === ".cmd" || ext === ".bat") return true
  return !ext
}

function spawnCommand(executable: string, shell: boolean) {
  return shell && executable.includes(" ") ? `"${executable}"` : executable
}

function capOutput(text: string) {
  const cleaned = stripAnsi(text)
  return cleaned.length > OUTPUT_CAP ? cleaned.slice(-OUTPUT_CAP) : cleaned
}

function lastLineOf(text: string) {
  return text.trim().split(/\r?\n/).at(-1)?.trim() ?? ""
}

function firstLineOf(text: string) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  )
}

export function runCliCommand(
  executable: string,
  args: string[],
  timeoutMs = CLI_TIMEOUT_MS,
): Promise<CliCommandResult> {
  return new Promise((resolve) => {
    let settled = false
    let output = ""
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (partial: { ok: boolean; code: number | null; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      const capped = capOutput(output)
      resolve({
        ...partial,
        output: capped,
        lastLine: lastLineOf(capped),
      })
    }
    const shell = needsShell(executable)
    let child: ChildProcess
    try {
      child = spawn(spawnCommand(executable, shell), args, {
        stdio: ["ignore", "pipe", "pipe"],
        cwd: os.homedir(),
        shell,
        windowsHide: true,
      })
    } catch (cause) {
      finish({
        ok: false,
        code: null,
        error: cause instanceof Error ? cause.message : String(cause),
      })
      return
    }
    timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, code: null, error: `timed out after ${timeoutMs} ms` })
    }, timeoutMs)
    child.stdout?.on("data", (chunk) => {
      output += String(chunk)
    })
    child.stderr?.on("data", (chunk) => {
      output += String(chunk)
    })
    child.on("error", (cause) => {
      finish({ ok: false, code: null, error: cause.message })
    })
    child.on("close", (code) => {
      finish({ ok: code === 0, code })
    })
  })
}

export async function runCliUpdate(executable: string): Promise<CliUpdateResult> {
  const key = inflightKey(executable)
  if (inflight.has(key)) {
    return {
      alreadyRunning: true,
      ok: false,
      code: null,
      output: "",
      lastLine: "",
      error: "already running",
    }
  }
  inflight.add(key)
  try {
    const result = await runCliCommand(executable, [UPDATE_ARG])
    return { ...result, alreadyRunning: false }
  } finally {
    inflight.delete(key)
  }
}

function mentionsCursor(text: string) {
  return /cursor/i.test(text)
}

function launcherName(executable: string) {
  return path.parse(executable).name.toLowerCase()
}

export async function probeCliVersion(executable: string) {
  const result = await runCliCommand(executable, ["--version"])
  if (!result.ok) return
  const version = firstLineOf(result.output)
  return version || undefined
}

async function identifyCursorAgent(executable: string) {
  const about = await runCliCommand(executable, ["about"])
  if (mentionsCursor(about.output)) return
  const version = await runCliCommand(executable, ["--version"])
  if (mentionsCursor(version.output)) return
  return "PATH agent is not the Cursor CLI"
}

export async function resolveCursorCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ executable: string } | { error: string }> {
  const cursorAgent = which("cursor-agent", env)
  if (cursorAgent) return { executable: cursorAgent }
  const agent = which("agent", env)
  if (!agent) {
    return { error: `Cursor CLI not found. Install it from ${CURSOR_CLI_INSTALL_URL}` }
  }
  if (launcherName(agent) === "agent") {
    const mismatch = await identifyCursorAgent(agent)
    if (mismatch) return { error: mismatch }
  }
  return { executable: agent }
}

export async function runVersionedCliUpdate(label: string, executable: string) {
  const key = inflightKey(executable)
  if (inflight.has(key)) {
    return { ok: false, alreadyRunning: true, message: `${label} update already running` }
  }
  inflight.add(key)
  try {
    const before = await probeCliVersion(executable)
    const result = await runCliCommand(executable, [UPDATE_ARG])
    if (!result.ok) {
      return {
        ok: false,
        alreadyRunning: false,
        message: `Failed to update ${label}: ${result.lastLine || result.error || `exit code ${result.code}`}`,
      }
    }
    // The updater exited 0, so a failed probe only means the version is unknown, not that the update failed.
    const after = await probeCliVersion(executable)
    if (!after) return { ok: true, alreadyRunning: false, message: "Update completed; version could not be read" }
    if (!before) {
      return {
        ok: true,
        alreadyRunning: false,
        message: `Update completed; previous version could not be read (now ${after})`,
      }
    }
    if (after !== before) {
      return { ok: true, alreadyRunning: false, message: `Updated ${label} from ${before} to ${after}` }
    }
    return { ok: true, alreadyRunning: false, message: "Update completed; version unchanged" }
  } finally {
    inflight.delete(key)
  }
}

// npm's Windows shim is codex.cmd plus a codex.ps1 next to it. A bare .ps1 can
// not be spawned directly (needsShell only covers .cmd/.bat/extensionless), so
// prefer the runnable .cmd sibling and fail closed when it is missing.
export async function resolveCodexCli(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ executable: string } | { error: string }> {
  const found = which("codex", env)
  if (!found) {
    return { error: `Codex CLI not found. Install it with ${CODEX_CLI_INSTALL_HINT}` }
  }
  if (found.toLowerCase().endsWith(".ps1")) {
    const sibling = path.join(path.dirname(found), "codex.cmd")
    if (existsSync(sibling)) return { executable: sibling }
    return { error: "Codex CLI shim is PowerShell-only; expected codex.cmd was not found next to it" }
  }
  return { executable: found }
}
