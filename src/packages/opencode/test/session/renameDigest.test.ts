import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Command } from "../../src/command"
import { renameDigest } from "../../src/session/titleGen"

const msg = (role: "user" | "assistant", text: string, synthetic?: boolean, metadata?: Record<string, unknown>) =>
  ({ info: { role }, parts: [{ type: "text", text, synthetic, metadata }] }) as unknown as SessionV1.WithParts

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

test("renameDigest uses command arguments before truncating expanded instructions", () => {
  const command = msg(
    "user",
    "Spitballing instructions. ".repeat(100) + "Require approval before plan execution",
    false,
    { ocCommandArguments: "Require approval before plan execution" },
  )
  expect(renameDigest([command, msg("assistant", "Add approval at the plan execution boundary.")])).toBe(
    "user: Require approval before plan execution\n\nassistant: Add approval at the plan execution boundary.",
  )
})

test("renameDigest keeps task text for argument-free commands and older messages", () => {
  const command = msg("user", "Review the current diff", false, { ocCommandArguments: " " })
  expect(renameDigest([command, msg("user", "Fix the cache invalidation")])).toBe(
    "user: Review the current diff\n\nuser: Fix the cache invalidation",
  )
})

test("renameDigest strips the active-command header from argument-free commands", () => {
  const header =
    "[/spit is active: its instructions replace any earlier slash command's persona, mode, and rules from this conversation.]"
  const command = msg("user", `${header}\n\nReview the current diff`, false, { ocCommandArguments: " " })
  expect(renameDigest([command])).toBe("user: Review the current diff")
})

test("renameDigest strips the composed-command preamble from argument-free commands", () => {
  const text = `${Command.COMPOSED_PREAMBLE}\n\n[/pass]\nReview the current diff\n\n[/fpc]\nClean up\n\n[User request]\n`
  const command = msg("user", text, false, { ocCommands: ["pass", "fpc"], ocCommandArguments: "" })
  expect(renameDigest([command])).toBe("user: [/pass]\nReview the current diff\n\n[/fpc]\nClean up\n\n[User request]")
})
