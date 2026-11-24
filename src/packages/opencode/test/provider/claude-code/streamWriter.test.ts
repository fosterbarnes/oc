import { expect, test } from "bun:test"
import { StreamWriter } from "../../../src/provider/claude-code/streamWriter"

const capture = () => {
  const parts: { type: string; rawValue?: unknown; delta?: string }[] = []
  const controller = { enqueue: (part: never) => parts.push(part), close: () => {} }
  return { parts, out: new StreamWriter(controller as never) }
}

// Claude can stream its answer to a steer before the steer's receipt saves (Steering.onReplay). That text
// once landed in the reply before the steer, leaving the answering reply empty.
test("text streamed while a read steer's receipt saves goes to the reply that answers it", () => {
  const { parts, out } = capture()
  out.append("before")
  out.hold()
  out.append("answer")
  expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"])
  out.splitAt("msg_steer")
  expect(parts.slice(3).map((part) => part.type)).toEqual(["raw", "text-start", "text-delta"])
  expect(parts[3].rawValue).toEqual({ claudeCodeInputRead: "msg_steer" })
  expect(parts[5].delta).toBe("answer")
})

test("a failed receipt releases held output without a split", () => {
  const { parts, out } = capture()
  out.hold()
  out.append("answer")
  out.release()
  expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta"])
})
