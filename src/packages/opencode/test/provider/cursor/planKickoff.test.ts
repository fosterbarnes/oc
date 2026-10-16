import { afterEach, describe, expect, test } from "bun:test"
import {
  flushPlanExecutionKickoff,
  queuePlanExecutionKickoff,
  registerPlanExecutionKickoff,
  resetPlanExecutionKickoffForTests,
} from "../../../src/provider/cursor/planExecutionKickoff.js"

describe("Cursor plan kickoff registrations", () => {
  afterEach(() => resetPlanExecutionKickoffForTests())

  test("dispatches by originating directory and keeps newer registrations on disposal", async () => {
    const calls: string[] = []
    const unregisterA = registerPlanExecutionKickoff("C:/project-a", async () => void calls.push("a"))
    registerPlanExecutionKickoff("C:/project-b", async () => void calls.push("b"))
    expect(queuePlanExecutionKickoff({ sessionID: "a", instanceDirectory: "C:/project-a", planPath: "a.md" })).toBe(
      true,
    )
    expect(queuePlanExecutionKickoff({ sessionID: "b", instanceDirectory: "C:/project-b", planPath: "b.md" })).toBe(
      true,
    )
    unregisterA()
    registerPlanExecutionKickoff("C:/project-a", async () => void calls.push("a-reboot"))
    await flushPlanExecutionKickoff("b", { terminal: true })
    await flushPlanExecutionKickoff("a", { terminal: true })
    expect(calls).toEqual(["b", "a-reboot"])
  })

  test("holds approval until the owning Run is terminal", async () => {
    const calls: string[] = []
    registerPlanExecutionKickoff("C:/project", async () => void calls.push("started"))
    queuePlanExecutionKickoff({ sessionID: "s", instanceDirectory: "C:/project", planPath: "plan.md" })
    expect(await flushPlanExecutionKickoff("s", { terminal: false })).toBe(false)
    expect(calls).toEqual([])
    expect(await flushPlanExecutionKickoff("s", { terminal: true })).toBe(true)
    expect(calls).toEqual(["started"])
  })
})
