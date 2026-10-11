/**
 * The environment a `claude` child is spawned with: effort, auth source,
 * thinking summaries, and the hygiene variables that pin the CLI version.
 */
import { cliHygieneEnv } from "./cli-version.js"
import type { ReasoningEffort } from "./types.js"

function envFlagEnabled(value: string | undefined): boolean {
  if (value === undefined) return false
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return !["0", "false", "no", "off"].includes(normalized)
}

export function isClaudeThinkingDisabled(): boolean {
  return (
    envFlagEnabled(process.env.CLAUDE_CODE_DISABLE_THINKING) ||
    envFlagEnabled(process.env.CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING)
  )
}

/**
 * The CLI's effort vocabulary is low | medium | high | xhigh | max. `minimal`
 * is this provider's own lowest step with no CLI counterpart, so it lands on
 * `low`.
 */
export function cliEffortLevel(effort: ReasoningEffort): string {
  return effort === "minimal" ? "low" : effort
}

export function claudeSpawnEnv(opts?: {
  ignoreAnthropicApiKey?: boolean
  /** Reasoning effort for this spawn; wins over a shell-level override. */
  effort?: ReasoningEffort
  /** Pool account config dir (accounts.ts); undefined keeps the inherited one. */
  configDir?: string
}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    TERM: "xterm-256color",
    // Pin the child to the binary whose version we detected, and keep it off
    // non-essential network calls. Fills gaps only, so an explicit shell value
    // survives: see `cliHygieneEnv` for why the version has to hold still.
    ...cliHygieneEnv(),
  }

  // Effort travels as CLAUDE_CODE_EFFORT_LEVEL, which the CLI treats as the
  // session-wide override (it beats settings.json and `/effort`). An env var
  // rather than `--effort` because a CLI too old to know it ignores it
  // instead of refusing to start. Unlike the thinking vars below, an explicit
  // effort from the request wins over the shell: the variant picker and an
  // agent's `reasoningEffort` are per-request choices, a shell export is not.
  if (opts?.effort) {
    env.CLAUDE_CODE_EFFORT_LEVEL = cliEffortLevel(opts.effort)
  }

  // Force subscription auth: with an API key in the env, Claude Code bills
  // pay-as-you-go (Console) instead of the logged-in plan's usage limits.
  // Opt-in via `ignoreAnthropicApiKey`.
  if (opts?.ignoreAnthropicApiKey) {
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
  }

  // A pool account must log in from its own config dir; any credential
  // override in the shell would quietly bill the default account instead.
  if (opts?.configDir) {
    env.CLAUDE_CONFIG_DIR = opts.configDir
    delete env.ANTHROPIC_API_KEY
    delete env.ANTHROPIC_AUTH_TOKEN
    delete env.CLAUDE_CODE_OAUTH_TOKEN
  }

  // Default-on thinking summaries for opus-4-7 (which omits thinking by
  // default on the CLI side). Any var the user has explicitly set in their
  // shell is passed through untouched; the plugin only fills in the default.
  if (
    !isClaudeThinkingDisabled() &&
    process.env.CLAUDE_CODE_SHOW_THINKING_SUMMARIES === undefined
  ) {
    env.CLAUDE_CODE_SHOW_THINKING_SUMMARIES = "1"
  }

  // Headless CLIs (2.1.283) only expose TaskCreate/TaskUpdate for a short
  // list of older models unless this is set; they feed opencode's todo panel.
  env.CLAUDE_CODE_ENABLE_TODO_TOOLS ??= "1"

  // The standalone CLI (2.1.285) offers its PowerShell tool only behind this
  // preview flag; the desktop app turns it on. Without it Windows gets Git
  // Bash alone, whose nested quoting mangled escapes in shell file writes.
  if (process.platform === "win32") env.CLAUDE_CODE_USE_POWERSHELL_TOOL ??= "1"

  return env
}
