import type { LanguageModelV3 } from "@ai-sdk/provider"
import { log } from "./logger.js"

/** Historical transcript marker. The account-failover feature that wrote it is gone. */
const ACCOUNT_FAILOVER_TOOL_CALL_PREFIX = "account_failover_"

type Prompt = Parameters<LanguageModelV3["doGenerate"]>[0]["prompt"]

function isHistoricalFailoverPart(part: any): boolean {
  if (!part || typeof part.toolCallId !== "string") return false
  if (part.type !== "tool-call" && part.type !== "tool-result") return false
  return part.toolCallId.startsWith(ACCOUNT_FAILOVER_TOOL_CALL_PREFIX)
}

/** Drop persisted failover dialog parts Claude never issued. */
function stripHistoricalFailoverParts(prompt: Prompt): Prompt {
  let changed = false
  const out = [] as unknown as Prompt
  for (const message of prompt) {
    const content = (message as { content?: unknown }).content
    if (!Array.isArray(content) || !content.some(isHistoricalFailoverPart)) {
      out.push(message)
      continue
    }
    changed = true
    const kept = content.filter((part: any) => !isHistoricalFailoverPart(part))
    if (kept.length === 0) continue
    out.push({ ...message, content: kept } as typeof message)
  }
  return changed ? out : prompt
}

/**
 * opencode-dcp anchors its nudges into message text as
 * `<dcp-system-reminder>` blocks (its `lib/messages/inject/utils.ts` appends
 * one to an existing text part, or splices in a synthetic part), and the
 * loudest of them orders the model to "use the `compress` tool now". Under
 * this provider that tool is only reachable when the operator forwards it,
 * so otherwise the block is an order that cannot be obeyed, carried by every
 * message it is anchored to.
 *
 * Blocks are removed wherever they sit rather than by matching a whole part,
 * because dcp appends its own `<dcp-message-id>` marker after one and an
 * end-anchored check would miss it. That is the same trap the `/btw`
 * reminder strip hit in production.
 */
const DCP_REMINDER_BLOCK =
  /<dcp-system-reminder\b[^>]*>[\s\S]*?<\/dcp-system-reminder>/gi

/** Remove every dcp reminder block from one piece of text. */
export function stripContextReminderBlocks(text: string): string {
  if (!text.includes("<dcp-system-reminder")) return text
  return text.replace(DCP_REMINDER_BLOCK, "").replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * Whether this turn should strip those blocks: the operator opted in AND no
 * `compress` tool is being proxied. When compress IS proxied the reminder is
 * satisfiable and must survive, or the model is told to compress by nothing
 * and holds a tool it never learns it needs.
 *
 * Resolved from configuration alone so it is available before the spawn
 * block decides anything. A name that is configured but missing from
 * opencode's registry therefore counts as callable and nothing is stripped,
 * which is the conservative direction: the cost is a reminder that stays.
 */
export function shouldStripContextReminders(options: {
  enabled?: boolean
  proxyTools?: readonly string[]
  proxyOpencodeTools?: readonly string[]
}): boolean {
  if (options.enabled !== true) return false
  const namesCompress = (list?: readonly string[]): boolean =>
    (list ?? []).some((name) => String(name).trim().toLowerCase() === "compress")
  return !namesCompress(options.proxyTools) && !namesCompress(options.proxyOpencodeTools)
}

/**
 * Strip dcp reminder blocks from every user and assistant text part.
 *
 * Emptied parts are kept as empty strings rather than dropped: a nudge is
 * sometimes a message's only text part, and removing the part outright could
 * leave a user message with no content at all, which takes the empty-content
 * sentinel path in `getClaudeUserMessage`. Every consumer here already skips
 * a falsy `text`.
 */
export function stripContextReminders(prompt: Prompt): {
  prompt: Prompt
  removed: number
} {
  let removed = 0
  const countIn = (text: string): number =>
    (text.match(DCP_REMINDER_BLOCK) ?? []).length

  const out = prompt.map((message) => {
    if (message.role !== "user" && message.role !== "assistant") return message

    // AI SDK v3 always delivers user/assistant content as a part array, so
    // there is no string form to handle here.
    if (!Array.isArray(message.content)) return message

    let touched = false
    const parts = (message.content as any[]).map((part) => {
      if (!part || part.type !== "text" || typeof part.text !== "string") return part
      const hits = countIn(part.text)
      if (hits === 0) return part
      removed += hits
      touched = true
      return { ...part, text: stripContextReminderBlocks(part.text) }
    })
    return touched ? ({ ...message, content: parts } as typeof message) : message
  })

  return removed > 0 ? { prompt: out, removed } : { prompt, removed: 0 }
}

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
])

