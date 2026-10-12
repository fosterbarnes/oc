/**
 * How long a proxied tool call may wait for opencode, and what happens when
 * that deadline passes. Shared by the proxy HTTP server and the broker so the
 * two layers make the same decision.
 */
import { log } from "./logger.js"
import { TASK_BATCH_TOOL_NAME } from "./proxyToolDefs.js"

// Flat fallback cap on how long a proxy tool call may wait for opencode to
// resolve it. Matches Claude CLI's hard upper bound for Bash (10 min). The
// effective deadline is resolved per tool - see `resolveProxyCallTimeoutMs`.
export const PROXY_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

/** A resolved deadline of 0 means the call waits until a lifecycle event
 * releases it: a result, an abort, the next user turn's orphan sweep, the
 * child closing, or the proxy server closing with its process. */
export const PROXY_NO_DEADLINE_MS = 0

// Per-tool default deadlines, keyed by lowercase proxy tool name. `task` and
// `task_batch` dispatch opencode subagents, and the wall clock is the wrong
// unit for those: a 10-min flat ceiling fired mid-subagent and dropped the
// late result on the floor (@jknlsn, live session ses_0cfc0da6, 2026-07-05),
// and a 60-min one did the same to any subagent that ran longer (@broskees'
// dd494a8). So they carry no deadline at all: an abandoned task call is
// released by the same lifecycle events that already release every other
// call, and a positive `proxyToolTimeoutMs` override restores a backstop.
//
// `question` blocks on a human reading a TUI form, so the flat ceiling is
// the wrong unit entirely: a question posed just before the operator steps
// away would be rejected mid-answer. Wait for an answer or lifecycle cleanup.
export const PROXY_PER_TOOL_DEFAULT_TIMEOUT_MS: Record<string, number> = {
  task: PROXY_NO_DEADLINE_MS,
  task_batch: PROXY_NO_DEADLINE_MS, // same reasoning: it IS task calls
  question: PROXY_NO_DEADLINE_MS,
}

// Node's setTimeout delay is a signed 32-bit int; values above 2^31-1 ms
// (~24.85 days) trigger TimeoutOverflowWarning and fire at ~1ms instead.
// Clamp absurd overrides / input.timeouts so a misconfigured deadline
// can't collapse to "fires immediately".
export const MAX_PROXY_TIMEOUT_MS = 2 ** 31 - 1

/**
 * Resolve the proxy deadline for a tool call. Layers, most-specific last:
 *  1. flat default (`PROXY_DEFAULT_TIMEOUT_MS`, 10 min)
 *  2. per-tool default (`PROXY_PER_TOOL_DEFAULT_TIMEOUT_MS`; `task` and
 *     `task_batch` have none)
 *  3. user override via `proxyToolTimeoutMs` config (case-insensitive key).
 *     A positive value replaces the default, `0` disables the deadline for
 *     that tool, and a negative or non-finite value is ignored.
 *  4. for `bash`, the call's own `input.timeout` -- the proxy must never
 *     undercut a build the caller explicitly asked to run long. The bash
 *     proxy def advertises a `timeout` field; before this fix the proxy
 *     ignored it and killed the call at the flat ceiling anyway. It only
 *     ever raises, so it also turns a disabled bash deadline back into one.
 * Finally clamped to `MAX_PROXY_TIMEOUT_MS` to stay within Node's timer range.
 * Returns `PROXY_NO_DEADLINE_MS` (0) when the call has no deadline; callers
 * must not arm a timer for that value.
 */
export function resolveProxyCallTimeoutMs(
  toolName: string,
  input: Record<string, unknown> | undefined,
  overrides: Record<string, number> | undefined,
): number {
  const key = toolName.toLowerCase()
  let ms = PROXY_PER_TOOL_DEFAULT_TIMEOUT_MS[key] ?? PROXY_DEFAULT_TIMEOUT_MS
  if (overrides) {
    const ov = lookupCaseInsensitive(overrides, key)
    if (isDeadlineOverride(ov)) ms = ov
  }
  if (key === "bash") {
    const requested = input?.timeout
    if (typeof requested === "number" && requested > ms) ms = requested
  }
  return Math.min(ms, MAX_PROXY_TIMEOUT_MS)
}

/** `0` (no deadline) or a positive finite number of milliseconds. */
function isDeadlineOverride(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
}

function lookupCaseInsensitive(map: Record<string, number>, key: string): number | undefined {
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key]
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === key) return map[k]
  }
  return undefined
}

/**
 * Client-side abort ceiling written into Claude's `--mcp-config` entry for
 * the proxy server. Without a `timeout` there, Claude CLI's remote-HTTP MCP
 * client aborts each call at its 60-second default even while an opencode
 * subagent is still running (@broskees, PR #18). It must be >= the largest
 * server-side deadline or the client gives up before the broker does, so it
 * tracks the max of every tool's effective deadline: the flat default, the
 * per-tool defaults, and the user's overrides applied on top of them. A tool
 * with no deadline needs the largest value the client accepts, because the
 * CLI rejects `timeout: 0` in the MCP config outright (measured on the fork
 * this came from, @broskees' dd494a8), and this is also Node's timer max.
 * (A bash call raising its own `input.timeout` above this ceiling is a known
 * edge; Claude CLI caps bash at 10 min anyway.)
 */
