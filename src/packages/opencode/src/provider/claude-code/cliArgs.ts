/**
 * The `claude` argv for one spawn, gated on the detected CLI version so older
 * binaries never see a flag they would refuse.
 */
import { log } from "./logger.js"
import {
  cliSupportsFastMode,
  cliSupportsPermissionPrompts,
  cliSupportsRestricted,
  cliSupportsThinking,
  cliSupportsThinkingDisplay,
  type CliVersion,
} from "./cliVersion.js"
import { isReadOnlyPermissionMode } from "./permissionPresets.js"
import { getClaudeSessionId, hasActiveProcess, takePendingRewind } from "./sessionManager.js"
import { isClaudeThinkingDisabled } from "./spawnEnv.js"

export function buildCliArgs(opts: {
  sessionKey: string
  skipPermissions: boolean
  includeSessionId?: boolean
  model?: string
  permissionMode?: string
  mcpConfig?: string | string[]
  strictMcpConfig?: boolean
  disallowedTools?: string[]
  tools?: readonly string[]
  appendSystemPromptFile?: string
  /** `--plugin-dir`: oc skills linked as a Claude Code plugin (skillPlugin.ts). */
  pluginDir?: string
  thinking?: "enabled" | "disabled"
  thinkingDisplay?: "summarized" | "omitted"
  fastMode?: boolean
  /** The provider's `claudeSettings`, merged into the one `--settings` object. */
  settings?: Record<string, unknown>
  cliVersion?: CliVersion | null
}): string[] {
  const {
    sessionKey,
    skipPermissions,
    includeSessionId = true,
    model,
    permissionMode,
    mcpConfig,
    strictMcpConfig,
    disallowedTools,
    tools,
    appendSystemPromptFile,
    pluginDir,
    thinking,
    thinkingDisplay,
    fastMode,
    settings,
    cliVersion,
  } = opts
  const args = [
    "--print",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    // Echoes each stdin user message when Claude reads it: the delivery receipt for a mid-turn steer.
    "--replay-user-messages",
  ]

  if (model) {
    args.push("--model", model)
  }

  // The read-only preset arrives as an internal `permissionMode` token rather
  // than a mode the CLI knows, because it is a capability restriction and the
  // CLI spells that as its own flags. `--restricted` removes Bash, the REPL,
  // the other code-running built-ins and WebFetch, confines the file tools to
  // the working directories, and refuses bypassPermissions.
  // `--permission-prompts none` denies anything left that would prompt
  // without asking this plugin, which is the same answer every
  // `can_use_tool` request gets on a CLI too old for the flag.
  const readOnly = isReadOnlyPermissionMode(permissionMode)
  if (readOnly) {
    if (cliSupportsRestricted(cliVersion ?? null)) {
      args.push("--restricted")
    } else {
      // The preset still holds: `--disallowedTools` carries the same tool
      // names and the plugin denies every permission request itself. What is
      // lost is the cwd confinement on reads and the CLI-side refusal of
      // bypass, so say so rather than degrading quietly.
      log.warn(
        'permissionPreset "read-only": this claude CLI has no --restricted' +
          " (2.1.258+), so file reads are not confined to the working" +
          " directory. The mutating tools are still refused via" +
          " --disallowedTools and every permission request is denied.",
        { cliVersion: cliVersion?.raw ?? "unknown" },
      )
    }
    if (cliSupportsPermissionPrompts(cliVersion ?? null)) {
      args.push("--permission-prompts", "none")
    } else {
      log.warn(
        'permissionPreset "read-only": this claude CLI has no' +
          " --permission-prompts (2.1.263+), so permission requests are" +
          " denied by the plugin's own can_use_tool handler instead of by" +
          " the CLI. Same outcome, one layer fewer.",
        { cliVersion: cliVersion?.raw ?? "unknown" },
      )
    }
  } else if (permissionMode) {
    args.push("--permission-mode", permissionMode)
  }

  // `--session-id` means "create a NEW session with this UUID" and the CLI
  // exits with "Session ID ... is already in use" whenever a transcript for
  // that ID already exists on disk. Continuing an existing session requires
  // `--resume` (which keeps the same session ID in print mode).
  if (includeSessionId) {
    const sessionId = getClaudeSessionId(sessionKey)
    if (sessionId && !hasActiveProcess(sessionKey)) {
      args.push("--resume", sessionId)
      // Drift recovery (sessionSync.ts): keep the transcript only up to the
      // last exchange opencode still shows, on a fork so the original stays.
      const rewindTo = takePendingRewind(sessionKey)
      if (rewindTo) args.push("--resume-session-at", rewindTo, "--fork-session")
    }
  }

  if (mcpConfig) {
    const configs = Array.isArray(mcpConfig) ? mcpConfig : [mcpConfig]
    const filtered = configs.filter((c) => typeof c === "string" && c.length > 0)
    if (filtered.length > 0) {
      args.push("--mcp-config", ...filtered)
    }
  }

  if (strictMcpConfig) {
    args.push("--strict-mcp-config")
  }

  if (disallowedTools && disallowedTools.length > 0) {
    args.push("--disallowedTools", ...disallowedTools)
  }
  if (tools !== undefined) args.push("--tools", tools.join(","))

  // `--thinking` is only present from Claude Code 2.x onward; gate so
  // pre-2.x binaries don't crash with a parse error. Unknown version ->
  // skip (the spawn still works, the user just doesn't get extended
  // thinking until they upgrade).
  if (thinking && cliSupportsThinking(cliVersion ?? null)) {
    args.push("--thinking", thinking)
  }

  // `--thinking-display` was added in Claude Code 2.1.142. Older CLIs
  // reject it with a parse error, so gate on detected version. When
  // version is unknown (detection failed), be conservative and skip.
  if (thinkingDisplay && cliSupportsThinkingDisplay(cliVersion ?? null)) {
    args.push("--thinking-display", thinkingDisplay)
  }

  if (appendSystemPromptFile) {
    args.push("--append-system-prompt-file", appendSystemPromptFile)
  }

  if (pluginDir) args.push("--plugin-dir", pluginDir)

  // Fast mode's only headless opt-in. `--settings` feeds the CLI's
  // `flagSettings` layer, which is the one its SDK gate checks; a `fastMode`
  // in the user's own settings.json is NOT enough for a `--print` run.
  // Built as one object so later flag-settings keys merge here instead of
  // adding a second `--settings` (the CLI takes the flag once).
  const flagSettings = {
    ...settings,
    ...(fastMode && cliSupportsFastMode(cliVersion ?? null) && { fastMode: true }),
  }
  if (Object.keys(flagSettings).length > 0) args.push("--settings", JSON.stringify(flagSettings))

  // Same rule as plan mode below, with a harder edge: `--restricted` and
  // `--dangerously-skip-permissions` together are not a silent override but a
  // startup error ("Error: bypassPermissions not supported in restricted
  // mode", measured on 2.1.280), so a read-only spawn carrying both would
  // never run at all. The preset already forces `skipPermissions` false; this
  // is the second lock, for anyone calling `buildCliArgs` directly.
  //
  // Plan mode is a capability restriction, not a prompt policy, and the CLI
  // lets `--dangerously-skip-permissions` override it outright: measured on
  // 2.1.258, a plan-mode run carrying both flags wrote a file on request
  // without prompting, while the same run without the skip flag refused and
  // created nothing. Since `skipPermissions` defaults to true, passing both
  // is the common case, so anyone asking for plan mode was silently getting
  // full write access. Plan mode must never permit edits, so it wins here.
  // Every other `permissionMode` value governs prompting, which is exactly
  // what the skip flag is for, so those still pass both.
  if (skipPermissions && permissionMode !== "plan" && !readOnly) {
    args.push("--dangerously-skip-permissions")
  }

  return args
}

export function thinkingCliOptions(): { thinking?: "enabled"; thinkingDisplay?: "summarized" } {
  if (isClaudeThinkingDisabled()) return {}
  return {
    thinking: "enabled",
    thinkingDisplay: process.env.CLAUDE_CODE_SHOW_THINKING_SUMMARIES === undefined ? "summarized" : undefined,
  }
}
