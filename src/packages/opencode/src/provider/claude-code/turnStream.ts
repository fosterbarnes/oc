/**
 * One opencode turn served by a `claude` process: spawn or reuse the child,
 * write the user envelope, translate its stream-json lines into AI SDK stream
 * parts, run proxied tool calls in-stream, and end the turn exactly once.
 *
 * Every exit path (result, denial, close, process error, abort, cancel,
 * watchdog) funnels through `cleanup`, so a reused process never accumulates
 * listeners across turns.
 */
import type { ChildProcess } from "node:child_process"
import type { EventEmitter } from "node:events"
import { unlink } from "node:fs/promises"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { generateId } from "ai"
import type { ClaudeCodeConfig, ClaudeStreamMessage } from "./types.js"
import type { TurnContext } from "./turnContext.js"
import type { RuntimeMcpStatus } from "./mcpBridge.js"
import type { CliVersion } from "./cliVersion.js"
import { mapTool, isWebSearchTool, isWebSearchHandledByCli } from "./toolMapping.js"
import { StreamWriter } from "./streamWriter.js"
import { isTodoMirror, TodoMirror } from "./todoMirror.js"
import { Steering } from "./steering.js"
import {
  accountBlockKind,
  describeResultFailure,
  formatAccountBlockNote,
  formatResultFailureNote,
  formatSilentTurnNote,
  formatStreamTimeoutNote,
  isAccountLimitError,
  isRateLimitRejected,
  parseCompactBoundary,
  parseRateLimitEvent,
  reportCompactBoundary,
  reportConversationReset,
  reportRateLimitEvent,
  resetsAtToMs,
  reportSystemInit,
  toQuotaWindows,
  type AccountBlockKind,
} from "./cliEvents.js"
import {
  BASE_PROVIDER_ID,
  canonicalAccountId,
  earliestLimitedUntil,
  failoverAccount,
  markAccountLimited,
  poolAccountIds,
  poolAccountLabel,
  poolConfigDir,
} from "./accounts.js"
import { extractTurnStats, formatTurnStatsBlock, turnStatsLogPayload } from "./turnStats.js"
import {
  getActiveProcess,
  spawnClaudeProcess,
  setClaudeSessionId,
  getClaudeSessionId,
  deleteClaudeSessionId,
  markClaudeSessionLost,
  recordSessionAnchor,
  clearSessionAnchors,
  deleteActiveProcess,
  deleteActiveProcessAndWait,
  respawnActiveProcess,
  resolveIdleProcessTimeoutMs,
  singleFlightSpawn,
  scheduleIdleProcessEviction,
  noteTurnStarted,
  isTurnInFlight,
  interruptTurn,
  takeUnattendedLines,
  describeChildCrash,
  isInitLine,
  type ActiveProcess,
} from "./sessionManager.js"
import { appendExchangeText, currentExchangeHash } from "./sessionSync.js"
import { reportUsageObservation } from "@/provider/usage-observations.js"
import { ScheduledResume } from "@/session/scheduledResume.js"
import { log } from "./logger.js"
import { claudeSteerSinks, hostToolExecutors, type HostToolExecutor, type HostToolResult } from "./shared.js"
import { PROXY_TOOL_PREFIX, proxyToolResult, type ProxyToolResult } from "./proxyMcp.js"
import {
  TASK_BATCH_TOOL_NAME,
  taskBatchTasks,
  taskBatchChildToolCallId,
  formatTaskBatchResults,
  type ProxyToolDef,
} from "./proxyToolDefs.js"
import {
  getPendingProxyCalls,
  onPendingProxyCall,
  rejectAllPendingProxyCallsForSession,
  rejectPendingProxyCallById,
  resolvePendingProxyCallById,
  type PendingProxyCall,
} from "./proxyBroker.js"
import {
  autoContinueEnabledFor,
  continuationSignature,
  isSilentTurn,
  makeAutoContinueMessage,
  shouldAutoContinueIncompleteTurn,
  type AutoContinueState,
} from "./autoContinue.js"
import { formatAskUserQuestion, isAskUserQuestionTool } from "./askUserQuestion.js"
import { handleControlRequest } from "./controlRequest.js"
import { effectiveMcpConfig, planSpawn, type LiveToolInfo } from "./spawnPlanning.js"
import { claudePromptTokens, contextUsage, toFinishReason, toUsage } from "./usage.js"

export interface TurnInput {
  config: ClaudeCodeConfig
  turn: TurnContext
  options: LanguageModelV3CallOptions
  userMsg: string
  /** The newest message is oc's wake prompt (`isWakeTurn`). */
  wake: boolean
  /** Pool account (accounts.ts) this turn starts on. */
  account: string
  /** This turn's message for a fresh conversation on another account, given the work done so far. */
  catchUpMessage: (progress: string) => string
  visibleTokens: number
  /** Proxy calls pending from the previous turn, read before `userMsg` was built. */
  previousPendingProxyCalls: PendingProxyCall[]
  catalogHash: string
  runtimeStatus: RuntimeMcpStatus | undefined
  cliVersion: CliVersion | null
  proxyTools: ProxyToolDef[] | null
  loadLiveToolInfo: () => Promise<LiveToolInfo>
  /** Session sync outcome (rewind, fresh conversation) to show first. */
  notice?: string
}

export function streamClaudeTurn(input: TurnInput) {
  let turn: ClaudeTurn | undefined
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      turn = new ClaudeTurn(input, new StreamWriter(controller))
      turn.start()
    },
    cancel() {
      turn?.cancel()
    },
  })
}

/**
 * Stream delta types handled explicitly. `signature_delta` carries encrypted
 * thinking-block signatures that are opaque to clients, so it is known and
 * ignored.
 */
const KNOWN_DELTA_TYPES = new Set(["thinking_delta", "text_delta", "input_json_delta", "signature_delta"])

// How long a turn that lost its child waits for that child's exit status
// before reporting the crash without one.
const CHILD_EXIT_STATUS_GRACE_MS = 250
// Abort grace period: short, since the operator already asked to stop.
const ABORT_GRACE_MS = 5_000
// Backstop for a denied proxy call whose result Claude never echoes.
const DENIAL_BACKSTOP_MS = 1_000

type CallUsage = ClaudeStreamMessage["usage"]

class ClaudeTurn {
  private readonly config: ClaudeCodeConfig
  private readonly turn: TurnContext
  private readonly sk: string
  private readonly options: LanguageModelV3CallOptions
  private readonly todos: TodoMirror
  private readonly steering: Steering

  private activeProcess: ActiveProcess | undefined
  private proc!: ChildProcess
  private lineEmitter!: EventEmitter
  private cliArgs: string[] = []
  /** Envelope this turn sends; replaced by the catch-up after an account switch. */
  private userMsg: string
  private account: string
  /** Next pool account, set by a usage rejection; the rejected turn's tail is dropped until its `result`. */
  private switchTo: string | undefined
  /** A usage rejection found no usable account; schedule a resume when the turn ends. Cleared by a later switch. */
  private allLimited = false
  /** Tools Claude called this turn, for the catch-up after an account switch. */
  private readonly toolLog: string[] = []

  /** The ReadableStream was cancelled by its consumer. */
  private cancelled = false
  /** Listeners may be attached; `abandon` has something to tear down. */
  private attached = false
  /** No more parts may be written. */
  private closed = false
  private cleanedUp = false
  private turnCompleted = false
  private abortHandler: (() => void) | undefined
  private unsubscribeProxyCalls: (() => void) | null = null

  // Watchdogs, tunable by env for reproductions and the regression tests.
  private readonly resultFallbackMs = envMs("CLAUDE_CODE_RESULT_FALLBACK_MS", 60_000)
  private readonly startWatchdogMs = envMs("CLAUDE_CODE_START_WATCHDOG_MS", 90_000)
  private resultFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private startWatchdog: ReturnType<typeof setTimeout> | null = null
  private denialTimer: ReturnType<typeof setTimeout> | null = null
  private respawnAttempted = false
  private hasReceivedContent = false
  private hasReceivedProgress = false
  /** Proxied tool calls this stream is running; the CLI is silent by design meanwhile. */
  private inStreamCalls = 0
  private toolDenied = false
  /** Ended at a tool boundary for a queued message; the interrupted CLI tail is ignored. */
  private preempted = false

  /** Set once a `stream_event` arrives: top-level `assistant` messages then duplicate the deltas. */
  private gotPartialEvents = false
  private hadThinkingTextFromStream = false
  private readonly reasoning = new Map<number, { id: string; started: boolean }>()
  private readonly textBlockIndices = new Set<number>()
  private readonly toolBlocks = new Map<number, { id: string; name: string; inputJson: string; started: boolean }>()
  /** CLI-executed tool calls awaiting their `tool_result`, id -> mapped name. */
  private readonly toolCallNames = new Map<string, string>()
  /** Calls opencode runs itself; the CLI's echo of their result must not be forwarded. */
  private readonly skipResultForIds = new Set<string>()
  private readonly proxyToolUseIds = new Set<string>()
  /** CLI-run web searches awaiting their result, so a failure can be shown. */
  private readonly webSearchIds = new Set<string>()

  // Activity since the last auto-continue nudge, and for the whole turn.
  private window = emptyWindow()
  private readonly seen = { text: false, reasoning: false, tool: false, proxy: false }
  private lastStopReason: string | null = null
  private readonly autoContinue: AutoContinueState

