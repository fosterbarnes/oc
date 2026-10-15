import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { OpencodeToolDef } from "./protocol/descriptors.js"
import { CursorLocalCancellationError } from "./errors.js"
import { CURSOR_COMPACTION_OPTION } from "./shared.js"

// Per-OpenCode-session turn state kept across Runs: the last real tool catalog (and its
// cold-start waiters), history images already sent, and post-compaction rebase markers.

// OpenCode omits tools from compaction calls. Keep the last real catalog per
// session so the new Cursor conversation is still born with tool definitions;
// execution remains disabled for the summary turn itself.
const toolCatalogBySession = new Map<string, OpencodeToolDef[]>()
const sentHistoryImageHashesBySession = new Map<string, Set<string>>()
// A compaction Run uses its own summary-agent system prompt. Its opaque Cursor
// checkpoint must never become the base for the resumed normal agent: doing so
// suppresses OpenCode's compacted prompt/system seed and makes Cursor narrate
// tool use instead of emitting exec requests. Rebase once on the next turn.
const postCompactionRebaseBySession = new Set<string>()
const compactionBoundaryBySession = new Map<string, string>()
export const MAX_TURN_STATE_SESSIONS = 256
const MAX_SENT_HISTORY_IMAGES_PER_SESSION = 256

/**
 * Cold-start race: OpenCode's title/lifecycle Run often arrives with tools=[]
 * before the real agent Run publishes the catalog. Materializing RequestContext
 * with tools=0 and later with the full set changes its bytes, forces a prompt-
 * cache rebuild, and incurs avoidable cost. A valid session-keyed lifecycle Run
 * therefore waits for the first real catalog; cancellation is the only escape.
 */
type ToolCatalogWaiter = {
  resolve: (tools: OpencodeToolDef[]) => void
  cancel: () => void
}

const toolCatalogWaitersBySession = new Map<string, Set<ToolCatalogWaiter>>()

function publishToolCatalogWaiters(sessionKey: string, tools: OpencodeToolDef[]): void {
  const waiters = toolCatalogWaitersBySession.get(sessionKey)
  if (!waiters || waiters.size === 0) return
  toolCatalogWaitersBySession.delete(sessionKey)
  for (const waiter of waiters) waiter.resolve(tools)
}

function waitForSiblingToolCatalog(sessionKey: string, signal?: AbortSignal): Promise<OpencodeToolDef[]> {
  const existing = toolCatalogBySession.get(sessionKey)
  if (existing && existing.length > 0) {
    return Promise.resolve(structuredClone(existing))
  }
  if (signal?.aborted) {
    return Promise.reject(new CursorLocalCancellationError("Cursor tool-catalog wait cancelled"))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let set = toolCatalogWaitersBySession.get(sessionKey)
    const finish = (tools?: OpencodeToolDef[], error?: CursorLocalCancellationError) => {
      if (settled) return
      settled = true
      set?.delete(waiter)
      if (set?.size === 0) toolCatalogWaitersBySession.delete(sessionKey)
      signal?.removeEventListener("abort", onAbort)
      if (error) reject(error)
      else resolve(structuredClone(tools!))
    }
    const onAbort = () => finish(undefined, new CursorLocalCancellationError("Cursor tool-catalog wait cancelled"))
    const waiter: ToolCatalogWaiter = {
      resolve: (tools) => finish(tools),
      cancel: onAbort,
    }

    if (!set) {
      set = new Set()
      toolCatalogWaitersBySession.set(sessionKey, set)
    }
    set.add(waiter)
    signal?.addEventListener("abort", onAbort, { once: true })

    // Re-check after enqueue: a sibling may have published between the initial
    // map lookup and waiter registration.
    const raced = toolCatalogBySession.get(sessionKey)
    if (raced && raced.length > 0) finish(raced)
  })
}

