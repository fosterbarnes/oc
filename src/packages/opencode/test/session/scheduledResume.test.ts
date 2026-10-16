import { describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Deferred, Effect } from "effect"
import { ScheduledResume } from "../../src/session/scheduledResume"
import type { SessionID } from "../../src/session/schema"
import { NotFoundError } from "../../src/storage/storage"

function tmpFile(): { file: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "scheduled-resume-"))
  return { file: join(dir, "scheduledResume.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function userMessage(created: number, scheduledResumeID?: string) {
  return {
    info: {
      role: "user",
      time: { created },
      agent: "build",
      model: { providerID: "claude-code", modelID: "claude-opus" },
    },
    parts: scheduledResumeID
      ? [{ type: "text", text: ScheduledResume.DEFAULT_PROMPT, metadata: { scheduledResumeID } }]
      : [],
  }
}

function services(
  opts: {
    sessionExists?: boolean
    status?: "idle" | "busy"
    messages?: ReturnType<typeof userMessage>[]
    onPrompt?: (input: unknown) => void
    loadFailure?: boolean
    promptFailure?: boolean
    queued?: { id: string; state: "pending" | "dispatching"; text: string; attachments: number }[]
  } = {},
) {
  const prompts: unknown[] = []
  const svc = {
    session: {
      get: (id: string) =>
        opts.sessionExists === false
          ? Effect.fail(new NotFoundError({ message: `Session not found: ${id}` }))
          : Effect.succeed({ directory: "/tmp/proj" }),
      messages: () => Effect.succeed(opts.messages ?? []),
    },
    status: { get: () => Effect.succeed({ type: opts.status ?? "idle" }) },
    prompt: {
      prompt: (input: unknown) => {
        prompts.push(input)
        if (opts.onPrompt) opts.onPrompt(input)
        return opts.promptFailure
          ? Effect.fail(new Error("prompt unavailable"))
          : Effect.succeed({ info: {}, parts: [] })
      },
      queue: {
        snapshot: () => Effect.succeed({ entries: opts.queued ?? [] }),
      },
    },
    store: {
      load: () =>
        opts.loadFailure
          ? Effect.die(new Error("instance unavailable"))
          : Effect.succeed({ directory: "/tmp/proj", worktree: "/tmp/proj", project: { id: "p" } }),
    },
  }
  return { svc: svc as unknown as Parameters<typeof ScheduledResume.fireEntry>[0], prompts }
}

function entry(over: Partial<ScheduledResume.Entry> = {}): ScheduledResume.Entry {
  return {
    id: "e1",
    sessionID: "ses_abc" as SessionID,
    directory: "/tmp/proj",
    fireAt: 1000,
    reason: ScheduledResume.RESUME_REASON,
    createdAt: 500,
    attempts: 0,
    ...over,
  }
}

async function claimed(store: ScheduledResume.Store) {
  store.setEnabled(true)
  store.requestResume(
    { sessionID: "ses_abc", directory: "/tmp/proj", fireAt: 1000, reason: ScheduledResume.RESUME_REASON },
    500,
  )
  return (await store.takeDue(1000))[0]!
}

describe("scheduledResume store", () => {
  test("starts disabled and requestResume returns null until enabled", () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      expect(store.getState().enabled).toBe(false)
      expect(store.requestResume({ sessionID: "s", directory: "/d", fireAt: 1, reason: "r" })).toBeNull()
      store.setEnabled(true)
      expect(store.requestResume({ sessionID: "s", directory: "/d", fireAt: 1, reason: "r" })).not.toBeNull()
    } finally {
      tmp.cleanup()
    }
  })

  test("one entry per session: newer schedule replaces", () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      const first = store.requestResume({ sessionID: "s", directory: "/d", fireAt: 100, reason: "r" }, 10)!
      const second = store.requestResume({ sessionID: "s", directory: "/d", fireAt: 200, reason: "r" }, 20)!
      expect(second.id).not.toBe(first.id)
      expect(store.getState().entries).toHaveLength(1)
      expect(store.getState().entries[0]!.fireAt).toBe(200)
    } finally {
      tmp.cleanup()
    }
  })

  test("reloads entries from file", () => {
    const tmp = tmpFile()
    try {
      const a = ScheduledResume.createStore(tmp.file)
      a.setEnabled(true)
      a.requestResume({ sessionID: "s", directory: "/d", fireAt: 100, reason: "r" }, 10)
      const b = ScheduledResume.createStore(tmp.file)
      expect(b.getState().entries).toHaveLength(1)
      expect(b.getState().enabled).toBe(true)
    } finally {
      tmp.cleanup()
    }
  })

  test("corrupt file reports an error and preserves a copy", () => {
    const tmp = tmpFile()
    try {
      writeFileSync(tmp.file, "{not json")
      const store = ScheduledResume.createStore(tmp.file)
      expect(() => store.getState()).toThrow("Corrupt scheduled resume state")
      expect(existsSync(`${tmp.file}.corrupt`)).toBe(true)
    } finally {
      tmp.cleanup()
    }
  })

  test("takeDue claims overdue entries once", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      store.requestResume({ sessionID: "due", directory: "/d", fireAt: 100, reason: "r" }, 10)
      store.requestResume({ sessionID: "later", directory: "/d", fireAt: 900, reason: "r" }, 10)
      expect((await store.takeDue(500)).map((e) => e.sessionID)).toEqual(["due" as SessionID])
      expect(await store.takeDue(500)).toEqual([])
      // A fresh owner sees the claim but cannot take it until recovery is allowed.
      expect(
        ScheduledResume.createStore(tmp.file)
          .getState()
          .entries.map((e) => e.sessionID),
      ).toEqual(["due", "later"] as SessionID[])
    } finally {
      tmp.cleanup()
    }
  })

  test("cancel removes the entry without resetting the resume count", () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      const created = store.requestResume({ sessionID: "s", directory: "/d", fireAt: 100, reason: "r" }, 10)!
      store.noteFired("s", "previous")
      expect(store.cancel(created.id)).toBe(true)
      expect(store.cancel(created.id)).toBe(false)
      expect(store.getState().entries).toEqual([])
      expect(store.getState().resumeCounts.s).toBe(1)
      for (let i = 0; i < 4; i++) store.noteFired("s", randomUUID())
      expect(store.requestResume({ sessionID: "s", directory: "/d", fireAt: 100, reason: "r" })).toBeNull()
      for (let i = 0; i < 5; i++) store.noteFired("s2", randomUUID())
      expect(store.requestResume({ sessionID: "s2", directory: "/d", fireAt: 100, reason: "r" })).toBeNull()
      store.noteUserIntervened("s2")
      expect(store.requestResume({ sessionID: "s2", directory: "/d", fireAt: 100, reason: "r" })).not.toBeNull()
    } finally {
      tmp.cleanup()
    }
  })

  test("stops scheduling after five consecutive auto-resumes", () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      for (let i = 0; i < 5; i++) {
        expect(
          store.requestResume({ sessionID: "s", directory: "/d", fireAt: 100 + i, reason: "r" }, 10),
        ).not.toBeNull()
        store.noteFired("s", randomUUID())
      }
      expect(store.requestResume({ sessionID: "s", directory: "/d", fireAt: 200, reason: "r" }, 10)).toBeNull()
    } finally {
      tmp.cleanup()
    }
  })

  test("setPrompt round-trips and an empty prompt keeps the current one", () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      expect(store.setPrompt("Keep going.").prompt).toBe("Keep going.")
      expect(ScheduledResume.createStore(tmp.file).getState().prompt).toBe("Keep going.")
      expect(store.setPrompt("").prompt).toBe("Keep going.")
    } finally {
      tmp.cleanup()
    }
  })

  test("mutations leave no lockfile and break through a stale one", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      store.requestResume({ sessionID: "s", directory: "/d", fireAt: 100, reason: "r" }, 10)
      expect(existsSync(`${tmp.file}.lock`)).toBe(false)
      // A crashed holder's lock (old mtime) must not wedge the store.
      writeFileSync(`${tmp.file}.lock`, "9999")
      const ancient = new Date(Date.now() - 60_000)
      utimesSync(`${tmp.file}.lock`, ancient, ancient)
      expect((await store.takeDue(500)).map((e) => e.sessionID)).toEqual(["s" as SessionID])
      expect(existsSync(`${tmp.file}.lock`)).toBe(false)
    } finally {
      tmp.cleanup()
    }
  })
})