  private lastCall: CallUsage | null = null
  /** `post_tokens` of a `/compact` boundary: its turn makes no model call, so this is the only size it has. */
  private compactedTokens: number | undefined
  private resultMeta: ReturnType<typeof resultMetadata> | Record<string, never> = {}
  /** Subtype of a failing `result`, so the finish reports an error rather than a clean stop. */
  private resultFailure: string | undefined
  private resultIsError = false
  /** The account itself cannot serve (expired login, billing), from the CLI's failure reply. */
  private accountBlock: AccountBlockKind | null = null
  /** Newest main-chain assistant message; the rewind point this exchange records. */
  private lastAssistantUuid: string | undefined
  private exchangeFlushed = false
  /** Written right after `stream-start`. */
  private readonly notices: string[] = []

  constructor(
    private readonly input: TurnInput,
    private readonly out: StreamWriter,
  ) {
    this.config = input.config
    this.turn = input.turn
    this.sk = input.turn.sessionKey
    this.options = input.options
    this.userMsg = input.userMsg
    this.account = input.account
    this.todos = new TodoMirror({
      out,
      turn: this.turn,
      options: this.options,
      account: () => this.account,
      closed: () => this.closed,
    })
    this.steering = new Steering({
      turn: this.turn,
      closed: () => this.closed,
      stopped: () => this.closed || this.cancelled || !!this.autoContinue.aborted || this.toolDenied,
      switching: () => !!this.switchTo,
      busy: () => this.inStreamCalls > 0,
      activeProcess: () => this.activeProcess,
      write: (line) => this.proc.stdin?.write(line),
      read: (messageID) => {
        if (!this.closed) this.out.splitAt(messageID)
      },
      receiptFailed: (error) => {
        this.autoContinue.aborted = true
        this.steering.retire("Claude read a message whose delivery receipt could not be saved")
        if (!this.closed)
          this.failTurn(`Claude read your message, but saving its delivery receipt failed: ${String(error)}`)
      },
    })
    this.autoContinue = {
      enabled: autoContinueEnabledFor(this.turn.compactionMode, this.config.autoContinueIncompleteTurns),
      attempts: 0,
      startedAt: Date.now(),
      noProgressCount: 0,
    }
    if (input.notice) this.notices.push(input.notice)
  }

  start() {
    this.activeProcess = getActiveProcess(this.sk)

    void this.setup().catch((err) => {
      if (this.cancelled) return
      this.abandon()
      log.error("failed to set up doStream", { error: err instanceof Error ? err.message : String(err) })
      this.out.enqueue({ type: "error", error: err instanceof Error ? err : new Error(String(err)) })
      this.out.close()
    })
  }

  cancel() {
    this.cancelled = true
    this.abandon()
  }

  private async setup() {
    if (this.cancelled) return
    const hadConversation = !!getClaudeSessionId(this.sk)
    await this.retireStaleProcess()
    // A retire that could not stop the old process loses the conversation;
    // never continue it fresh without the next turn's confirm.
    if (hadConversation && !getClaudeSessionId(this.sk)) {
      throw new Error(
        "The old Claude process did not exit, so its conversation was lost. Send again to choose how to continue.",
      )
    }

    if (this.activeProcess) {
      log.debug("reusing active process", { sk: this.sk })
      this.cliArgs = (await this.planSpawnFor(this.activeProcess)).cliArgs
    } else {
      this.activeProcess = await singleFlightSpawn(this.sk, () => this.spawnFresh())
      this.cliArgs = this.activeProcess.cliArgs ?? []
    }
    this.proc = this.activeProcess.proc
    this.lineEmitter = this.activeProcess.lineEmitter
    if (!this.turn.compactionMode && this.turn.affinity !== "default") {
      this.activeProcess.wakeTarget = {
        sessionID: this.turn.affinity,
        directory: this.turn.cwd,
        providerID: this.config.provider,
        modelID: this.turn.modelId,
        agent: this.turn.agent,
        variant: this.turn.variant,
      }
    }
    // A wake prompt attaches to the turn the CLI started on its own; any
    // other turn takes over from it (interrupting it below if still running).
    const attachAutonomous = this.activeProcess.autonomousTurn === true && this.input.wake
    this.activeProcess.autonomousTurn = false

    // The CLI serves one turn at a time. If the previous one is still running
    // (aborted, or ended on the inactivity fallback rather than a `result`),
    // stop it before attaching listeners, or its tail streams into this turn.
    if (!attachAutonomous && isTurnInFlight(this.activeProcess)) {
      log.warn("previous turn still in flight; interrupting it", { sk: this.sk })
      const idle = await interruptTurn(this.activeProcess)
      if (!idle) log.warn("previous turn did not stop in time; this turn may see stale output", { sk: this.sk })
    }

    this.out.enqueue({ type: "stream-start", warnings: [] })
    this.attached = true
    for (const notice of this.notices) this.out.note(notice)
    const autonomousLines = this.replayUnattendedOutput(attachAutonomous)

    if (!this.turn.compactionMode) this.activeProcess.opencodeSessionID = this.turn.affinity
    this.activeProcess.releaseTurn?.()
    this.activeProcess.releaseTurn = this.release
    this.lineEmitter.on("line", this.onLine)
    this.lineEmitter.on("close", this.onClose)
    this.unsubscribeProxyCalls = onPendingProxyCall(this.sk, this.onProxyCall)
    this.proc.on("error", this.onProcError)
    // Only the chat's own tool turn takes steers; title and summary calls share its session id.
    if (!this.turn.compactionMode && this.turn.scope === "tools")
      claudeSteerSinks.set(this.turn.affinity, this.steering.sink)

    if (this.options.abortSignal) {
      this.abortHandler = this.onAbort
      this.options.abortSignal.addEventListener("abort", this.onAbort, { once: true })
      if (this.options.abortSignal.aborted) {
        this.abandon()
        this.out.close()
        return
      }
    }
    if (this.cancelled) {
      this.abandon()
      return
    }

    // A new turn cannot continue a call from a prior turn.
    for (const call of this.input.previousPendingProxyCalls) {
      rejectPendingProxyCallById(
        call.toolCallId,
        new Error(
          `Pending proxy call '${call.toolName}' (${call.toolCallId}) was orphaned by a new user turn; rejecting`,
        ),
      )
    }

    if (attachAutonomous) {
      // Feed what the CLI already said in its own turn through the normal
      // handlers, so tool calls and text render live; its `result` ends this turn.
      log.info("attaching to a turn claude started on its own", { sk: this.sk, lines: autonomousLines.length })
      for (const line of autonomousLines) this.onLine(line)
      return
    }

    noteTurnStarted(this.activeProcess)
    this.proc.stdin?.write(this.userMsg + "\n")
    log.debug("sent user message", { textLength: this.userMsg.length })
    // A reused child that goes silent after the envelope write (seen after a
    // long proxy-blocked tool call) is respawned instead of hanging the turn.
    this.armStartWatchdog()
  }

  private planSpawnFor(reused: ActiveProcess | undefined) {
    return planSpawn({
      config: this.config,
      turn: this.turn,
      options: this.options,
      account: this.account,
      reusing: !!reused,
      proxyServer: reused?.proxyServer ?? null,
      proxyTools: this.input.proxyTools,
      runtimeStatus: this.input.runtimeStatus,
      cliVersion: this.input.cliVersion,
      loadLiveToolInfo: this.input.loadLiveToolInfo,
    })
  }

  /**
   * Plan and spawn this key's child. Setups that race here share the result
   * (`singleFlightSpawn`). The plan is awaited, so a child another path started
   * meanwhile is reused instead, and this plan's proxy server and prompt file go.
   */
  private async spawnFresh(): Promise<ActiveProcess> {
    const plan = await this.planSpawnFor(undefined)
    const live = getActiveProcess(this.sk)
    if (live) {
      if (plan.proxyServer && plan.proxyServer !== live.proxyServer) void plan.proxyServer.close()
      if (plan.systemPromptFile && plan.systemPromptFile !== live.systemPromptFile)
        void unlink(plan.systemPromptFile).catch(() => {})
      return live
    }
    return this.spawn(plan)
  }

  private spawn(plan: Awaited<ReturnType<typeof planSpawn>>) {
    const ap = spawnClaudeProcess(
      this.config.cliPath,
      plan.cliArgs,
      this.turn.cwd,
      this.sk,
      plan.proxyServer,
      plan.mcpHash,
      plan.systemPromptFile,
      this.config.ignoreAnthropicApiKey,
      this.turn.reasoningEffort,
      this.account,
    )
    ap.toolCatalogHash = this.input.catalogHash
    ap.settings = this.turn.processSettings
    return ap
  }

  /** Point this turn's listeners at `ap`, after detaching them from the previous child. */
  private attach(ap: ActiveProcess) {
    this.lineEmitter.off("line", this.onLine)
    this.lineEmitter.off("close", this.onClose)
    this.proc.off("error", this.onProcError)
    this.activeProcess = ap
    this.proc = ap.proc
    this.lineEmitter = ap.lineEmitter
    ap.releaseTurn = this.release
    this.lineEmitter.on("line", this.onLine)
    this.lineEmitter.on("close", this.onClose)
    this.proc.on("error", this.onProcError)
  }

  /**
   * A usage rejection on a pool account: mark it limited and, when another
   * account is usable, switch this turn to it at the rejected `result`.
   * Compaction stays: it needs the conversation that lives on this account.
   */
  private beginAccountSwitch(msg: ClaudeStreamMessage): boolean {
    const info = parseRateLimitEvent(msg)
    if (!info || !isRateLimitRejected(info)) return false
    return this.queueAccountSwitch(resetsAtToMs(info.resetsAt ?? info.overageResetsAt), info.rateLimitType)
  }

