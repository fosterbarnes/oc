import { expect, mock, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"

// Before v0.2.325 the session prompt sat in a replace-mode plugin slot as a fragment, so the queue strip
// appearing re-created the whole Prompt, whose fresh empty snapshot hid the strip and refetched: a
// remount and queue fetch per round trip for as long as anything was queued.
test("a queued prompt shows its strip without remounting the session prompt", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const session = {
    id: "dummy",
    title: "Demo session",
    slug: "dummy",
    projectID: "project",
    directory,
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
  }
  let queueGets = 0
  const calls = createFetch((url) => {
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
    if (url.pathname === `/session/${session.id}/queue`) {
      queueGets++
      return json({
        pause: "none",
        entries: [
          { id: "msg_queued", state: "pending", text: "/pass", attachments: 0, target: "current", chain: false },
        ],
      })
    }
  })
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          // Slots set up with no plugin, as in the app: the prompt renders as the slot's fallback.
          async start(input) {
            input.runtime.setupSlots(input.api)
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    const start = Date.now()
    let escaped = 0
    while (!setup.captureCharFrame().includes("QUEUED")) {
      if (Date.now() - start > 10_000) throw new Error(`queue strip never showed\n${setup.captureCharFrame()}`)
      // With no provider configured the app opens its provider dialog over the prompt. Presses stay
      // apart so the input parser does not read two Escapes as one Alt sequence.
      if (setup.captureCharFrame().includes("Connect a provider") && Date.now() - escaped > 300) {
        setup.mockInput.pressEscape()
        escaped = Date.now()
      }
      await setup.renderOnce()
      await Bun.sleep(10)
    }
    const shown = queueGets
    await Bun.sleep(1000)
    await setup.renderOnce()
    // Only the 2 s poll may refetch; the old loop refetched on every round trip.
    expect(queueGets - shown).toBeLessThanOrEqual(1)
    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
}, 20_000)
