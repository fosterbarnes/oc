import type { ChildProcess } from "node:child_process"
import launch from "cross-spawn"
import { createInterface } from "node:readline"
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { unlink } from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { log } from "./logger.js"
import { rawOpencodeClient } from "./runtimeStatus.js"
import { SERVER_CLOSED_MESSAGE, type ProxyMcpServer } from "./proxyMcp.js"
import { getPendingProxyCalls, rejectAllPendingProxyCallsForSession } from "./proxyBroker.js"
import type { ReasoningEffort } from "./types.js"
import { claudeSpawnEnv } from "./spawnEnv.js"
import { cliCommand } from "./cliExecutable.js"
import { DEFAULT_ACCOUNT, forgetSessionPin, poolConfigDir } from "./accounts.js"

export interface ActiveProcess {
  proc: ChildProcess
  lineEmitter: EventEmitter
  proxyServer?: ProxyMcpServer | null
  /**
   * Hash of the merged opencode MCP config the process was spawned with.
   * `null` when no MCP servers were enabled. Used to detect mid-session
   * config drift and force a respawn.
   */
  mcpHash?: string | null
  toolCatalogHash?: string
  /** Temp file holding `--append-system-prompt-file` content; unlinked on exit. */
  systemPromptFile?: string
  /** Effort the process was spawned with, so a respawn keeps it. */
  effort?: ReasoningEffort
  /**
   * Model, agent and effort the process was spawned with. A turn with other
   * settings retires the process and resumes the same conversation.
   */
  settings?: string
  /** When the child was spawned. */
  startedAt?: number
  /**
   * The binary this child was spawned with. Account failover compares it
   * against the path the current turn resolves to: a difference means the
   * conversation has moved to another account, and the process plus its
   * Claude session id have to go because a transcript cannot resume across
   * accounts. Absent on the interactive shim, which never fails over.
   */
  cliPath?: string
  cliArgs?: string[]
  /** Pool account (accounts.ts) the child is logged in as. */
  account?: string
  /**
   * stdout lines the child emitted while no turn had a line listener
   * attached (between opencode turns). Bounded; see `bufferUnattendedLine`.
   * Absent on the interactive shim, which has no unattended window.
   */
  unattendedLines?: string[]
  /** Lines evicted from `unattendedLines` because the cap was hit. */
  unattendedDropped?: number
  /**
   * opencode session this process last served, tagged by doStream each turn.
   * Session deletion matches this tag as well as the session key.
   */
  opencodeSessionID?: string
  /**
   * True from a stdin write that asks the CLI for work until its terminal
   * `result` line, whether or not a turn is still listening. Set by
   * `noteTurnStarted`, cleared by `noteTurnLine` (see `interruptTurn`).
   */
  turnInFlight?: boolean
  /**
   * The in-flight turn was interrupted (`interruptTurn`). Until its `result`,
   * whatever the CLI prints with no turn listening is that turn's tail (the
   * cut-off reply), which the user stopped: it is dropped, not replayed.
   */
  turnAbandoned?: boolean
  turnIdleWaiters?: Array<() => void>
  /**
   * Ends the turn whose listeners are attached to this child. A newer turn
   * calls it first, so an aborted turn still in its grace period never sees
   * the next turn's lines or proxy calls.
   */
  releaseTurn?: () => void
  /**
   * Tail of what the child last wrote to stderr, capped at
   * `STDERR_RETAIN_BYTES` with the newest bytes kept. Often the only record
   * of why a child died when it closed without emitting a terminal `result`
   * line; see `describeChildCrash`.
   */
  lastStderr?: string
  /** The oc session and settings of the last turn, for `requestWakeTurn`. */
  wakeTarget?: WakeTarget
  /**
   * True from a turn the CLI started on its own between oc turns (a
   * background task finished) until an oc turn attaches to it.
   */
  autonomousTurn?: boolean
  /**
   * Set once the child's stdout closed, its stdin failed, or it was killed. Such a
   * child cannot finish a turn, so no turn is handed it and LRU evicts it first.
   */
  closing?: boolean
}

export interface WakeTarget {
  sessionID: string
  directory: string
  providerID: string
  modelID: string
  agent?: string
  variant?: string
}

/**
 * Hidden prompt oc posts when the CLI starts a turn on its own. The turn that
 * carries it attaches to the running CLI turn instead of sending anything.
 */
export const WAKE_PROMPT_TEXT = "[Claude Code continued on its own after a background task finished.]"

// A child normally only speaks while a doStream turn is listening. The one
// exception is a turn that ended on the CLI's side while opencode was still
// waiting on a proxy call (Claude's MCP client gave up on the request and
// the model carried on alone). Keep what it said so the next turn can show
// it instead of losing it; cap it so a runaway child cannot grow the heap.
const UNATTENDED_LINE_CAP = 500
const UNATTENDED_BYTE_CAP = 2 * 1024 * 1024

export function bufferUnattendedLine(ap: ActiveProcess, line: string): void {
  const lines = (ap.unattendedLines ??= [])
  lines.push(line)
  let bytes = 0
  for (const kept of lines) bytes += Buffer.byteLength(kept)
  while (lines.length > 0 && (lines.length > UNATTENDED_LINE_CAP || bytes > UNATTENDED_BYTE_CAP)) {
    bytes -= Buffer.byteLength(lines.shift()!)
    ap.unattendedDropped = (ap.unattendedDropped ?? 0) + 1
  }
}

/** Hand over and clear everything the child said while nobody listened. */
export function takeUnattendedLines(ap: ActiveProcess): {
  lines: string[]
  dropped: number
} {
  const lines = ap.unattendedLines ?? []
  const dropped = ap.unattendedDropped ?? 0
  ap.unattendedLines = []
  ap.unattendedDropped = 0
  return { lines, dropped }
}

