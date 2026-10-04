// @ts-nocheck
import { test } from "node:test"
import assert from "node:assert/strict"
import { renderSessionTail } from "@/tool/session-tail.ts"

const row = (id: string, sessionID: string, text: string) => ({
  info: { id, role: "user", sessionID },
  parts: [{ type: "text", text }],
})

test("session_tail stops at the character budget and ignores another session", () => {
  const messages = [
    row("a", "ses_other", "foreign"),
    ...["b", "c", "d", "e", "f"].map((id) => row(id, "ses_this", "x".repeat(4_000))),
  ]
  const rendered = renderSessionTail(messages, "ses_this", { limit: 20 })
  assert.equal(rendered.truncated, true)
  assert.doesNotMatch(rendered.output, /foreign/)
  assert.ok(rendered.output.length < 16_000 + 100)
})
