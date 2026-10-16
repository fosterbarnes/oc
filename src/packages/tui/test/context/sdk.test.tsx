/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import { onCleanup, onMount } from "solid-js"
import { SDKProvider, useSDK } from "../../src/context/sdk"
import { createFetch, directory } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"

function eventStream(signal?: AbortSignal | null) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          try {
            controller.close()
          } catch {}
        }
        if (signal?.aborted) {
          close()
          return
        }
        signal?.addEventListener("abort", close, { once: true })
      },
    }),
    {
      headers: { "content-type": "text/event-stream" },
    },
  )
}

test("retries an SSE request failure and notifies after the connection is restored", async () => {
  let eventCalls = 0
  let restored = 0
  const base = createFetch()
  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider
        url="http://test"
        directory={directory}
        fetch={Object.assign(
          async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : String(input))
            if (url.pathname === "/global/event" || url.pathname === "/event" || url.pathname === "/api/event") {
              eventCalls++
              if (eventCalls === 1) throw new Error("offline")
              return eventStream(init?.signal)
            }
            return base.fetch(input, init)
          },
          { preconnect: () => {} },
        )}
      >
        {(() => {
          function Probe() {
            const sdk = useSDK()
            onMount(() => {
              onCleanup(
                sdk.onReconnect(() => {
                  restored++
                }),
              )
            })
            return <box />
          }
          return <Probe />
        })()}
      </SDKProvider>
    </TestTuiContexts>
  ))

  try {
    const start = Date.now()
    while (restored < 1) {
      if (Date.now() - start > 5000) throw new Error("timed out waiting for reconnect")
      await Bun.sleep(20)
    }
    expect(eventCalls).toBeGreaterThanOrEqual(2)
    expect(restored).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("clears restored-connection subscribers when the SDK provider unmounts", async () => {
  let eventCalls = 0
  let restored = 0
  const base = createFetch()
  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider
        url="http://test"
        directory={directory}
        fetch={Object.assign(
          async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(input instanceof Request ? input.url : String(input))
            if (url.pathname === "/global/event" || url.pathname === "/event" || url.pathname === "/api/event") {
              eventCalls++
              if (eventCalls === 1) throw new Error("offline")
              return eventStream(init?.signal)
            }
            return base.fetch(input, init)
          },
          { preconnect: () => {} },
        )}
      >
        {(() => {
          function Probe() {
            const sdk = useSDK()
            onMount(() => {
              onCleanup(
                sdk.onReconnect(() => {
                  restored++
                }),
              )
            })
            return <box />
          }
          return <Probe />
        })()}
      </SDKProvider>
    </TestTuiContexts>
  ))

  const start = Date.now()
  while (restored < 1) {
    if (Date.now() - start > 5000) throw new Error("timed out waiting for reconnect")
    await Bun.sleep(20)
  }
  app.renderer.destroy()
  const after = restored
  await Bun.sleep(1200)
  expect(restored).toBe(after)
})

test("does not flush stale batched events after SDK destroy", async () => {
  const emitted: unknown[] = []
  let captured: ((event: unknown) => void) | undefined
  const events = {
    subscribe: async (handler: (event: unknown) => void) => {
      captured = handler
      return () => {
        captured = undefined
      }
    },
  } as unknown as import("../../src/context/sdk").EventSource
  const base = createFetch()
  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider
        url="http://test"
        directory={directory}
        fetch={Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => base.fetch(input, init), {
          preconnect: () => {},
        })}
        events={events}
      >
        {(() => {
          function Probe() {
            const sdk = useSDK()
            onMount(() => {
              const off = sdk.event.on("event" as any, (e) => emitted.push(e))
              onCleanup(off)
            })
            return <box />
          }
          return <Probe />
        })()}
      </SDKProvider>
    </TestTuiContexts>
  ))
  try {
    await Bun.sleep(20)
    // trigger batch window: two events within 16ms should start a timer
    const evt = {
      type: "session.updated",
      properties: { info: { id: "dummy", directory, time: { created: 0, updated: 0 } } },
    } as unknown as import("@opencode-ai/sdk/v2").GlobalEvent
    captured?.(evt as any)
    captured?.(evt as any)
    // destroy before 16ms batch timer fires - stale timer protection should prevent second flush
    // first event flushed immediately, second stays queued; after destroy queued flush is cancelled
    app.renderer.destroy()
    await Bun.sleep(40)
    expect(emitted.length).toBe(1)
  } finally {
    if (!app.renderer.isDestroyed) app.renderer.destroy()
  }
})

test("a throwing handler does not stop later handlers or later events", async () => {
  const received: unknown[] = []
  let captured: ((event: unknown) => void) | undefined
  const events = {
    subscribe: async (handler: (event: unknown) => void) => {
      captured = handler
      return () => {
        captured = undefined
      }
    },
  } as unknown as import("../../src/context/sdk").EventSource
  const base = createFetch()
  const app = await testRender(() => (
    <TestTuiContexts>
      <SDKProvider
        url="http://test"
        directory={directory}
        fetch={Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => base.fetch(input, init), {
          preconnect: () => {},
        })}
        events={events}
      >
        {(() => {
          function Probe() {
            const sdk = useSDK()
            onMount(() => {
              sdk.event.on("event", () => {
                throw new Error("handler failed")
              })
              sdk.event.on("event", (event) => received.push(event))
            })
            return <box />
          }
          return <Probe />
        })()}
      </SDKProvider>
    </TestTuiContexts>
  ))
  try {
    await Bun.sleep(20)
    const evt = {
      directory,
      project: "proj_test",
      payload: { id: "evt_throw", type: "server.connected", properties: {} },
    } as unknown as import("@opencode-ai/sdk/v2").GlobalEvent
    captured?.(evt)
    captured?.(evt)
    await Bun.sleep(40)
    expect(received.length).toBe(2)
  } finally {
    if (!app.renderer.isDestroyed) app.renderer.destroy()
  }
})
