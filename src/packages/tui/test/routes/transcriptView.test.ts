import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { activityRuns, activitySummary, nextTranscriptView } from "../../src/routes/session/transcriptView"

const base = { sessionID: "ses_1" }
const user = (id: string) => ({ ...base, id, role: "user", time: { created: 1 } }) as Message
const assistant = (id: string, extra: object = {}) =>
  ({ ...base, id, role: "assistant", time: { created: 1, completed: 2 }, ...extra }) as Message
const tool = (id: string, messageID: string, name: string, status = "completed") =>
  ({
    ...base,
    id,
    messageID,
    type: "tool",
    tool: name,
    callID: id,
    state:
      status === "completed"
        ? { status, input: {}, output: "", title: "", metadata: {}, time: { start: 1, end: 2 } }
        : { status, input: {}, time: { start: 1 } },
  }) as Part
const thought = (id: string, messageID: string, text = "plan", done = true) =>
  ({ ...base, id, messageID, type: "reasoning", text, time: { start: 1, end: done ? 2 : undefined } }) as Part
const text = (id: string, messageID: string, value: string) =>
  ({ ...base, id, messageID, type: "text", text: value }) as Part

describe("activityRuns", () => {
  test("joins thinking and tool parts across step messages until visible text", () => {
    const messages = [user("u1"), assistant("a1"), assistant("a2"), assistant("a3")]
    const parts: Record<string, Part[]> = {
      a1: [thought("p1", "a1"), tool("p2", "a1", "read")],
      a2: [thought("p3", "a2", ""), tool("p4", "a2", "bash")],
      a3: [text("p5", "a3", "Done."), tool("p6", "a3", "read")],
    }
    const runs = activityRuns(messages, (id) => parts[id] ?? [])
    expect(runs.get("p1")?.items.map((item) => item.id)).toEqual(["p1", "p2", "p4"])
    expect(runs.get("p4")?.id).toBe("p1")
    // Empty thinking renders nothing; a lone tool after text is not a run.
    expect(runs.has("p3")).toBe(false)
    expect(runs.has("p6")).toBe(false)
  })

  test("subagent calls, user messages and errors end a run", () => {
    const messages = [
      assistant("a1"),
      user("u2"),
      assistant("a2", { error: { name: "UnknownError", data: { message: "x" } } }),
      assistant("a3"),
    ]
    const parts: Record<string, Part[]> = {
      a1: [tool("p1", "a1", "read"), tool("p2", "a1", "task"), tool("p3", "a1", "grep")],
      a2: [tool("p4", "a2", "read"), tool("p5", "a2", "read")],
      a3: [tool("p6", "a3", "read")],
    }
    const runs = activityRuns(messages, (id) => parts[id] ?? [])
    expect([...runs.keys()]).toEqual(["p4", "p5"])
  })
})

describe("activitySummary", () => {
  test("counts finished work and reports running work", () => {
    const messages = [assistant("a1", { time: { created: 1 } })]
    const parts = [
      tool("p1", "a1", "bash"),
      tool("p2", "a1", "edit"),
      tool("p3", "a1", "glob"),
      tool("p4", "a1", "grep"),
      thought("p5", "a1"),
      tool("p6", "a1", "bash", "running"),
    ]
    const run = activityRuns(messages, () => parts).get("p1")!
    expect(activitySummary(run)).toEqual({
      label: "1 command, 1 edit, 2 searches, 1 thought",
      active: true,
      failed: false,
    })
  })

  test("labels a run with nothing finished by its current step", () => {
    const parts = [thought("p1", "a1", "plan", false), tool("p2", "a1", "read", "pending")]
    const live = activityRuns([assistant("a1", { time: { created: 1 } })], () => parts).get("p1")!
    expect(activitySummary(live).label).toBe("Thinking…")
    // Thinking in a completed message counts as finished even without an end time.
    const done = activityRuns([assistant("a1")], () => parts).get("p1")!
    expect(activitySummary(done).label).toBe("1 thought")
  })
})

test("views cycle full, grouped, summary", () => {
  expect(nextTranscriptView("full")).toBe("grouped")
  expect(nextTranscriptView("grouped")).toBe("summary")
  expect(nextTranscriptView("summary")).toBe("full")
})
