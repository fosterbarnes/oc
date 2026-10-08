import type { LogLevel, LogMode } from "./logger"

export type { LogLevel, LogMode }

export interface ClaudeCodeConfig {
  provider: string
  cliPath: string
  /**
   * Which opencode major this model was created by, which decides the tool
   * vocabulary its stream uses (src/host-tools.ts). Set only by the V2
   * entrypoint's `sdk` hook; absent means opencode 1.x. Per model rather than
   * per process on purpose: opencode 1.18 also calls a dual export's `setup`,
   * so nothing process-wide may decide it.
   */
  hostApi?: "v1" | "v2"
  cwd?: string
  account?: string
  configDir?: string
  providerID?: string
  skipPermissions?: boolean
  /**
   * Widened past `PermissionMode` because a resolved `permissionPreset` puts
   * its own internal token here (`READ_ONLY_PERMISSION_MODE`), which
   * `buildCliArgs` translates to CLI flags. The operator-facing option on
   * `ClaudeCodeProviderSettings` stays a plain `PermissionMode`.
   */
  permissionMode?: EffectivePermissionMode
  /** The preset this config was resolved from, for diagnostics. */
  permissionPreset?: PermissionPreset
  mcpConfig?: string | string[]
  strictMcpConfig?: boolean
  proxyTools?: string[]
  proxyOpencodeTools?: string[]
  stripContextReminders?: boolean
  extraDisallowedTools?: string[]
  proxyToolTimeoutMs?: Record<string, number>
  webSearch?: WebSearchRouting
  hotReloadMcp?: boolean
  multiStepContinuation?: boolean
  autoContinueIncompleteTurns?: boolean | "smart"
  ignoreAnthropicApiKey?: boolean
  /** Kill an idle headless Claude worker after this many milliseconds. */
  idleProcessTimeoutMs?: number
  /** Append a one-line cost / duration / cache footer to each finished turn. */
  turnStats?: boolean
  logging?: LoggingConfig
}

export interface LoggingConfig {
  /**
   * Persist log activity (DEBUG / INFO / NOTICE / WARN / ERROR - those
   * passing `level`) to a file. Default: `false`. When `false`, entries
   * below WARN vanish entirely; WARN / ERROR still surface in the TUI via
   * stderr. Set to `true` to capture the audit trail to disk for review
   * via `tail` / `grep`.
   */
  file?: boolean
  /**
   * Optional custom directory for the file log. Defaults to
   * `~/.local/share/opencode-claude-code/`. Has no effect when `file:false`.
   */
  dir?: string
  /**
   * TUI policy. `"silent"` (default) routes DEBUG / INFO / NOTICE to file
   * only; WARN / ERROR still bubble in the TUI as they always do. `"debug"`
   * additionally echoes every emitted level to stderr (which opencode's TUI
   * surfaces as warning bubbles).
   */
  mode?: LogMode
  /**
   * Minimum level to emit anywhere. Anything below the threshold is dropped
   * before either destination decides what to do. Order:
   * `debug` < `info` < `notice` < `warn` < `error`. Default: `"info"`.
   */
  level?: LogLevel
}

export type WebSearchRouting = "claude" | "disabled" | (string & {})

