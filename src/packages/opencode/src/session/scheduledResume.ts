import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import type { Session } from "./session"
import type { SessionPrompt } from "./prompt"
import type { SessionStatus } from "./status"
import type { SessionID } from "./schema"

export const DEFAULT_PROMPT = "Usage limit reset. Continue where you left off."
/** Consecutive auto-resumes after which scheduling stops until the user intervenes. */
export const MAX_AUTO_RESUMES = 5
export const RESUME_REASON = "usage-reset"
const POLL_MS = 15_000

export interface Entry {
  id: string
  sessionID: SessionID
  directory: string
  fireAt: number
  reason: string
  createdAt: number
  attempts: number
}

export interface State {
  enabled: boolean
  prompt: string
  entries: Entry[]
  resumeCounts: Record<string, number>
}

export interface RequestInput {
  sessionID: string
  directory: string
  fireAt: number
  reason: string
}

function defaultState(): State {
  return { enabled: false, prompt: DEFAULT_PROMPT, entries: [], resumeCounts: {} }
}

function isEntry(value: unknown): value is Entry {
  const e = value as Record<string, unknown>
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.sessionID === "string" &&
    typeof e.directory === "string" &&
    typeof e.fireAt === "number" &&
    Number.isFinite(e.fireAt) &&
    typeof e.reason === "string" &&
    typeof e.createdAt === "number" &&
    Number.isFinite(e.createdAt) &&
    typeof e.attempts === "number" &&
    Number.isSafeInteger(e.attempts) &&
    e.attempts >= 0
  )
}

function sanitize(raw: unknown): State {
  const base = defaultState()
  if (!raw || typeof raw !== "object") return base
  const r = raw as Record<string, unknown>
  const entries = Array.isArray(r.entries) ? r.entries.filter(isEntry) : []
  const resumeCounts: Record<string, number> = {}
  if (r.resumeCounts && typeof r.resumeCounts === "object") {
    for (const [k, v] of Object.entries(r.resumeCounts as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) resumeCounts[k] = Math.floor(v)
    }
  }
  return {
    enabled: r.enabled === true,
    prompt: typeof r.prompt === "string" && r.prompt ? r.prompt : base.prompt,
    entries,
    resumeCounts,
  }
}

export interface Store {
  readonly getState: () => State
  readonly setEnabled: (enabled: boolean) => State
  readonly setPrompt: (prompt: string) => State
  readonly requestResume: (input: RequestInput, now?: number) => Entry | null
  readonly cancel: (id: string) => boolean
  /** Bookkeeping writes return false when the lock was not acquired; `persist` retries them. */
  readonly retry: (entry: Entry) => boolean
  /** Remove and return entries due at `now`, persisting the remainder first (fire-once claim). */
  readonly takeDue: (now?: number) => Entry[]
  readonly noteFired: (sessionID: string) => boolean
  readonly noteUserIntervened: (sessionID: string) => boolean
}

export function createStore(file: string | null, clock: () => number = Date.now): Store {
  const read = (): State => {
    if (!file) return defaultState()
    try {
      return sanitize(JSON.parse(readFileSync(file, "utf8")))
    } catch {
      return defaultState()
    }
  }
  // Two instances (oc + native opencode share the data dir) can claim the
  // same rows, so every read-modify-write runs under a lockfile. Sync API,
  // so this is a bounded spin, not a queue: a critical section is one small
  // JSON write, and a lock older than STALE_MS is a crashed holder.
  const STALE_MS = 30_000
  const withLock = <T>(action: () => T): T | undefined => {
    if (!file) return action()
    const lock = `${file}.lock`
    mkdirSync(path.dirname(lock), { recursive: true })
    const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
    const sleep = (ms: number) => Atomics.wait(sleepBuf, 0, 0, ms)
    const deadline = Date.now() + 5_000
    for (;;) {
      try {
        writeFileSync(lock, String(process.pid), { flag: "wx" })
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
        try {
          if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { force: true })
        } catch {}
        if (Date.now() >= deadline) {
          // Leave queued entries untouched so the next poll can retry safely.
          return undefined
        }
        sleep(10)
      }
    }
    try {
      return action()
    } finally {
      rmSync(lock, { force: true })
    }
  }
  // Always re-read: two instances share this file, and claiming (takeDue)
  // persists before sending. Mutations run under the lockfile (withLock).
  const write = (state: State): void => {
    if (!file) return
    mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(state), "utf8")
    renameSync(tmp, file)
  }

  const getState = () => read()

  const setEnabled = (enabled: boolean): State =>
    withLock(() => {
      const state = read()
      state.enabled = enabled
      write(state)
      return state
    }) ?? read()

  const setPrompt = (prompt: string): State =>
    withLock(() => {
      const state = read()
      if (prompt) state.prompt = prompt
      write(state)
      return state
    }) ?? read()

  const requestResume = (input: RequestInput, now: number = clock()): Entry | null =>
    withLock(() => {
      const state = read()
      if (!state.enabled) return null
      if (!input.sessionID || !input.directory || !Number.isFinite(input.fireAt)) return null
      if ((state.resumeCounts[input.sessionID] ?? 0) >= MAX_AUTO_RESUMES) return null
      const entry: Entry = {
        id: randomUUID(),
        sessionID: input.sessionID as SessionID,
        directory: input.directory,
        fireAt: input.fireAt,
        reason: input.reason,
        createdAt: now,
        attempts: 0,
      }
      // One entry per session: a newer schedule replaces the older one.
      state.entries = [...state.entries.filter((e) => e.sessionID !== input.sessionID), entry]
      write(state)
      return entry
    }) ?? null

  const cancel = (id: string): boolean =>
    withLock(() => {
      const state = read()
      const entry = state.entries.find((e) => e.id === id)
      if (!entry) return false
      state.entries = state.entries.filter((e) => e.id !== id)
      write(state)
      return true
    }) ?? false

  const takeDue = (now: number = clock()): Entry[] =>
    withLock(() => {
      const state = read()
      const due = state.entries.filter((e) => e.fireAt <= now)
      if (!due.length) return []
      state.entries = state.entries.filter((e) => e.fireAt > now)
      write(state)
      return due
    }) ?? []

  const retry = (entry: Entry): boolean =>
    withLock(() => {
      const state = read()
      if ((state.resumeCounts[entry.sessionID] ?? 0) >= MAX_AUTO_RESUMES) return true
      // Keep a newer schedule if the provider requested one while this entry was firing.
      if (state.entries.some((pending) => pending.sessionID === entry.sessionID)) return true
      state.entries.push({
        ...entry,
        attempts: entry.attempts + 1,
        fireAt: clock() + Math.min(60_000 * 2 ** Math.min(entry.attempts, 6), 3_600_000),
      })
      write(state)
      return true
    }) ?? false

  const noteFired = (sessionID: string): boolean =>
    withLock(() => {
      const state = read()
      state.resumeCounts[sessionID] = (state.resumeCounts[sessionID] ?? 0) + 1
      write(state)
      return true
    }) ?? false

  const noteUserIntervened = (sessionID: string): boolean =>
    withLock(() => {
      const state = read()
      if (!(sessionID in state.resumeCounts)) return true
      delete state.resumeCounts[sessionID]
      write(state)
      return true
    }) ?? false

  return { getState, setEnabled, setPrompt, requestResume, cancel, retry, takeDue, noteFired, noteUserIntervened }
}

