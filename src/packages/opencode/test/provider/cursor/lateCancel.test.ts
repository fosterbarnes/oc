import { expect, test } from "bun:test"
import { SessionManager, type CursorSession } from "@/provider/cursor/session"

// The previous step's ReadableStream cancel can land after the continuation wrote its tool
// results (pending cleared) but before the continuation's pump begins. It used to close the Run.
const deliveredSession = (manager: SessionManager) => {
  const state = { destroyed: 0 }
  const session = {
    sessionId: "s1",
    conversationId: "c1",
    stream: {
      write() {},
      destroy: () => state.destroyed++,
      isClosed: () => state.destroyed > 0,
      onTerminal: () => () => {},
    },
    pending: new Map(),
    displayToolCalls: new Map(),
    blobs: new Map(),
    pumpActive: false,
  } as unknown as CursorSession
  manager.registerPending(1, session, "read_result", "read")
  const claim = manager.claim("s1", 1)
  if ("kind" in claim) throw new Error("expected a pending continuation")
  expect(manager.deliverClaim(claim, [new Uint8Array([1])]).kind).toBe("delivered")
  return { session, state }
}

// A real cancel in that gap must not leave the Run open forever when no step ever resumes it.
test("a cancel held for the resume gap closes the Run once the grace passes without a pump", () => {
  const timers: (() => void)[] = []
  const manager = new SessionManager({ setTimer: (callback) => (timers.push(callback), 0 as never) })
  const { session, state } = deliveredSession(manager)
  expect(manager.closeUnlessPending(session)).toBe(false)
  for (const run of timers.splice(0)) run()
  expect(state.destroyed).toBe(1)

  // A step that starts reading within the grace keeps it.
  const later = new SessionManager({ setTimer: (callback) => (timers.push(callback), 0 as never) })
  const resumed = deliveredSession(later)
  expect(later.closeUnlessPending(resumed.session)).toBe(false)
  later.beginPump(resumed.session, Symbol("pump"))
  for (const run of timers.splice(0)) run()
  expect(resumed.state.destroyed).toBe(0)
})

test("late cancel between result delivery and the next pump keeps the Run", () => {
  const manager = new SessionManager()
  let destroyed = 0
  const session = {
    sessionId: "s1",
    conversationId: "c1",
    stream: { write() {}, destroy: () => destroyed++, isClosed: () => destroyed > 0, onTerminal: () => () => {} },
    pending: new Map(),
    displayToolCalls: new Map(),
    blobs: new Map(),
    pumpActive: false,
  } as unknown as CursorSession
  manager.registerPending(1, session, "read_result", "read")
  const claim = manager.claim("s1", 1)
  if ("kind" in claim) throw new Error("expected a pending continuation")
  expect(manager.deliverClaim(claim, [new Uint8Array([1])]).kind).toBe("delivered")

  expect(manager.closeUnlessPending(session)).toBe(false)
  expect(destroyed).toBe(0)

  const owner = Symbol("pump")
  manager.beginPump(session, owner)
  manager.endPump(session, owner)
  expect(manager.closeUnlessPending(session)).toBe(true)
  expect(destroyed).toBe(1)
})