export interface ClaudeCodeProviderSettings {
  cliPath?: string
  /** Internal: set by the opencode 2 entrypoint. See `ClaudeCodeConfig.hostApi`. */
  hostApi?: "v1" | "v2"
  cwd?: string
  name?: string
  providerID?: string
  account?: string
  configDir?: string
  /**
   * Model that subagents run on when their own definition pins nothing.
   * Unset means no implicit override at all, so an agent keeps inheriting the
   * caller's model exactly as opencode intends. See `src/agent-models.ts`.
   */
  defaultSubagentModel?: string
  skipPermissions?: boolean
  permissionMode?: PermissionMode
  /**
   * Apply a named permission preset instead of hand-combining
   * `permissionMode`, `skipPermissions`, `proxyTools` and
   * `extraDisallowedTools`.
   *
   * `"read-only"` makes the turn unable to change anything: no
   * `--dangerously-skip-permissions` (the CLI refuses bypass under
   * `--restricted` outright), `--restricted` so the CLI has no Bash, REPL or
   * WebFetch at all, the mutating built-ins on `--disallowedTools` for CLIs
   * too old for that flag, the write and command tools removed from the
   * opencode proxy, and every remaining permission request denied.
   *
   * A preset overrides those five options rather than merging with them, so
   * one setting decides the posture; the plugin warns about each value it
   * drops. Unset (the default) changes nothing.
   */
  permissionPreset?: PermissionPreset
  mcpConfig?: string | string[]
  strictMcpConfig?: boolean
  /**
   * Proxy these Claude built-in tools through opencode instead of letting the
   * CLI execute them directly. When a tool is listed here, the plugin:
   *   - passes `--disallowedTools <ClaudeName>` to the CLI, and
   *   - exposes an equivalent tool via an in-process HTTP MCP server named
   *     `opencode_proxy`. Claude calls the MCP tool, which blocks on
   *     opencode's tool executor (with its native permission UI) and returns
   *     the result.
   *
    * Supported: `bash`, `write`, `edit`, `webfetch`, `task`, `question`. Leave empty or unset to disable proxying.
    *
    * `task` proxies Claude CLI's `Agent` (subagent dispatch) tool through
    * opencode's `task` tool, so subagent calls run under opencode's
    * configured subagent set (build/general/custom) with opencode's
    * permission and lifecycle handling, instead of Claude CLI's
    * internal-only general-purpose / Explore / Plan options. The calling
    * agent must have `permission.task: allow` for the target subagent
    * (see opencode's agent docs).
    *
    * `question` proxies Claude CLI's `AskUserQuestion` through opencode's
    * native `question` tool (TUI form with options + custom answer). The
    * calling agent must have `permission.question: allow`. Version-gated:
    * silently dropped on opencode builds that lack the `question` registry
    * entry, in which case the deny/markdown fallback applies.
    */
  proxyTools?: string[]

  /**
   * opencode tools to forward through the proxy by name, on top of the
   * built-in `proxyTools` defs. Empty by default.
   *
   * MCP-backed opencode tools are routed automatically through the proxy,
   * but that match is `<server>` or
   * `<server>_<tool>`, so a tool another opencode plugin declares directly
   * belongs to no server and is never offered to Claude. opencode-dcp's
   * `compress` is the motivating case: dcp injects "MAX CONTEXT LIMIT
   * REACHED ... You MUST use the `compress` tool now" reminders that the
   * model could not act on, because the tool was never in its list.
   *
   * Names are opencode's tool ids as `client.tool.list()` reports them
   * (matched case-insensitively): `["compress"]`. An unknown name is
   * skipped with a warning. This is an explicit allowlist and never
   * automatic: a forwarded tool executes inside opencode with the calling
   * agent's permissions.
   *
   * A name already held by a proxy def is NOT taken over. Listing
   * `"compress"` here while `proxyTools` also contains `"Compress"` leaves
   * the plugin's own in-process compress in charge and drops the forwarded
   * one with a warning, because the two do different things: the plugin's
   * resets the Claude Code session, opencode's compresses opencode's
   * transcript. Pick one.
   */
  proxyOpencodeTools?: string[]

  /**
   * Remove `<dcp-system-reminder>` blocks from message text when no
   * `compress` tool is being proxied. Off by default.
   *
   * opencode-dcp anchors those reminders into messages, so they are re-sent
   * with every message that carries one. When compress is not reachable
   * they are an instruction the model cannot follow, and the plugin already
   * tells it to ignore them in the appended system prompt. Turning this on
   * stops paying for them as well. It is inert whenever `compress` is
   * proxied (via either `proxyTools` or `proxyOpencodeTools`), since the
   * reminder is then something the model can actually act on.
   */
  stripContextReminders?: boolean

