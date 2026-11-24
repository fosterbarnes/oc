import { randomUUID } from "node:crypto"
import {
  copyFileSync,
  constants,
  existsSync,
  linkSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect } from "effect"
import { InstanceRef } from "@/effect/instance-ref"
import { InstanceStore } from "@/project/instance-store"
import type { Session } from "./session"
import type { SessionPrompt } from "./prompt"
import type { SessionStatus } from "./status"
import { MessageID, type SessionID } from "./schema"
import { ScheduledDelivery } from "./scheduledDelivery"

export const DEFAULT_PROMPT = "Usage limit reset. Continue where you left off."
/** Consecutive auto-resumes after which scheduling stops until the user intervenes. */
export const MAX_AUTO_RESUMES = 5
export const RESUME_REASON = "usage-reset"
const wakes = new Map<string | null, ReturnType<typeof ScheduledDelivery.makeWake>>()

export interface Entry {
  id: string
  sessionID: SessionID
  directory: string
  fireAt: number
  reason: string
  createdAt: number
  attempts: number
  claim?: ScheduledDelivery.Claim
  messageID?: MessageID
}

export interface State {
  enabled: boolean
  prompt: string
  entries: Entry[]
  resumeCounts: Record<string, number>
  delivered: Record<string, string[]>
  /** Cancel markers already applied whose files may still exist (see createStore). */
  consumedCancels?: string[]
}

export interface RequestInput {
  sessionID: string
  directory: string
  fireAt: number
  reason: string
}

function defaultState(): State {
  return { enabled: false, prompt: DEFAULT_PROMPT, entries: [], resumeCounts: {}, delivered: {} }
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
    e.attempts >= 0 &&
    (e.claim === undefined || ScheduledDelivery.claim(e.claim) !== undefined) &&
    (e.messageID === undefined || (typeof e.messageID === "string" && e.messageID.startsWith("msg")))
  )
}

function sanitize(raw: unknown): State {
  const base = defaultState()
  if (!raw || typeof raw !== "object") throw new Error("Invalid scheduled resume state")
  const r = raw as Record<string, unknown>
  if (
    typeof r.enabled !== "boolean" ||
    typeof r.prompt !== "string" ||
    !Array.isArray(r.entries) ||
    !r.entries.every(isEntry) ||
    !r.resumeCounts ||
    typeof r.resumeCounts !== "object"
  ) {
    throw new Error("Invalid scheduled resume state")
  }
  const entries = r.entries
  if (r.delivered !== undefined && (!r.delivered || typeof r.delivered !== "object" || Array.isArray(r.delivered))) {
    throw new Error("Invalid scheduled resume receipts")
  }
  const resumeCounts: Record<string, number> = {}
  if (r.resumeCounts && typeof r.resumeCounts === "object") {
    for (const [k, v] of Object.entries(r.resumeCounts as Record<string, unknown>)) {
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw new Error("Invalid scheduled resume count")
      if (v > 0) resumeCounts[k] = v
    }
  }
  return {
    enabled: r.enabled === true,
    prompt: typeof r.prompt === "string" && r.prompt ? r.prompt : base.prompt,
    entries,
    resumeCounts,
    delivered: Object.fromEntries(
      Object.entries(r.delivered ?? {}).map(([key, value]) => {
        if (!Array.isArray(value) || !value.every((id) => typeof id === "string")) {
          throw new Error("Invalid scheduled resume receipts")
        }
        return [key, value.slice(-50)]
      }),
    ),
    ...(r.consumedCancels === undefined ? {} : { consumedCancels: cancelNames(r.consumedCancels) }),
  }
}

function cancelNames(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((name) => typeof name === "string")) {
    throw new Error("Invalid scheduled resume cancels")
  }
  return value
}

export interface Store {
  readonly getState: () => State
  readonly setEnabled: (enabled: boolean) => State
  readonly setPrompt: (prompt: string) => State
  readonly requestResume: (input: RequestInput, now?: number) => Entry | null
  readonly cancel: (id: string) => boolean
  readonly cancelSession: (sessionID: string) => boolean
  /** Bookkeeping writes return false when the lock was not acquired; `persist` retries them. */
  readonly retry: (entry: Entry) => boolean
  /** Persist an owned claim before returning due entries. */
  readonly takeDue: (now?: number) => Promise<Entry[]>
  readonly noteFired: (sessionID: string, deliveryID: string) => boolean
  readonly noteUserIntervened: (sessionID: string) => boolean
  readonly owns: (entry: Entry) => boolean
  readonly wake: ReturnType<typeof ScheduledDelivery.makeWake>
}