const DEFAULT_FILE = process.env.BUN_TEST != null ? null : path.join(Global.Path.data, "scheduledResume.json")

const singleton = createStore(DEFAULT_FILE)

export const store = singleton
export const getState = singleton.getState
export const setEnabled = singleton.setEnabled
export const setPrompt = singleton.setPrompt
/** Plain entry point for the claude-code turn hook: persists without Effect services. The poll loop fires it. */
export const requestResume = singleton.requestResume
export const cancel = singleton.cancel
export const takeDue = singleton.takeDue

export interface FireServices {
  readonly session: Pick<Session.Interface, "get" | "messages">
  readonly status: Pick<SessionStatus.Interface, "get">
  readonly prompt: Pick<SessionPrompt.Interface, "prompt">
  readonly store: Pick<InstanceStore.Interface, "load">
}

// withLock gives up after 5s, but a crashed holder's lock is only cleared after STALE_MS (30s), so
// bookkeeping keeps trying past that instead of silently losing a retry or a cap count.
const persist = (write: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 10 && !write(); attempt++) yield* Effect.sleep("1 second")
  })

const drop = (store: Store, entry: Entry, reason: string) =>
  reason === "user-message" || reason === "session-gone"
    ? persist(() => store.noteUserIntervened(entry.sessionID))
    : Effect.void

/** Fire one claimed entry; retry transient failures without resetting the successful-resume cap. */
export const fireEntry = Effect.fn("ScheduledResume.fireEntry")(function* (
  services: FireServices,
  store: Store,
  entry: Entry,
) {
  const fire = Effect.gen(function* () {
    const info = yield* services.session
      .get(entry.sessionID)
      .pipe(Effect.catchTag("NotFoundError", () => drop(store, entry, "session-gone").pipe(Effect.as(undefined))))
    if (!info) return
    const ctx = yield* services.store.load({ directory: entry.directory || info.directory })
    yield* Effect.gen(function* () {
      const messages = yield* services.session.messages({ sessionID: entry.sessionID })
      const lastUser = messages
        .filter(
          (message) =>
            !message.parts.some((part) => part.type === "text" && part.metadata?.scheduledResumeID === entry.id),
        )
        .map((message) => message.info)
        .findLast((info): info is SessionV1.User => info.role === "user")
      if (lastUser && lastUser.time.created > entry.createdAt) {
        yield* drop(store, entry, "user-message")
        return
      }
      const status = yield* services.status.get(entry.sessionID)
      if (status.type !== "idle") {
        yield* persist(() => store.retry(entry))
        return
      }
      yield* services.prompt.prompt({
        sessionID: entry.sessionID,
        ...(lastUser ? { model: lastUser.model, agent: lastUser.agent } : {}),
        parts: [
          { type: "text", text: store.getState().prompt, synthetic: true, metadata: { scheduledResumeID: entry.id } },
        ],
      })
      yield* persist(() => store.noteFired(entry.sessionID))
    }).pipe(Effect.provideService(InstanceRef, ctx))
  })
  yield* fire.pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        yield* persist(() => store.retry(entry))
        yield* Effect.logWarning("scheduled resume delayed", { sessionID: entry.sessionID, cause: String(cause) })
      }),
    ),
  )
})

/** Drain due entries now, then every POLL_MS. Overdue entries fire once on startup. */
export const pollLoop = (services: FireServices, store: Store) =>
  Effect.gen(function* () {
    const drain = Effect.sync(() => store.takeDue()).pipe(
      Effect.flatMap((due) => Effect.forEach(due, (entry) => fireEntry(services, store, entry), { discard: true })),
      Effect.catch((cause) => Effect.logWarning("scheduled resume drain failed", { cause: String(cause) })),
      Effect.catchDefect((cause) => Effect.logWarning("scheduled resume drain defect", { cause: String(cause) })),
    )
    yield* drain
    yield* Effect.forever(Effect.sleep(POLL_MS).pipe(Effect.andThen(drain)))
  })

export * as ScheduledResume from "./scheduledResume"
