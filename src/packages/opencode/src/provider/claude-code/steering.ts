/**
 * Messages the operator sends while a Claude turn runs (steers). The turn's
 * sink admits them and holds them (still retractable) until Claude's next tool
 * call, writes them to the CLI's stdin then, and acknowledges them once Claude
 * reads them.
 */
import { randomUUID } from "node:crypto"
import type { ClaudeStreamMessage } from "./types.js"
import type { TurnContext } from "./turnContext.js"
import { deleteActiveProcessAndWait, markClaudeSessionLost, type ActiveProcess } from "./sessionManager.js"
import type { ClaudeSteer, ClaudeSteerSink } from "./shared.js"
import { log } from "./logger.js"

export type SteeringHost = {
  turn: TurnContext
  closed: () => boolean
  /** Closed, cancelled, aborted, or ended by a tool denial. */
  stopped: () => boolean
  /** An account switch is pending; the rejected turn's tail takes no steers. */
  switching: () => boolean
  activeProcess: () => ActiveProcess | undefined
  write: (line: string) => void
  /** Claude read a steer; output from here waits for its `read` or `receiptFailed`. */
  hold: (messageID: string) => void
  /** Claude read a steer and its delivery receipt is saved. */
  read: (messageID: string) => void
  /** Claude read a steer whose delivery receipt could not be saved. */
  receiptFailed: (error: unknown) => void
}

export class Steering {
  /** Steers not yet written to stdin; still retractable. */
  private held: ClaudeSteer[] = []
  /** Messages the operator sent mid-turn, written to stdin and not yet echoed back as read. */
  private readonly written: (ClaudeSteer & { uuid: string; read: boolean })[] = []
  // Keep ownership even after the receipt saves, and across a child replacement.
  private readonly writtenIds = new Set<string>()
  /** Messages this turn cannot take; it ends at its next tool boundary so oc's loop runs them. */
  private preempts: string[] = []
  /** Bumped by `clear()`, so a failed retract that started before it does not restore a cleared steer. */
  private cleared = 0
  private _retired = false
  /** oc recording that Claude read a steer; the finish waits so oc's loop never sends it again. */
  readonly acks = new Set<Promise<void>>()
  readonly sink: ClaudeSteerSink = {
    steer: (steer) => this.admit(steer),
    preempt: (messageID) => this.preempt(messageID),
    retract: (messageID, remove) => this.retract(messageID, remove),
  }

  constructor(private readonly host: SteeringHost) {}

  /** The child was retired for unread steers; its remaining output is ignored. */
  get retired() {
    return this._retired
  }

  get hasUnread() {
    return this.written.some((steer) => !steer.read)
  }

  // Read is not answered: a steer the CLI echoes after its `result` (while the finish waits on
  // todowrite) is running as the CLI's next turn. Cleared at each `result`.
  private readAfterResult = false

  /** The CLI still owes a turn for a steer: unread, or read after its last `result`. */
  get owesTurn() {
    return this.hasUnread || this.readAfterResult
  }

  /** The CLI ended a turn; steers it read before this were answered in it. */
  noteResult() {
    this.readAfterResult = false
  }

  get preempting() {
    return this.preempts[0]
  }

  unreadIds() {
    return this.written.filter((steer) => !steer.read).map((steer) => steer.messageID)
  }

  /** Unread steers died with the replaced child; held ones still go out at the next tool boundary. */
  forgetWritten() {
    this.written.length = 0
    this.readAfterResult = false
  }

  /** The turn restarts on another account; oc's loop sends every unread steer after it. Preempts stay. */
  clear() {
    this.cleared++
    this.written.length = 0
    this.held = []
    this.readAfterResult = false
  }

