/**
 * Mirrors a Claude turn's todo list into oc's todo panel. Claude Code runs its
 * own todo tools (TodoWrite, TaskCreate/TaskUpdate); oc's `todowrite` only
 * shows the result, once per turn, provider-executed.
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { generateId } from "ai"
import type { TurnContext } from "./turnContext.js"
import type { StreamWriter } from "./streamWriter.js"
import { readClaudeTaskList } from "./taskList.js"
import { poolConfigDir } from "./accounts.js"
import { getClaudeSessionId } from "./sessionManager.js"
import { hostToolExecutors } from "./shared.js"
import { log } from "./logger.js"

/** oc's `todowrite` as a mirror of Claude Code's own todo tools (TodoWrite, TaskCreate/TaskUpdate). */
export function isTodoMirror(name: string) {
  return name === "todowrite"
}

export class TodoMirror {
  private readonly enabled: boolean
  /** Mirrors run in order (see `mirror`); the turn's finish waits for them. */
  private chain = Promise.resolve()
  private pending = 0
  /** Newest TodoWrite list this turn, mirrored at the turn's end (see `flush`). */
  private held: { id: string; input: unknown } | undefined
  /** Claude used its task tools this turn, so its saved task list is mirrored at the end. */
  private usedTaskTools = false

  constructor(
    private readonly host: {
      out: StreamWriter
      turn: TurnContext
      options: LanguageModelV3CallOptions
      /** The turn's current pool account; it changes on an account switch. */
      account: () => string
      closed: () => boolean
    },
  ) {
    this.enabled = host.options.tools?.some((tool) => tool.name === "todowrite") === true
  }

  /** No mirror is still running. */
  get idle() {
    return this.pending === 0
  }

  /** Settles once every queued mirror has run. */
  get settled() {
    return this.chain
  }

  /** A CLI tool call finished; TaskCreate/TaskUpdate mean the saved task list is mirrored at the end. */
  noteTool(name: string) {
    if (this.enabled && (name === "TaskCreate" || name === "TaskUpdate")) this.usedTaskTools = true
  }

  /** Keep the newest TodoWrite list for `flush`. */
  hold(id: string, input: unknown) {
    if (this.enabled) this.held = { id, input }
  }

  /**
   * Mirror the turn's todo list into oc once, at the end: the newest TodoWrite
   * list, or Claude Code's saved task list when it used TaskCreate/TaskUpdate
   * (one item per call, so the saved list is the only whole one).
   */
  flush() {
    if (!this.enabled) return
    const claudeSessionId = this.usedTaskTools ? getClaudeSessionId(this.host.turn.sessionKey) : undefined
    const saved = claudeSessionId ? readClaudeTaskList(poolConfigDir(this.host.account()), claudeSessionId) : undefined
    const held = this.held ?? (saved ? { id: `todowrite_${generateId()}`, input: saved } : undefined)
    this.held = undefined
    this.usedTaskTools = false
    if (held) this.mirror(held.id, held.input)
  }

  /**
   * Claude Code already ran its own todo tool and has its result; oc's
   * `todowrite` only mirrors the list into the todo panel. It runs here,
   * provider-executed, so oc's agent loop never sends the result back to
   * Claude as a new turn. Mirrors run one at a time so a late one never
   * overwrites a newer list, and a denial never ends the turn.
   */
  private mirror(id: string, input: unknown) {
    const out = this.host.out
    out.enqueue({ type: "tool-input-start", id, toolName: "todowrite", providerExecuted: true })
    out.enqueue({
      type: "tool-call",
      toolCallId: id,
      toolName: "todowrite",
      input: JSON.stringify(input),
      providerExecuted: true,
    })
    const execute = this.host.turn.compactionMode ? undefined : hostToolExecutors.get(this.host.turn.affinity)
    this.pending++
    this.chain = this.chain
      .then(async () => {
        const outcome = execute
          ? await execute("todowrite", input as Record<string, unknown>, id).then(
              (result) => ({ result, isError: result.denied !== undefined }),
              (error) => ({
                result: {
                  output: error instanceof Error ? error.message : String(error),
                  title: "todowrite",
                  metadata: {},
                },
                isError: true,
              }),
            )
          : { result: { output: "", title: "todowrite", metadata: {} }, isError: false }
        if (outcome.isError) log.warn("todo mirror failed", { id, output: outcome.result.output })
        if (this.host.closed()) return
        out.enqueue({
          type: "tool-result",
          toolCallId: id,
          toolName: "todowrite",
          result: {
            output: outcome.result.output,
            title: outcome.result.title ?? "todowrite",
            metadata: outcome.result.metadata ?? {},
          },
          ...(outcome.isError ? { isError: true } : {}),
          providerExecuted: true,
        })
      })
      .finally(() => {
        this.pending--
      })
  }
}
