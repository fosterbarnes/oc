import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { renameDigest } from "../../src/session/prompt"

const msg = (role: "user" | "assistant", text: string, synthetic?: boolean) =>
  ({ info: { role }, parts: [{ type: "text", text, synthetic }] }) as unknown as SessionV1.WithParts

test("renameDigest keeps the first user message and the latest exchanges", () => {
  const history = [
    msg("user", "start task"),
    ...Array.from({ length: 8 }, (_, i) => msg(i % 2 ? "assistant" : "user", `turn ${i}`)),
    msg("user", "hidden", true),
  ]
  const digest = renameDigest(history)
  expect(digest.startsWith("user: start task\n\n...")).toBe(true)
  expect(digest).toContain("assistant: turn 7")
  expect(digest).not.toContain("turn 1\n")
  expect(digest).not.toContain("hidden")
})

test("renameDigest does not repeat a first message already in the recent window", () => {
  expect(renameDigest([msg("user", "only"), msg("assistant", "reply")])).toBe("user: only\n\nassistant: reply")
})