/** The CLI emits `system/init` at the start of every turn it runs. */
export function isInitLine(line: string): boolean {
  if (!line.includes('"init"')) return false
  try {
    const msg = JSON.parse(line) as { type?: string; subtype?: string }
    return msg.type === "system" && msg.subtype === "init"
  } catch {
    return false
  }
}

/**
 * The CLI began a turn with no oc turn listening (a background task finished
 * and Claude woke to report it). Post a hidden prompt so oc opens a turn that
 * attaches to it and shows it live, as Claude Code does in a terminal.
 */
function requestWakeTurn(ap: ActiveProcess) {
  const target = ap.wakeTarget
  const client = rawOpencodeClient()
  if (!target || !client) return
  ap.autonomousTurn = true
  ap.turnInFlight = true
  log.notice("claude started a turn between oc turns; waking the session", { sessionID: target.sessionID })
  void client
    .post({
      url: `/session/${target.sessionID}/prompt_async?directory=${encodeURIComponent(target.directory)}`,
      body: {
        model: { providerID: target.providerID, modelID: target.modelID },
        agent: target.agent,
        variant: target.variant,
        parts: [{ type: "text", text: WAKE_PROMPT_TEXT, synthetic: true }],
      },
    })
    .then((response) => {
      if (response.error !== undefined) log.warn("wake prompt failed", { error: String(response.error) })
    })
}

// The CLI writes its own diagnostics to stderr, which is where the reason a
// child died is usually the only thing on record. Keep the tail so a turn
// that ends with the child gone can say why; bounded, newest bytes win.
const STDERR_RETAIN_BYTES = 2 * 1024

export function retainStderr(ap: ActiveProcess, chunk: string): void {
  ap.lastStderr = ((ap.lastStderr ?? "") + chunk).slice(-STDERR_RETAIN_BYTES)
}

/**
 * One line (plus the stderr tail) explaining a child that closed its stdio
 * without emitting a terminal `result`. Before this the turn simply finished
 * with reason `stop` and empty usage, so a crashed CLI read as a short but
 * successful answer.
 */
export function describeChildCrash(
  exitCode: number | null | undefined,
  signal: NodeJS.Signals | null | undefined,
  lastStderr: string | undefined,
): string {
  const how = signal
    ? `was killed by ${signal}`
    : typeof exitCode === "number"
      ? `exited with code ${exitCode}`
      : "closed its output"
  const tail = lastStderr?.trim()
  return (
    `The Claude Code CLI ${how} before finishing this turn (no result was emitted), ` +
    "so the answer above may be incomplete." +
    (tail ? `\n\nLast stderr from the CLI:\n${tail}` : "")
  )
}

/** A completed exchange the CLI can be rewound to with `--resume-session-at`. */
export interface SessionAnchor {
  /** Last main-chain assistant message uuid of the exchange. */
  uuid: string
  /** `exchangeHash` of the exchange's position and everything it showed in opencode. */
  hash: string
}

interface ClaudeSessionRecord {
  sessionId: string
  /** Oldest first; the last entry is the newest completed exchange. */
  anchors: SessionAnchor[]
  /** Pool account the conversation lives on; absent means the default account. */
  account?: string
  movedTo?: string
  /** Copied from the chat this one was forked from; its first spawn branches with `--fork-session`. */
  forked?: boolean
}

// One active CLI process per session key. Keyed by a composite
// (cwd + opencode session-affinity) so two chats don't race.
// Iteration order is insertion order, which we refresh on access to
// make this a poor-man's LRU; see `touch()` below.
const activeProcesses = new Map<string, ActiveProcess>()
// Spawns still planning or starting for a key; see `singleFlightSpawn`.
const spawnsInFlight = new Map<string, Promise<ActiveProcess>>()
// Loaded from `SESSIONS_FILE` on first use so a restarted opencode resumes
// the same Claude conversations instead of silently starting new ones.
const claudeSessions = new Map<string, ClaudeSessionRecord>()
let claudeSessionsLoaded = false
const SESSIONS_FILE = path.join(Global.Path.data, "claude-code", "sessions.json")
const MAX_SESSION_ANCHORS = 20
/** Why a session key lost its Claude conversation; read by the next turn's confirm. */
const lostSessions = new Map<string, string>()
/** Assistant uuid the next spawn for a key rewinds to (`--resume-session-at`). */
const pendingRewinds = new Map<string, string>()
// Idle-eviction timers keyed like `activeProcesses` (idle timeout by
// @bernardofortes, absorbed from a5f723a).
const idleEvictionTimers = new Map<string, ReturnType<typeof setTimeout>>()
const MAX_IDLE_TIMEOUT_MS = 2_147_483_647

/**
 * Idle eviction is off unless `idleProcessTimeoutMs` is set: an unset option
 * resolves to 0, which arms no timer, so workers live until LRU eviction as
 * they always have. PR #36 (@broskees) proposed 30 minutes by default; that
 * was reverted at merge because it changes when a resumed chat pays for a
 * fresh `--resume` spawn, which is the user's call. An idle `claude --print`
 * holds roughly 250 MB resident, so setting it is worth documenting, not
 * imposing. The Claude session id survives eviction either way.
 */
export const DEFAULT_IDLE_PROCESS_TIMEOUT_MS = 0

/** The idle timeout a caller-facing option resolves to: unset means the default. */
export function resolveIdleProcessTimeoutMs(configured: number | undefined): number {
  return configured === undefined ? DEFAULT_IDLE_PROCESS_TIMEOUT_MS : configured
}

