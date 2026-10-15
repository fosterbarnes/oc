import { mkdirSync } from "node:fs"
import path from "node:path"
import launch from "cross-spawn"
import { Global } from "@opencode-ai/core/global"
import { DEFAULT_ACCOUNT } from "../accounts.js"
import { claudeSpawnEnv } from "../spawnEnv.js"
import { cliCommand } from "../cliExecutable.js"
import { detectCliVersion, type CliVersion } from "../cliVersion.js"
import { materializeDefaultDir } from "./identity"

export const WARMUP_PROMPT = "hi"
export const WARMUP_SYSTEM_PROMPT = "Reply with hi only."

// Minimum CLI for warm-up: Haiku 5.5 needs 2.1.293+, `auth status` reports
// its config directory since 2.1.268, and --safe-mode exists since 2.1.169.
// Gate on the cached detected version, never on --help text (which omits
// flags) and never on a production prompt parse probe.
export const WARMUP_MIN_VERSION = { major: 2, minor: 1, patch: 293 } as const

export function cliSupportsWarmup(version: CliVersion | null | undefined): boolean {
  if (!version) return false
  if (version.major !== WARMUP_MIN_VERSION.major) return version.major > WARMUP_MIN_VERSION.major
  if (version.minor !== WARMUP_MIN_VERSION.minor) return version.minor > WARMUP_MIN_VERSION.minor
  return version.patch >= WARMUP_MIN_VERSION.patch
}

export async function checkWarmupCli(cliPath: string): Promise<{ available: boolean; error?: string }> {
  const version = await detectCliVersion(cliPath).catch(() => null)
  if (!version) return { available: false, error: "Claude CLI not found; install claude to use warm-up" }
  if (!cliSupportsWarmup(version))
    return { available: false, error: `Claude CLI ${version.raw} is too old; warm-up needs 2.1.293 or newer` }
  return { available: true }
}

export function buildWarmupArgs(): string[] {
  // One-shot greeting with no tools. --max-turns 1 bounds the CLI's own
  // agent turn machinery to a single turn; --safe-mode keeps authentication
  // working while disabling customizations. Admin-managed policy settings
  // still apply and are respected, never bypassed.
  return [
    "-p",
    WARMUP_PROMPT,
    "--model",
    "haiku",
    "--effort",
    "low",
    "--max-turns",
    "1",
    "--safe-mode",
    "--setting-sources",
    "",
    "--tools",
    "",
    "--strict-mcp-config",
    "--disallowedTools",
    "*",
    "--system-prompt",
    WARMUP_SYSTEM_PROMPT,
    "--no-session-persistence",
    "--output-format",
    "json",
  ]
}

// Stored subscription auth for every account, including the default: shell
// API keys, token overrides, third-party base URLs, Haiku remapping, and a
// bare-mode switch would all redirect or reshape the greeting.
export function buildWarmupEnv(configDir: string | undefined): Record<string, string | undefined> {
  const env = claudeSpawnEnv({ effort: "low", configDir })
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  delete env.ANTHROPIC_BASE_URL
  delete env.ANTHROPIC_DEFAULT_HAIKU_MODEL
  delete env.CLAUDE_CODE_SIMPLE
  return env
}

export function warmupConfigDir(accountID: string): string {
  if (accountID === DEFAULT_ACCOUNT) return materializeDefaultDir()
  return accountID
}

// Neutral owned working directory for auth probes and greetings: a data-dir
// folder oc owns, never a user repository. No repo config, agent prompts,
// skills, memory, or hooks can leak into the request; --safe-mode already
// disables instruction discovery, and the owned dir adds isolation. Auth and
// send share it and the same pinned environment.
export function warmupCwd(): string {
  const dir = path.join(Global.Path.data, "claude-code", "warmup-cwd")
  mkdirSync(dir, { recursive: true })
  return dir
}

export interface CliRunOpts {
  cliPath: string
  args: string[]
  env: Record<string, string | undefined>
  cwd: string
  timeoutMs: number
  signal?: AbortSignal
  /** Child set the spawned process is tracked in; defaults to the shared one. Loops pass their own. */
  tracker?: ChildTracker
}

export interface CliRunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

export type CliRunner = (opts: CliRunOpts) => Promise<CliRunResult>

/** Structural child handle; cross-spawn's ChildProcess satisfies it. */
export type ChildTracker = Set<{ kill(signal?: NodeJS.Signals): unknown }>

const sharedChildren: ChildTracker = new Set()

export function killTracker(tracker: ChildTracker): void {
  for (const child of tracker) {
    try {
      child.kill("SIGKILL")
    } catch {
      // Already exited; nothing to stop.
    }
  }
  tracker.clear()
}

export function killOwnedChildren(): void {
  killTracker(sharedChildren)
}

function redact(text: string, limit = 200): string {
  const single = text.replace(/\s+/g, " ").trim()
  return single.length > limit ? `${single.slice(0, limit)}...` : single
}

export function defaultCliRunner(opts: CliRunOpts): Promise<CliRunResult> {
  return new Promise((resolve) => {
    const tracker = opts.tracker ?? sharedChildren
    const command = cliCommand(opts.cliPath, opts.args)
    let child: ReturnType<typeof launch>
    try {
      child = launch(command.command, command.args, {
        cwd: opts.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: opts.env as Record<string, string>,
        windowsHide: true,
        signal: opts.signal,
      })
    } catch (error) {
      resolve({ code: null, stdout: "", stderr: `spawn failed: ${redact(String(error))}`, timedOut: false })
      return
    }
    tracker.add(child)
    let stdout = ""
    let stderr = ""
    let done = false
    const finish = (result: CliRunResult) => {
      if (done) return
      done = true
      clearTimeout(timer)
      tracker.delete(child)
      resolve(result)
    }
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {
        // Already exited.
      }
      finish({ code: null, stdout, stderr, timedOut: true })
    }, opts.timeoutMs)
    timer.unref?.()
    child.stdout?.on("data", (chunk) => {
      if (stdout.length < 64 * 1024) stdout += String(chunk).slice(0, 64 * 1024 - stdout.length)
    })
    child.stderr?.on("data", (chunk) => {
      if (stderr.length < 64 * 1024) stderr += String(chunk).slice(0, 64 * 1024 - stderr.length)
    })
    child.on("error", (error) => {
      finish({ code: null, stdout, stderr: `spawn failed: ${redact(String(error))}`, timedOut: false })
    })
    child.on("close", (code) => {
      finish({ code: code ?? null, stdout, stderr, timedOut: false })
    })
    opts.signal?.addEventListener(
      "abort",
      () => {
        try {
          child.kill("SIGKILL")
        } catch {
          // Already exited.
        }
      },
      { once: true },
    )
  })
}

let cliRunnerOverride: CliRunner | null = null

export function _setCliRunner(runner: CliRunner | null): void {
  cliRunnerOverride = runner
}

export function cliRunner(): CliRunner {
  return cliRunnerOverride ?? defaultCliRunner
}
