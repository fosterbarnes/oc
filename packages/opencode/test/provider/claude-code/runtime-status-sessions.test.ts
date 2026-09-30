// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
// The session lookups every caller treats as advisory: a wrong answer here
// either aborts a live turn (run state) or spawns Claude in the wrong project
// (directory). All of them must degrade to "I don't know" rather than guess,
// so the failure shapes are pinned as hard as the happy paths.

import assert from "node:assert/strict"
import { test } from "node:test"

import {
  fetchSessionDirectory,
  fetchSessionRunState,
  setOpencodeClient,
} from "@/provider/claude-code/runtime-status.js"

/**
 * `setOpencodeClient` ignores null, so "no client captured" is expressed as a
 * client with none of the routes: `client?.session?.get` is the branch under
 * test either way.
 */
const NO_ROUTES = {}

interface SessionGetCall {
  path: { id: string }
  query?: { directory?: string }
}

function clientWithSessionGet(
  handler: (call: SessionGetCall) => unknown,
): { calls: SessionGetCall[] } {
  const calls: SessionGetCall[] = []
  setOpencodeClient({
    session: {
      get: async (options: SessionGetCall) => {
        calls.push(options)
        return handler(options)
      },
    },
  })
  return { calls }
}

// ---------------------------------------------------------------------------
// fetchSessionDirectory
// ---------------------------------------------------------------------------

test("fetchSessionDirectory returns the session's own project directory", async () => {
  const probe = clientWithSessionGet(() => ({
    data: { id: "ses_1", directory: "/home/jan/proj", parentID: undefined },
  }))

  assert.equal(await fetchSessionDirectory("ses_1"), "/home/jan/proj")
  assert.deepEqual(probe.calls, [{ path: { id: "ses_1" } }])
})

test("fetchSessionDirectory refuses the ids that mean 'no session'", async () => {
  const probe = clientWithSessionGet(() => ({ data: { directory: "/x/y" } }))

  assert.equal(await fetchSessionDirectory("default"), undefined)
  assert.equal(await fetchSessionDirectory(""), undefined)
  // The route is never even called for those: the "default" bucket is the
  // plugin's own placeholder, not an opencode session id.
  assert.deepEqual(probe.calls, [])
})

test("fetchSessionDirectory falls back on an unusable or missing directory", async () => {
  for (const directory of ["/", "", "x", 42, null, undefined]) {
    clientWithSessionGet(() => ({ data: { directory } }))
    assert.equal(
      await fetchSessionDirectory("ses_1"),
      undefined,
      `directory ${JSON.stringify(directory)} should not be used`,
    )
  }
})

test("fetchSessionDirectory survives a malformed or rejected response", async () => {
  for (const data of [undefined, null, "a string", 7]) {
    clientWithSessionGet(() => ({ data }))
    assert.equal(await fetchSessionDirectory("ses_1"), undefined)
  }

  clientWithSessionGet(() => {
    throw new Error("connection refused")
  })
  assert.equal(await fetchSessionDirectory("ses_1"), undefined)

  setOpencodeClient(NO_ROUTES)
  assert.equal(await fetchSessionDirectory("ses_1"), undefined)
})

// ---------------------------------------------------------------------------
// fetchSessionRunState
// ---------------------------------------------------------------------------

interface StatusProbe {
  calls: number
  /** Whether every call arrived with `this` bound to `client.session`. */
  boundCorrectly: boolean
}

function clientWithStatus(
  handler: (call: number) => unknown,
): StatusProbe {
  const probe: StatusProbe = { calls: 0, boundCorrectly: true }
  const session = {
    marker: "session-object",
    status: async function (this: unknown) {
      probe.calls++
      // The call site is `status.call(client.session)`. An unbound call would
      // leave `this` undefined and break a real SDK client's own internals.
      if ((this as { marker?: string })?.marker !== "session-object") {
        probe.boundCorrectly = false
      }
      return handler(probe.calls)
    },
  }
  setOpencodeClient({ session })
  return probe
}

test("a session opencode reports as running is busy", async () => {
  const probe = clientWithStatus(() => ({
    data: { ses_1: { type: "running" }, ses_2: { type: "idle" } },
  }))

  assert.equal(await fetchSessionRunState("ses_1"), "busy")
  assert.equal(probe.boundCorrectly, true)
})

test("idle means idle, and so does absent from the status map", async () => {
  clientWithStatus(() => ({ data: { ses_1: { type: "idle" } } }))

  assert.equal(await fetchSessionRunState("ses_1"), "idle")
  // opencode only lists sessions it is tracking; a missing one is finished.
  assert.equal(await fetchSessionRunState("ses_unlisted"), "idle")
})

test("an entry with no recognizable type is treated as busy, not idle", async () => {
  // Erring towards busy is deliberate: releasing a pending proxy call on a
  // guess is the expensive mistake.
  clientWithStatus(() => ({ data: { ses_1: { type: "some-future-state" } } }))
  assert.equal(await fetchSessionRunState("ses_1"), "busy")

  clientWithStatus(() => ({ data: { ses_1: {} } }))
  assert.equal(await fetchSessionRunState("ses_1"), "busy")
})

test("no client, no route, no data or a rejection all read as unknown", async () => {
  setOpencodeClient(NO_ROUTES)
  assert.equal(await fetchSessionRunState("ses_1"), "unknown")

  for (const data of [undefined, null, "not an object"]) {
    clientWithStatus(() => ({ data }))
    assert.equal(await fetchSessionRunState("ses_1"), "unknown")
  }

  clientWithStatus(() => {
    throw new Error("socket hang up")
  })
  assert.equal(await fetchSessionRunState("ses_1"), "unknown")
})

test("the 'default' bucket has no run state to read", async () => {
  const probe = clientWithStatus(() => ({ data: { default: { type: "running" } } }))

  assert.equal(await fetchSessionRunState("default"), "unknown")
  assert.equal(await fetchSessionRunState(""), "unknown")
  assert.equal(probe.calls, 0)
})

