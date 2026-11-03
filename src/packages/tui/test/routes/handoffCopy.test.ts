import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@opencode-ai/sdk/v2"
import { handoffText, handoffTurn } from "../../src/routes/session/handoffCopy"

const base = { sessionID: "ses_1" }
const user = (id: string) => ({ ...base, id, role: "user", time: { created: 1 } }) as Message
const assistant = (id: string, extra: object = {}) =>
  ({
    ...base,
    id,
    role: "assistant",
    parentID: "u1",
    time: { created: 1, completed: 2 },
    finish: "stop",
    ...extra,
  }) as Message
const text = (id: string, messageID: string, value: string, metadata?: Record<string, unknown>) =>
  ({ ...base, id, messageID, type: "text", text: value, metadata }) as Part
// What SessionPrompt.command stamps on the template text it sends.
const command = (names: string[]) =>
  text("t1", "u1", "Write a prompt...", { ocCommands: names, ocCommandArguments: "" })

describe("handoffText", () => {
  test("keeps code fences inside a longer fence", () => {
    const reply = ["Here it is:", "````text", "Do this:", "```ts", "const a = 1", "```", "Then ~~~ that.", "````"].join(
      "\n",
    )
    expect(handoffText(reply)).toBe(["Do this:", "```ts", "const a = 1", "```", "Then ~~~ that."].join("\n"))
  })

  test("prefers the last text block over a later example block", () => {
    const reply = ["````text", "the prompt", "````", "", "```ts", "example()", "```"].join("\n")
    expect(handoffText(reply)).toBe("the prompt")
  })

  test("falls back to the last block, tilde fences included", () => {
    expect(handoffText(["~~~", "first", "~~~", "~~~md", "second", "~~~~"].join("\r\n"))).toBe("second")
  })

  test("a cut-off block or inline backticks give nothing", () => {
    expect(handoffText(["````text", "half a prompt", "```"].join("\n"))).toBeUndefined()
    expect(handoffText("use ```inline``` code")).toBeUndefined()
  })
})

describe("handoffTurn", () => {
  test("joins every finished step answering a /prompt request, also composed", () => {
    const messages = [user("u1"), assistant("a1", { finish: "tool-calls" }), assistant("a2")]
    const parts: Record<string, Part[]> = {
      u1: [command(["spit", "prompt"])],
      a1: [text("p1", "a1", "Checking paths.")],
      a2: [text("p2", "a2", "````text\nprompt\n````")],
    }
    expect(handoffTurn(messages, (id) => parts[id] ?? [])).toEqual({
      id: "a2",
      text: "Checking paths.\n````text\nprompt\n````",
    })
  })

  test("ignores other commands and unfinished, aborted, or mid-tool turns", () => {
    const parts = (names: string[]) => (id: string) =>
      id === "u1" ? [command(names)] : [text("p", id, "````text\nx\n````")]
    expect(handoffTurn([user("u1"), assistant("a1")], parts(["spit"]))).toBeUndefined()
    for (const extra of [
      { time: { created: 1 } },
      { error: { name: "MessageAbortedError", data: {} } },
      { finish: "tool-calls" },
    ]) {
      expect(handoffTurn([user("u1"), assistant("a1", extra)], parts(["prompt"]))).toBeUndefined()
    }
  })
})
