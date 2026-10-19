import { expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { subagentFeed } from "../../../src/util/subagentFeed"

// Only the fields subagentFeed reads: role and id on messages, type plus text or tool state on parts.
const message = (id: string, role: "user" | "assistant") => ({ id, role, sessionID: "ses_child" }) as Message
const base = (id: string, messageID: string) => ({ id, messageID, sessionID: "ses_child" })

const parts = {
  msg_user: [{ ...base("p0", "msg_user"), type: "text", text: "Find the callers" }],
  msg_a: [
    { ...base("p1", "msg_a"), type: "reasoning", text: "I should\n\nsearch   first", time: { start: 1 } },
    {
      ...base("p2", "msg_a"),
      type: "tool",
      tool: "grep",
      callID: "c1",
      state: {
        status: "completed",
        title: "contextUsage",
        input: {},
        output: "",
        metadata: {},
        time: { start: 1, end: 2 },
      },
    },
  ],
  msg_b: [
    {
      ...base("p3", "msg_b"),
      type: "tool",
      tool: "read",
      callID: "c2",
      state: { status: "error", input: {}, error: "missing", time: { start: 1, end: 2 } },
    },
    { ...base("p4", "msg_b"), type: "text", text: "Found two callers." },
  ],
} as unknown as Record<string, Part[]>

const messages = [message("msg_user", "user"), message("msg_a", "assistant"), message("msg_b", "assistant")]

test("lists tool calls, thinking, and text across assistant messages, oldest first", () => {
  expect(subagentFeed(messages, parts, 10)).toEqual([
    { kind: "reasoning", text: "I should search first" },
    { kind: "tool", text: "› Grep contextUsage", error: false },
    { kind: "tool", text: "› Read", error: true },
    { kind: "text", text: "Found two callers." },
  ])
})

test("keeps only the newest entries", () => {
  expect(subagentFeed(messages, parts, 2).map((entry) => entry.text)).toEqual(["› Read", "Found two callers."])
})

test("shows only the tail of long output", () => {
  const long = {
    msg_a: [{ ...base("p1", "msg_a"), type: "text", text: `${"a".repeat(1_000)}END` }],
  } as unknown as Record<string, Part[]>
  const [entry] = subagentFeed([message("msg_a", "assistant")], long, 4)
  expect(entry.text.length).toBe(400)
  expect(entry.text.endsWith("END")).toBe(true)
})