function rememberToolCatalog(sessionKey: string, tools: OpencodeToolDef[]): void {
  toolCatalogBySession.delete(sessionKey)
  toolCatalogBySession.set(sessionKey, structuredClone(tools))
  publishToolCatalogWaiters(sessionKey, tools)
  while (toolCatalogBySession.size > MAX_TURN_STATE_SESSIONS) {
    const oldest = toolCatalogBySession.keys().next().value as string | undefined
    if (!oldest) break
    toolCatalogBySession.delete(oldest)
  }
}

/** Restore the last real catalog solely for lifecycle turns such as compaction. */
export function restoreTurnToolCatalog(sessionKey: string, tools: OpencodeToolDef[]): void {
  if (!sessionKey || tools.length === 0) return
  rememberToolCatalog(sessionKey, tools)
}

export function snapshotToolCatalog(sessionKey: string | undefined): OpencodeToolDef[] {
  if (!sessionKey) return []
  return structuredClone(toolCatalogBySession.get(sessionKey) ?? [])
}

export function rememberPostCompactionRebase(sessionKey: string): void {
  postCompactionRebaseBySession.delete(sessionKey)
  postCompactionRebaseBySession.add(sessionKey)
  while (postCompactionRebaseBySession.size > MAX_TURN_STATE_SESSIONS) {
    const oldest = postCompactionRebaseBySession.values().next().value as string | undefined
    if (!oldest) break
    postCompactionRebaseBySession.delete(oldest)
  }
}

export function sentHistoryImageHashes(sessionKey: string | undefined): ReadonlySet<string> | undefined {
  if (!sessionKey) return undefined
  const hashes = sentHistoryImageHashesBySession.get(sessionKey)
  if (!hashes) return undefined
  sentHistoryImageHashesBySession.delete(sessionKey)
  sentHistoryImageHashesBySession.set(sessionKey, hashes)
  return hashes
}

export function rememberSentHistoryImageHashes(sessionKey: string | undefined, hashes: readonly string[]): void {
  if (!sessionKey || hashes.length === 0) return
  const remembered = sentHistoryImageHashesBySession.get(sessionKey) ?? new Set<string>()
  for (const hash of hashes) {
    remembered.delete(hash)
    remembered.add(hash)
    while (remembered.size > MAX_SENT_HISTORY_IMAGES_PER_SESSION) {
      const oldest = remembered.values().next().value as string | undefined
      if (!oldest) break
      remembered.delete(oldest)
    }
  }
  sentHistoryImageHashesBySession.delete(sessionKey)
  sentHistoryImageHashesBySession.set(sessionKey, remembered)
  while (sentHistoryImageHashesBySession.size > MAX_TURN_STATE_SESSIONS) {
    const oldest = sentHistoryImageHashesBySession.keys().next().value as string | undefined
    if (!oldest) break
    sentHistoryImageHashesBySession.delete(oldest)
  }
}

function toolsInFixedOrder<T extends { name?: string }>(tools: readonly T[]): T[] {
  return tools.map((tool) => ({ ...tool })).sort((left, right) => (left.name ?? "").localeCompare(right.name ?? ""))
}

/** Exported for tests - false for compaction/summary (no tools) and toolChoice none. */
export function computeAllowTools(
  toolCount: number,
  toolChoice: LanguageModelV3CallOptions["toolChoice"] | undefined,
): boolean {
  return toolCount > 0 && toolChoice?.type !== "none"
}