  /** Same failover when the CLI only put the limit in result/assistant text. */
  private beginTextAccountSwitch(msg: ClaudeStreamMessage): boolean {
    // A successful result may quote limit text in its own reply; only an error result is a rejection.
    if (this.switchTo || !msg.is_error) return false
    const resultText = typeof msg.result === "string" ? msg.result : null
    // An error result that names no limit is some other failure, even when the
    // reply quotes limit text. The streamed copy is only consulted when the
    // CLI sent no result text (its synthetic limit reply streams as text).
    if (resultText !== null) return isAccountLimitError({ resultText }) && this.queueAccountSwitch(undefined, "text")
    if (!isAccountLimitError({ resultText: this.out.shown })) return false
    return this.queueAccountSwitch(undefined, "text")
  }

  private queueAccountSwitch(resetsAtMs: number | undefined, rateLimitType: string | undefined): boolean {
    markAccountLimited(this.account, resetsAtMs)
    if (this.turn.compactionMode) return false
    const ids = poolAccountIds(this.config.accounts)
    // A pinned chat fails over too; its pin follows, and the global current account is not touched.
    const next = failoverAccount(this.turn.affinity, ids)
    if (!next || next === this.account) {
      this.allLimited = true
      return false
    }
    log.notice("claude account hit its usage limit; switching accounts", {
      sessionKey: this.sk,
      from: this.account,
      to: next,
      rateLimitType,
    })
    this.switchTo = next
    this.allLimited = false
    return true
  }