  /**
   * A message the operator sent while this turn runs. The CLI only hands
   * stdin messages to Claude at a tool boundary, so it is held until there
   * is one: written when Claude calls a CLI-run tool, just before a proxied
   * tool's result, or at the turn's `result`, where the CLI runs it as its
   * next turn (`completeResult` waits). Until then it can still be deleted.
   */
  private admit(steer: ClaudeSteer) {
    if (this.host.stopped() || this.host.switching()) return false
    if (steer.modelID !== this.host.turn.modelId || steer.agent !== this.host.turn.agent) return false
    // Never overtake a message waiting to run as its own step.
    if (this.preempts.length > 0) return false
    this.held.push(steer)
    log.info("accepted steered message", { messageID: steer.messageID })
    return true
  }

  private preempt(messageID: string) {
    if (this.host.stopped() || this.host.switching()) return false
    this.preempts.push(messageID)
    log.info("accepted preempting message", { messageID })
    return true
  }

  private async retract(messageID: string, remove: () => Promise<void>) {
    if (this.host.stopped()) return false
    if (this.writtenIds.has(messageID)) return false
    const index = this.held.findIndex((steer) => steer.messageID === messageID)
    const held = this.held[index]
    if (!held && !this.preempts.includes(messageID)) return false
    this.held = this.held.filter((steer) => steer.messageID !== messageID)
    this.preempts = this.preempts.filter((id) => id !== messageID)
    const cleared = this.cleared
    // The result cannot release oc's next step while its history still contains the removed steer.
    const removal = remove().catch((error) => {
      // An account switch cleared the queues meanwhile; oc's loop resends the still-saved steer after it.
      if (!this.host.closed() && this.cleared === cleared) {
        // Back in its place, so it still goes before steers sent after it.
        if (held) this.held.splice(Math.min(index, this.held.length), 0, held)
        else this.preempts.push(messageID)
      }
      throw error
    })
    this.acks.add(removal)
    try {
      await removal
    } finally {
      this.acks.delete(removal)
    }
    return true
  }

  /** Writes held steers to stdin; true when it wrote any. */
  flush() {
    if (this.host.stopped() || this.host.switching()) return false
    const wrote = this.held.length > 0
    for (const steer of this.held) {
      const uuid = randomUUID()
      this.writtenIds.add(steer.messageID)
      this.written.push({ ...steer, uuid, read: false })
      this.host.write(
        JSON.stringify({
          type: "user",
          uuid,
          message: { role: "user", content: [{ type: "text", text: steer.text }] },
        }) + "\n",
      )
      log.info("steered user message into running turn", {
        sessionKey: this.host.turn.sessionKey,
        textLength: steer.text.length,
      })
    }
    this.held = []
    return wrote
  }

  /** The CLI read a stdin message. Other echoes (this turn's own envelope, nudges) need nothing. */
  onReplay(msg: ClaudeStreamMessage) {
    const steer = this.written.find((steer) => steer.uuid === msg.uuid && !steer.read)
    if (!steer) return
    steer.read = true
    this.readAfterResult = true
    log.info("claude consumed steered message", { messageID: steer.messageID, uuid: steer.uuid })
    // Synchronous, before the receipt saves: Claude's answer may already be streaming.
    this.host.hold(steer.messageID)
    const ack = steer.delivered().then(
      () => this.host.read(steer.messageID),
      (error) => this.host.receiptFailed(error),
    )
    this.acks.add(ack)
    void ack.then(() => this.acks.delete(ack))
  }

  /** Interrupt only stops the active CLI turn, not stdin messages queued behind it. */
  retire(reason: string) {
    const ap = this.host.activeProcess()
    if (this._retired || !ap) return
    this._retired = true
    ap.turnAbandoned = true
    ap.wakeTarget = undefined
    // Retire synchronously before a proxy rejection can release the CLI's next turn.
    void deleteActiveProcessAndWait(this.host.turn.sessionKey, { forceKill: true }).catch((error) =>
      log.error("failed to retire Claude process", { error: String(error) }),
    )
    markClaudeSessionLost(this.host.turn.sessionKey, reason)
  }
}
