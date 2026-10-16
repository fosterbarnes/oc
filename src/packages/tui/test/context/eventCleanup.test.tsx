/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import type { GlobalEvent } from "@opencode-ai/sdk/v2"
import { useEvent } from "../../src/context/event"
import { SDKProvider } from "../../src/context/sdk"
import { createEventSource, createFetch, directory } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"

const sessionUpdated = {
  directory,
  project: "proj_test",
  payload: {
    id: "evt_cleanup",
    type: "session.updated",
    properties: { info: { id: "ses_cleanup", title: "cleanup", time: { created: 0, updated: 0 }, directory } },
  },
} as unknown as GlobalEvent

test("a handler subscribed under a component runs once after repeated mount and dispose", async () => {
  const events = createEventSource()
  const base = createFetch()
  const [visible, setVisible] = createSignal(false)
  let calls = 0
  function Probe() {
    const event = useEvent()
    event.on("session.updated", () => {
      calls++
    })
    return <box />
  }
  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider url="http://test" directory={directory} fetch={base.fetch} events={events.source}>
        <Show when={visible()}>
          <Probe />
        </Show>
      </SDKProvider>
    </TestTuiContexts>
  ))

  try {
    await Bun.sleep(20)
    for (let i = 0; i < 5; i++) {
      setVisible(true)
      setVisible(false)
    }
    setVisible(true)
    events.emit(sessionUpdated)
    expect(calls).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("unsubscribing again after the owner is disposed is harmless", async () => {
  const events = createEventSource()
  const base = createFetch()
  const [visible, setVisible] = createSignal(true)
  let off: (() => void) | undefined
  function Probe() {
    const event = useEvent()
    off = event.on("session.updated", () => {})
    return <box />
  }
  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider url="http://test" directory={directory} fetch={base.fetch} events={events.source}>
        <Show when={visible()}>
          <Probe />
        </Show>
      </SDKProvider>
    </TestTuiContexts>
  ))

  try {
    await Bun.sleep(20)
    setVisible(false)
    expect(() => off?.()).not.toThrow()
  } finally {
    app.renderer.destroy()
  }
})