  private runPendingSwitch(): boolean {
    if (!this.switchTo) return false
    void this.switchAccount().catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      log.error("account switch failed", { sessionKey: this.sk, error: message })
      if (!this.closed) this.failTurn(`Switching Claude accounts failed: ${message}`)
    })
    return true
  }

  /**
   * Retire the limited account's child and conversation, then send this
   * turn again on the next account as a fresh conversation, with the
   * existing catch-up plus what this turn already did (so tools that ran are
   * not run again). Another rejection there switches again; every switch
   * marks an account limited, so the chain ends once all of them are.
   */
  private async switchAccount() {
    const next = this.switchTo!
    this.switchTo = undefined
    this.allLimited = false
    const progress = this.progressSummary()
    // Unread steers die with the retired child; oc's loop sends them after this turn.
    this.steering.clear()
    this.clearStartWatchdog()
    // Detach first: the retired child's close is not this turn ending.
    this.lineEmitter.off("line", this.onLine)
    this.lineEmitter.off("close", this.onClose)
    this.proc.off("error", this.onProcError)
    await deleteActiveProcessAndWait(this.sk)
    deleteClaudeSessionId(this.sk)
    if (this.closed) return
    if (this.autoContinue.aborted) return this.finish()
    const previous = this.account
    this.account = next
    this.out.note(
      `\n> **Claude account switched:** ${poolAccountLabel(previous)} hit its usage limit; continuing on ${poolAccountLabel(next)}.\n`,
    )
    const plan = await planSpawn({
      config: this.config,
      turn: this.turn,
      options: this.options,
      account: this.account,
      reusing: false,
      proxyServer: null,
      proxyTools: this.input.proxyTools,
      runtimeStatus: this.input.runtimeStatus,
      cliVersion: this.input.cliVersion,
      loadLiveToolInfo: this.input.loadLiveToolInfo,
    })
    if (this.closed) return
    if (this.autoContinue.aborted) return this.finish()
    this.cliArgs = plan.cliArgs
    const ap = this.spawn(plan)
    this.attach(ap)
    if (!this.turn.compactionMode) ap.opencodeSessionID = this.turn.affinity
    this.respawnAttempted = false
    this.userMsg = this.input.catchUpMessage(progress)
    noteTurnStarted(ap)
    this.proc.stdin?.write(this.userMsg + "\n")
    log.debug("sent catch-up after account switch", { textLength: this.userMsg.length })
    this.armStartWatchdog()
  }

  private progressSummary() {
    const text = this.out.shown.trim()
    const tools = this.toolLog.length ? `Tool calls you made:\n${this.toolLog.join("\n")}` : ""
    return [text && `Your reply so far:\n${text}`, tools].filter(Boolean).join("\n\n")
  }

  /**
   * Retire a live process that no longer matches this turn: a changed tool
   * catalog, model, agent or effort, or a changed opencode MCP config. A
   * compaction turn keeps whatever process holds the conversation. Waits
   * for the old owner to exit so two processes never append to one
   * transcript. The Claude session id stays, so the next spawn resumes it.
   */
  private async retireStaleProcess() {
    const ap = this.activeProcess
    if (!ap || this.turn.compactionMode) return
    // A wake attaches to the turn the CLI is already running; changed settings wait for the next turn.
    if (this.input.wake && ap.autonomousTurn) return
    if (ap.toolCatalogHash !== this.input.catalogHash) {
      await deleteActiveProcessAndWait(this.sk)
      this.activeProcess = undefined
      return
    }
    if (ap.settings !== this.turn.processSettings) {
      if (this.input.previousPendingProxyCalls.length > 0) {
        log.info("deferring settings change until proxy calls resolve", { sk: this.sk })
        return
      }
      log.info("model, agent or effort changed; resuming the conversation in a new process", {
        sk: this.sk,
        previous: ap.settings,
        next: this.turn.processSettings,
      })
      await deleteActiveProcessAndWait(this.sk)
      this.activeProcess = undefined
      return
    }
    if (this.config.hotReloadMcp === false) return
    const currentHash = effectiveMcpConfig(this.config, this.turn.cwd, undefined, this.input.runtimeStatus).mcpHash
    const previousHash = ap.mcpHash ?? null
    if (previousHash === currentHash) return
    if (this.input.previousPendingProxyCalls.length > 0) {
      log.info("deferring MCP hot reload until proxy calls resolve", {
        sk: this.sk,
        previousHash,
        currentHash,
        pendingCalls: this.input.previousPendingProxyCalls.length,
      })
      return
    }
    log.info("opencode MCP config changed, respawning claude", { sk: this.sk, previousHash, currentHash })
    await deleteActiveProcessAndWait(this.sk)
    this.activeProcess = undefined
  }

  /**
   * Whatever the child said while no turn was listening comes first, so the
   * operator sees it. Narration only: replaying actionable events could run
   * old tools or close this stream on a stale approval or result. When this
   * turn attaches to one the CLI started on its own, the lines from that
   * turn's `init` on are returned for live handling instead.
   */
  private replayUnattendedOutput(attachAutonomous: boolean): string[] {
    const all = takeUnattendedLines(this.activeProcess!)
    const start = attachAutonomous ? all.lines.findLastIndex(isInitLine) : -1
    const live = start < 0 ? [] : all.lines.slice(start)
    const unattended = { lines: start < 0 ? all.lines : all.lines.slice(0, start), dropped: all.dropped }
    if (unattended.lines.length === 0 && unattended.dropped === 0) return live
    log.notice("replaying stdout the child emitted between turns", {
      sessionKey: this.sk,
      lines: unattended.lines.length,
      dropped: unattended.dropped,
    })
    if (unattended.dropped > 0) {
      this.out.block(`> _${unattended.dropped} lines of output emitted between turns were dropped._\n\n`)
    }
    let partialText = false
    for (const line of unattended.lines) {
      const outer = parseLine(line)
      if (!outer) continue
      const msg = outer.type === "stream_event" && outer.event ? outer.event : outer
      if (msg.type === "content_block_delta" && msg.delta?.type === "text_delta") {
        partialText = true
        if (msg.delta.text) this.out.append(msg.delta.text)
        continue
      }
      if (msg.type === "assistant") {
        const text = partialText ? "" : assistantText(msg)
        partialText = false
        if (text) this.out.append(text)
        continue
      }
      if (msg.type === "result") {
        if (outer.session_id) setClaudeSessionId(this.sk, outer.session_id, this.account)
        if (msg.is_error && msg.result) this.out.append(msg.result)
      }
    }
    this.out.endText()
    // Replayed lines are history, not liveness: the watchdogs judge the child
    // on what it does from here on.
    this.clearResultFallback()
    this.hasReceivedContent = false
    return live
  }

  // ---------------------------------------------------------------------------
  // CLI output

  private readonly onLine = (line: string) => {
    if (!line.trim() || this.closed || this.steering.retired || this.preempted) return
    // Any line counts as activity, so mid-turn pauses between blocks survive.
    this.startResultFallback()
    const outer = parseLine(line)
    if (!outer) return this.onUnparsedLine(line)
    try {
      this.handleMessage(outer)
    } catch (e) {
      log.debug("failed to handle line", { error: e instanceof Error ? e.message : String(e) })
    }
  }

  /**
   * Stdout that is not JSON. Junk is ignored. A result line cut short would
   * otherwise wait out the 60 s fallback, so the turn ends now. The child is
   * dropped too: its state after that line is unknown, and a reused child would
   * first wait out an interrupt that nothing answers.
   */
  private onUnparsedLine(line: string) {
    log.warn("failed to parse line", { bytes: line.length })
    if (!line.includes('"type":"result"')) return
    this.failTurn("Claude Code's result could not be read, so this turn did not finish.")
    deleteActiveProcess(this.sk)
  }

  private handleMessage(outer: ClaudeStreamMessage) {
    // Unwrap the --include-partial-messages envelope; the inner event uses the
    // same content_block_* / message_* shape.
    const msg: ClaudeStreamMessage =
      outer.type === "stream_event" && outer.event ? { ...outer.event, session_id: outer.session_id } : outer
    // Keep the originating account's quota even while its rejected reply is suppressed for failover.
    if (msg.type === "rate_limit_event") {
      const windows = toQuotaWindows(parseRateLimitEvent(msg))
      if (windows.length)
        reportUsageObservation({
          providerID: BASE_PROVIDER_ID,
          accountID: canonicalAccountId(this.account),
          observedAt: Date.now(),
          windows,
        })
    }
    // The limited account's own "you've hit your limit" reply is not shown.
    if (this.switchTo && msg.type !== "result") return

    if (isModelProgress(msg)) {
      this.hasReceivedProgress = true
      this.clearStartWatchdog()
      this.startResultFallback()
    }
    if (outer.type === "stream_event") this.gotPartialEvents = true
    if (outer.type === "assistant" && outer.uuid && !outer.parent_tool_use_id) this.lastAssistantUuid = outer.uuid
    if (handleControlRequest(msg, this.proc)) return
    log.debug("stream message", { type: msg.type, subtype: msg.subtype })

    if (msg.type === "conversation_reset") return this.onConversationReset(msg)
    // Not returned from: the reply's own text still renders below.
    this.accountBlock = accountBlockKind(msg) ?? this.accountBlock

    switch (msg.type) {
      case "system":
        return this.onSystem(msg)
      case "rate_limit_event": {
        if (this.beginAccountSwitch(msg)) return
        // A rejection is why the turn is about to fail; put it in the transcript.
        const note = reportRateLimitEvent(msg)
        if (note) this.out.note(note)
        return
      }
      case "content_block_start":
        return this.onBlockStart(msg)
      case "content_block_delta":
        return this.onBlockDelta(msg)
      case "content_block_stop":
        return this.onBlockStop(msg)
      case "message_delta": {
        // The protocol-level stop reason is authoritative for why the turn
        // ended, bypassing the auto-continue keyword heuristic.
        const delta = msg as { delta?: { stop_reason?: unknown }; usage?: Record<string, unknown> }
        const stopReason = delta.delta?.stop_reason
        if (this.gotPartialEvents && typeof stopReason === "string") this.lastStopReason = stopReason
        // The call's `assistant` line came earlier with message_start's usage, whose output
        // count is about 1; the final counts arrive here.
        const counts = Object.entries(delta.usage ?? {}).filter((entry) => typeof entry[1] === "number")
        if (this.gotPartialEvents && counts.length) {
          this.lastCall = { ...this.lastCall, ...Object.fromEntries(counts) }
          this.reportLiveUsage(outer)
        }
        return
      }
      case "assistant":
        this.onAssistant(msg)
        return this.reportLiveUsage(outer)
      case "user":
        // A compaction turn's summary also arrives as a replay; `onUser` handles that.
        if (outer.isReplay && !this.turn.compactionMode) return this.steering.onReplay(msg)
        return this.onUser(msg)
      case "result":
        return this.onResult(msg)
    }
  }

  /**
   * The whole agent loop is one opencode step, so the final `finish` is the only
   * usage opencode would see. Send each main-thread call's usage as a raw chunk
   * (AI SDK flat shape) so the context display stays live during the turn.
   */
  private reportLiveUsage(outer: ClaudeStreamMessage) {
    if (outer.parent_tool_use_id || !this.lastCall) return
    const usage = toUsage(contextUsage(this.lastCall))
    this.out.enqueue({
      type: "raw",
      rawValue: {
        claudeCodeUsage: {
          inputTokens: usage.inputTokens.total,
          outputTokens: usage.outputTokens.total,
          inputTokenDetails: {
            cacheReadTokens: usage.inputTokens.cacheRead,
            cacheWriteTokens: usage.inputTokens.cacheWrite,
          },
        },
      },
    })
  }

  private onSystem(msg: ClaudeStreamMessage) {
    if (msg.subtype === "init") {
      if (msg.session_id) {
        setClaudeSessionId(this.sk, msg.session_id, this.account)
        log.info("session initialized", { claudeSessionId: msg.session_id })
      }
      reportSystemInit(msg, { ignoreAnthropicApiKey: this.config.ignoreAnthropicApiKey })
      return
    }
    // Compacting can run for minutes with no model output; neither watchdog
    // may mistake that for a silent child. The next line re-arms them.
    if (msg.subtype === "status" && (msg as { status?: unknown }).status === "compacting") {
      this.clearStartWatchdog()
      this.clearResultFallback()
      return
    }
    // The CLI compacted its own context. Nothing else tells the operator that
    // everything before this point is now a summary.
    if (msg.subtype === "compact_boundary") {
      const note = reportCompactBoundary(msg)
      if (note) this.out.note(note)
      this.compactedTokens = parseCompactBoundary(msg)?.postTokens
    }
  }

  /**
   * Claude Code started a new conversation (`/clear`, plan-mode exit).
   * Content-block indices restart with it, so nothing keyed by index may
   * survive: a stale tool block re-emits a finished tool call on the new
   * conversation's first block. The `system/init` that follows carries the
   * new Claude session id.
   */
  private onConversationReset(msg: ClaudeStreamMessage) {
    const note = reportConversationReset(msg)
    if (!note) return
    // Older rewind points belong to the conversation that just ended.
    clearSessionAnchors(this.sk)
    this.lastAssistantUuid = undefined
    this.toolBlocks.clear()
    this.reasoning.clear()
    this.textBlockIndices.clear()
    this.out.note(note)
  }

  private onBlockStart(msg: ClaudeStreamMessage) {
    const block = msg.content_block
    const idx = msg.index
    if (!block || idx === undefined) return

    if (block.type === "thinking") {
      this.noteReasoning()
      this.reasoning.set(idx, { id: generateId(), started: false })
      return
    }
    if (block.type === "text") {
      this.textBlockIndices.add(idx)
      // Final-answer detection only considers the latest text block.
      this.window.lastText = ""
      if (block.text) this.emitVisibleText(block.text)
      return
    }
    if (block.type !== "tool_use" || !block.id || !block.name) return
    if (block.name.startsWith(PROXY_TOOL_PREFIX)) this.proxyToolUseIds.add(block.id)
    this.noteTool()
    const entry = { id: block.id, name: block.name, inputJson: "", started: false }
    this.toolBlocks.set(idx, entry)
    if (rendersAsText(block.name, this.config) || block.name.startsWith(PROXY_TOOL_PREFIX)) return
    const mapped = mapTool(block.name, undefined, this.mapToolOptions())
    // A todo row is written once, at the turn's end (`TodoMirror.flush`).
    if (mapped.skip || isTodoMirror(mapped.name)) return
    entry.started = true
    this.out.enqueue({
      type: "tool-input-start",
      id: block.id,
      toolName: mapped.name,
      providerExecuted: mapped.executed,
    })
    log.info("tool started", { name: block.name, mappedName: mapped.name, id: block.id })
  }

  private onBlockDelta(msg: ClaudeStreamMessage) {
    const delta = msg.delta
    const idx = msg.index
    if (!delta || idx === undefined) return

    if (delta.type === "thinking_delta" && delta.thinking) {
      this.noteReasoning()
      this.hadThinkingTextFromStream = true
      const reasoning = this.reasoning.get(idx)
      if (reasoning) {
        if (!reasoning.started) this.out.enqueue({ type: "reasoning-start", id: reasoning.id })
        reasoning.started = true
        this.out.enqueue({ type: "reasoning-delta", id: reasoning.id, delta: delta.thinking })
      }
    }
    if (delta.type === "text_delta" && delta.text) this.emitVisibleText(delta.text)
    if (delta.type === "input_json_delta" && delta.partial_json) {
      const tool = this.toolBlocks.get(idx)
      if (tool) tool.inputJson += delta.partial_json
      // Only a call whose named start was emitted may get deltas; a nameless
      // pending part renders in opencode as `:gear: unknown`.
      if (tool?.started) this.out.enqueue({ type: "tool-input-delta", id: tool.id, delta: delta.partial_json })
    }
    if (!KNOWN_DELTA_TYPES.has(delta.type)) {
      log.debug("unrecognized content_block_delta type", { type: delta.type, idx, keys: Object.keys(delta) })
    }
  }

  private onBlockStop(msg: ClaudeStreamMessage) {
    const idx = msg.index
    if (idx === undefined) return
    const reasoning = this.reasoning.get(idx)
    if (reasoning?.started) {
      this.out.enqueue({ type: "reasoning-end", id: reasoning.id })
      reasoning.started = false
    }
    if (this.textBlockIndices.delete(idx)) this.out.endText()

    const tool = this.toolBlocks.get(idx)
    if (!tool) return
    // Block indices restart at 0 on every assistant message, and a turn can
    // hold several. A surviving entry would make the next message's block at
    // this index re-emit a tool call opencode already completed, which then
    // reports "Tool execution aborted".
    this.toolBlocks.delete(idx)
    const input = parseToolInput(tool.inputJson)
    if (input) return this.completeToolUse(tool.id, tool.name, input, false)
    this.failUnreadableToolUse(tool)
  }

  /**
   * A tool input that is not JSON cannot be mapped. The call goes out with its
   * raw text, which the AI SDK rejects as invalid tool input (a tool error),
   * instead of running with empty arguments. The CLI's own result is skipped.
   */
  private failUnreadableToolUse(tool: { id: string; name: string; inputJson: string }) {
    if (rendersAsText(tool.name, this.config) || tool.name.startsWith(PROXY_TOOL_PREFIX)) return
    const mapped = mapTool(tool.name, undefined, this.mapToolOptions())
    if (mapped.skip || isTodoMirror(mapped.name)) return
    this.skipResultForIds.add(tool.id)
    this.out.enqueue({
      type: "tool-call",
      toolCallId: tool.id,
      toolName: mapped.name,
      input: tool.inputJson,
      providerExecuted: mapped.executed,
      dynamic: mapped.executed,
    })
  }

  /**
   * A complete assistant message. With partial messages on, its content
   * duplicates the streamed deltas, so only usage, stop reason, and thinking
   * the stream never carried are taken from it.
   */
  private onAssistant(msg: ClaudeStreamMessage) {
    const message = msg.message as (ClaudeStreamMessage["message"] & { stop_reason?: unknown }) | undefined
    if (message?.usage) this.lastCall = message.usage
    if (typeof message?.stop_reason === "string") this.lastStopReason = message.stop_reason
    const content = message?.content
    if (!content) return

    if (this.gotPartialEvents) {
      // Some CLI builds strip thinking_delta from the stream but keep thinking
      // in the final message.
      const thinking = content.filter((b) => b.type === "thinking")
      if (thinking.length === 0) return
      log.info("assistant message thinking blocks", {
        count: thinking.length,
        hasText: thinking.some((b) => !!b.thinking),
        hadStreamThinking: this.hadThinkingTextFromStream,
      })
      if (this.hadThinkingTextFromStream) return
      for (const block of thinking) {
        if (!block.thinking) continue
        this.noteReasoning()
        this.hadThinkingTextFromStream = true
        this.out.reasoning(block.thinking)
      }
      return
    }

    const hasText = content.some((b) => b.type === "text" && b.text)
    const hasToolUse = content.some((b) => b.type === "tool_use")
    if (hasText) this.hasReceivedContent = true
    if (hasText && !hasToolUse) this.startResultFallback()
    if (hasToolUse) this.clearResultFallback()

    for (const block of content) {
      if (block.type === "text" && block.text) {
        this.window.lastText = ""
        this.out.note(block.text)
        this.noteVisibleText(block.text)
        this.hasReceivedContent = true
      }
      if (block.type === "thinking" && block.thinking) {
        this.noteReasoning()
        this.out.reasoning(block.thinking)
      }
      if (block.type === "tool_use" && block.id && block.name) {
        this.noteTool()
        this.completeToolUse(block.id, block.name, (block.input ?? {}) as Record<string, unknown>, true)
      }
    }
  }

  /**
   * A finished `tool_use`. Question, plan, and CLI-run web search calls have
   * no opencode tool and render as text; proxied calls are handled by the
   * broker; everything else becomes an opencode tool call.
   */
  private completeToolUse(id: string, name: string, input: Record<string, unknown>, emitStart: boolean) {
    this.toolLog.push(`${name} ${JSON.stringify(input).slice(0, 300)}`)
    if (isAskUserQuestionTool(name)) {
      // Latch: the model handed control to the operator, so no auto-continue
      // nudge may proceed on its behalf for the rest of the turn.
      this.autoContinue.sawAskUserQuestion = true
      return this.out.note(formatAskUserQuestion(input))
    }
    if (name === "ExitPlanMode") return this.out.note(formatPlanApproval(input))
    if (isWebSearchTool(name) && isWebSearchHandledByCli(this.config.webSearch)) {
      this.webSearchIds.add(id)
      return this.out.note(
        `\n> **Web search:** ${typeof input.query === "string" ? input.query : JSON.stringify(input)}\n`,
      )
    }
    if (name.startsWith(PROXY_TOOL_PREFIX)) {
      this.proxyToolUseIds.add(id)
      this.noteProxy()
      log.debug("ignoring proxy tool_use; broker handles it", { name, id })
      return
    }
    this.todos.noteTool(name)
    const mapped = mapTool(name, input, this.mapToolOptions())
    log.info("tool call complete", { name, mappedName: mapped.name, id, executed: mapped.executed })
    if (mapped.skip) return
    if (isTodoMirror(mapped.name)) {
      this.todos.hold(id, mapped.input)
      return
    }
    this.toolCallNames.set(id, mapped.name)
    if (!mapped.executed) this.skipResultForIds.add(id)
    if (emitStart) {
      this.out.enqueue({ type: "tool-input-start", id, toolName: mapped.name, providerExecuted: mapped.executed })
    }
    this.out.enqueue({
      type: "tool-call",
      toolCallId: id,
      toolName: mapped.name,
      input: JSON.stringify(mapped.input),
      providerExecuted: mapped.executed,
      // The CLI already ran it. `dynamic` makes the AI SDK keep a CLI tool oc
      // has no registry entry for (Monitor, ScheduleWakeup, ...) under its own
      // name instead of repairing it into an `invalid` row.
      dynamic: mapped.executed,
    })
  }

  /** Tool results the CLI produced, or on a compaction turn the summary it replays. */
  private onUser(msg: ClaudeStreamMessage) {
    if (this.turn.compactionMode) return this.onCompactionReplay(msg)
    this.readToolResults(msg)
    // Claude recorded these results, so this is the tool boundary a queued message waits for.
    if (!msg.parent_tool_use_id && msg.message?.content?.some((block) => block.type === "tool_result")) {
      this.maybePreempt()
    }
  }

  private readToolResults(msg: ClaudeStreamMessage) {
    for (const block of msg.message?.content ?? []) {
      if (block.type !== "tool_result" || !block.tool_use_id) continue
      const id = block.tool_use_id
      // A proxied or opencode-run call's result is opencode's to report. The
      // MCP call id differs from Claude's tool_use id, so the first such echo
      // after a denial stands in for the denied one and ends the turn.
      if (this.proxyToolUseIds.delete(id) || this.skipResultForIds.has(id)) {
        // Settled either way; a call left here would hold off every later preempt.
        this.toolCallNames.delete(id)
        if (this.denialTimer) return void this.endDeniedTurn()
        continue
      }
      const resultText = toolResultText(block.content)
      if (this.webSearchIds.delete(id)) {
        if (block.is_error === true) {
          this.out.note(`\n> **Web search failed:** ${resultText.slice(0, 200) || "no reason given"}\n`)
        }
        continue
      }

      const name = this.toolCallNames.get(id)
      if (!name) continue
      this.toolCallNames.delete(id)
      // `isError` makes the AI SDK emit a `tool-error`, which is what renders
      // the row as failed rather than a success whose output is an error.
      const isError = block.is_error === true
      this.out.enqueue({
        type: "tool-result",
        toolCallId: id,
        toolName: name,
        result: { output: resultText, title: name, metadata: isError ? { error: true } : {} },
        ...(isError ? { isError: true } : {}),
        providerExecuted: true,
      })
      this.noteTool()
      log.info("tool result emitted", { toolUseId: id, name, isError })
    }
  }

  /**
   * `/compact` replays the new summary as a user message, then its command
   * output. The summary becomes oc's summary text; the output is shown only
   * when it is not the plain success line (an error, or nothing to compact).
   */
  private onCompactionReplay(msg: ClaudeStreamMessage) {
    const content: unknown = msg.message?.content
    if (typeof content !== "string") return
    const text = content.replace(/<\/?local-command-stdout>/g, "").trim()
    if (!text || text === "Compacted") return
    this.out.note(text)
  }

  private onResult(msg: ClaudeStreamMessage) {
    if (this.steering.retired) return this.finish()
    this.clearResultFallback()
    this.resultIsError = msg.is_error === true
    this.beginTextAccountSwitch(msg)
    // An aborted turn ends here; it must not restart on another account.
    if (this.switchTo && (this.autoContinue.aborted || this.cancelled)) this.switchTo = undefined
    if (this.runPendingSwitch()) return
    if (msg.session_id) setClaudeSessionId(this.sk, msg.session_id, this.account)

    // Some CLI failures carry their only readable text in `result.result`. Others (API errors,
    // usage limits) already sent it as a synthetic assistant reply.
    if (
      !this.out.inText &&
      msg.is_error &&
      typeof msg.result === "string" &&
      msg.result.trim() &&
      !this.out.shown.includes(msg.result.trim())
    ) {
      this.out.block(msg.result)
    }

    // Name the account and what to run; the CLI's own message names neither.
    // The CLI labels this result `success` with `is_error: true`, so this is
    // also what marks the turn failed.
    if (this.accountBlock && msg.is_error) {
      const configDir = poolConfigDir(this.account)
      const account = poolAccountLabel(this.account)
      this.resultFailure ??= this.accountBlock
      this.out.note(formatAccountBlockNote({ kind: this.accountBlock, account, configDir }))
      log.warn(`Claude account "${account}" cannot serve requests`, { sessionKey: this.sk, kind: this.accountBlock })
    }

    // A non-`success` subtype is a failed turn: name it and finish as an error.
    const failure = describeResultFailure(msg)
    if (failure) {
      this.resultFailure = msg.subtype
      this.out.block(formatResultFailureNote(failure))
      log.warn(failure, { sessionKey: this.sk, subtype: msg.subtype })
    }

    const turnStats = extractTurnStats(msg)
    this.resultMeta = resultMetadata(msg)
    log.info("conversation result", {
      sessionId: msg.session_id,
      numTurns: msg.num_turns,
      isError: msg.is_error,
      subtype: msg.subtype,
      ...turnStatsLogPayload(turnStats),
    })
    // Never on compaction (it would land in the summary) or on failure (the
    // error is the thing to read).
    if (this.config.turnStats && !this.turn.compactionMode && !msg.is_error && !failure) {
      const footer = formatTurnStatsBlock(turnStats)
      if (footer) this.out.block(footer)
    }

    this.turnCompleted = true
    this.out.endText()
    this.todos.flush()
    if (this.todos.idle && this.steering.acks.size === 0) return this.completeResult(msg)
    void Promise.all([this.todos.settled, ...this.steering.acks]).then(
      () => this.completeResult(msg),
      (error) => {
        if (!this.closed) this.failTurn(`Updating a pending message failed: ${String(error)}`)
      },
    )
  }

  private completeResult(msg: ClaudeStreamMessage) {
    if (this.closed) return
    // A steer written after Claude's last tool call is still in stdin: the CLI
    // runs it as its next turn, which this step keeps streaming until that `result`.
    this.steering.flush()
    if (!this.autoContinue.aborted && !this.toolDenied && this.steering.hasUnread) {
      this.turnCompleted = false
      if (this.activeProcess) noteTurnStarted(this.activeProcess)
      this.startResultFallback()
      return
    }
    // A queued message runs next; no nudge may keep this turn going in front of it.
    if (!this.toolDenied && !this.steering.preempting && this.maybeAutoContinue(msg)) return
    // finish() runs cleanup(), which rejects whatever is still pending.
    const pendingSiblings = getPendingProxyCalls(this.sk)
    if (pendingSiblings.length > 0) {
      log.info("rejecting parallel proxy calls still pending at result boundary", {
        sessionKey: this.sk,
        count: pendingSiblings.length,
      })
    }

    for (const reasoning of this.reasoning.values()) {
      if (reasoning.started) this.out.enqueue({ type: "reasoning-end", id: reasoning.id })
    }

    // A clean finish that said and did nothing. opencode would file it as an
    // ordinary blank reply, indistinguishable from a crash.
    const silent = isSilentTurn({
      enabled: this.autoContinue.enabled,
      compactionMode: this.turn.compactionMode,
      sawVisibleText: this.seen.text,
      sawToolActivity: this.seen.tool,
      sawProxyActivity: this.seen.proxy,
      isError: msg.is_error === true || this.resultFailure !== undefined,
      aborted: this.autoContinue.aborted,
      sawQuestion: this.autoContinue.sawAskUserQuestion,
    })
    if (silent) {
      log.notice("claude finished the turn without a reply", {
        sessionKey: this.sk,
        stopReason: this.lastStopReason,
        hadReasoning: this.seen.reasoning,
        attempts: this.autoContinue.attempts,
      })
      this.out.note(formatSilentTurnNote(this.seen.reasoning))
    }
    this.recordAnchor(msg)
    if (this.turn.compactionMode && !this.out.shown.trim()) this.out.note("Claude Code compacted this conversation.")

    this.out.enqueue({
      type: "finish",
      finishReason: this.finishReason(),
      // oc's context meter skips replies with no output tokens, so report the compacted size.
      usage:
        this.turn.compactionMode && !this.lastCall && this.compactedTokens
          ? toUsage({ input_tokens: 0, output_tokens: this.compactedTokens })
          : toUsage(contextUsage(this.lastCall)),
      providerMetadata: {
        "claude-code": {
          ...this.resultMeta,
          claudePromptTokens: claudePromptTokens(this.lastCall),
          visibleThreadTokens: this.input.visibleTokens,
          ...(this.resultFailure ? { resultSubtype: this.resultFailure } : {}),
        },
        ...cacheCreationMetadata(msg.usage),
      },
    })
    this.finish()
    scheduleIdleProcessEviction(this.sk, resolveIdleProcessTimeoutMs(this.config.idleProcessTimeoutMs))
  }

  /**
   * A queued message this turn cannot take (other settings, attachments, another model) ends it
   * once no tool is running: the CLI turn is interrupted and oc's loop runs that message next
   * under its own settings. Checked only after a tool result: a reply without a tool call ends
   * the turn by itself, as a native step would. Unread steers go first; the next boundary checks
   * again.
   */
  private maybePreempt() {
    if (!this.steering.preempting || this.preempted || this.closed || this.toolDenied) return
    if (this.inStreamCalls > 0 || this.toolCallNames.size > 0 || this.proxyToolUseIds.size > 0) return
    if (this.steering.hasUnread) return
    this.preempted = true
    this.autoContinue.aborted = true
    this.clearResultFallback()
    log.info("preempting claude turn for a queued message", {
      sessionKey: this.sk,
      messageID: this.steering.preempting,
    })
    if (this.activeProcess) void interruptTurn(this.activeProcess)
    this.out.endText()
    this.todos.flush()
    // Read receipts must be saved first, or oc's loop would send those steers again.
    void Promise.all([this.todos.settled, ...this.steering.acks]).then(
      () => this.endPreempted(),
      (error) => {
        if (!this.closed) this.failTurn(`Updating a pending message failed: ${String(error)}`)
      },
    )
  }

  private endPreempted() {
    if (this.closed) return
    for (const reasoning of this.reasoning.values()) {
      if (reasoning.started) this.out.enqueue({ type: "reasoning-end", id: reasoning.id })
    }
    this.out.enqueue({
      type: "finish",
      finishReason: toFinishReason("stop"),
      usage: toUsage(contextUsage(this.lastCall)),
      providerMetadata: {
        "claude-code": {
          claudePromptTokens: claudePromptTokens(this.lastCall),
          visibleThreadTokens: this.input.visibleTokens,
        },
      },
    })
    this.finish()
  }

  /**
   * A cleanly finished exchange becomes a rewind point (sessionSync.ts).
   * Failed and aborted turns do not: opencode may show them differently
   * from what the CLI kept.
   */
  private recordAnchor(msg: ClaudeStreamMessage) {
    this.flushExchangeText()
    if (this.turn.compactionMode || !this.lastAssistantUuid || this.autoContinue.aborted) return
    if (msg.is_error || this.resultFailure !== undefined) return
    recordSessionAnchor(this.sk, { uuid: this.lastAssistantUuid, hash: currentExchangeHash(this.sk) })
  }

  /** Hand what this stream showed to the exchange in progress, once. */
  private flushExchangeText() {
    if (this.exchangeFlushed || this.turn.compactionMode) return
    this.exchangeFlushed = true
    appendExchangeText(this.sk, this.out.shown)
  }

  /** Nudge the CLI to keep going when its result looks like an unfinished turn. */
  private maybeAutoContinue(msg: ClaudeStreamMessage) {
    const snapshot = {
      text: this.window.text,
      lastVisibleText: this.window.lastText,
      hadReasoning: this.window.reasoning,
      hadToolActivity: this.window.tool,
      hadProxyActivity: this.window.proxy,
      isError: msg.is_error,
    }
    const decision = shouldAutoContinueIncompleteTurn(this.autoContinue, {
      ...snapshot,
      stopReason: this.lastStopReason,
    })
    const logFields = {
      sessionKey: this.sk,
      reason: decision.reason,
      attempts: this.autoContinue.attempts,
      textLength: snapshot.text.length,
      lastTextLength: snapshot.lastVisibleText.length,
      hadReasoning: snapshot.hadReasoning,
      hadToolActivity: snapshot.hadToolActivity,
      hadProxyActivity: snapshot.hadProxyActivity,
    }
    if (!decision.continue) {
      log.notice("auto-continuation stopped", { ...logFields, stopReason: this.lastStopReason })
      return false
    }
    const signature = continuationSignature(snapshot)
    this.autoContinue.noProgressCount =
      signature === this.autoContinue.lastSignature ? this.autoContinue.noProgressCount + 1 : 0
    this.autoContinue.lastSignature = signature
    this.autoContinue.attempts++
    log.notice("auto-continuing incomplete claude result", { ...logFields, attempts: this.autoContinue.attempts })
    this.turnCompleted = false
    this.window = emptyWindow()
    this.lastStopReason = null
    // The `result` just consumed marked the CLI idle; this puts it back to work.
    if (this.activeProcess) noteTurnStarted(this.activeProcess)
    this.proc.stdin?.write(makeAutoContinueMessage() + "\n")
    return true
  }

  // ---------------------------------------------------------------------------
  // Proxied tool calls

  private readonly onProxyCall = (call: PendingProxyCall) => {
    if (this.closed || this.cancelled || this.autoContinue.aborted || this.toolDenied) {
      // Late arrival: reject now so the proxy HTTP request returns instead of
      // hanging until its timeout.
      log.warn("pending proxy call arrived after stream close; rejecting", {
        sessionKey: this.sk,
        toolCallId: call.toolCallId,
        toolName: call.toolName,
      })
      rejectPendingProxyCallById(
        call.toolCallId,
        new Error(`Pending proxy call '${call.toolName}' arrived after the stream was already closed`),
      )
      return
    }
    log.info("received pending proxy call for session", {
      sessionKey: this.sk,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
    })
    this.noteProxy()
    this.noteTool()
    const execute = this.turn.compactionMode ? undefined : hostToolExecutors.get(this.turn.affinity)
    if (execute) {
      void this.runProxyCall(call, execute).catch((error) => {
        rejectPendingProxyCallById(call.toolCallId, error instanceof Error ? error : new Error(String(error)))
      })
      return
    }
    log.warn(`Tool '${call.toolName}' is not available in this turn`, {
      sessionKey: this.sk,
      toolCallId: call.toolCallId,
      toolName: call.toolName,
    })
    rejectPendingProxyCallById(call.toolCallId, new Error(`Tool '${call.toolName}' is not available in this turn`))
  }

  /**
   * Run a proxied call inside this stream: opencode records a provider-executed
   * call and result, and Claude's held MCP request is answered as soon as the
   * tool finishes, so the turn never ends early. `task_batch` fans out into
   * parallel `task` calls gathered back onto the parent id.
   */
  private async runProxyCall(call: PendingProxyCall, execute: HostToolExecutor) {
    this.inStreamCalls++
    this.clearResultFallback()
    let denied = false
    const runOne = async (toolCallId: string, toolName: string, input: Record<string, unknown>) => {
      const outcome = await this.executeProxyTool(call, execute, toolCallId, toolName, input)
      if (outcome.denied) {
        denied = true
        this.toolDenied = true
      }
      return outcome.result
    }
    try {
      const result =
        call.toolName === TASK_BATCH_TOOL_NAME
          ? formatTaskBatchResults(
              await Promise.all(
                taskBatchTasks(call.input).map(async (task, index) => ({
                  task,
                  result: await runOne(taskBatchChildToolCallId(call.toolCallId, index), "task", task),
                })),
              ),
            )
          : await runOne(call.toolCallId, call.toolName, call.input)
      // Before the result, so Claude reads held steers at this tool boundary.
      this.steering.flush()
      resolvePendingProxyCallById(call.toolCallId, result)
    } finally {
      // A failed call is rejected by the caller after this.
      this.steering.flush()
      this.inStreamCalls--
      this.startResultFallback()
    }
    // Let Claude record the denied result first; the CLI echoes it within
    // milliseconds and `onUser` ends the turn then. The timer is a backstop.
    if (denied && !this.denialTimer && !this.closed) {
      this.denialTimer = setTimeout(() => this.endDeniedTurn(), DENIAL_BACKSTOP_MS)
    }
  }

  private async executeProxyTool(
    call: PendingProxyCall,
    execute: HostToolExecutor,
    toolCallId: string,
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<{ result: ProxyToolResult; denied: boolean }> {
    if (this.closed || this.cancelled || this.autoContinue.aborted || call.signal?.aborted) {
      return { result: { kind: "error", message: "Proxy tool call was aborted before execution" }, denied: false }
    }
    this.out.enqueue({ type: "tool-input-start", id: toolCallId, toolName, providerExecuted: true })
    this.out.enqueue({ type: "tool-call", toolCallId, toolName, input: JSON.stringify(input), providerExecuted: true })
    const outcome: { result: HostToolResult; isError: boolean } = await execute(
      toolName,
      input,
      toolCallId,
      call.signal,
    ).then(
      (result) => ({ result, isError: result.denied !== undefined }),
      (error) => ({
        result: {
          output: error instanceof Error ? error.message : String(error),
          title: toolName,
          metadata: { error: true },
        },
        isError: true,
      }),
    )
    const result: ProxyToolResult = outcome.isError
      ? { kind: "error", message: outcome.result.output }
      : proxyToolResult(outcome.result)
    if (!this.closed) {
      this.out.enqueue({
        type: "tool-result",
        toolCallId,
        toolName,
        // The AI SDK turns an isError result into a tool-error carrying this
        // value, so a denial reaches the processor as the original rejection.
        result:
          outcome.result.denied ??
          (result.kind === "error" ? { ...outcome.result, output: result.message } : outcome.result),
        ...(result.kind === "error" ? { isError: true } : {}),
        providerExecuted: true,
      })
    }
    return { result, denied: outcome.result.denied !== undefined }
  }

  /**
   * A denial ends the turn: interrupt the CLI so Claude cannot retry or work
   * around it, wait for it to stop (bounded by the interrupt timeout), then
   * close the stream as an error so the processor records the turn as blocked.
   * A `result` that lands meanwhile finishes the stream first, as an error too.
   * Once per turn.
   */
  private async endDeniedTurn() {
    if (!this.denialTimer) return
    clearTimeout(this.denialTimer)
    this.denialTimer = null
    if (this.steering.hasUnread) this.steering.retire("the denied turn had unread queued messages")
    if (this.closed) return
    if (this.activeProcess && !this.steering.retired) {
      const idle = await interruptTurn(this.activeProcess)
      log.info("interrupt sent for denied tool call", { sk: this.sk, idle })
    }
    if (this.closed) return
    this.out.endText()
    this.out.enqueue({
      type: "finish",
      finishReason: this.finishReason(),
      usage: toUsage(contextUsage(this.lastCall)),
      providerMetadata: { "claude-code": this.resultMeta },
    })
    this.finish()
  }

  /**
   * A failed, aborted, or denied turn ends as an error, so the processor never
   * reads it as a completed answer.
   */
  private finishReason() {
    if (this.resultFailure) return { unified: "error" as const, raw: this.resultFailure }
    if (this.autoContinue.aborted || this.toolDenied) return toFinishReason("error")
    return toFinishReason("stop")
  }

  // ---------------------------------------------------------------------------
  // Endings

  /** stdout closed. Without a terminal `result` first, the child died mid-turn. */
  private readonly onClose = () => {
    log.debug("readline closed")
    if (this.closed) return
    // The proxy requests behind pending calls have no one to answer them now.
    this.rejectPendingProxyCalls("Claude CLI subprocess closed before pending tool calls were resolved")
    // The limited account's child may exit right after its limit reply, before any `result`.
    if (this.switchTo && !this.autoContinue.aborted && this.runPendingSwitch()) return
    // An abort is not a crash: the CLI may exit before its interrupt result lands.
    const crashed = !this.turnCompleted && !this.autoContinue.aborted
    this.closed = true
    this.cleanup()
    this.out.endText()

    const report = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (crashed) {
        log.warn("claude process closed without a result", {
          sessionKey: this.sk,
          exitCode,
          signal,
          stderrBytes: this.activeProcess?.lastStderr?.length ?? 0,
        })
        this.out.enqueue({
          type: "error",
          error: new Error(describeChildCrash(exitCode, signal, this.activeProcess?.lastStderr)),
        })
      }
      this.out.enqueue({
        type: "finish",
        finishReason: crashed ? toFinishReason("error") : this.finishReason(),
        usage: toUsage(),
        providerMetadata: { "claude-code": this.resultMeta },
      })
      this.out.close()
    }

    // stdout usually reaches EOF a tick before the child's `exit`, so the
    // status that explains a crash may not be known yet. Wait briefly for it.
    const proc = this.proc
    if (!crashed || proc.exitCode !== null || proc.signalCode !== null) return report(proc.exitCode, proc.signalCode)
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(grace)
      report(code, signal)
    }
    const grace = setTimeout(() => {
      proc.off("exit", onExit)
      report(proc.exitCode, proc.signalCode)
    }, CHILD_EXIT_STATUS_GRACE_MS)
    proc.once("exit", onExit)
  }

  private readonly onProcError = (err: Error) => {
    log.error("process error", { error: err.message })
    deleteActiveProcess(this.sk)
    markClaudeSessionLost(this.sk, `the Claude process failed (${err.message})`)
    if (this.closed) return
    this.rejectPendingProxyCalls(`Claude CLI subprocess error: ${err.message}`)
    this.out.enqueue({ type: "error", error: err })
    this.finish()
  }

  private readonly onAbort = () => {
    this.autoContinue.aborted = true
    log.info("aborting claude turn", {
      sessionKey: this.sk,
      unreadSteers: this.steering.unreadIds(),
    })
    if (this.closed) return
    if (this.steering.hasUnread) {
      this.steering.retire("the interrupted turn had unread queued messages")
    }
    // Claude already applied the held todo list; the panel should show it too.
    this.todos.flush()
    // Stop the CLI's turn, not just this end of the stream: otherwise it runs
    // the abandoned turn to completion, billing tokens and running tools, and
    // its late output lands in the next turn. The process stays alive.
    const interrupt = this.activeProcess && !this.steering.retired ? interruptTurn(this.activeProcess) : undefined
    // opencode stops its tool runs with the turn, so proxy calls handed to it
    // will never get a result. Release them so the CLI's parked requests return.
    if (!this.hasReceivedContent) {
      log.info("abort signal received before content, closing stream immediately", { cwd: this.turn.cwd })
      this.rejectPendingProxyCalls("Provider stream was aborted before pending proxy calls completed")
      this.closed = true
      this.cleanup()
      this.out.close()
      return
    }
    log.info("abort signal received mid-turn, starting grace period", { cwd: this.turn.cwd })
    this.rejectPendingProxyCalls("Provider stream was aborted while proxy tool calls were pending")
    if (!interrupt) {
      // The aborted-grace guard in startResultFallback keeps an armed timer, so drop it first.
      this.clearResultFallback()
      return this.startResultFallback(ABORT_GRACE_MS)
    }
    // Finish once the CLI has stopped (or the interrupt timed out), so a late `result` cannot end the stream as a success.
    void interrupt.then((idle) => {
      log.info("interrupt sent for aborted turn", { sk: this.sk, idle })
      this.onClose()
    })
  }

  /** A newer turn takes over the child: an aborted turn still in its grace period ends now. */
  private readonly release = () => {
    if (this.closed) return
    this.autoContinue.aborted = true
    this.clearResultFallback()
    this.onClose()
  }

  /** Stop listening and interrupt the CLI's turn; the process stays for the next one. */
  private abandon() {
    if (!this.attached) return
    this.autoContinue.aborted = true
    this.closed = true
    this.cleanup()
    if (this.activeProcess && !this.steering.retired) void interruptTurn(this.activeProcess)
  }

  /** Mark the stream done, tear down, and close it. */
  private finish() {
    this.maybeScheduleResume()
    this.closed = true
    this.cleanup()
    this.out.close()
  }

  private cleanup() {
    if (this.cleanedUp) return
    this.cleanedUp = true
    if (this.steering.hasUnread && (this.autoContinue.aborted || this.toolDenied || !this.turnCompleted)) {
      this.steering.retire("the stopped turn had unread queued messages")
    }
    this.flushExchangeText()
    this.clearResultFallback()
    this.clearStartWatchdog()
    if (this.denialTimer) clearTimeout(this.denialTimer)
    this.denialTimer = null
    if (this.abortHandler) this.options.abortSignal?.removeEventListener("abort", this.abortHandler)
    this.lineEmitter.off("line", this.onLine)
    this.lineEmitter.off("close", this.onClose)
    this.unsubscribeProxyCalls?.()
    this.unsubscribeProxyCalls = null
    if (this.activeProcess?.releaseTurn === this.release) this.activeProcess.releaseTurn = undefined
    if (claudeSteerSinks.get(this.turn.affinity) === this.steering.sink) claudeSteerSinks.delete(this.turn.affinity)
    this.proc.off("error", this.onProcError)
    rejectAllPendingProxyCallsForSession(this.sk, new Error("Provider stream closed before proxy calls completed"))
  }

  private rejectPendingProxyCalls(reason: string) {
    if (getPendingProxyCalls(this.sk).length === 0) return
    rejectAllPendingProxyCallsForSession(this.sk, new Error(reason))
  }

  // ---------------------------------------------------------------------------
  // Watchdogs

  /**
   * Wire-inactivity watchdog. Reset by every line; fires only after the CLI
   * emitted content and then went silent without a `result`. Not armed while
   * this stream runs a proxied tool, since the CLI waits silently on it.
   */
  private startResultFallback(delayMs = this.resultFallbackMs) {
    // An aborted turn's grace is final: later lines must not push it out to the long default.
    if (this.autoContinue.aborted && this.resultFallbackTimer) return
    this.clearResultFallback()
    if ((!this.hasReceivedContent && !this.hasReceivedProgress) || this.closed) return
    if (this.inStreamCalls > 0 && !this.autoContinue.aborted) return
    this.resultFallbackTimer = setTimeout(() => {
      if (this.closed) return
      log.warn("result fallback timer fired - closing stream without result event", { delayMs })
      // Say so rather than leave a reply that just stops. An abort is exempt:
      // the operator asked for it.
      if (!this.autoContinue.aborted) this.out.note(formatStreamTimeoutNote(delayMs))
      this.onClose()
    }, delayMs)
  }

  private clearResultFallback() {
    if (!this.resultFallbackTimer) return
    clearTimeout(this.resultFallbackTimer)
    this.resultFallbackTimer = null
  }

  /**
   * Start watchdog: covers a reused process that writes nothing at all after
   * the envelope, which the inactivity watchdog skips. First fire respawns the
   * child to resume the conversation; a second fire ends the turn so the next
   * one spawns fresh.
   */
  private armStartWatchdog() {
    this.clearStartWatchdog()
    if (this.closed) return
    this.startWatchdog = setTimeout(() => this.onStartWatchdogFire(), this.startWatchdogMs)
  }

  private clearStartWatchdog() {
    if (!this.startWatchdog) return
    clearTimeout(this.startWatchdog)
    this.startWatchdog = null
  }

  private onStartWatchdogFire() {
    this.startWatchdog = null
    if (this.closed || this.hasReceivedContent || this.hasReceivedProgress) return
    if (this.respawnAttempted) {
      log.error("claude process still silent after respawn; ending turn", { sessionKey: this.sk })
      deleteActiveProcess(this.sk)
      markClaudeSessionLost(this.sk, "the Claude process stopped responding")
      return this.failTurn("Claude process produced no output after the envelope write (start watchdog timeout).")
    }
    this.respawnAttempted = true
    log.warn("no stdout after envelope write; respawning claude process to resume conversation", {
      sessionKey: this.sk,
      startWatchdogMs: this.startWatchdogMs,
    })
    void this.respawnSilentProcess()
  }

  private async respawnSilentProcess() {
    // The old child's exit must not close this turn, so detach before it is awaited.
    this.lineEmitter.off("line", this.onLine)
    this.lineEmitter.off("close", this.onClose)
    this.proc.off("error", this.onProcError)
    const respawned = await respawnActiveProcess(
      this.sk,
      this.config.cliPath,
      this.cliArgs,
      this.turn.cwd,
      this.config.ignoreAnthropicApiKey,
    )
    if (this.closed) return
    if (!respawned) {
      log.error("no active process to respawn (start watchdog); ending turn", { sessionKey: this.sk })
      return this.failTurn("No active claude process to respawn after start watchdog timeout.")
    }
    this.attach(respawned)
    // Unread steers died with the old child; held ones still go out at the next tool boundary.
    this.steering.forgetWritten()
    try {
      noteTurnStarted(respawned)
      this.proc.stdin?.write(this.userMsg + "\n")
      log.debug("re-sent user message after respawn", { textLength: this.userMsg.length })
    } catch (err) {
      log.error("failed to re-send envelope after respawn", { error: err instanceof Error ? err.message : String(err) })
    }
    this.armStartWatchdog()
  }

  private failTurn(message: string) {
    this.maybeScheduleResume()
    this.closed = true
    this.cleanup()
    this.out.enqueue({ type: "error", error: new Error(message) })
    this.out.close()
  }

  /**
   * The turn ends with every pool account limited and no switch happened, so
   * queue a fixed resume prompt at the earliest reset plus a minute. The
   * scheduler drops it when disabled, capped, superseded, or the session is
   * busy; `turn.affinity` is the opencode sessionID (`"default"` outside oc).
   */
  private maybeScheduleResume() {
    if (!this.allLimited) return
    this.allLimited = false
    if (this.turn.compactionMode || this.autoContinue.aborted || this.cancelled) return
    // A turn that completed cleanly (for example on overage) did not fail on the limit.
    if (this.turnCompleted && !this.resultIsError && this.resultFailure === undefined) return
    const sessionID = this.turn.affinity
    if (!sessionID || sessionID === "default") return
    const ids = poolAccountIds(this.config.accounts)
    // Pinned chats fail over too, so the earliest reset in the pool resumes any chat.
    const resetAt = earliestLimitedUntil(ids)
    if (resetAt === undefined) return
    const entry = ScheduledResume.requestResume({
      sessionID,
      directory: this.turn.cwd,
      fireAt: resetAt + 60_000,
      reason: ScheduledResume.RESUME_REASON,
    })
    if (entry)
      log.notice("scheduled auto-resume after usage reset", { sessionKey: this.sk, sessionID, fireAt: entry.fireAt })
  }

  // ---------------------------------------------------------------------------
  // Activity bookkeeping

  private emitVisibleText(text: string) {
    this.out.append(text)
    this.noteVisibleText(text)
    this.hasReceivedContent = true
  }

  private noteVisibleText(text: string) {
    this.window.text += text
    this.window.lastText += text
    if (text) this.seen.text = true
  }

  private noteReasoning() {
    this.window.reasoning = true
    this.seen.reasoning = true
  }

  private noteTool() {
    this.window.tool = true
    this.seen.tool = true
  }

  private noteProxy() {
    this.window.proxy = true
    this.seen.proxy = true
  }

  private mapToolOptions() {
    return { webSearch: this.config.webSearch }
  }
}