export function resolveProxyClientCeilingMs(overrides: Record<string, number> | undefined): number {
  let ms = PROXY_DEFAULT_TIMEOUT_MS
  const consider = (deadlineMs: number): boolean => {
    if (deadlineMs === PROXY_NO_DEADLINE_MS) return true
    if (deadlineMs > ms) ms = deadlineMs
    return false
  }
  for (const [toolName, defaultMs] of Object.entries(PROXY_PER_TOOL_DEFAULT_TIMEOUT_MS)) {
    const override = overrides ? lookupCaseInsensitive(overrides, toolName) : undefined
    if (consider(isDeadlineOverride(override) ? override : defaultMs)) {
      return MAX_PROXY_TIMEOUT_MS
    }
  }
  for (const value of Object.values(overrides ?? {})) {
    if (isDeadlineOverride(value) && consider(value)) return MAX_PROXY_TIMEOUT_MS
  }
  return Math.min(ms, MAX_PROXY_TIMEOUT_MS)
}

/**
 * Asked when a call's deadline passes. `true` means opencode is still serving
 * the call, so it keeps waiting and is asked about again later.
 *
 * The deadline counted time the operator spent on opencode's permission
 * prompt, and that is where nearly every deadline went: measured 2026-09-23,
 * three proxied `bash` calls sat on an `external_directory` prompt for 24, 34
 * and 10.5 minutes (opencode's own part timings) and each was rejected at 10.
 * Claude then moved on to a new call, and the approval, once given, arrived as
 * a late result that the next turn's orphan sweep read as a new message: the
 * new call was cancelled and Claude was told the user had refused it. opencode
 * reports the session `busy` for as long as a prompt is open (measured on
 * 1.18.32), which is the signal the language model's guard reads.
 *
 * Registered by the language model; with no guard every deadline is final, as
 * it always was, so a bare proxy server and the offline tests are unchanged.
 */
export type ProxyDeadlineGuard = (call: { callId: string; toolName: string }) => Promise<boolean>

let proxyDeadlineGuard: ProxyDeadlineGuard | null = null

export function setProxyDeadlineGuard(guard: ProxyDeadlineGuard | null): void {
  proxyDeadlineGuard = guard
}

/** How often a call kept past its deadline is looked at again. */
export const PROXY_DEADLINE_RECHECK_MS = 60_000

let deadlineRecheckMs = PROXY_DEADLINE_RECHECK_MS

/** Test seam: `null` restores the default. */
export function _setProxyDeadlineRecheckMs(ms: number | null): void {
  deadlineRecheckMs = ms ?? PROXY_DEADLINE_RECHECK_MS
}

export interface ProxyDeadline {
  cancel(): void
}

/**
 * One call's deadline, shared by the HTTP handler and the broker so the two
 * layers make the same decision. `onExpire` runs only once the guard says
 * opencode is no longer serving the call (or there is no guard). A guard that
 * throws counts as "not serving", so a failed lookup can only end a call the
 * way it always ended, never hold one open.
 */
export function armProxyDeadline(opts: {
  callId: string
  toolName: string
  deadlineMs: number
  onExpire: () => void
  /** Only one layer logs the extension, so a call does not report twice. */
  logExtension?: boolean
  /** Test seam. */
  recheckMs?: number
}): ProxyDeadline {
  let cancelled = false
  let extended = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const check = async (): Promise<void> => {
    timer = null
    if (cancelled) return
    let keep = false
    const guard = proxyDeadlineGuard
    if (guard) {
      try {
        keep = await guard({ callId: opts.callId, toolName: opts.toolName })
      } catch {
        keep = false
      }
    }
    if (cancelled) return
    if (keep) {
      if (!extended && opts.logExtension) {
        log.warn("proxy call past its deadline, but opencode is still serving it; waiting", {
          callId: opts.callId,
          toolName: opts.toolName,
          deadlineMs: opts.deadlineMs,
          note: "usually a permission prompt in opencode; the call ends when it is answered, you abort, or the claude process goes",
        })
      }
      extended = true
      timer = setTimeout(() => void check(), opts.recheckMs ?? deadlineRecheckMs)
      return
    }
    opts.onExpire()
  }

  timer = setTimeout(() => void check(), opts.deadlineMs)
  return {
    cancel() {
      cancelled = true
      if (timer) clearTimeout(timer)
      timer = null
    },
  }
}

/**
 * Build the timeout error surfaced to Claude. Keeps the substrings
 * `"timed out after"` and `"waiting for opencode to resolve"` that the
 * proxy-mcp catch block classifies as expected cleanup (notice, not warn).
 * For `task` we append guidance: a Task timeout means the subagent may
 * still be running but its result is now unreachable, and the model must
 * neither declare the dispatch failed nor "schedule a wake-up" -- that is a
 * Claude Code affordance which cannot fire in this headless/proxy context,
 * so deferring silently drops the work.
 */
export function buildProxyTimeoutError(toolName: string, ms: number): Error {
  const key = toolName.toLowerCase()
  const base = `Proxy tool '${toolName}' timed out after ${ms}ms waiting for opencode to resolve the call`
  if (key === "task" || key === TASK_BATCH_TOOL_NAME) {
    return new Error(
      base +
        (key === "task" ? " (the subagent)." : " (the subagents).") +
        " The subagent may still be running but its result" +
        " is no longer reachable in this session. Do not declare the dispatch" +
        " failed, and do not 'schedule a wake-up' or defer -- that mechanism" +
        " does not apply here. If the result is required, re-dispatch or" +
        " verify it directly now.",
    )
  }
  return new Error(base)
}