const readdirSafe = (dir: string) => {
  try {
    return readdirSync(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}
const cancelSessionOf = (marker: string) => marker.slice(0, marker.lastIndexOf("."))

export function createStore(file: string | null, clock: () => number = Date.now): Store {
  const wake = wakes.get(file) ?? ScheduledDelivery.makeWake()
  wakes.set(file, wake)
  const owner = ScheduledDelivery.ownerOnce()
  let identity: Awaited<ReturnType<typeof ScheduledDelivery.owner>> | undefined
  // Cancels that timed out on the lock, as `<sessionID>.<uuid>` markers. They are files beside the state
  // so the other instance sharing it (oc + native) honors them too; takeDue applies them under its lock,
  // and owns() refuses a claimed entry while one is pending. A unique name per cancel means consuming
  // the markers a transaction saw can never erase a cancel published after it. The state write that applies
  // markers also lists them in `consumedCancels`, so a crash before their files are deleted cannot apply
  // them again later (and drop a newer schedule); the list keeps only names whose files still exist.
  const cancelDir = file ? `${file}.cancel` : undefined
  const memoryCancels = new Set<string>()
  const markerNames = () => [...(cancelDir ? readdirSafe(cancelDir) : []), ...memoryCancels]
  const pendingCancels = (state: State, sessionID?: string) =>
    markerNames().filter(
      (name) =>
        !state.consumedCancels?.includes(name) && (sessionID === undefined || cancelSessionOf(name) === sessionID),
    )
  /**
   * Call before the state write that applies `names`. Returns every applied marker whose file still exists
   * (earlier ones whose delete failed included) for consumeCancels to delete after the write.
   */
  const recordConsumed = (state: State, names: string[]) => {
    const live = new Set(markerNames())
    const kept = (state.consumedCancels ?? []).filter((name) => live.has(name))
    state.consumedCancels = [...kept, ...names]
    return state.consumedCancels
  }
  const addCancel = (sessionID: string) => {
    const name = `${sessionID}.${randomUUID()}`
    if (cancelDir) {
      try {
        mkdirSync(cancelDir, { recursive: true })
        writeFileSync(path.join(cancelDir, name), "")
        return
      } catch {
        // Session cancel calls this and must still stop the run; this instance keeps the cancel in memory.
      }
    }
    memoryCancels.add(name)
  }
  const consumeCancels = (names: string[]) => {
    for (const name of names) {
      memoryCancels.delete(name)
      try {
        if (cancelDir) rmSync(path.join(cancelDir, name), { force: true })
      } catch {
        // Session cancel reaches this; a locked marker (Windows) is retried by the next consumer.
      }
    }
  }
  const read = (): State => {
    if (!file) return defaultState()
    try {
      return sanitize(JSON.parse(readFileSync(file, "utf8")))
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return defaultState()
      if (
        !(cause instanceof SyntaxError) &&
        !(cause instanceof Error && cause.message.startsWith("Invalid scheduled resume"))
      )
        throw cause
      // Every read of a broken file lands here. A later, different corruption gets its own copy (named by
      // content, so repeated reads of it make one) instead of claiming the first one's.
      const corrupt = readFileSync(file)
      const first = `${file}.corrupt`
      const backup =
        existsSync(first) && !readFileSync(first).equals(corrupt)
          ? `${file}.corrupt.${Bun.hash(corrupt).toString(16)}`
          : first
      try {
        copyFileSync(file, backup, constants.COPYFILE_EXCL)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
      throw new Error(`Corrupt scheduled resume state preserved at ${backup}`, { cause })
    }
  }
  // Two instances (oc + native opencode share the data dir) can claim the
  // same rows, so every read-modify-write runs under a lockfile. Sync API,
  // so this is a bounded spin, not a queue: a critical section is one small
  // JSON write, and a lock older than STALE_MS is a crashed holder.
  const STALE_MS = 30_000
  // Lock content is "pid:token"; the token tells this holder's lock from a later one at the same path.
  const readLock = (lock: string) => {
    try {
      return readFileSync(lock, "utf8")
    } catch {
      return undefined
    }
  }
  const holderGone = (content: string) => {
    const pid = Number.parseInt(content, 10)
    if (!pid) return false
    try {
      process.kill(pid, 0)
      return false
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ESRCH"
    }
  }
  const withLock = <T>(action: () => T): T | undefined => {
    if (!file) return action()
    const lock = `${file}.lock`
    mkdirSync(path.dirname(lock), { recursive: true })
    const sleepBuf = new Int32Array(new SharedArrayBuffer(4))
    const sleep = (ms: number) => Atomics.wait(sleepBuf, 0, 0, ms)
    const deadline = Date.now() + 5_000
    const token = `${process.pid}:${randomUUID()}`
    for (;;) {
      try {
        writeFileSync(lock, token, { flag: "wx" })
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err
        const seen = readLock(lock)
        const aside = `${lock}.${token.replace(":", "-")}.stale`
        try {
          // The 5 s wait below is shorter than STALE_MS, so a crashed holder is also detected by its pid.
          // Rename is atomic, so only one waiter takes the stale lock; if another holder replaced it after
          // `seen` was read, that live lock is put back instead of deleted.
          if (seen !== undefined && (Date.now() - statSync(lock).mtimeMs > STALE_MS || holderGone(seen))) {
            renameSync(lock, aside)
            if (readLock(aside) !== seen) linkSync(aside, lock)
          }
        } catch {}
        rmSync(aside, { force: true })
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
      // A holder judged stale may have lost the lock to another process; never delete theirs.
      if (readLock(lock) === token) rmSync(lock, { force: true })
    }
  }
  // Always re-read: two instances share this file, and claiming (takeDue)
  // persists before sending. Mutations run under the lockfile (withLock).
  const write = (state: State): void => {
    if (!file) return
    mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    try {
      writeFileSync(tmp, JSON.stringify(state), "utf8")
      renameSync(tmp, file)
    } catch (error) {
      // Later processes have other pids and would never reuse or remove this one.
      try {
        rmSync(tmp, { force: true })
      } catch {
        // Keep the write's own error; a locked tmp (Windows) is only left behind.
      }
      throw error
    }
    wake.notify()
  }

  const getState = () => read()

  const setEnabled = (enabled: boolean): State =>
    withLock(() => {
      const state = read()
      state.enabled = enabled
      // Off means stop waiting: queued wakes would still fire if they stayed on disk.
      if (!enabled) state.entries = []
      write(state)
      return state
    }) ??
    (() => {
      throw new Error("Scheduled resume lock timeout")
    })()

  const setPrompt = (prompt: string): State =>
    withLock(() => {
      const state = read()
      if (prompt) state.prompt = prompt
      write(state)
      return state
    }) ??
    (() => {
      throw new Error("Scheduled resume lock timeout")
    })()

  const requestResume = (input: RequestInput, now: number = clock()): Entry | null => {
    const result = withLock((): Entry | null => {
      const state = read()
      if (!state.enabled) return null
      if (!input.sessionID || !input.directory || !Number.isFinite(input.fireAt)) return null
      // A cancel still waiting for takeDue applies first, so this newer schedule survives it.
      const pending = pendingCancels(state, input.sessionID)
      if (pending.length) dropSession(state, input.sessionID)
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
      const applied = recordConsumed(state, pending)
      write(state)
      consumeCancels(applied)
      return entry
    })
    // A crashed holder keeps the lock up to STALE_MS; the caller logs the lost schedule.
    if (result === undefined) throw new Error("Scheduled resume lock timeout")
    return result
  }

  const cancel = (id: string): boolean =>
    withLock(() => {
      const state = read()
      const entry = state.entries.find((e) => e.id === id)
      if (!entry) return false
      state.entries = state.entries.filter((e) => e.id !== id)
      write(state)
      return true
    }) ?? false

  const dropSession = (state: State, sessionID: string) => {
    const next = state.entries.filter((entry) => entry.sessionID !== sessionID)
    const counted = sessionID in state.resumeCounts
    if (next.length === state.entries.length && !counted) return false
    state.entries = next
    delete state.resumeCounts[sessionID]
    return true
  }

  const cancelSession = (sessionID: string): boolean => {
    const done = withLock(() => {
      const state = read()
      const pending = pendingCancels(state, sessionID)
      const dropped = dropSession(state, sessionID)
      if (dropped || pending.length) {
        const applied = recordConsumed(state, pending)
        write(state)
        consumeCancels(applied)
      }
      return dropped
    })
    if (done === undefined) addCancel(sessionID)
    return done ?? false
  }

  const takeDue = async (now: number = clock()): Promise<Entry[]> => {
    if (!read().enabled) {
      withLock(() => {
        const state = read()
        if (state.enabled) return
        // Cancels still apply their count reset, and their markers must not pile up while disabled.
        const pending = pendingCancels(state)
        const dropped = pending.filter((marker) => dropSession(state, cancelSessionOf(marker))).length
        if (!dropped && !pending.length && state.entries.length === 0) return
        state.entries = []
        const applied = recordConsumed(state, pending)
        write(state)
        consumeCancels(applied)
      })
      return []
    }
    const observed = read().entries
    const resolved = await Effect.runPromise(owner)
    identity = resolved
    const expired = await Promise.all(
      observed.map(async (entry) => {
        const claim = entry.claim
        if (!claim || entry.fireAt > now || !(await ScheduledDelivery.expired(claim, now))) return
        return { id: entry.id, claim }
      }),
    )
    return (
      withLock(() => {
        const state = read()
        const pending = pendingCancels(state)
        pending.forEach((marker) => dropSession(state, cancelSessionOf(marker)))
        // Deletes only after the write: a failed write leaves the cancels for the next poll.
        if (pending.length) {
          const applied = recordConsumed(state, pending)
          write(state)
          consumeCancels(applied)
        }
        // A liveness result cannot evict a claim replaced while the OS query was in flight.
        const due = state.entries.filter(
          (entry) =>
            entry.fireAt <= now &&
            (!entry.claim ||
              now - entry.claim.at >= ScheduledDelivery.CLAIM_MS ||
              expired.some(
                (checked) =>
                  checked?.id === entry.id &&
                  checked.claim?.owner === entry.claim?.owner &&
                  checked.claim?.at === entry.claim?.at,
              )),
        )
        if (!due.length) return []
        for (const entry of due) {
          entry.claim = { ...resolved, at: now }
          entry.messageID ??= MessageID.ascending()
        }
        write(state)
        return due
      }) ?? []
    )
  }

  const retry = (entry: Entry): boolean =>
    withLock(() => {
      const state = read()
      if ((state.resumeCounts[entry.sessionID] ?? 0) >= MAX_AUTO_RESUMES) return true
      // Keep a newer schedule if the provider requested one while this entry was firing.
      const current = state.entries.find((pending) => pending.id === entry.id)
      if (!current || current.claim?.owner !== identity?.owner || current.claim?.at !== entry.claim?.at) return true
      const { claim, ...pending } = current
      state.entries = state.entries.map((item) =>
        item.id !== entry.id
          ? item
          : {
              ...pending,
              attempts: entry.attempts + 1,
              fireAt: clock() + Math.min(60_000 * 2 ** Math.min(entry.attempts, 6), 3_600_000),
            },
      )
      write(state)
      return true
    }) ?? false

  const noteFired = (sessionID: string, deliveryID: string): boolean =>
    withLock(() => {
      const state = read()
      const ids = state.delivered[sessionID] ?? []
      if (!ids.includes(deliveryID)) {
        state.resumeCounts[sessionID] = (state.resumeCounts[sessionID] ?? 0) + 1
        state.delivered[sessionID] = [...ids, deliveryID].slice(-50)
      }
      state.entries = state.entries.filter((entry) => entry.id !== deliveryID)
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

  return {
    getState,
    setEnabled,
    setPrompt,
    requestResume,
    cancel,
    cancelSession,
    retry,
    takeDue,
    noteFired,
    noteUserIntervened,
    wake,
    // A cancel still waiting on the lock stops an entry this process already claimed.
    owns: (entry) => {
      const state = read()
      return (
        pendingCancels(state, entry.sessionID).length === 0 &&
        state.entries.some(
          (item) => item.id === entry.id && item.claim?.owner === identity?.owner && item.claim?.at === entry.claim?.at,
        )
      )
    },
  }
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
export const cancelSession = singleton.cancelSession
export const takeDue = singleton.takeDue

export interface FireServices {
  readonly session: Pick<Session.Interface, "get" | "messages">
  readonly status: Pick<SessionStatus.Interface, "get">
  readonly prompt: Pick<SessionPrompt.Interface, "prompt" | "queue">
  readonly store: Pick<InstanceStore.Interface, "load">
}

// withLock gives up after 5s, but a crashed holder's lock is only cleared after STALE_MS (30s), so
// bookkeeping keeps trying past that instead of silently losing a retry or a cap count.
const persist = (write: () => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 10; attempt++) {
      if (write()) return
      yield* Effect.sleep("1 second")
    }
    yield* Effect.die(new Error("Scheduled resume receipt lock timeout"))
  })

const drop = (store: Store, entry: Entry, reason: string) =>
  Effect.sync(() => store.cancel(entry.id)).pipe(
    Effect.andThen(
      reason === "user-message" || reason === "session-gone"
        ? persist(() => store.noteUserIntervened(entry.sessionID))
        : Effect.void,
    ),
  )

/** Fire one claimed entry; retry transient failures without resetting the successful-resume cap. */
export const fireEntry = Effect.fn("ScheduledResume.fireEntry")(function* (
  services: FireServices,
  store: Store,
  entry: Entry,
) {
  const fire = Effect.gen(function* () {
    if (!store.getState().enabled) {
      yield* drop(store, entry, "disabled")
      return
    }
    if (!store.owns(entry)) return
    const info = yield* services.session
      .get(entry.sessionID)
      .pipe(Effect.catchTag("NotFoundError", () => drop(store, entry, "session-gone").pipe(Effect.as(undefined))))
    if (!info) return
    const ctx = yield* services.store.load({ directory: entry.directory || info.directory })
    yield* Effect.gen(function* () {
      const messages = yield* services.session.messages({ sessionID: entry.sessionID })
      // Admission records the delivery id on the session (ScheduledDelivery.admit); it outlives a deleted message.
      const receipts: unknown = info.metadata?.scheduledDeliveries
      if (
        (Array.isArray(receipts) && receipts.includes(entry.id)) ||
        messages.some(
          (message) =>
            message.info.id === entry.messageID ||
            message.parts.some((part) => part.type === "text" && part.metadata?.scheduledResumeID === entry.id),
        )
      ) {
        yield* persist(() => store.noteFired(entry.sessionID, entry.id))
        return
      }
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
      // Queued prompts go first. A paused queue also waits here, so the resume never jumps ahead of it.
      // Scheduled prompts keep their own time and do not hold the resume.
      const queueClear = services.prompt.queue
        .snapshot(entry.sessionID)
        .pipe(Effect.map((queued) => !queued.entries.some((queuedEntry) => queuedEntry.runAt === undefined)))
      if (!(yield* queueClear)) {
        yield* persist(() => store.retry(entry))
        return
      }
      if (!store.owns(entry)) return
      const sent = yield* services.prompt.prompt({
        sessionID: entry.sessionID,
        messageID: entry.messageID,
        // Rechecked inside admission: a prompt queued after the check above must still go first.
        delivery: { id: entry.id, check: queueClear.pipe(Effect.map((clear) => clear && store.owns(entry))) },
        persisted: persist(() => store.noteFired(entry.sessionID, entry.id)),
        ...(lastUser ? { model: lastUser.model, agent: lastUser.agent } : {}),
        parts: [
          { type: "text", text: store.getState().prompt, synthetic: true, metadata: { scheduledResumeID: entry.id } },
        ],
      })
      if (!store.owns(entry)) return
      // Admission declined it (a prompt got queued first): try again later. If it was in fact already
      // delivered, the next attempt finds its receipt above and counts it as fired.
      if ("skipped" in sent) return yield* persist(() => store.retry(entry))
      yield* persist(() => store.noteFired(entry.sessionID, entry.id))
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

/** Local writes re-arm deadlines; a slow reconciliation discovers other processes' writes. */
export const pollLoop = (services: FireServices, store: Store) =>
  Effect.gen(function* () {
    const drain = Effect.promise(() => store.takeDue()).pipe(
      Effect.flatMap((due) =>
        Effect.forEach(due, (entry) => fireEntry(services, store, entry).pipe(Effect.forkScoped), { discard: true }),
      ),
      Effect.catch((cause) => Effect.logWarning("scheduled resume drain failed", { cause: String(cause) })),
      Effect.catchDefect((cause) => Effect.logWarning("scheduled resume drain defect", { cause: String(cause) })),
    )
    yield* Effect.forever(
      Effect.gen(function* () {
        const version = store.wake.version()
        yield* drain
        const now = Date.now()
        const deadline = Effect.sync(() =>
          Math.min(
            now + ScheduledDelivery.RECONCILE_MS,
            ...store
              .getState()
              .entries.map((entry) => (entry.claim ? entry.claim.at + ScheduledDelivery.CLAIM_MS : entry.fireAt)),
          ),
        ).pipe(Effect.catchDefect(() => Effect.succeed(now + ScheduledDelivery.RECONCILE_MS)))
        yield* store.wake.wait(version, yield* deadline)
      }),
    )
  })

export * as ScheduledResume from "./scheduledResume"
