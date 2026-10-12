import { expect, test } from "bun:test"
import type { Message, Session, SessionStatus } from "@opencode-ai/sdk/v2"
import { visibleSubagents } from "../src/feature-plugins/sidebar/subagents"

const child: Session = {
  id: "child",
  parentID: "root",
  slug: "child",
  projectID: "project",
  directory: ".",
  title: "Inspect callers",
  agent: "explore",
  version: "1",
  time: { created: 100, updated: 1_000 },
}

function state(
  input: { status?: SessionStatus; turn?: number; failed?: boolean; waiting?: boolean; completed?: number } = {},
) {
  return {
    session: {
      get: () => child,
      children: (root: string) => (root === "root" ? [{ ...child, sessionFailed: input.failed }] : []),
      status: () => input.status,
      messages: (id: string): Message[] => {
        if (id === "root")
          return input.turn
            ? [
                {
                  id: "user",
                  sessionID: "root",
                  role: "user",
                  agent: "go",
                  model: { providerID: "test", modelID: "test" },
                  time: { created: input.turn },
                },
              ]
            : []
        if (!input.completed) return []
        return [
          {
            id: "assistant",
            sessionID: "child",
            role: "assistant",
            parentID: "user",
            agent: "explore",
            mode: "explore",
            modelID: "test",
            providerID: "test",
            path: { cwd: ".", root: "." },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            time: { created: 100, completed: input.completed },
          },
        ]
      },
      permission: () => [],
      question: () => (input.waiting ? [{ id: "question", sessionID: "child", questions: [] }] : []),
    },
  }
}

test("active children survive age and new turns; pending requests take priority", () => {
  expect(visibleSubagents(state({ status: { type: "busy" }, turn: 2_000 }), "child", 200_000)[0]?.label).toBe("working")
  expect(
    visibleSubagents(state({ status: { type: "retry", attempt: 1, message: "retry", next: 0 } }), "child", 200_000)[0]
      ?.label,
  ).toBe("retrying")
  expect(visibleSubagents(state({ status: { type: "busy" }, waiting: true }), "child", 200_000)[0]?.label).toBe(
    "waiting",
  )
})

test("finished children expire at two minutes or the next root turn", () => {
  expect(visibleSubagents(state(), "child", 120_999)[0]?.label).toBe("done")
  expect(visibleSubagents(state(), "child", 121_000)).toEqual([])
  expect(visibleSubagents(state({ turn: 1_001 }), "child", 2_000)).toEqual([])
  expect(visibleSubagents(state({ failed: true }), "child", 2_000)[0]?.label).toBe("failed")
})

test("completion time wins over later metadata updates", () => {
  expect(visibleSubagents(state({ completed: 500 }), "child", 120_500)).toEqual([])
  expect(visibleSubagents(state({ completed: 500, turn: 501 }), "child", 1_000)).toEqual([])
})
