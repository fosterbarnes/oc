/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"
import { createSignal, onCleanup } from "solid-js"
import { tmpdir } from "../fixture/fixture"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createEventSource, createFetch, directory, json, type FetchHandler } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"

function request(id: string): PermissionRequest {
  return { id, sessionID: "ses_1", permission: "bash", patterns: ["ls"], metadata: {}, always: ["ls *"] }
}

async function frameWith(app: { renderOnce: () => Promise<void>; captureCharFrame: () => string }, text: string) {
  const start = Date.now()
  while (true) {
    await app.renderOnce()
    const frame = app.captureCharFrame()
    if (frame.includes(text)) return frame
    if (Date.now() - start > 2000) throw new Error(`frame never showed: ${text}`)
    await Bun.sleep(10)
  }
}

async function mountPrompt(root: string) {
  const state = `${root}/state`
  await mkdir(state, { recursive: true })
  await Bun.write(`${state}/kv.json`, "{}")

  const replies: string[] = []
  const replyStatus = { value: 500 }
  const override: FetchHandler = (url) => {
    if (!url.pathname.endsWith("/reply")) return undefined
    replies.push(url.pathname)
    if (replyStatus.value === 200) return json(true)
    if (replyStatus.value === 404)
      return json(
        { _tag: "PermissionNotFoundError", requestID: "per_1", message: "Permission request not found" },
        { status: 404 },
      )
    return json({ message: "reply rejected" }, { status: replyStatus.value })
  }
  const calls = createFetch(override)
  const events = createEventSource()
  const [current, setRequest] = createSignal(request("per_1"))

  const [
    { ArgsProvider },
    { KVProvider },
    { SDKProvider },
    { PermissionProvider },
    { ProjectProvider },
    { ExitProvider },
    { RouteProvider },
    { SyncProvider },
    { ThemeProvider },
    { LocationProvider },
    { Toast, ToastProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
    { TuiConfigProvider },
    { PermissionPrompt },
  ] = await Promise.all([
    import("../../src/context/args"),
    import("../../src/context/kv"),
    import("../../src/context/sdk"),
    import("../../src/context/permission"),
    import("../../src/context/project"),
    import("../../src/context/exit"),
    import("../../src/context/route"),
    import("../../src/context/sync"),
    import("../../src/context/theme"),
    import("../../src/context/location"),
    import("../../src/ui/toast"),
    import("../../src/keymap"),
    import("../../src/config"),
    import("../../src/routes/session/permission"),
  ])

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    return (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <ArgsProvider>
              <KVProvider>
                <ThemeProvider mode="dark">
                  <ToastProvider>
                    <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={events.source}>
                      <PermissionProvider>
                        <ProjectProvider>
                          <ExitProvider exit={() => {}}>
                            <RouteProvider>
                              <SyncProvider>
                                <LocationProvider>
                                  <PermissionPrompt request={current()} directory={directory} />
                                  <Toast />
                                </LocationProvider>
                              </SyncProvider>
                            </RouteProvider>
                          </ExitProvider>
                        </ProjectProvider>
                      </PermissionProvider>
                    </SDKProvider>
                  </ToastProvider>
                </ThemeProvider>
              </KVProvider>
            </ArgsProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  return {
    app,
    replies,
    replyStatus,
    setRequest,
    async cleanup() {
      app.renderer.destroy()
    },
  }
}

async function waitForReplies(prompt: Awaited<ReturnType<typeof mountPrompt>>, count: number) {
  const start = Date.now()
  while (prompt.replies.length < count) {
    if (Date.now() - start > 2000) throw new Error("reply never sent")
    await prompt.app.renderOnce()
    await Bun.sleep(10)
  }
}

test("highlighting Allow always previews its patterns and selecting it replies in one step", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountPrompt(tmp.path)

  try {
    await frameWith(prompt.app, "Shell command")
    prompt.app.mockInput.pressArrow("right")
    const frame = await frameWith(prompt.app, "- ls *")
    expect(frame).toContain("This will allow the following patterns")
    expect(prompt.replies).toEqual([])

    prompt.replyStatus.value = 200
    prompt.app.mockInput.pressEnter()
    await waitForReplies(prompt, 1)
    expect(prompt.replies).toEqual(["/permission/per_1/reply"])
  } finally {
    await prompt.cleanup()
  }
})

test("a reply for a request the server no longer has does not show an error", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountPrompt(tmp.path)

  try {
    await frameWith(prompt.app, "Shell command")
    prompt.replyStatus.value = 404
    prompt.app.mockInput.pressEnter()
    await waitForReplies(prompt, 1)
    for (let frame = 0; frame < 10; frame++) {
      await prompt.app.renderOnce()
      await Bun.sleep(10)
    }
    expect(prompt.app.captureCharFrame()).not.toContain("Permission reply failed")
  } finally {
    await prompt.cleanup()
  }
})

test("a failed permission reply keeps the prompt on screen and shows an error toast", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountPrompt(tmp.path)

  try {
    await frameWith(prompt.app, "Shell command")
    prompt.app.mockInput.pressEnter()

    const frame = await frameWith(prompt.app, "Permission reply failed")
    expect(frame).toContain("Shell command")
    expect(prompt.replies).toEqual(["/permission/per_1/reply"])

    prompt.replyStatus.value = 200
    prompt.app.mockInput.pressEnter()
    const start = Date.now()
    while (prompt.replies.length < 2) {
      if (Date.now() - start > 2000) throw new Error("retry never sent")
      await prompt.app.renderOnce()
      await Bun.sleep(10)
    }
    expect(prompt.replies).toEqual(["/permission/per_1/reply", "/permission/per_1/reply"])
  } finally {
    await prompt.cleanup()
  }
})