  /**
   * Extra Claude Code built-ins to switch off with `--disallowedTools`,
   * on top of the ones implied by `proxyTools`.
   *
   * `proxyTools` can only disable built-ins the plugin knows how to
   * replace, so a built-in with no proxy equivalent (`NotebookEdit`, and
   * anything Claude Code adds after this release) has no off switch
   * otherwise. Names are Claude's, not opencode's: `["NotebookEdit"]`.
   *
   * Disabling a tool with no replacement removes the capability rather
   * than routing it through opencode - that is the point, but it does mean
   * the model has to work without it.
   */
  extraDisallowedTools?: string[]

  /**
   * Per-tool proxy call timeouts in milliseconds, keyed by the proxy tool
   * name (`bash`, `edit`, `write`, `webfetch`, `task`, `question` -
   * case-insensitive). When a proxied tool call waits longer than its
   * deadline for opencode to resolve it, the call is rejected and Claude
   * receives a timeout error.
   *
   * Defaults (used when a tool is absent here): `bash`/`edit`/`write`/
   * `webfetch` -> 10 min (matches Claude CLI's Bash ceiling); `task` and
   * `task_batch` -> no deadline (the call waits for the subagent; abandoned
   * calls are released by aborts, the next user turn, and the process going
   * away); `question` -> 30 min (operator AFK). A positive value here replaces
   * the default for that tool, `0` disables its deadline, and a negative or
   * non-finite value is ignored.
   *
   * For `bash` specifically the call's own `input.timeout` is honoured on
   * top: the effective deadline is `max(resolved, input.timeout)`, so a
   * long build the caller explicitly asked to run is never undercut, and a
   * positive `input.timeout` restores a deadline that `bash: 0` disabled.
   */
  proxyToolTimeoutMs?: Record<string, number>

  /**
   * Strip `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` from the environment of
   * every spawned `claude` process. When an API key is present, Claude Code
   * authenticates with it (pay-as-you-go Console billing) instead of the
   * logged-in Pro/Max subscription - silently bypassing the Agent SDK plan
   * credit. Set this to `true` to force the CLI to fall back to its stored
   * subscription auth. Defaults to `false` (the key is passed through, so
   * deliberate API-key users are unaffected). Regardless of this setting, the
   * plugin logs a one-time warning at startup when an API key is detected.
   */
  ignoreAnthropicApiKey?: boolean

  /**
   * Kill a retained headless Claude worker after this many milliseconds of
   * inactivity following a completed turn. Off unless set. The timer
   * starts when a turn completes (not at spawn), starting another turn cancels
   * it, a worker found mid-turn when it fires is left alone and re-timed, and
   * the Claude session id is retained for a transparent resume. Omit or set 0
   * to keep workers until LRU eviction (16 processes).
   */
  idleProcessTimeoutMs?: number

  /**
   * Append one compact line to the end of every finished (non-compaction,
   * non-error) turn with what that turn cost: dollars, wall duration, how many
   * internal CLI turns it took, and input / output / cache-read / cache-write
   * tokens. It is rendered as its own text part led by `▌ **stats:**` and is
   * stripped again from any transcript rebuilt for the CLI, so the model never
   * reads its own accounting.
   *
   * Off by default, because a cost line under every reply is a preference.
   * The same numbers are logged at INFO regardless of this setting, and
   * `total_cost_usd`, `duration_ms`, `usage`, `modelUsage` and
   * `permission_denials` always reach `providerMetadata`.
   */
  turnStats?: boolean

  /**
   * Routing for Claude's built-in `WebSearch` tool.
   *
   * - `"claude"` (default): Claude CLI runs WebSearch internally via
   *   Anthropic's web search. No MCP setup required, no extra cost.
   * - `"<opencode-tool-name>"` (e.g. `"websearch_web_search_exa"`): forward
   *   the call to that opencode-side tool with `executed:false`. Requires
   *   the corresponding MCP server to be configured in opencode.
   * - `"disabled"`: prevent the model from calling WebSearch entirely
   *   (passes `WebSearch` via `--disallowedTools`).
   */
  webSearch?: WebSearchRouting