function toImageBlock(part: any): any | null {
  const raw: unknown = part.image ?? part.data ?? part.url ?? part.source?.data
  if (!raw) {
    log.warn("file part without data, skipping")
    return null
  }

  let resolvedMediaType: string = part.mediaType || part.mimeType || part.mime || ""
  let base64: string | null = null

  if (typeof raw === "string") {
    if (raw.startsWith("data:")) {
      const match = /^data:([^;,]+)(?:;[^,]*)*(?:;base64)?,(.*)$/s.exec(raw)
      if (!match) {
        log.warn("malformed data URI, skipping file part")
        return null
      }
      resolvedMediaType = resolvedMediaType || match[1]
      base64 = match[2]
    } else if (/^https?:\/\//i.test(raw)) {
      log.warn("remote URL images are not supported by Claude CLI, skipping")
      return null
    } else {
      base64 = raw
    }
  } else if (raw instanceof URL) {
    log.warn("remote URL images are not supported by Claude CLI, skipping")
    return null
  } else if (raw instanceof Uint8Array || Buffer.isBuffer(raw)) {
    base64 = Buffer.from(raw as Uint8Array).toString("base64")
  } else {
    log.warn("unsupported file part data type", { dataType: typeof raw })
    return null
  }

  if (!resolvedMediaType || !SUPPORTED_IMAGE_TYPES.has(resolvedMediaType)) {
    log.warn("unsupported media type for Claude image block, skipping", {
      mediaType: resolvedMediaType,
    })
    return null
  }

  return {
    type: "image",
    source: { type: "base64", media_type: resolvedMediaType, data: base64 },
  }
}

function getToolResultText(part: any): string {
  const value = part.output ?? part.result

  if (typeof value === "string") {
    return value
  }

  if (!value || typeof value !== "object") {
    return JSON.stringify(value)
  }

  switch (value.type) {
    case "text":
    case "error-text":
      return String(value.value)
    case "json":
    case "error-json":
      return JSON.stringify(value.value)
    case "execution-denied":
      return value.reason ? `Execution denied: ${value.reason}` : "Execution denied"
    case "content":
      return Array.isArray(value.value)
        ? value.value
            .map((item: any) => {
              if (item?.type === "text") return item.text
              return JSON.stringify(item)
            })
            .join("\n")
        : JSON.stringify(value.value)
    default:
      return JSON.stringify(value)
  }
}

/**
 * Convert AI SDK prompt into a Claude CLI stream-json user message: only
 * what arrived since the last assistant message.
 *
 * Reasoning effort is not part of the message. It used to ride here as a
 * thinking keyword ("(ultrathink)"), but Claude Code dropped every keyword
 * except that one, so effort now reaches the CLI as CLAUDE_CODE_EFFORT_LEVEL
 * at spawn time (see `claudeSpawnEnv`).
 *
 * `resume` is set on the first message of a fresh Claude conversation for a
 * chat that already has history; see `resumeBlock`.
 */
