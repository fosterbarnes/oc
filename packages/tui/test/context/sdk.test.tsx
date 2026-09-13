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
        fetch={Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(input instanceof Request ? input.url : String(input))
          if (url.pathname === "/global/event" || url.pathname === "/event" || url.pathname === "/api/event") {
            eventCalls++
            if (eventCalls === 1) throw new Error("offline")
            return eventStream(init?.signal)
          }
          return base.fetch(input, init)
        }, { preconnect: () => {} })}
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
        fetch={Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = new URL(input instanceof Request ? input.url : String(input))
          if (url.pathname === "/global/event" || url.pathname === "/event" || url.pathname === "/api/event") {
            eventCalls++
            if (eventCalls === 1) throw new Error("offline")
            return eventStream(init?.signal)
          }
          return base.fetch(input, init)
        }, { preconnect: () => {} })}
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