// Cap on live CLI subprocesses. Session-affinity-keyed entries accumulate
// one-per-chat, so an unbounded map would leak processes as users open new
// chats. This caps at a reasonable working-set and evicts the oldest idle
// one, never a process that is mid-turn. Kept at 16: PR #36 proposed 8 on
// the assumption that a default idle timer does the real work, and that
// default was not adopted, so the cap is still the only bound.
export const MAX_ACTIVE_PROCESSES = 16
const PROCESS_EXIT_TIMEOUT_MS = 1_500
const PROCESS_FORCE_EXIT_TIMEOUT_MS = 500
const STDOUT_DRAIN_GRACE_MS = 1_000
/** Same wording the attached turn's close handler uses, so one log line
 * shape covers a child that died mid-turn and one that died between turns. */
export const CHILD_EXITED_MESSAGE = "Claude CLI subprocess closed before pending tool calls were resolved"

function touch(key: string): void {
  const existing = activeProcesses.get(key)
  if (existing) {
    activeProcesses.delete(key)
    activeProcesses.set(key, existing)
  }
}

/**
 * Make room for a new child, but never by killing one that is mid-turn.
 * Insertion order is LRU, so the first idle entry is the oldest safe victim.
 * Evicting an in-flight process truncates that turn silently: its readline
 * closes, the close handler finishes the stream, and the operator sees a
 * half-written answer with no error. When every process is busy we exceed the
 * cap for now rather than kill live work; the next spawn tries again.
 */
export function evictIfNeeded(): void {
  while (activeProcesses.size >= MAX_ACTIVE_PROCESSES) {
    let victimKey: string | undefined
    for (const [key, ap] of activeProcesses) {
      if (ap.closing || !isTurnInFlight(ap)) {
        victimKey = key
        break
      }
    }
    if (!victimKey) {
      log.warn("every claude process is mid-turn; skipping LRU eviction", {
        active: activeProcesses.size,
        cap: MAX_ACTIVE_PROCESSES,
      })
      return
    }
    log.info("evicting LRU claude process", { sessionKey: victimKey })
    deleteActiveProcess(victimKey)
  }
}

// Turn lifecycle and interrupt (from @broskees' 68ed142, adapted).
//
// The Claude CLI runs one turn per process. Closing the opencode-side stream
// tells it nothing: before this, an abort only detached our listeners and the
// CLI ran the abandoned turn to completion (Joseph Roberts measured ~7,500
// extra characters generated after abort on a haiku probe), kept billing, kept
// running tools, and its late output landed in whatever turn came next, whose
// own stream was then closed early by the stale `result`. The CLI answers a
// stream-json `control_request` of subtype `interrupt` by aborting the turn
// and emitting a terminal `result`, normally within milliseconds.

const TURN_INTERRUPT_TIMEOUT_MS = 5_000

/** Cheap pre-filter before JSON.parse, since every CLI stdout line hits this. */
function isTerminalResultLine(line: string): boolean {
  if (!line.includes('"result"')) return false
  try {
    return (JSON.parse(line) as { type?: string }).type === "result"
  } catch {
    return false
  }
}

function settleTurn(ap: ActiveProcess): void {
  ap.turnInFlight = false
  ap.turnAbandoned = false
  const waiters = ap.turnIdleWaiters ?? []
  ap.turnIdleWaiters = []
  for (const wake of waiters) wake()
}

/** Call immediately before any stdin write that asks the CLI to do work. */
export function noteTurnStarted(ap: ActiveProcess): void {
  ap.turnInFlight = true
}

/**
 * Feed every CLI stdout line here, independent of whichever turn currently
 * owns the stream: a `result` that lands after its turn detached (the abort
 * case) must still mark the CLI idle rather than leak into the next turn.
 */
export function noteTurnLine(ap: ActiveProcess, line: string): void {
  if (!ap.turnInFlight) return
  if (isTerminalResultLine(line)) settleTurn(ap)
}

export function isTurnInFlight(ap: ActiveProcess): boolean {
  return ap.turnInFlight === true
}

/** Resolves true once the CLI is idle, false if it stayed busy past the timeout. */
export function awaitTurnIdle(ap: ActiveProcess, timeoutMs: number): Promise<boolean> {
  if (!ap.turnInFlight) return Promise.resolve(true)
  return new Promise((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      const waiters = ap.turnIdleWaiters ?? []
      const at = waiters.indexOf(wake)
      if (at >= 0) waiters.splice(at, 1)
      resolve(false)
    }, timeoutMs)
    ;(ap.turnIdleWaiters ??= []).push(wake)
  })
}

/** Ask the CLI to abandon the in-flight turn, and wait for it to say it did. */
export function interruptTurn(ap: ActiveProcess, timeoutMs = TURN_INTERRUPT_TIMEOUT_MS): Promise<boolean> {
  if (!ap.turnInFlight) return Promise.resolve(true)
  const stdin = ap.proc.stdin
  if (!stdin || !stdin.writable) {
    log.notice("cannot interrupt this process; waiting for the turn to end")
    return awaitTurnIdle(ap, timeoutMs)
  }
  try {
    stdin.write(
      JSON.stringify({
        type: "control_request",
        request_id: randomUUID(),
        request: { subtype: "interrupt" },
      }) + "\n",
    )
  } catch (error) {
    log.warn("failed to write interrupt control request", {
      error: error instanceof Error ? error.message : String(error),
    })
    return Promise.resolve(false)
  }
  ap.turnAbandoned = true
  return awaitTurnIdle(ap, timeoutMs)
}

function cancelIdleProcessEviction(key: string): void {
  const timer = idleEvictionTimers.get(key)
  if (!timer) return
  clearTimeout(timer)
  idleEvictionTimers.delete(key)
}

