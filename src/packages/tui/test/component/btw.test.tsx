/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir, wait } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { TestTuiContexts } from "../fixture/tui-environment"
import { eventSource, json } from "../fixture/tui-sdk"
import { DialogBtw, type BtwTarget } from "../../src/component/dialogBtw"
import { SDKProvider } from "../../src/context/sdk"
import { KVProvider } from "../../src/context/kv"
import { ThemeProvider } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { ToastProvider } from "../../src/ui/toast"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"

const target: BtwTarget = {
  sessionID: "ses_btw",
  model: { providerID: "test", modelID: "test-model" },
  agent: "build",
  variant: undefined,
}

// The generate endpoint is the only route the dialog calls. `respond` decides how it answers, and
// `calls` records each request body and whether its signal was aborted.
async function mountBtw(input: {
  root: string
  question?: string
  respond: (request: Request) => Promise<Response> | Response
  calls: { body: unknown; aborted: boolean }[]
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const fetch = Object.assign(
    async (url: Request | string | URL, init?: RequestInit) => {
      const request = new Request(url, init)
      if (new URL(request.url).pathname !== `/session/${target.sessionID}/generate`) return json({}, { status: 404 })
      const call = { body: await request.clone().json(), aborted: false }
      input.calls.push(call)
      request.signal.addEventListener("abort", () => (call.aborted = true))
      return input.respond(request)
    },
    { preconnect: () => {} },
  )

  // Opens the dialog the way the prompt does, so Esc goes through the dialog stack.
  function Open() {
    const dialog = useDialog()
    dialog.replace(() => <DialogBtw target={target} question={input.question} />)
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    return (
      <TestTuiContexts directory={input.root} paths={{ home: input.root, state, worktree: input.root }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <SDKProvider url="http://btw.test" fetch={fetch} events={eventSource()}>
                    <DialogProvider>
                      <Open />
                    </DialogProvider>
                  </SDKProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 100, height: 40 })
  return {
    app,
    async frameContains(text: string) {
      await app.renderOnce()
      return app.captureCharFrame().includes(text)
    },
    async cleanup() {
      app.renderer.destroy()
    },
  }
}

test("renders the markdown answer and sends the question with the captured model and agent", async () => {
  await using tmp = await tmpdir()
  const calls: { body: unknown; aborted: boolean }[] = []
  const btw = await mountBtw({
    root: tmp.path,
    question: "what is two plus two?",
    calls,
    respond: () => json({ text: "It is **four**.", providerID: "test", modelID: "test-model" }),
  })

  try {
    await wait(() => calls.length > 0)
    await wait(() => btw.app.captureCharFrame().includes("four"))
    expect(await btw.frameContains("c copy")).toBe(true)
    expect(calls[0].body).toEqual({
      prompt: "what is two plus two?",
      model: { providerID: "test", modelID: "test-model" },
      agent: "build",
    })
  } finally {
    await btw.cleanup()
  }
})

test("shows the server's error message when the side question is refused", async () => {
  await using tmp = await tmpdir()
  const calls: { body: unknown; aborted: boolean }[] = []
  const btw = await mountBtw({
    root: tmp.path,
    question: "anything?",
    calls,
    respond: () =>
      json(
        {
          _tag: "UnsupportedProviderError",
          providerID: "claude-code",
          message: "/btw is not available on Claude Code yet",
        },
        { status: 422 },
      ),
  })

  try {
    await wait(() => btw.app.captureCharFrame().includes("is not available on Claude Code yet"))
    expect(await btw.frameContains("c copy")).toBe(false)
  } finally {
    await btw.cleanup()
  }
})

test("escape aborts only the pending side request", async () => {
  await using tmp = await tmpdir()
  const calls: { body: unknown; aborted: boolean }[] = []
  const btw = await mountBtw({
    root: tmp.path,
    question: "still thinking?",
    calls,
    respond: (request) =>
      new Promise<Response>((_, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      }),
  })

  try {
    await wait(() => calls.length > 0)
    expect(await btw.frameContains("Waiting for the answer")).toBe(true)
    btw.app.mockInput.pressEscape()
    await wait(() => calls[0].aborted)
    expect(calls[0].aborted).toBe(true)
  } finally {
    await btw.cleanup()
  }
})