describe("scheduledResume fireEntry", () => {
  test("inserting an earlier entry wakes the deadline sleeper", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      store.requestResume({ sessionID: "ses_later", directory: "/d", fireAt: Date.now() + 60_000, reason: "test" })
      await Effect.runPromise(
        Effect.gen(function* () {
          const sent = yield* Deferred.make<void>()
          const { svc, prompts } = services({ onPrompt: () => Effect.runSync(Deferred.succeed(sent, undefined)) })
          yield* ScheduledResume.pollLoop(svc, store).pipe(Effect.forkScoped({ startImmediately: true }))
          store.requestResume({ sessionID: "ses_earlier", directory: "/d", fireAt: Date.now() + 50, reason: "test" })
          yield* Deferred.await(sent).pipe(Effect.timeout("2 seconds"))
          expect(prompts).toHaveLength(1)
        }).pipe(Effect.scoped),
      )
    } finally {
      tmp.cleanup()
    }
  })

  test("a held lock leaves the resume queued without sending a second prompt", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      const pending = store.requestResume({ sessionID: "ses_abc", directory: "/d", fireAt: 100, reason: "r" }, 10)!
      const other = ScheduledResume.createStore(tmp.file)
      const { svc, prompts } = services()
      writeFileSync(`${tmp.file}.lock`, String(process.pid))
      for (const due of await other.takeDue(500)) await Effect.runPromise(ScheduledResume.fireEntry(svc, other, due))
      expect(prompts).toEqual([])
      expect(other.getState().entries).toEqual([pending])
      expect(existsSync(`${tmp.file}.lock`)).toBe(true)
      rmSync(`${tmp.file}.lock`)
      for (const due of await store.takeDue(500)) await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toHaveLength(1)
      expect(await other.takeDue(500)).toEqual([])
      expect(other.getState().resumeCounts).toEqual({ ses_abc: 1 })
    } finally {
      tmp.cleanup()
    }
  }, 15_000)

  test("busy session is delayed and the prompt is not sent", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file, () => 1000)
      const due = await claimed(store)
      const { svc, prompts } = services({ status: "busy" })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toEqual([])
      expect(store.getState().resumeCounts).toEqual({})
      expect(store.getState().entries[0]).toMatchObject({ id: due.id, attempts: 1, fireAt: 61_000 })
      expect(store.getState().entries[0]?.claim).toBeUndefined()
    } finally {
      tmp.cleanup()
    }
  })

  test("queued prompts go first: the resume waits while the queue has entries", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file, () => 1000)
      const due = await claimed(store)
      const queued = [{ id: "msg_queued", state: "pending" as const, text: "next", attachments: 0 }]
      const { svc, prompts } = services({ queued })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toEqual([])
      expect(store.getState().resumeCounts).toEqual({})
      expect(store.getState().entries[0]).toMatchObject({ id: due.id, attempts: 1, fireAt: 61_000 })
    } finally {
      tmp.cleanup()
    }
  })

  test("newer user message drops the entry and resets the count", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.noteFired("ses_abc", "previous")
      const due = await claimed(store)
      const { svc, prompts } = services({ messages: [userMessage(600)] })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toEqual([])
      expect(store.getState().resumeCounts).toEqual({})
    } finally {
      tmp.cleanup()
    }
  })

  test("idle session with no newer message sends the resume prompt", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      const due = await claimed(store)
      const { svc, prompts } = services({ messages: [userMessage(400)] })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toHaveLength(1)
      const input = prompts[0] as { sessionID: string; agent: string; model: unknown; parts: { text: string }[] }
      expect(input.sessionID).toBe("ses_abc")
      expect(input.agent).toBe("build")
      expect(input.parts[0]!.text).toBe(store.getState().prompt)
      expect(store.getState().resumeCounts).toEqual({ ses_abc: 1 })
    } finally {
      tmp.cleanup()
    }
  })

  test("deleted session is dropped without sending", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      const due = await claimed(store)
      const { svc, prompts } = services({ sessionExists: false })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toEqual([])
      expect(store.getState().entries).toEqual([])
    } finally {
      tmp.cleanup()
    }
  })

  for (const failure of ["loadFailure", "promptFailure"] as const) {
    test(`${failure} persists a retry with increasing backoff`, async () => {
      const tmp = tmpFile()
      try {
        const store = ScheduledResume.createStore(tmp.file, () => 1000)
        const due = await claimed(store)
        const { svc } = services({ [failure]: true })
        await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
        const retry = ScheduledResume.createStore(tmp.file).getState().entries[0]!
        expect(retry).toMatchObject({ id: due.id, attempts: 1, fireAt: 61_000 })
        expect(await store.takeDue(60_000)).toEqual([])
        const second = (await store.takeDue(61_000))[0]!
        expect(second.id).toBe(retry.id)
        await Effect.runPromise(ScheduledResume.fireEntry(svc, store, second))
        expect(store.getState().entries[0]).toMatchObject({ id: due.id, attempts: 2, fireAt: 121_000 })
        expect(store.getState().resumeCounts).toEqual({})
        const finalClaim = (await store.takeDue(121_000))[0]!
        await Effect.runPromise(ScheduledResume.fireEntry(services().svc, store, finalClaim))
        expect(store.getState().resumeCounts).toEqual({ ses_abc: 1 })
      } finally {
        tmp.cleanup()
      }
    })
  }

  test("retry preserves a newer schedule and the successful-resume cap", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file, () => 1000)
      store.setEnabled(true)
      const newer = store.requestResume({ sessionID: "ses_abc", directory: "/d", fireAt: 2000, reason: "new" })
      store.retry(entry())
      expect(store.getState().entries).toEqual([newer!])
      await store.takeDue(2000)
      for (let i = 0; i < ScheduledResume.MAX_AUTO_RESUMES; i++) store.noteFired("ses_abc", randomUUID())
      store.retry(entry())
      expect(store.getState().entries).toHaveLength(1)
    } finally {
      tmp.cleanup()
    }
  })

  test("saved resume messages do not cancel retries but newer user messages do", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      const due = await claimed(store)
      const saved = userMessage(600, due.id)
      const resumed = services({ messages: [userMessage(400), saved] })
      await Effect.runPromise(ScheduledResume.fireEntry(resumed.svc, store, due))
      expect(resumed.prompts).toHaveLength(0)
      expect(store.getState().resumeCounts).toEqual({ ses_abc: 1 })
      const intervened = services({ status: "busy", messages: [saved, userMessage(700)] })
      const next = await claimed(store)
      await Effect.runPromise(ScheduledResume.fireEntry(intervened.svc, store, next))
      expect(intervened.prompts).toEqual([])
      expect(store.getState().entries).toEqual([])
      expect(store.getState().resumeCounts).toEqual({})
    } finally {
      tmp.cleanup()
    }
  })
})