/**
 * A child a turn may still use: not closing, killed, or exited, and with stdin
 * open. A turn given a dying child writes into a closed stdin and then waits out
 * the start watchdog.
 */
function isLiveProcess(ap: ActiveProcess): boolean {
  if (ap.closing || ap.proc.killed) return false
  if (typeof ap.proc.exitCode === "number" || typeof ap.proc.signalCode === "string") return false
  return ap.proc.stdin?.writable !== false
}

/** Whether a live process owns `key`, without refreshing LRU order or idle timers. */
export function hasActiveProcess(key: string): boolean {
  const ap = activeProcesses.get(key)
  return ap !== undefined && isLiveProcess(ap)
}

export function getActiveProcess(key: string): ActiveProcess | undefined {
  const ap = activeProcesses.get(key)
  if (!ap || !isLiveProcess(ap)) return undefined
  cancelIdleProcessEviction(key)
  touch(key)
  return ap
}

export function setActiveProcess(key: string, ap: ActiveProcess): void {
  cancelIdleProcessEviction(key)
  activeProcesses.set(key, ap)
}

/**
 * Evict a headless Claude worker after a completed turn has stayed idle.
 * Armed by the turn's `completeResult`, so the clock starts when a turn
 * finishes, not when the child was spawned. Reusing the worker through
 * `getActiveProcess` cancels the timer. The Claude session id is
 * intentionally retained so the next turn can continue the same conversation
 * via `--resume`. A process found mid-turn when the timer fires (a recovered
 * continuation, an auto-continue, a late tool result) is not evicted; the
 * timer is re-armed instead, the same rule the LRU cap follows.
 */
export function scheduleIdleProcessEviction(key: string, timeoutMs: number | undefined): void {
  cancelIdleProcessEviction(key)
  if (
    typeof timeoutMs !== "number" ||
    !Number.isFinite(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > MAX_IDLE_TIMEOUT_MS
  ) {
    return
  }

  const scheduledProcess = activeProcesses.get(key)
  if (!scheduledProcess) return

  const timer = setTimeout(() => {
    idleEvictionTimers.delete(key)
    if (activeProcesses.get(key) !== scheduledProcess) return
    if (isTurnInFlight(scheduledProcess)) {
      log.info("idle timer found a turn in flight; re-arming", { sessionKey: key, timeoutMs })
      scheduleIdleProcessEviction(key, timeoutMs)
      return
    }
    log.info("evicting idle claude process", { sessionKey: key, timeoutMs })
    deleteActiveProcess(key)
  }, timeoutMs)
  timer.unref()
  idleEvictionTimers.set(key, timer)
}

/** Whether an idle-eviction timer is armed for the key (read-only, for tests). */
export function isIdleProcessEvictionScheduled(key: string): boolean {
  return idleEvictionTimers.has(key)
}

function detachActiveProcess(key: string): ActiveProcess | undefined {
  cancelIdleProcessEviction(key)
  const ap = activeProcesses.get(key)
  if (!ap) return undefined
  activeProcesses.delete(key)
  ap.closing = true
  if (ap.proxyServer) {
    void ap.proxyServer.close()
    // The server's close already answered every open HTTP request with an
    // error; the broker's entries for them can never be resolved to anyone
    // now, and a `task` call has no deadline that would otherwise reap them.
    rejectAllPendingProxyCallsForSession(key, new Error(SERVER_CLOSED_MESSAGE))
  }
  return ap
}

/**
 * Release everything this plugin holds for one opencode session that was
 * deleted: its live `claude` children (any model or effort), the remembered
 * Claude session ids, and per-session state. Unlike idle eviction this is a real deletion, so nothing is kept for a resume.
 * The `"default"` affinity is the shared bucket used when no session id is
 * known and is deliberately never matched. Returns the released keys.
 */
export function deleteActiveProcessesForSession(sessionID: string): string[] {
  if (!sessionID || sessionID === "default") return []
  const released: string[] = []
  for (const [key, ap] of [...activeProcesses]) {
    const owned = ap.opencodeSessionID === sessionID || describeSessionKey(key).session === sessionID
    if (!owned) continue
    log.info("releasing claude process for deleted session", { sessionKey: key, sessionID })
    void deleteActiveProcessAndWait(key)
    released.push(key)
  }
  // Session ids and per-session state can outlive their process (idle
  // eviction keeps them for `--resume`); a deleted session never resumes.
  forgetSessionPin(sessionID)
  for (const key of [...loadedSessions().keys()]) {
    if (describeSessionKey(key).session !== sessionID) continue
    deleteClaudeSessionId(key)
    lostSessions.delete(key)
    if (!released.includes(key)) released.push(key)
  }
  return released
}

/** Called by the server only after the oc turn ends, before moving its cwd. */
export async function prepareSessionDirectoryMove(sessionID: string, directory: string): Promise<void> {
  const keys = [...activeProcesses].filter(
    ([key, process]) => process.opencodeSessionID === sessionID || describeSessionKey(key).session === sessionID,
  )
  if (keys.some(([, process]) => isTurnInFlight(process)))
    throw new Error("Claude Code is still running in this session")
  for (const [key] of keys) {
    if (!(await deleteActiveProcessAndWait(key)))
      throw new Error("Claude Code did not release the old working directory")
  }
  for (const [key, record] of loadedSessions()) {
    if (describeSessionKey(key).session === sessionID) record.movedTo = directory
  }
  persistSessions()
}

/**
 * Give a forked oc session copies of its origin's Claude conversations. Each copy
 * resumes the origin's transcript once with `--fork-session`, so the two chats branch
 * and the origin keeps its own; the CLI's new id then replaces the copy's (see
 * `setClaudeSessionId`). A fork from an earlier message rewinds in `sessionSync.ts`.
 */
export function forkClaudeSessions(fromSessionID: string, toSessionID: string): void {
  const sessions = loadedSessions()
  const copies = [...sessions].filter(
    ([key, record]) => describeSessionKey(key).session === fromSessionID && !record.movedTo,
  )
  if (!copies.length) return
  for (const [key, record] of copies) {
    const parts = key.split("::")
    parts[2] = toSessionID
    sessions.set(parts.join("::"), {
      sessionId: record.sessionId,
      anchors: [...record.anchors],
      account: record.account,
      forked: true,
    })
  }
  capClaudeSessions()
  persistSessions()
}

export function isPendingFork(key: string): boolean {
  return loadedSessions().get(key)?.forked === true
}

/** Consume a durable intentional-move marker; unrelated conversation loss still asks. */
export function takeSessionDirectoryMove(sessionID: string, directory: string): boolean {
  const keys = [...loadedSessions()]
    .filter(([key, record]) => describeSessionKey(key).session === sessionID && record.movedTo === directory)
    .map(([key]) => key)
  if (!keys.length) return false
  for (const key of keys) deleteClaudeSessionId(key)
  return true
}

/**
 * Synchronous best-effort sweep for host process exit. Node does not kill
 * children on exit, so without this a hard opencode shutdown reparents every
 * live `claude` to init. Must stay sync: `process.on("exit")` runs no async
 * work. Session ids are left alone; the process is going away with them.
 */
export function killAllActiveProcesses(): string[] {
  const keys = [...activeProcesses.keys()]
  for (const key of keys) deleteActiveProcess(key)
  return keys
}

let processExitCleanupWired = false

/**
 * Arm `killAllActiveProcesses` for host process exit, once per process. The
 * plugin entry can run more than once (tests, account expansion), and each
 * run must not add another `exit` listener. Returns whether this call armed it.
 */
export function ensureProcessExitCleanup(): boolean {
  if (processExitCleanupWired) return false
  processExitCleanupWired = true
  process.once("exit", () => {
    killAllActiveProcesses()
  })
  return true
}

export function deleteActiveProcess(key: string): void {
  const ap = detachActiveProcess(key)
  ap?.proc.kill()
}

function hasProcessExited(proc: ChildProcess): boolean {
  return proc.exitCode !== null || proc.signalCode !== null
}

function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasProcessExited(proc)) return Promise.resolve(true)

  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      proc.off("exit", onExit)
      resolve(hasProcessExited(proc))
    }, timeoutMs)
    proc.once("exit", onExit)
  })
}

