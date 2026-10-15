import type { LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { generateId } from "ai"

/** Text and reasoning block bookkeeping over the stream controller. */
export class StreamWriter {
  private textId: string | null = null
  /** Every text and reasoning delta written, in order: what opencode will show. */
  shown = ""

  constructor(private readonly controller: ReadableStreamDefaultController<LanguageModelV3StreamPart>) {}

  enqueue(part: { type: string } & Record<string, unknown>) {
    if ((part.type === "text-delta" || part.type === "reasoning-delta") && typeof part.delta === "string") {
      this.shown += part.delta
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
