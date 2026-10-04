// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
import assert from "node:assert/strict"
import { readFileSync, statSync, unlinkSync } from "node:fs"
import { dirname } from "node:path"
import { test } from "node:test"
import { buildAppendedSystemPrompt } from "@/provider/claude-code/prompts.js"
import { pluginTmpDir } from "@/provider/claude-code/tmp.js"
import { isOverflow } from "@/session/overflow"

// Claude Code compacts its own conversation, so oc never auto-compacts a
// Claude chat: the same token count that overflows another provider does not.
test("isOverflow is false for claude-code models and unchanged for others", () => {
  const model = (providerID: string) => ({ providerID, limit: { context: 200_000, output: 32_000 } })
  const tokens = { total: 199_000, input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }
  assert.equal(isOverflow({ cfg: {}, tokens, model: model("anthropic") }), true)
  assert.equal(isOverflow({ cfg: {}, tokens, model: model("claude-code") }), false)
  assert.equal(isOverflow({ cfg: {}, tokens, model: model("claude-code-work") }), false)
})

// The prompt file can carry an agent's private instructions. It must land
// inside the plugin's own 0700 scratch directory and be 0600, not loose in a
// shared OS tmpdir at the umask default.
test("the system prompt file is written 0600 inside the plugin scratch directory", () => {
  const promptFile = buildAppendedSystemPrompt({ agentPrompt: "SECRET-PROMPT-SENTINEL" })
  assert.ok(promptFile)
  try {
    assert.equal(dirname(promptFile), pluginTmpDir())
    if (process.platform !== "win32") {
      assert.equal(statSync(promptFile).mode & 0o777, 0o600)
      assert.equal(statSync(pluginTmpDir()).mode & 0o777, 0o700)
    }
    assert.match(readFileSync(promptFile, "utf8"), /SECRET-PROMPT-SENTINEL/)
  } finally {
    unlinkSync(promptFile)
  }
})