type StopOptions = {
  exitTimeoutMs?: number
  forceExitTimeoutMs?: number
  forceKill?: boolean
}

/** Kill a child and wait for it to exit: graceful first, then SIGKILL. False if it never exits. */
async function stopChildProcess(proc: ChildProcess, options: StopOptions = {}): Promise<boolean> {
  if (hasProcessExited(proc)) return true
  const gracefulExit = waitForProcessExit(proc, options.exitTimeoutMs ?? PROCESS_EXIT_TIMEOUT_MS)
  if (!options.forceKill) proc.kill()
  if (await gracefulExit) return true

  const forcedExit = waitForProcessExit(proc, options.forceExitTimeoutMs ?? PROCESS_FORCE_EXIT_TIMEOUT_MS)
  proc.kill("SIGKILL")
  return forcedExit
}

export async function deleteActiveProcessAndWait(key: string, options: StopOptions = {}): Promise<boolean> {
  const ap = activeProcesses.get(key)
  // Queued stdin work must die before closing the proxy can release a tool boundary.
  if (options.forceKill) ap?.proc.kill("SIGKILL")
  detachActiveProcess(key)
  if (!ap || (await stopChildProcess(ap.proc, options))) return true

  log.warn("claude process did not exit; its conversation is lost", {
    sessionKey: key,
  })
  markClaudeSessionLost(key, "the Claude process did not exit when asked to")
  return false
}

export function getClaudeSessionId(key: string): string | undefined {
  const record = loadedSessions().get(key)
  return record?.movedTo ? undefined : record?.sessionId
}

function loadedSessions(): Map<string, ClaudeSessionRecord> {
  if (claudeSessionsLoaded) return claudeSessions
  claudeSessionsLoaded = true
  const text = readSessionsFile()
  if (!text) return claudeSessions
  const parsed = parseSessionsFile(text)
  if (!parsed) {
    log.warn("ignoring unreadable claude sessions file", { file: SESSIONS_FILE })
    return claudeSessions
  }
  for (const [key, record] of parsed) claudeSessions.set(key, record)
  return claudeSessions
}

function readSessionsFile(): string | undefined {
  try {
    return readFileSync(SESSIONS_FILE, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      log.warn("cannot read claude sessions file", { file: SESSIONS_FILE, error: String(error) })
    }
    return undefined
  }
}

function parseSessionsFile(text: string): [string, ClaudeSessionRecord][] | undefined {
  try {
    const data = JSON.parse(text) as unknown
    if (!data || typeof data !== "object") return undefined
    return Object.entries(data).flatMap(([key, value]): [string, ClaudeSessionRecord][] => {
      const record = value as Partial<ClaudeSessionRecord> | null
      if (typeof record?.sessionId !== "string") return []
      const anchors = Array.isArray(record.anchors)
        ? record.anchors.filter((a) => typeof a?.uuid === "string" && typeof a?.hash === "string")
        : []
      const account = typeof record.account === "string" ? record.account : undefined
      const movedTo = typeof record.movedTo === "string" ? record.movedTo : undefined
      const forked = record.forked === true ? true : undefined
      return [[key, { sessionId: record.sessionId, anchors, account, movedTo, forked }]]
    })
  } catch {
    return undefined
  }
}

