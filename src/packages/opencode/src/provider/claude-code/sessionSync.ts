/**
 * Keeps one opencode chat and its Claude Code conversation in step without
 * ever pasting opencode history into the CLI.
 *
 * - A lost conversation (crash, missing transcript, cap, no record) is only
 *   replaced after the operator confirms it in the TUI.
 * - When opencode's history no longer ends where the CLI's does (a revert),
 *   the CLI is rewound to the last exchange both still share and only the new
 *   message is sent.
 *
 * Exchanges are compared by position and hash: everything one user message
 * produced, as opencode shows it (text and reasoning), against what this
 * provider emitted for that exchange. The position keeps two identical replies
 * ("Noted.") apart, so a reverted one is still seen as gone. A mismatch never
 * rewinds unless opencode's latest exchange equals an older one the CLI recorded.
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { TurnContext } from "./turnContext.js"
import { log } from "./logger.js"
import { rawOpencodeClient, showToast } from "./runtimeStatus.js"
import { getPendingProxyCalls } from "./proxyBroker.js"
import {
  deleteActiveProcessAndWait,
  deleteClaudeSessionId,
  describeSessionKey,
  getClaudeSessionId,
  getSessionAnchors,
  isPendingFork,
  markClaudeSessionLost,
  MAX_CLAUDE_SESSION_ENTRIES,
  rewindClaudeSession,
  takeClaudeSessionLoss,
  takeSessionDirectoryMove,
} from "./sessionManager.js"

type Prompt = LanguageModelV3CallOptions["prompt"]

const NO_RECORD_REASON = "opencode has no Claude conversation on record for this chat"
const START_FRESH = "Start fresh"

/** Per session key: finished exchanges before the one in progress, and the text this provider
 *  emitted for it. LRU like the conversation records; an exchange idle through 64 newer ones
 *  only loses its rewind anchor hash. */
const exchanges = new Map<string, { position: number; text: string }>()

function rememberExchange(key: string, exchange: { position: number; text: string }) {
  exchanges.delete(key)
  exchanges.set(key, exchange)
  if (exchanges.size > MAX_CLAUDE_SESSION_ENTRIES) exchanges.delete(exchanges.keys().next().value!)
}

export function appendExchangeText(key: string, text: string): void {
  if (!text) return
  const current = exchanges.get(key)
  rememberExchange(key, { position: current?.position ?? 0, text: (current?.text ?? "") + text })
}

export function currentExchangeHash(key: string): string {
  const exchange = exchanges.get(key)
  return exchangeHash(exchange?.position ?? 0, exchange?.text ?? "")
}

/** A deleted session never resumes, so its exchanges go with it. */
export function forgetSessionExchanges(sessionID: string): void {
  for (const key of [...exchanges.keys()]) {
    if (describeSessionKey(key).session === sessionID) exchanges.delete(key)
  }
}

/**
 * Run before a non-compaction turn spawns or reuses a process. Returns a
 * notice for the turn's transcript, or throws when the operator declined a
 * fresh conversation.
 */
export async function syncClaudeSession(input: {
  turn: TurnContext
  prompt: Prompt
  hasPriorConversation: boolean
  /** Pool account label when this chat's conversation was retired for another account. */
  accountSwitch?: string
  abortSignal?: AbortSignal
}): Promise<string | undefined> {
  const key = input.turn.sessionKey
  const newExchange = input.prompt.at(-1)?.role === "user"
  if (newExchange) rememberExchange(key, { position: promptExchangeHashes(input.prompt).length, text: "" })
  const loss = takeClaudeSessionLoss(key)
  if (!getClaudeSessionId(key)) {
    if (takeSessionDirectoryMove(input.turn.affinity, input.turn.cwd)) {
      return "> **Working directory changed:** started Claude Code in the session's new directory with the last exchange. Earlier turns remain in oc history.\n"
    }
    if (!input.hasPriorConversation) return undefined
    // Moving to another pool account is intended, so nothing to confirm.
    if (input.accountSwitch) {
      return `> **Claude account switched:** this chat now runs on ${input.accountSwitch}. Started a new Claude conversation there; it was given the last exchange and can read earlier turns.
`
    }
    return confirmFreshConversation(input.turn, loss ?? NO_RECORD_REASON, input.abortSignal)
  }
  if (!newExchange || getPendingProxyCalls(key).length > 0) return undefined
  return rewindOnDrift(input.turn, input.prompt, input.abortSignal)
}