function emptyWindow() {
  return { text: "", lastText: "", reasoning: false, tool: false, proxy: false }
}

function envMs(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseLine(line: string) {
  try {
    return JSON.parse(line) as ClaudeStreamMessage
  } catch {
    return undefined
  }
}

function parseToolInput(json: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(json || "{}")
  } catch {
    return undefined
  }
}

/** Output from the model itself, as opposed to CLI bookkeeping lines. */
function isModelProgress(msg: ClaudeStreamMessage) {
  if (msg.type === "assistant") return !!msg.message?.content?.length
  if (msg.type === "content_block_start") return msg.content_block?.type === "tool_use"
  if (msg.type !== "content_block_delta") return false
  return (
    (msg.delta?.type === "text_delta" && !!msg.delta.text) ||
    (msg.delta?.type === "thinking_delta" && !!msg.delta.thinking)
  )
}

/** Tools rendered as text rather than opencode tool rows. */
function rendersAsText(name: string, config: ClaudeCodeConfig) {
  return (
    isAskUserQuestionTool(name) ||
    name === "ExitPlanMode" ||
    (isWebSearchTool(name) && isWebSearchHandledByCli(config.webSearch))
  )
}

function formatPlanApproval(input: Record<string, unknown>) {
  const plan = typeof input.plan === "string" ? input.plan : ""
  return `\n\n${plan}\n\n---\n**Do you want to proceed with this plan?** (yes/no)\n`
}

function assistantText(msg: ClaudeStreamMessage) {
  return (msg.message?.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("")
}

function toolResultText(content: string | Array<{ type: string; text?: string }> | undefined) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
}

function resultMetadata(msg: ClaudeStreamMessage) {
  return {
    sessionId: msg.session_id,
    costUsd: msg.total_cost_usd,
    durationMs: msg.duration_ms,
    durationApiMs: msg.duration_api_ms,
    numTurns: msg.num_turns,
    usage: msg.usage,
    modelUsage: msg.modelUsage,
    // Names and ids only: a denial's `tool_input` can be a whole file write.
    permissionDenials: msg.permission_denials?.map((denial) => ({
      tool_name: denial.tool_name,
      tool_use_id: denial.tool_use_id,
    })),
  }
}

function cacheCreationMetadata(usage: CallUsage | undefined) {
  if (typeof usage?.cache_creation_input_tokens !== "number") return {}
  return { anthropic: { cacheCreationInputTokens: usage.cache_creation_input_tokens } }
}