  /**
   * Detect mid-session opencode MCP config changes and respawn the
   * underlying claude process so newly enabled / disabled MCPs become
   * visible to the model without restarting opencode or starting a new
   * chat. Eviction happens at the start of the next user turn (never mid
   * tool-call) and the session id is preserved for `--resume` so the conversation
   * continues seamlessly. Defaults to `true`.
   *
   * Set to `false` to keep the previous behavior (cached subprocess
   * survives MCP changes until the chat is reset).
   */
  hotReloadMcp?: boolean

  /**
   * Append a short system-prompt hint that nudges Claude to chain
   * multiple tool calls within a single turn instead of pausing for user
   * confirmation between subtasks. Each turn boundary in opencode
   * requires the user to manually press "continue" to resume, so for
   * multi-step tasks this option reduces friction. Defaults to `true`.
   *
   * Set to `false` if you prefer the un-nudged model behavior (Claude
   * decides when to end the turn entirely on its own).
   */
  multiStepContinuation?: boolean

  /**
   * Smartly continue incomplete Claude CLI results inside the same opencode
   * turn. Claude CLI sometimes emits `result` after reasoning/tool activity
   * without a useful final answer, which makes opencode stop and wait for the
   * user to type "continue". With the default `"smart"`, the plugin detects
   * those incomplete result boundaries, feeds Claude a small continuation
   * message internally, and keeps the opencode stream open. Final answers,
   * questions, blockers, errors, aborts, and safety-budget exhaustion still
   * stop normally.
   *
   * Set to `false` to disable.
   */
  autoContinueIncompleteTurns?: boolean | "smart"


  /**
   * Logger configuration. See `LoggingConfig` for fields. Env vars
   * (`OPENCODE_CLAUDE_CODE_LOG_FILE`, `OPENCODE_CLAUDE_CODE_LOG_DIR`,
   * `OPENCODE_CLAUDE_CODE_LOG_LEVEL`, `DEBUG=opencode-claude-code`) override
   * these values when explicitly set, so a developer can flip behavior for
   * one process without editing opencode.jsonc.
   */
  logging?: LoggingConfig
}

export type ReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

export type PermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan"

/**
 * A named bundle of permission settings, so a safety posture is one option
 * instead of a hand-rolled combination of `permissionMode`, `skipPermissions`,
 * `proxyTools` and `extraDisallowedTools`. Opt-in:
 * unset means today's behaviour, unchanged.
 *
 * `read-only` is the only preset so far. See `src/permission-presets.ts` for
 * what it resolves to and why each part is needed.
 */
export type PermissionPreset = "read-only"

/**
 * The `permissionMode` a resolved preset puts on `ClaudeCodeConfig`.
 * Plugin-internal, never a value the operator sets: `buildCliArgs` translates
 * `"read-only"` into `--restricted` (plus `--permission-prompts none` where
 * the CLI has it) rather than passing it to `--permission-mode`, which would
 * reject it.
 */
export const READ_ONLY_PERMISSION_MODE = "read-only"

export type EffectivePermissionMode =
  | PermissionMode
  | typeof READ_ONLY_PERMISSION_MODE

/**
 * `Question` is deliberately absent: enabling it disables Claude Code's
 * built-in AskUserQuestion (via --disallowedTools) and replaces the
 * stop-and-wait deny/markdown path with an in-turn blocking form. That is a
 * behavior trade against the issue-#8 guarantee, so it stays opt-in until it
 * has the same live mileage Task had before v0.10.0 flipped it on. Users opt
 * in by listing it in `proxyTools`; see README "Question proxy tool".
 *
 * It lives here rather than in `index.ts` (which still re-exports it, so the
 * public name is unchanged) because `permission-presets.ts` needs it to say
 * which proxy tools a preset dropped, and `startup-diagnostics.ts` and
 * `doctor.ts` read that answer. Importing `index.ts` from any of the three
 * would be a cycle.
 *
 * Only oc-only tools are proxied: Claude Code's native file, shell and web
 * tools run in the CLI and render as oc tool rows.
 */
export const DEFAULT_PROXY_TOOL_NAMES = ["Task", "run_after_turn", "time"]

/**
 * Claude CLI stream-json message types.
 */
