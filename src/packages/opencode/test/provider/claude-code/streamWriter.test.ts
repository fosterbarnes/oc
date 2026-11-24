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
  out.hold("msg_steer")
  out.append("answer")
  expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta", "text-end"])
  out.splitAt("msg_steer")
  expect(parts.slice(3).map((part) => part.type)).toEqual(["raw", "text-start", "text-delta"])
  expect(parts[3].rawValue).toEqual({ claudeCodeInputRead: "msg_steer" })
  expect(parts[5].delta).toBe("answer")
})

test("a failed receipt releases held output without a split", () => {
  const { parts, out } = capture()
  out.hold("msg_steer")
  out.append("answer")
  out.release()
  expect(parts.map((part) => part.type)).toEqual(["text-start", "text-delta"])
})

const reads = (parts: { rawValue?: unknown }[]) =>
  parts.flatMap((part) =>
    part.rawValue ? [(part.rawValue as { claudeCodeInputRead: string }).claudeCodeInputRead] : [],
  )

// Overlapping steers: the first receipt to save once released everything held under its own message.
test("steers read back to back share one reply under the newest, whichever receipt saves first", () => {
  const { parts, out } = capture()
  out.hold("msg_a")
  out.hold("msg_b")
  out.append("answer")
  out.splitAt("msg_a")
  expect(parts).toEqual([])
  out.splitAt("msg_b")
  expect(reads(parts)).toEqual(["msg_b"])
  expect(parts.at(-1)?.delta).toBe("answer")
})

test("output between two reads stays with the first steer even when the second receipt saves first", () => {
  const { parts, out } = capture()
  out.hold("msg_a")
  out.append("for a")
  out.hold("msg_b")
  out.append("for b")
  out.splitAt("msg_b")
  expect(parts).toEqual([])
  out.splitAt("msg_a")
  expect(parts.map((part) => (part.rawValue ? reads([part])[0] : (part.delta ?? part.type)))).toEqual([
    "msg_a",
    "text-start",
    "for a",
    "text-end",
    "msg_b",
    "text-start",
    "for b",
  ])
})