export async function resolveTurnToolState(input: {
  sessionKey?: string
  incomingTools: OpencodeToolDef[]
  toolChoice?: LanguageModelV3CallOptions["toolChoice"]
  isCompaction: boolean
  abortSignal?: AbortSignal
}): Promise<{ advertisedTools: OpencodeToolDef[]; allowTools: boolean }> {
  const { sessionKey, incomingTools, isCompaction } = input
  if (sessionKey && incomingTools.length > 0) {
    rememberToolCatalog(sessionKey, toolsInFixedOrder(incomingTools))
  }

  // Advertisement and permission are deliberately independent.
  //
  // Advertisement must stay byte-stable across every Run of a conversation or
  // the RequestContext changes shape and Cursor's prompt cache goes cold. A
  // zero-tool call is never a smaller catalog - it is a lifecycle turn
  // (compaction, title generation, summarization) that OpenCode opens alongside
  // the real one - so it re-advertises the last real catalog rather than
  // collapsing the context to tools=0. A genuinely restricted turn still sends
  // a non-empty set and is advertised verbatim.
  //
  // On cold start the lifecycle Run may arrive before any catalog exists. For a
  // valid session key, wait until a sibling doStream publishes the first real
  // catalog; cancellation is the only escape. Never time out to tools=[] and
  // never invent or filter the enabled set.
  //
  // Permission is computed from what actually arrived, so those lifecycle turns
  // still refuse execution and cannot duplicate the real turn's side effects.
  let advertisedTools: OpencodeToolDef[]
  if (incomingTools.length > 0) {
    advertisedTools = toolsInFixedOrder(incomingTools)
  } else if (sessionKey) {
    const cached =
      toolCatalogBySession.get(sessionKey) ?? (await waitForSiblingToolCatalog(sessionKey, input.abortSignal))
    advertisedTools = toolsInFixedOrder(cached)
  } else {
    // Without a session key there is no safe sibling-correlation key. Preserve
    // the host's literal no-tool call rather than borrowing another session's
    // catalog.
    advertisedTools = []
  }
  return {
    advertisedTools,
    allowTools: !isCompaction && computeAllowTools(incomingTools.length, input.toolChoice),
  }
}

/** True when OpenCode marked this Run as compaction (nested or flat providerOptions). */
export function isCursorCompactionTurn(providerOptions: unknown): boolean {
  if (!providerOptions || typeof providerOptions !== "object" || Array.isArray(providerOptions)) return false
  const record = providerOptions as Record<string, unknown>
  if (record[CURSOR_COMPACTION_OPTION] === true) return true
  const nested = record.cursor
  return (
    !!nested &&
    typeof nested === "object" &&
    !Array.isArray(nested) &&
    (nested as Record<string, unknown>)[CURSOR_COMPACTION_OPTION] === true
  )
}

export function resolveTurnConversationReset(input: {
  sessionKey?: string
  isCompaction: boolean
  allowTools: boolean
  boundary?: string
}): {
  reset: boolean
  reason?: "compaction" | "post-compaction-rebase"
} {
  const { sessionKey, isCompaction, allowTools } = input
  if (isCompaction) {
    if (sessionKey) rememberPostCompactionRebase(sessionKey)
    return { reset: true, reason: "compaction" }
  }
  // Title and other no-tool Runs must not spend the post-compaction rebase.
  if (!allowTools || !sessionKey) return { reset: false }
  // Another model may have written the summary, so the host boundary id is the
  // only sign of a compaction this provider never saw.
  // ponytail: in-memory, so a restart rebases once per compacted session.
  const newBoundary = !!input.boundary && compactionBoundaryBySession.get(sessionKey) !== input.boundary
  if (input.boundary) {
    compactionBoundaryBySession.delete(sessionKey)
    compactionBoundaryBySession.set(sessionKey, input.boundary)
    if (compactionBoundaryBySession.size > MAX_TURN_STATE_SESSIONS) {
      compactionBoundaryBySession.delete(compactionBoundaryBySession.keys().next().value!)
    }
  }
  if (postCompactionRebaseBySession.delete(sessionKey) || newBoundary) {
    return { reset: true, reason: "post-compaction-rebase" }
  }
  return { reset: false }
}

export function resetTurnStateForTests(): void {
  for (const waiters of toolCatalogWaitersBySession.values()) {
    for (const waiter of waiters) waiter.cancel()
  }
  toolCatalogWaitersBySession.clear()
  toolCatalogBySession.clear()
  postCompactionRebaseBySession.clear()
  compactionBoundaryBySession.clear()
}

/** True while the next tool-allowed Run of this session must rebase after a compaction. */
export function hasPostCompactionRebase(sessionKey: string | undefined): boolean {
  return !!sessionKey && postCompactionRebaseBySession.has(sessionKey)
}
