import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { generateId } from "ai"

/** Text and reasoning block bookkeeping over the stream controller. */
export class StreamWriter {
  private textId: string | null = null
  /** oc message Claude read mid-turn; the next output starts oc's reply to it. */
  private readMessageID: string | null = null
  /** Output after Claude read a steer whose receipt is still saving (`hold`); it answers that steer. */
  private held: ({ type: string } & Record<string, unknown>)[] | null = null
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
  hold() {
    if (this.held) return
    this.endText()
    this.held = []
  }

  /** Send held output as it is (no split): the receipt failed or the stream is closing. */
  release() {
    const parts = this.held ?? []
    this.held = null
    for (const part of parts) this.emit(part)
  }

  /**
   * Claude read a message sent mid-turn. Its reply starts at the next output, so several messages
   * read back to back share one reply, answering the newest.
   */
  splitAt(messageID: string) {
    // Held output already started after the read, so its open text stays open.
    if (!this.held) this.endText()
    this.readMessageID = messageID
    this.release()
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
    } catch {}
  }

  private startText() {
    this.endText()
    const id = generateId()
    this.textId = id
    this.enqueue({ type: "text-start", id })
    return id
  }
}
