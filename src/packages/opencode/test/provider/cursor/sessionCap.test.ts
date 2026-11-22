import { expect, test } from "bun:test"
import { SessionManager, type CursorSession } from "@/provider/cursor/session"

let next = 0
const heldRun = (awaitingTools: boolean) => {
  const id = ++next
  return {
    sessionId: `s${id}`,
    conversationId: `c${id}`,
    openCodeSessionId: `oc${id}`,
    stream: { close() {}, onTerminal: () => () => {} },
    pending: new Map(awaitingTools ? [[1, { state: "pending" }]] : []),
    displayToolCalls: new Map(),
    blobs: new Map(),
    pumpActive: false,
    createdAt: id,
  } as unknown as CursorSession
}

// Many parallel subagents each hold a Run open while oc runs their tools. Evicting one forced a
// history rebase that dropped earlier tool results, so the agents re-read files in a loop.
test("open-session cap never evicts a Run awaiting tool results", () => {
  const manager = new SessionManager({ maxOpenSessions: 2 })
  const runs = [heldRun(true), heldRun(true), heldRun(true)]
  for (const run of runs) manager.registerSession(run)
  expect(runs.map((run) => run.closed)).toEqual([false, false, false])
})

test("open-session cap still evicts the oldest leaked idle Run", () => {
  const manager = new SessionManager({ maxOpenSessions: 2 })
  const runs = [heldRun(false), heldRun(false), heldRun(false)]
  for (const run of runs) manager.registerSession(run)
  expect(runs.map((run) => run.closed)).toEqual([true, false, false])
})