/** Written on every change; small, since it is capped at `MAX_CLAUDE_SESSION_ENTRIES`. */
function persistSessions(): void {
  try {
    mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true })
    writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(claudeSessions)), {
      encoding: "utf8",
      mode: 0o600,
    })
  } catch (error) {
    log.warn("cannot write claude sessions file", { file: SESSIONS_FILE, error: String(error) })
  }
}

/**
 * A Claude session id outlives its process on purpose, so nothing in the
 * ordinary lifecycle ever removes one: under a long-lived `opencode serve`
 * that hops projects and models this map only grows. The cap is generous
 * because the cost of getting
 * it wrong is a conversation that silently restarts.
 */
export const MAX_CLAUDE_SESSION_ENTRIES = 64

/**
 * A key with a live process or a proxied call still in the air
 * is doing work that the id is part of; dropping it would
 * strand that work on a session the next turn no longer resumes. Read from
 * the map directly rather than through `getActiveProcess`: that one refreshes
 * LRU order and cancels idle timers, which a scan must not do.
 */
function claudeSessionIsBusy(key: string): boolean {
  if (activeProcesses.has(key)) return true
  return getPendingProxyCalls(key).length > 0
}

/**
 * Shed the least recently used idle sessions. When every key is busy this
 * evicts nothing and the map runs over the cap for a while, the same rule
 * `evictIfNeeded` follows: exceeding a cap briefly is cheaper than cutting a
 * conversation that is still running.
 */
function capClaudeSessions(): void {
  for (const key of [...claudeSessions.keys()]) {
    if (claudeSessions.size <= MAX_CLAUDE_SESSION_ENTRIES) return
    if (claudeSessionIsBusy(key)) continue
    log.info("claude session cap reached; releasing an idle session", {
      sessionKey: key,
      size: claudeSessions.size,
      cap: MAX_CLAUDE_SESSION_ENTRIES,
    })
    markClaudeSessionLost(key, "too many Claude conversations were remembered, so the oldest idle one was released")
  }
}

export function setClaudeSessionId(key: string, sessionId: string, account?: string): void {
  const sessions = loadedSessions()
  const existing = sessions.get(key)
  // Re-inserting moves the key to the back, so the cap sheds the conversation
  // that has been quiet longest rather than the one that started first. A
  // forked id keeps its anchors: `--fork-session` preserves message uuids.
  sessions.delete(key)
  sessions.set(key, { sessionId, anchors: existing?.anchors ?? [], account: account ?? existing?.account })
  capClaudeSessions()
  if (existing?.sessionId !== sessionId || (account && existing?.account !== account)) persistSessions()
}

/**
 * Retire the key's process and conversation when they belong to a pool
 * account other than `account`: a transcript cannot resume across accounts.
 * True when a conversation was dropped, which the caller replaces with the
 * catch-up envelope instead of asking (sessionSync.ts).
 */
export async function retireOtherAccount(key: string, account: string): Promise<boolean> {
  const ap = activeProcesses.get(key)
  if (ap && (ap.account ?? DEFAULT_ACCOUNT) !== account) await deleteActiveProcessAndWait(key)
  const record = loadedSessions().get(key)
  if (!record || (record.account ?? DEFAULT_ACCOUNT) === account) return false
  deleteClaudeSessionId(key)
  lostSessions.delete(key)
  return true
}

export function deleteClaudeSessionId(key: string): void {
  const sessions = loadedSessions()
  const record = sessions.get(key)
  if (!record) return
  sessions.delete(key)
  pendingRewinds.delete(key)
  persistSessions()
}

/**
 * Drop a conversation that ended without anyone asking for it (crash,
 * missing transcript, cap). The next turn for the key asks the operator
 * before it starts a fresh one; see `sessionSync.ts`.
 */
export function markClaudeSessionLost(key: string, reason: string): void {
  deleteClaudeSessionId(key)
  // Re-inserting moves the key to the back, so the cap drops the oldest loss.
  lostSessions.delete(key)
  lostSessions.set(key, reason)
  if (lostSessions.size > MAX_CLAUDE_SESSION_ENTRIES) lostSessions.delete(lostSessions.keys().next().value!)
}

/** Why the key's conversation was lost, once; undefined when it was not. */
export function takeClaudeSessionLoss(key: string): string | undefined {
  const reason = lostSessions.get(key)
  lostSessions.delete(key)
  return reason
}

export function getSessionAnchors(key: string): readonly SessionAnchor[] {
  return loadedSessions().get(key)?.anchors ?? []
}

export function recordSessionAnchor(key: string, anchor: SessionAnchor): void {
  const record = loadedSessions().get(key)
  if (!record) return
  record.anchors = [...record.anchors, anchor].slice(-MAX_SESSION_ANCHORS)
  persistSessions()
}

export function clearSessionAnchors(key: string): void {
  const record = loadedSessions().get(key)
  if (!record?.anchors.length) return
  record.anchors = []
  persistSessions()
}

/**
 * Rewind the key's next spawn to `anchor` and forget the exchanges after
 * it. The caller must retire the live process first; only a spawn reads it.
 */
export function rewindClaudeSession(key: string, anchor: SessionAnchor): void {
  const record = loadedSessions().get(key)
  if (!record) return
  const at = record.anchors.findIndex((a) => a.uuid === anchor.uuid)
  if (at >= 0) record.anchors = record.anchors.slice(0, at + 1)
  pendingRewinds.set(key, anchor.uuid)
  persistSessions()
}

export function takePendingRewind(key: string): string | undefined {
  const uuid = pendingRewinds.get(key)
  pendingRewinds.delete(key)
  return uuid
}

