// @ts-nocheck
import { test } from "node:test"
import assert from "node:assert/strict"
import { claudePromptTokens, contextUsage, toUsage } from "@/provider/claude-code/usage.js"

test("last assistant usage is kept and the cumulative result sum is not", () => {
  const cumulative = {
    input_tokens: 100_000,
    output_tokens: 8_000,
    cache_read_input_tokens: 80_000,
    cache_creation_input_tokens: 1_000,
  }
  const last = {
    input_tokens: 1_200,
    output_tokens: 40,
    cache_read_input_tokens: 300,
    cache_creation_input_tokens: 10,
  }
  const usage = toUsage(contextUsage(last))
  assert.equal(usage.inputTokens.total, 1_510)
  assert.equal(usage.outputTokens.total, 40)
  assert.notEqual(claudePromptTokens(last), claudePromptTokens(cumulative))
  assert.equal(claudePromptTokens(last), 1_550)
})
