import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { generateId } from "ai"

/** Text and reasoning block bookkeeping over the stream controller. */
export class StreamWriter {
  private textId: string | null = null
  /** oc message Claude read mid-turn; the next output starts oc's reply to it. */
  private readMessageID: string | null = null
  /**
   * Output after Claude read a steer whose receipt is still saving (`hold`), with one boundary per read
   * steer, so each stretch lands in the reply to the steer read just before it.
   */
  private held: (({ type: string } & Record<string, unknown>) | { readSplit: string; saved: boolean })[] | null = null
  /** Every text and reasoning delta written, in order: what opencode will show. */
  shown = ""

  constructor(private readonly controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>) {}

  enqueue(part: { type: string } & Record<string, unknown>) {
    if ((part.type === "text-delta" || part.type === "reasoning-delta") && typeof part.delta === "string") {
      this.shown += part.delta
    }
    if (this.held) {
      this.held.push(part)
      return
    }
    this.emit(part)
  }

  /**
   * Claude read a message sent mid-turn; its receipt saves before `splitAt`. Output from here on is held
   * so it lands in the reply that answers the message, not the one before it.
   */
  hold(messageID: string) {
    // A text block open at the read belongs to the reply before it.
    this.endText()
    this.held ??= []
    this.held.push({ readSplit: messageID, saved: false })
  }

  /** Send held output as it is (no split): the receipt failed or the stream is closing. */
  release() {
    const parts = this.held ?? []
    this.held = null
    for (const part of parts) if ("type" in part) this.emit(part)
  }

  /**
   * The receipt for a read message saved. Its reply starts at the next output, so several messages
   * read back to back share one reply, answering the newest. Receipts can save in any order: output
   * waits until every earlier read's receipt has saved.
   */
  splitAt(messageID: string) {
    const boundary = this.held?.find((part) => !("type" in part) && part.readSplit === messageID)
    if (!boundary || "type" in boundary) {
      if (!this.held) this.endText()
      this.readMessageID = messageID
      return
    }
    boundary.saved = true
    while (this.held?.length) {
      const head = this.held[0]
      if ("type" in head) this.emit(head)
      else if (head.saved) this.readMessageID = head.readSplit
      else return
      this.held.shift()
    }
    this.held = null
  }

  private emit(part: { type: string } & Record<string, unknown>) {
    if (this.readMessageID && part.type !== "raw") {
      // oc's processor ends its reply here and answers the message in a new one (`SessionProcessor.splitAt`).
      this.controller.enqueue({ type: "raw", rawValue: { claudeCodeInputRead: this.readMessageID } })
      this.readMessageID = null
    }
    this.controller.enqueue(part as LanguageModelV3StreamPart)
  }

  get inText() {
    return this.textId !== null
  }

  /** Continue the open text block, or open one. */
  append(delta: string) {
    this.enqueue({ type: "text-delta", id: this.textId ?? this.startText(), delta })
  }

  /** Write into a fresh text block and leave it open. */
  block(delta: string) {
    this.enqueue({ type: "text-delta", id: this.startText(), delta })
  }

  /** Write a self-contained text block. */
  note(delta: string) {
    this.block(delta)
    this.endText()
  }

  endText() {
    if (!this.textId) return
    this.enqueue({ type: "text-end", id: this.textId })
    this.textId = null
  }

  reasoning(text: string) {
    const id = generateId()
    this.enqueue({ type: "reasoning-start", id })
    this.enqueue({ type: "reasoning-delta", id, delta: text })
    this.enqueue({ type: "reasoning-end", id })
  }

  close() {
    try {
      this.release()
      this.controller.close()
    } catch (error) {
      // Closing twice (abort then the child's close) or after the consumer cancelled throws TypeError.
      if (!(error instanceof TypeError)) throw error
    }
  }

  private startText() {
    this.endText()
    const id = generateId()
    this.textId = id
    this.enqueue({ type: "text-start", id })
    return id
  }
}