/**
 * Run `start` for `key` unless one is already in flight, and share its result.
 * Turn setups that race past the same check then get one child, not two; a
 * failed start clears its entry so the next turn tries again.
 */
export function singleFlightSpawn(key: string, start: () => Promise<ActiveProcess>): Promise<ActiveProcess> {
  const inFlight = spawnsInFlight.get(key)
  if (inFlight) return inFlight
  const spawning = start().finally(() => spawnsInFlight.delete(key))
  spawnsInFlight.set(key, spawning)
  return spawning
}

export function spawnClaudeProcess(
  cliPath: string,
  cliArgs: string[],
  cwd: string,
  sessionKey: string,
  proxyServer?: ProxyMcpServer | null,
  mcpHash?: string | null,
  systemPromptFile?: string,
  ignoreAnthropicApiKey?: boolean,
  effort?: ReasoningEffort,
  account?: string,
): ActiveProcess {
  evictIfNeeded()
  log.info("spawning new claude process", {
    cliPath,
    cliArgs,
    cwd,
    sessionKey,
    effort,
    account,
  })

  const command = cliCommand(cliPath, cliArgs)
  const proc = launch(command.command, command.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: claudeSpawnEnv({ ignoreAnthropicApiKey, effort, configDir: account && poolConfigDir(account) }),
    windowsHide: true,
  })

  const lineEmitter = new EventEmitter()

  const ap: ActiveProcess = {
    proc,
    lineEmitter,
    proxyServer: proxyServer ?? null,
    mcpHash,
    systemPromptFile,
    effort,
    startedAt: Date.now(),
    cliPath,
    cliArgs: [...cliArgs],
    account,
    unattendedLines: [],
    unattendedDropped: 0,
  }

  const rl = createInterface({ input: proc.stdout! })
  rl.on("line", (line: string) => {
    // Read before `noteTurnLine`, which clears it on the abandoned turn's own `result`.
    const abandoned = ap.turnAbandoned === true
    noteTurnLine(ap, line)
    if (lineEmitter.listenerCount("line") === 0) {
      if (abandoned) return
      bufferUnattendedLine(ap, line)
      if (!ap.autonomousTurn && isInitLine(line)) requestWakeTurn(ap)
      return
    }
    lineEmitter.emit("line", line)
  })
  rl.on("close", () => {
    // Readline closes on stdout end, which can come well before `exit`.
    ap.closing = true
    settleTurn(ap)
    lineEmitter.emit("close")
  })
  // A dead child still in the map would be overwritten untracked, so kill it first.
  const stale = activeProcesses.get(sessionKey)
  if (stale && !isLiveProcess(stale)) deleteActiveProcess(sessionKey)
  cancelIdleProcessEviction(sessionKey)
  activeProcesses.set(sessionKey, ap)

  // Baseline 'error' listener so Node doesn't throw when the process emits
  // an error between stream turns (no per-stream listener attached then).
  proc.on("error", (err) => {
    log.error("claude process error", { sessionKey, error: err.message })
    // A child that never started emits no `exit`, so release its entry here.
    if (proc.pid === undefined && activeProcesses.get(sessionKey) === ap) detachActiveProcess(sessionKey)
  })

  // Same baseline for the child's stdin, which is a separate emitter. Every
  // write that asks the CLI for work (fresh envelope, auto-continue, the
  // watchdog re-send, the interrupt request) can land after the child died,
  // and an unhandled 'error' on a stream throws inside opencode's own
  // process. Ending the turn is not this handler's job: the child is gone,
  // so its readline 'close' follows and the turn's close handler reports it
  // (see `describeChildCrash`). Releasing `turnInFlight` is, since no
  // terminal `result` is ever coming for a write that never arrived.
  proc.stdin?.on("error", (err: NodeJS.ErrnoException) => {
    log.warn("claude process stdin error", {
      sessionKey,
      code: err.code,
      error: err.message,
    })
    ap.closing = true
    settleTurn(ap)
  })

  proc.on("exit", (code, signal) => {
    log.info("claude process exited", { code, signal, sessionKey })
    // Exit can come before the last stdout lines are read, so readline closes once they drain.
    // The timer covers a grandchild that keeps the pipe open and stops stdout from ever ending.
    const drainGrace = setTimeout(() => rl.close(), STDOUT_DRAIN_GRACE_MS)
    drainGrace.unref()
    rl.once("close", () => clearTimeout(drainGrace))
    void proxyServer?.close()
    if (systemPromptFile) {
      void unlink(systemPromptFile).catch(() => {})
    }
    const ownsSessionKey = activeProcesses.get(sessionKey) === ap
    if (ownsSessionKey) {
      cancelIdleProcessEviction(sessionKey)
      activeProcesses.delete(sessionKey)
      // The child is the only thing that could still consume these calls'
      // results. A turn that is attached rejects them from its own close
      // handler; this covers a child that dies between turns, which no
      // deadline would otherwise reap now that `task` has none.
      if (getPendingProxyCalls(sessionKey).length > 0) {
        rejectAllPendingProxyCallsForSession(sessionKey, new Error(CHILD_EXITED_MESSAGE))
      }
    }
    if (ownsSessionKey && code !== 0 && code !== null) {
      log.info("process exited with error, clearing session", {
        code,
        sessionKey,
      })
      markClaudeSessionLost(sessionKey, `the Claude process exited with code ${code}`)
    }
  })

  proc.stderr?.on("data", (data: Buffer) => {
    const stderr = data.toString()
    log.debug("stderr", { data: stderr.slice(0, 200) })
    retainStderr(ap, stderr)

    // "No conversation found with session ID: <uuid>" is what `--resume`
    // prints for a purged transcript - note the lowercase "session ID",
    // which the capitalized match below does not catch.
    if (
      stderr.includes("No conversation found") ||
      (stderr.includes("Session ID") &&
        (stderr.includes("already in use") || stderr.includes("not found") || stderr.includes("invalid")))
    ) {
      if (activeProcesses.get(sessionKey) === ap) {
        log.warn("claude session ID error, clearing session", {
          sessionKey,
          error: stderr.slice(0, 200),
        })
        markClaudeSessionLost(sessionKey, "Claude Code could not find or open this chat's transcript")
      } else {
        log.debug("ignoring session ID error from stale claude process", {
          sessionKey,
        })
      }
    }
  })

  return ap
}