export interface ClaudeStreamMessage {
  type: string
  subtype?: string
  request_id?: string

  // Fast mode, reported on both `system`/`init` and `result`. `off` with a
  // reason is how a request that asked for fast mode but did not get it shows
  // up: the CLI degrades to standard speed rather than failing, so without
  // reading these the downgrade is invisible. `cooldown` is the post-rate-limit
  // state and is temporary.
  fast_mode_state?: "on" | "off" | "cooldown"
  fast_mode_disabled_reason?: string

  // Present on `stream_event` envelopes when --include-partial-messages is on.
  // The inner event mirrors the same shape (content_block_*, message_*, etc).
  event?: ClaudeStreamMessage

  request?: {
    subtype?: string
    tool_name?: string
    input?: Record<string, unknown>
    tool_use_id?: string
    permission_suggestions?: unknown[]
    blocked_path?: string
    decision_reason?: string
    title?: string
    display_name?: string
    agent_id?: string
    description?: string
  }

  /**
   * On an `assistant` message the CLI synthesised to report a failure: the
   * kind of failure (`authentication_failed`, `billing_error`, ...). Read by
   * `accountBlockKind`; schema confirmed on Claude Code 2.1.280.
   */
  error?: string

  /** On a `conversation_reset`: the conversation Claude Code started. */
  new_conversation_id?: string

  message?: {
    role?: string
    model?: string
    usage?: ClaudeStreamMessage["usage"]
    content?: Array<{
      type: string
      text?: string
      name?: string
      input?: unknown
      id?: string
      tool_use_id?: string
      content?: string | Array<{ type: string; text?: string }>
      thinking?: string
      /** On a `tool_result` block: the CLI-executed tool failed. */
      is_error?: boolean
    }>
  }

  // `system`/`init` fields. Read by `reportSystemInit` in `cli-events.ts`;
  // shapes confirmed against the CLI's own zod schemas on 2.1.263.
  apiKeySource?: string
  permissionMode?: string
  model?: string
  claude_code_version?: string
  tools?: string[]
  mcp_servers?: Array<{ name?: string; status?: string }>

  // `system`/`compact_boundary`. The stream schema emits `compact_metadata`;
  // the CLI's own transcript reader uses `compactMetadata`.
  compact_metadata?: Record<string, unknown>
  compactMetadata?: Record<string, unknown>

  // `rate_limit_event`. See `RateLimitInfo` in `cli-events.ts`.
  rate_limit_info?: Record<string, unknown>

  tool?: {
    name?: string
    id?: string
    input?: unknown
  }

  tool_result?: {
    tool_use_id?: string
    content?: string | Array<{ type: string; text?: string }>
    is_error?: boolean
  }

  session_id?: string
  /** Transcript chain entry id; `--resume-session-at` rewinds to an assistant one. */
  uuid?: string
  /** Set on a subagent's messages, which live on a side chain, not the main one. */
  parent_tool_use_id?: string | null
  total_cost_usd?: number
  duration_ms?: number
  duration_api_ms?: number
  id?: string
  result?: string
  is_error?: boolean
  num_turns?: number
  stop_reason?: string | null

  /**
   * Per-model totals on `result`, keyed by model id: `inputTokens`,
   * `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`,
   * `webSearchRequests`, `costUSD`. All numeric, which is what makes it safe
   * to forward whole into `providerMetadata`.
   */
  modelUsage?: Record<string, Record<string, number>>
  /**
   * Tool calls the CLI's permission layer refused during the turn. Each entry
   * also carries a `tool_input` on the wire; it is deliberately not declared
   * here, because it can be a whole file's contents and must not be copied
   * into provider metadata.
   */
  permission_denials?: Array<{
    tool_name?: string
    tool_use_id?: string
  }>

  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
    iterations?: Array<{
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }>
  }

  content_block?: {
    type: string
    text?: string
    id?: string
    name?: string
    input?: string
    thinking?: string
  }

  delta?: {
    type: string
    text?: string
    partial_json?: string
    thinking?: string
  }

  index?: number
}
