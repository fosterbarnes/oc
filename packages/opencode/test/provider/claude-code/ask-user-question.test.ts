// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
import assert from "node:assert/strict"
import { test } from "node:test"
import {
  denyMessageForTool,
  isAskUserQuestionTool,
} from "@/provider/claude-code/claude-code-language-model.js"

test("isAskUserQuestionTool matches CLI casing variants", () => {
  assert.equal(isAskUserQuestionTool("AskUserQuestion"), true)
  assert.equal(isAskUserQuestionTool("ask_user_question"), true)
  assert.equal(isAskUserQuestionTool("askuserquestion"), true)
  assert.equal(isAskUserQuestionTool("Bash"), false)
  assert.equal(isAskUserQuestionTool(undefined), false)
})

// Regression guard for issue #8 ("Questions are skipped"): the deny message
// must instruct the model to stop and wait, with NO "proceed if
// non-interactive" escape hatch that the model used to take routinely.
test("AskUserQuestion deny message stops unconditionally", () => {
  const msg = denyMessageForTool("AskUserQuestion")
  assert.match(msg, /stop now/i)
  assert.match(msg, /wait for the operator/i)
  assert.match(msg, /do not guess/i)
  // Must explicitly defuse the "the user cancelled, so I'll proceed"
  // rationalization the model otherwise reaches for after the deny.
  assert.match(msg, /not a cancellation/i)
  assert.match(msg, /cancelled, skipped, or declined/i)
  // None of the old "proceed if non-interactive" escape-hatch markers.
  assert.doesNotMatch(msg, /non-interactive/i)
  assert.doesNotMatch(msg, /reasonable/i)
  assert.doesNotMatch(msg, /do not stall/i)
  // Same message regardless of casing.
  assert.equal(denyMessageForTool("ask_user_question"), msg)
})

test("non-question tools point at the proxy", () => {
  assert.equal(
    denyMessageForTool("Bash"),
    "Tool Bash is unavailable here. Use the mcp__opencode_proxy__ tools instead.",
  )
})

// Regression guard for the question proxy path: when "Question" is in
// proxyTools, the model calls `mcp__opencode_proxy__question` instead of
// the native `AskUserQuestion`. The proxy tool name must NOT be matched
// by isAskUserQuestionTool, otherwise the sawAskUserQuestion latch would
// fire on the proxied path too — blocking auto-continue even though the
// proxy already blocked until the operator answered (no waiting needed).
test("proxy question tool name is NOT matched by isAskUserQuestionTool", () => {
  assert.equal(
    isAskUserQuestionTool("mcp__opencode_proxy__question"),
    false,
  )
  assert.equal(isAskUserQuestionTool("mcp__opencode_proxy__Question"), false)
  // The native names the proxy replaces must still match, so the
  // deny/markdown fallback stays correct when the proxy is off.
  assert.equal(isAskUserQuestionTool("AskUserQuestion"), true)
  assert.equal(isAskUserQuestionTool("ask_user_question"), true)
})