/**
 * Append `--resume <id>` to an already-built args vector when a Claude
 * conversation id is known for the session and the args don't already carry
 * a session flag. Used by `respawnActiveProcess` to resume the conversation
 * in a fresh child without rebuilding the whole (version-gated) args vector.
 * `--resume`, not `--session-id`: the latter means "create a NEW session
 * with this UUID" and the CLI rejects it with "Session ID ... is already in
 * use" whenever a transcript exists on disk - which is exactly the state a
 * mid-conversation respawn is in. If the wedged child died before writing
 * any transcript, `--resume` fails with "No conversation found with session
 * ID", which the stderr recovery matcher already catches (marks the
 * conversation lost, so the next turn asks before starting fresh).
 */
export function appendResumeIfNeeded(sessionKey: string, cliArgs: string[]): string[] {
  if (cliArgs.includes("--resume") || cliArgs.includes("--session-id")) {
    return cliArgs
  }
  const sid = getClaudeSessionId(sessionKey)
  if (!sid) return cliArgs
  return [...cliArgs, "--resume", sid, ...(isPendingFork(sessionKey) ? ["--fork-session"] : [])]
}

/**
 * Replace a wedged reused process with a fresh one, resuming the same
 * Claude conversation. Used by the doStream start-watchdog when a reused
 * process produces no stdout within a grace window after a fresh-turn
 * envelope write - observed after a very long proxy-blocked tool call
 * (e.g. a multi-minute `task` subagent). Before the per-tool proxy timeout
 * fix this was masked because the flat 10-minute ceiling ended the turn
 * first; now that the task proxy blocks and returns successfully, resuming
 * a reused child after such a long wait can leave it silent on stdout.
 *
 * Reuses the existing proxy server, system-prompt file, and MCP hash (their
 * handles are already baked into `cliArgs`' `--mcp-config`/append-prompt
 * paths), so this only swaps the child process. The old child's exit
 * handler is silenced before kill so it doesn't close the proxy server we
 * are reusing; the new child gets its own exit handler from
 * `spawnClaudeProcess`. `claudeSessions` is left intact so the respawn can
 * add `--resume` (see `appendResumeIfNeeded`).
 *
 * The respawn happens in the middle of the same logical turn, and the caller
 * re-sends that turn's envelope at once. Turn state lives on the
 * `ActiveProcess`, so the replacement inherits the old process's in-flight
 * marker (@broskees' b719497); without that handoff abort, LRU eviction, the
 * idle timer and the next turn's quiesce all mistake the busy replacement
 * for an idle process.
 *
 * Resolves the new `ActiveProcess`, or `undefined` if there was no active
 * process for the key (caller should treat that as "nothing to respawn") or
 * the old child did not exit.
 */
export async function respawnActiveProcess(
  sessionKey: string,
  cliPath: string,
  cliArgs: string[],
  cwd: string,
  ignoreAnthropicApiKey?: boolean,
): Promise<ActiveProcess | undefined> {
  const old = activeProcesses.get(sessionKey)
  if (!old) return undefined
  const turnWasInFlight = isTurnInFlight(old)
  activeProcesses.delete(sessionKey)
  old.closing = true
  // Silence the old exit handler so it doesn't close the proxy server,
  // unlink the system-prompt file, or touch claudeSessions on its way out
  // - those handles are reused by the new child. spawnClaudeProcess wires
  // a fresh exit handler for the respawned child.
  old.proc.removeAllListeners("exit")
  // The replacement resumes the transcript the old child may still hold open.
  if (!(await stopChildProcess(old.proc))) {
    log.warn("claude process did not exit before respawn; its conversation is lost", { sessionKey })
    markClaudeSessionLost(sessionKey, "the Claude process did not exit when asked to")
    return undefined
  }
  const replacement = spawnClaudeProcess(
    cliPath,
    appendResumeIfNeeded(sessionKey, old.cliArgs ?? cliArgs),
    cwd,
    sessionKey,
    old.proxyServer,
    old.mcpHash,
    old.systemPromptFile,
    ignoreAnthropicApiKey,
    old.effort,
    old.account,
  )
  if (turnWasInFlight) noteTurnStarted(replacement)
  replacement.toolCatalogHash = old.toolCatalogHash
  replacement.settings = old.settings
  replacement.opencodeSessionID = old.opencodeSessionID
  replacement.wakeTarget = old.wakeTarget
  replacement.autonomousTurn = old.autonomousTurn
  return replacement
}

/** Build a session key: the cwd, then what identifies the conversation in it. */
export function sessionKey(cwd: string, conversation: string): string {
  return `${cwd}::${conversation}`
}

/**
 * Pull the readable parts back out of a session key for the doctor report.
 * The conversation key is `<cwd>::<scope>::<affinity>::context=[...]`.
 */
export function describeSessionKey(key: string): { cwd: string; session: string } {
  const parts = key.split("::")
  return { cwd: parts[0] ?? "unknown", session: parts[2] ?? "unknown" }
}
