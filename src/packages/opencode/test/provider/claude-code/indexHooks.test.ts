// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
// The two hooks the plugin hangs off opencode's V1 plugin API, driven through
// the real `server()` factory rather than by calling their bodies directly.

import assert from "node:assert/strict"
import { test } from "node:test"

// Set before anything calls `server()`: the factory runs the stale-install
// cleanup, which deletes from the real opencode plugin cache.
process.env.OPENCODE_CLAUDE_CODE_PLUGIN_NO_CLEANUP = "1"

import { claudeCodeServer } from "@/provider/claude-code/index.js"
import type { OpenCodeConfig } from "@/provider/claude-code/opencodeTypes.js"
import { getOpencodeClient, getOpencodeProjectDirectory } from "@/provider/claude-code/runtimeStatus.js"

type Hooks = Awaited<ReturnType<typeof claudeCodeServer>>

interface ToastRecord {
  title?: string
  message?: string
  variant?: string
}

function fakeClient(toasts: ToastRecord[] = []) {
  return {
    toasts,
    tui: {
      showToast: async (options: { body: ToastRecord }) => {
        toasts.push(options.body)
        return {}
      },
    },
    session: {
      status: async () => ({ data: {} }),
    },
  }
}

async function buildHooks(input: Record<string, unknown> = {}): Promise<Hooks> {
  return await claudeCodeServer({
    client: fakeClient(),
    directory: "/tmp/opencode-hooks-project",
    ...input,
  })
}

// ---------------------------------------------------------------------------
// server()
// ---------------------------------------------------------------------------

test("server() captures the SDK client and opencode's project directory", async () => {
  const client = fakeClient()
  await claudeCodeServer({
    client,
    directory: "/Users/jan/projects/app",
    worktree: "/Users/jan/projects",
  })

  assert.equal(getOpencodeClient(), client)
  assert.equal(getOpencodeProjectDirectory(), "/Users/jan/projects/app")
})

test("server() falls back to worktree, then to nothing, for the directory", async () => {
  await claudeCodeServer({ client: fakeClient(), directory: "/", worktree: "/Users/jan/wt" })
  assert.equal(getOpencodeProjectDirectory(), "/Users/jan/wt")

  // Neither usable: the captured fallback must stay empty rather than pin the
  // spawn to "/".
  await claudeCodeServer({ client: fakeClient(), directory: "/", worktree: "/" })
  assert.equal(getOpencodeProjectDirectory(), undefined)
})

test("server() exposes the hooks opencode 1.x looks for", async () => {
  const hooks = await buildHooks()
  assert.equal(typeof hooks.config, "function")
  assert.equal(typeof hooks.event, "function")
  // Models come from provider state's catalog seed, not a provider hook.
  assert.equal(hooks.provider, undefined)
  // Session and agent come from session/llm/request.ts now, not a plugin hook.
  assert.equal(hooks["chat.params"], undefined)
})
