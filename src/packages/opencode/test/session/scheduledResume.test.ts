import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
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

  test("corrupt file starts empty without throwing", () => {
    const tmp = tmpFile()
    try {
      writeFileSync(tmp.file, "{not json")
      const store = ScheduledResume.createStore(tmp.file)
      expect(store.getState().entries).toEqual([])
      expect(store.getState().enabled).toBe(false)
    } finally {
      tmp.cleanup()
    }
  })

  test("takeDue claims overdue entries once", () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      store.requestResume({ sessionID: "due", directory: "/d", fireAt: 100, reason: "r" }, 10)
      store.requestResume({ sessionID: "later", directory: "/d", fireAt: 900, reason: "r" }, 10)
      expect(store.takeDue(500).map((e) => e.sessionID)).toEqual(["due" as SessionID])
      expect(store.takeDue(500)).toEqual([])
      // Claimed entries persist as removed: a fresh store sees only the later one.
      expect(
        ScheduledResume.createStore(tmp.file)
          .getState()
          .entries.map((e) => e.sessionID),
      ).toEqual(["later" as SessionID])
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
      store.noteFired("s")
      expect(store.cancel(created.id)).toBe(true)
      expect(store.cancel(created.id)).toBe(false)
      expect(store.getState().entries).toEqual([])
      expect(store.getState().resumeCounts.s).toBe(1)
      for (let i = 0; i < 4; i++) store.noteFired("s")
      expect(store.requestResume({ sessionID: "s", directory: "/d", fireAt: 100, reason: "r" })).toBeNull()
      for (let i = 0; i < 5; i++) store.noteFired("s2")
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
        store.noteFired("s")
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

  test("mutations leave no lockfile and break through a stale one", () => {
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
      expect(store.takeDue(500).map((e) => e.sessionID)).toEqual(["s" as SessionID])
      expect(existsSync(`${tmp.file}.lock`)).toBe(false)
    } finally {
      tmp.cleanup()
    }
  })
})

describe("scheduledResume fireEntry", () => {
  test("a held lock leaves the resume queued without sending a second prompt", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.setEnabled(true)
      const pending = store.requestResume({ sessionID: "ses_abc", directory: "/d", fireAt: 100, reason: "r" }, 10)!
      const other = ScheduledResume.createStore(tmp.file)
      const { svc, prompts } = services()
      writeFileSync(`${tmp.file}.lock`, String(process.pid))
      for (const due of other.takeDue(500)) await Effect.runPromise(ScheduledResume.fireEntry(svc, other, due))
      expect(prompts).toEqual([])
      expect(other.getState().entries).toEqual([pending])
      expect(existsSync(`${tmp.file}.lock`)).toBe(true)
      rmSync(`${tmp.file}.lock`)
      for (const due of store.takeDue(500)) await Effect.runPromise(ScheduledResume.fireEntry(svc, store, due))
      expect(prompts).toHaveLength(1)
      expect(other.takeDue(500)).toEqual([])
      expect(other.getState().resumeCounts).toEqual({ ses_abc: 1 })
    } finally {
      tmp.cleanup()
    }
  }, 15_000)

  test("busy session is delayed and the prompt is not sent", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file, () => 1000)
      const { svc, prompts } = services({ status: "busy" })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, entry()))
      expect(prompts).toEqual([])
      expect(store.getState().resumeCounts).toEqual({})
      expect(store.getState().entries).toEqual([{ ...entry(), attempts: 1, fireAt: 61_000 }])
    } finally {
      tmp.cleanup()
    }
  })

  test("newer user message drops the entry and resets the count", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      store.noteFired("ses_abc")
      const { svc, prompts } = services({ messages: [userMessage(600)] })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, entry()))
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
      const { svc, prompts } = services({ messages: [userMessage(400)] })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, entry()))
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
      const { svc, prompts } = services({ sessionExists: false })
      await Effect.runPromise(ScheduledResume.fireEntry(svc, store, entry()))
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
        const { svc } = services({ [failure]: true })
        await Effect.runPromise(ScheduledResume.fireEntry(svc, store, entry()))
        const retry = ScheduledResume.createStore(tmp.file).getState().entries[0]!
        expect(retry).toEqual({ ...entry(), attempts: 1, fireAt: 61_000 })
        expect(store.takeDue(60_000)).toEqual([])
        expect(store.takeDue(61_000)).toEqual([retry])
        await Effect.runPromise(ScheduledResume.fireEntry(svc, store, retry))
        expect(store.getState().entries[0]).toEqual({ ...entry(), attempts: 2, fireAt: 121_000 })
        expect(store.getState().resumeCounts).toEqual({})
        const claimed = store.takeDue(121_000)[0]!
        await Effect.runPromise(ScheduledResume.fireEntry(services().svc, store, claimed))
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
      store.takeDue(2000)
      for (let i = 0; i < ScheduledResume.MAX_AUTO_RESUMES; i++) store.noteFired("ses_abc")
      store.retry(entry())
      expect(store.getState().entries).toEqual([])
    } finally {
      tmp.cleanup()
    }
  })

  test("saved resume messages do not cancel retries but newer user messages do", async () => {
    const tmp = tmpFile()
    try {
      const store = ScheduledResume.createStore(tmp.file)
      const saved = userMessage(600, "e1")
      const resumed = services({ messages: [userMessage(400), saved] })
      await Effect.runPromise(ScheduledResume.fireEntry(resumed.svc, store, entry({ attempts: 1 })))
      expect(resumed.prompts).toHaveLength(1)
      expect(store.getState().resumeCounts).toEqual({ ses_abc: 1 })
      const intervened = services({ status: "busy", messages: [saved, userMessage(700)] })
      await Effect.runPromise(ScheduledResume.fireEntry(intervened.svc, store, entry({ attempts: 2 })))
      expect(intervened.prompts).toEqual([])
      expect(store.getState().entries).toEqual([])
      expect(store.getState().resumeCounts).toEqual({})
    } finally {
      tmp.cleanup()
    }
  })
})
