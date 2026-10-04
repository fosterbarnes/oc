import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { log } from "./logger.js"
import { cliCommand } from "./cli-executable.js"

const execFileAsync = promisify(execFile)

export interface CliVersion {
  major: number
  minor: number
  patch: number
  raw: string
}

const cache = new Map<string, Promise<CliVersion | null>>()

/**
 * Env vars set on every `claude` child so the binary we detected stays the
 * binary we run.
 *
 * `detectCliVersion` resolves once per cliPath and caches that answer for the
 * life of the opencode process, and several flags are gated on it:
 * `--thinking-display summarized`, `--plugin-dir`, and fast mode via
 * `--settings`. If the CLI autoupdates underneath a long-running opencode the
 * cached version stops describing the binary actually being spawned, so a gated
 * flag can be passed to a CLI that rejects it or withheld from one that
 * supports it. A binary swapped mid-session is a plain correctness hazard
 * besides.
 *
 * `DISABLE_AUTOUPDATER` is the update blocker Anthropic's own runner sets on
 * the children it spawns. Do not add `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`:
 * it also blocks updates, but on 2.1.285 it drops Monitor, PushNotification,
 * DesignSync, claude.ai MCP connectors and several slash commands, which left
 * oc's Claude weaker than the CLI run directly.
 */
export const CLI_HYGIENE_ENV_VARS = ["DISABLE_AUTOUPDATER"] as const

/**
 * The hygiene vars that are missing from `inherited`, each set to "1".
 *
 * Only ever fills a gap: a var the user exported themselves is left exactly as
 * they set it, including an empty string, which both vars read as off. That is
 * the same rule the thinking vars follow in `claudeSpawnEnv`, and it is the
 * escape hatch for anyone who deliberately wants the autoupdater, so this needs
 * no provider option of its own.
 */
export function cliHygieneEnv(
  inherited: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const filled: Record<string, string> = {}
  for (const name of CLI_HYGIENE_ENV_VARS) {
    if (inherited[name] === undefined) filled[name] = "1"
  }
  return filled
}

/**
 * Run `claude --version` once per cliPath and parse the leading semver.
 * Returns null on any failure (binary missing, unparseable output, etc.)
 * so callers can fall back to the most conservative flag set.
 */
export function detectCliVersion(cliPath: string): Promise<CliVersion | null> {
  const cached = cache.get(cliPath)
  if (cached) return cached
  const promise = (async (): Promise<CliVersion | null> => {
    try {
      const command = cliCommand(cliPath, ["--version"])
      const { stdout } = await execFileAsync(command.command, command.args, {
        timeout: 5000,
        shell: command.shell,
      })
      const match = /(\d+)\.(\d+)\.(\d+)/.exec(stdout.trim())
      if (!match) {
        log.warn("claude --version output unparseable", { stdout: stdout.trim() })
        return null
      }
      const v: CliVersion = {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        raw: stdout.trim(),
      }
      log.info("detected claude cli version", { cliPath, version: v.raw })
      if (!cliSupportsThinkingDisplay(v)) {
        log.notice(
          "claude cli < 2.1.142 detected; Opus 4.7 thinking summaries unavailable. Run `npm i -g @anthropic-ai/claude-code` to upgrade.",
          { version: v.raw },
        )
      }
      return v
    } catch (err) {
      log.warn("failed to detect claude cli version", {
        cliPath,
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  })()
  cache.set(cliPath, promise)
  return promise
}

function gte(v: CliVersion, target: { major: number; minor: number; patch: number }): boolean {
  if (v.major !== target.major) return v.major > target.major
  if (v.minor !== target.minor) return v.minor > target.minor
  return v.patch >= target.patch
}

/**
 * `--thinking-display` was introduced in Claude Code 2.1.142 alongside
 * Opus 4.7's "omitted by default" thinking behavior. Older CLIs reject
 * the flag with a parse error, so we gate it. Unknown version → return
 * false so we don't risk crashing the spawn.
 */
export function cliSupportsThinkingDisplay(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 1, patch: 142 })
}

/**
 * Fast mode's headless opt-in. In print mode the CLI reports
 * `fast_mode_disabled_reason: "sdk_opt_in_required"` unless the *flag* settings
 * layer carries `fastMode: true`, which only `--settings` populates (there is
 * no `--fast` flag, and no fast-mode model name the CLI still accepts).
 *
 * 2.1.220 is the floor because it is the oldest binary the opt-in path was
 * confirmed present in, not because 2.1.219 is known to lack it. An unknown
 * settings key is ignored rather than fatal, so the downside of gating too
 * high is only that fast mode stays off.
 */
export function cliSupportsFastMode(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 1, patch: 220 })
}

/**
 * `--restricted` (removes the command and code-running built-ins plus
 * WebFetch, confines the file tools to the working directories, refuses
 * bypassPermissions). Claude Code's changelog puts it at 2.1.248; 2.1.258 is
 * the oldest binary on hand whose `--help` was checked and has it, and 2.1.248
 * itself could not be checked, so the gate sits at what was measured. Gating
 * one release line too high costs nothing but the flag; gating too low would
 * hand an older CLI an argument it exits on.
 */
export function cliSupportsRestricted(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 1, patch: 258 })
}

/**
 * `--permission-prompts <host|none>`. Measured absent from 2.1.258's `--help`
 * and present in 2.1.263's, so the introduction is somewhere in between
 * (the changelog says 2.1.259) and the gate again sits at the verified side.
 * Below it every `can_use_tool` request is denied by the plugin, which
 * is why the read-only preset still holds on older CLIs.
 */
export function cliSupportsPermissionPrompts(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 1, patch: 263 })
}

/**
 * `--thinking` has been part of Claude Code's CLI since the 2.x line.
 * We require a detected 2.0.0+ before passing it; unknown version → skip
 * to avoid crashing a pre-flag binary. Anyone on the 1.x line should
 * upgrade.
 */
export function cliSupportsThinking(v: CliVersion | null): boolean {
  if (!v) return false
  return gte(v, { major: 2, minor: 0, patch: 0 })
}