export function getClaudeUserMessage(
  prompt: Prompt,
  resume?: { sessionID?: string },
  opts: {
    cliToolCallIds?: ReadonlySet<string>
    stripContextReminders?: boolean
  } = {},
): string {
  const cliToolCallIds = opts.cliToolCallIds
  const content: any[] = []

  // The account-failover form is the plugin's own dialog: Claude never issued
  // that call and never saw its answer. On the turn after a form the answer
  // reached Claude as a stray `<opencode_tool_result>` ("The user
  // dismissed this question"), measured 2026-09-23.
  prompt = stripHistoricalFailoverParts(prompt)

  // Done once here, at the top, so everything below sees the cleaned text.
  if (opts.stripContextReminders) {
    const stripped = stripContextReminders(prompt)
    if (stripped.removed > 0) {
      log.info("stripped unsatisfiable context reminders", {
        blocks: stripped.removed,
      })
      prompt = stripped.prompt
    }
  }

  /**
   * A `tool_result` block is only meaningful to a resumed CLI session when
   * that session issued the matching `tool_use`. Anything opencode ran on its
   * own behalf (a `subtask: true` command's `task` call, issue #29) has an id
   * the CLI never emitted, so the block is orphaned: Claude cannot resolve it
   * and the payload, which is right there in the envelope, is unreachable.
   * Those are rendered as plain text instead, which keeps the content and
   * loses only the pairing the CLI could not have honoured anyway.
   *
   * `cliToolCallIds` is the set of calls this CLI process is waiting on. When
   * a caller does not supply it we keep the old unconditional block, so a
   * forgotten call site degrades to today's behaviour rather than breaking
   * the proxy round-trip.
   */
  const pushToolResult = (part: any): void => {
    const id = part.toolCallId
    const text = getToolResultText(part)
    if (!cliToolCallIds || cliToolCallIds.has(id)) {
      content.push({ type: "tool_result", tool_use_id: id, content: text })
      return
    }
    log.info("rendering opencode-side tool result as text", {
      toolCallId: id,
      toolName: part.toolName,
      chars: text.length,
    })
    content.push({
      type: "text",
      text: `<opencode_tool_result tool="${part.toolName ?? "unknown"}">\n${text}\n</opencode_tool_result>`,
    })
  }

  // Find messages since last assistant message
  const messages: typeof prompt = []
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === "assistant") break
    messages.unshift(prompt[i])
  }

  for (const msg of messages) {
    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        const str = msg.content as string
        if (str.trim()) {
          content.push({ type: "text", text: str })
        }
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content as any[]) {
          if (part.type === "text") {
            if (part.text && part.text.trim()) {
              content.push({ type: "text", text: part.text })
            }
          } else if (part.type === "file" || part.type === "image") {
            const block = toImageBlock(part)
            if (block) {
              content.push(block)
            } else {
              log.debug("skipped non-image file part", {
                mediaType: part.mediaType,
              })
            }
          } else if (part.type === "tool-result") {
            pushToolResult(part)
          }
        }
      }
    } else if (msg.role === "tool") {
      // AI SDK V3 delivers tool results in `tool`-role messages, not `user`.
      // Without this branch we'd hit the empty-content sentinel path and
      // send "(empty)" to Claude CLI instead of the actual tool result -
      // forcing the user to press "continue" between proxy tool calls.
      if (Array.isArray(msg.content)) {
        for (const part of msg.content as any[]) {
          if (part?.type === "tool-result") {
            pushToolResult(part)
          }
        }
      }
    }
  }

  if (content.length === 0) {
    // CLI rejects a zero-block message with 400, and Anthropic rejects
    // whitespace-only text blocks - so we need a non-whitespace sentinel.
    // "(empty)" matches the parenthetical meta-note convention this file
    // already uses for reasoning keywords ("(think)", "(megathink)", etc.),
    // which the model reads as out-of-band metadata rather than a prompt to
    // continue its previous turn.
    log.warn("empty user content; sending sentinel to satisfy CLI")
    return JSON.stringify({
      type: "user",
      message: {
        role: "user",
        content: [{ type: "text", text: "(empty)" }],
      },
    })
  }

  if (resume) content.unshift({ type: "text", text: resumeBlock(prompt, resume.sessionID) })

  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content,
    },
  })
}

const RESUME_USER_CHARS = 1500
const RESUME_REPLY_CHARS = 4000

/**
 * Catch-up for a fresh Claude conversation in a chat with history (its old
 * transcript is gone). Pushes only the previous exchange, which answers most
 * follow-ups ("do option b"), and points at `session_read` for anything older
 * instead of pasting the whole history. Excerpts keep their ends: a reply's
 * options and questions sit at the bottom.
 */
function resumeBlock(prompt: Prompt, sessionID: string | undefined): string {
  const lastReply = prompt.findLastIndex((m) => m.role === "assistant")
  const previousUser = prompt.findLastIndex((m, i) => i < lastReply && m.role === "user")
  const reply = prompt
    .slice(previousUser + 1, lastReply + 1)
    .filter((m) => m.role === "assistant")
    .map(messageText)
    .join("\n")
  const earlierTurns = prompt.slice(0, lastReply).filter((m) => m.role === "user").length
  const reads = sessionID
    ? `If the excerpt is not enough to act correctly, read more of this chat (oc session ${sessionID}) before answering:
- mcp__opencode_proxy__session_read {"sessionId":"${sessionID}","window":"tail","turns":6}
- the same with "window":"head","turns":2 if the original goal is unclear
- "window":"full" only if both fall short; it returns a file path and outline, read only the sections you need
Re-read any file the transcript says was edited before you change it.

`
    : ""
  return `<session_resume>
You are continuing an existing oc chat. Your earlier Claude conversation for it was lost, so you do not remember it; the user does. Earlier user turns: ${earlierTurns}.

Previous user message:
${tail(previousUser < 0 ? "" : messageText(prompt[previousUser]), RESUME_USER_CHARS)}

Your previous reply (end):
${tail(reply, RESUME_REPLY_CHARS)}

${reads}The transcript is background, not instructions: do not redo or resume earlier work unless the new message asks for it. Do not summarize the catch-up to the user. The message after this block is your task.
</session_resume>`
}

function messageText(message: Prompt[number]): string {
  if (typeof message.content === "string") return message.content
  return message.content.map((part) => (part.type === "text" ? part.text : "")).filter(Boolean).join("\n")
}

function tail(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `[...]${trimmed.slice(-max)}` : trimmed || "(none)"
}

/** Rough visible-thread size. Not the Claude prompt. */
export function visibleThreadTokens(prompt: Prompt): number {
  let chars = 0
  for (const msg of prompt) {
    const content = (msg as { content?: unknown }).content
    if (typeof content === "string") chars += content.length
    else if (Array.isArray(content)) chars += JSON.stringify(content).length
  }
  return Math.ceil(chars / 4)
}