async function rewindOnDrift(turn: TurnContext, prompt: Prompt, abortSignal?: AbortSignal) {
  const key = turn.sessionKey
  const anchors = getSessionAnchors(key)
  const latest = promptExchangeHashes(prompt).at(-1)
  const newest = anchors.at(-1)
  if (!latest || !newest || latest === newest.hash) return undefined
  const target = anchors.findLast((anchor) => anchor.hash === latest)
  if (!target) {
    // Resuming would bring along turns the fork dropped, so it starts fresh instead.
    if (isPendingFork(key)) {
      deleteClaudeSessionId(key)
      return "> **New Claude conversation:** this fork starts earlier than Claude Code can be rewound to, so it was given the last exchange and can read earlier turns.\n"
    }
    log.info("opencode history differs from the claude conversation; no shared exchange to rewind to", {
      sessionKey: key,
      anchors: anchors.length,
    })
    return undefined
  }
  await deleteActiveProcessAndWait(key)
  if (!getClaudeSessionId(key)) {
    return confirmFreshConversation(turn, takeClaudeSessionLoss(key) ?? NO_RECORD_REASON, abortSignal)
  }
  rewindClaudeSession(key, target)
  log.notice("rewinding claude conversation to the last exchange opencode still shows", {
    sessionKey: key,
    uuid: target.uuid,
    dropped: anchors.length - 1 - anchors.indexOf(target),
  })
  showToast("Claude conversation was out of sync with this chat and was rewound.", "info")
  return "> **Claude conversation rewound:** it did not match this chat's history, so Claude Code was rewound to the last exchange both share. Only your new message was sent.\n"
}

async function confirmFreshConversation(turn: TurnContext, reason: string, abortSignal?: AbortSignal) {
  const notice = `> **Claude conversation lost:** ${reason}. Started a new Claude conversation; it was given the last exchange and can read earlier turns.\n`
  const answer = await askFreshConversation(turn, reason, abortSignal)
  if (answer === false) {
    // Keep the loss so the next attempt asks again.
    markClaudeSessionLost(turn.sessionKey, reason)
    throw new Error(`Claude conversation lost: ${reason}. Nothing was sent; send again to choose.`)
  }
  if (answer === undefined) {
    // notice, not warn: warn would raise a second toast next to this one.
    log.notice("cannot ask before starting a fresh claude conversation", { sessionKey: turn.sessionKey, reason })
    showToast(`Claude conversation lost: ${reason}. Started a new one.`, "warning")
  }
  return notice
}

/** True to start fresh, false when declined, undefined when no one can be asked. */
async function askFreshConversation(turn: TurnContext, reason: string, abortSignal?: AbortSignal) {
  const client = rawOpencodeClient()
  if (!client || turn.affinity === "default") return undefined
  // The shared client is bound to whichever instance booted last; the TUI
  // replies to the session's own instance, so the question must live there.
  const response = await client.post({
    url: `/question/ask?directory=${encodeURIComponent(turn.cwd)}`,
    body: {
      sessionID: turn.affinity,
      questions: [
        {
          header: "Claude session lost",
          question: `The Claude Code conversation for this chat is gone: ${reason}. Start a new Claude conversation? It gets this chat's last exchange and can read earlier turns, but loses its own working memory.`,
          options: [
            { label: START_FRESH, description: "Send this message to a new Claude conversation" },
            { label: "Cancel", description: "Send nothing and keep asking on the next message" },
          ],
          custom: false,
        },
      ],
    },
    signal: abortSignal,
  })
  if (response.error !== undefined) {
    log.warn("question ask failed", { error: String(response.error) })
    return undefined
  }
  const answers = response.data as string[][] | null | undefined
  return answers?.[0]?.[0] === START_FRESH
}

/**
 * Exchange hashes for the history before the new message: all assistant
 * text and reasoning between consecutive user messages.
 */
function promptExchangeHashes(prompt: Prompt): string[] {
  const exchanges: string[] = []
  let current: string | undefined
  for (const message of prompt) {
    if (message.role === "user") {
      if (current !== undefined) exchanges.push(exchangeHash(exchanges.length, current))
      current = undefined
      continue
    }
    if (message.role !== "assistant") continue
    current = (current ?? "") + message.content.map((part) => ("text" in part ? part.text : "")).join("")
  }
  if (current !== undefined) exchanges.push(exchangeHash(exchanges.length, current))
  return exchanges
}

// Whitespace is dropped: opencode may trim part text it stores.
function exchangeHash(position: number, text: string): string {
  return `${position}:${Bun.hash(text.replace(/\s+/g, "")).toString(36)}`
}
