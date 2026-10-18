import { expect, mock, test } from "bun:test"
import path from "node:path"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { ClipboardReadResult, HostClipboardService } from "@opentui/core"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect } from "effect"
import { Global } from "@opencode-ai/core/global"
import { tmpdir } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "../../fixture/tui-sdk"
import { wait } from "../cmd/tui/sync-fixture"

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
// Module scope: src/clipboard caches the first host clipboard, so later cases reuse its read.
let finishRead!: (result: ClipboardReadResult) => void

// Win32 Ctrl+V reads the clipboard through OpenTUI's native host clipboard first. A fast Enter
// after Ctrl+V can arrive as Ctrl+Enter (Ctrl still held), which must submit too, not add a newline.
test.skipIf(process.platform !== "win32").each([
  ["Enter", false],
  ["Ctrl+Enter", true],
])("%s pressed while an image paste is still reading sends the image with the draft", async (_name, ctrl) => {
  await using tmp = await tmpdir()
  await Bun.write(path.join(tmp.path, "kv.json"), "{}")
  const setup = await createTestRenderer({ width: 120, height: 30, useThread: false, kittyKeyboard: true })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({
    ...core,
    createCliRenderer: async () => setup.renderer,
    createHostClipboard: () =>
      ({
        read: () =>
          new Promise<ClipboardReadResult>((resolve) => {
            finishRead = resolve
          }),
      }) as Partial<HostClipboardService> as HostClipboardService,
  }))
  const session = {
    id: "dummy",
    title: "Demo session",
    slug: "dummy",
    projectID: "project",
    directory,
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
  }
  const calls = createFetch((url) => {
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary" }])
    if (url.pathname === "/config/providers")
      return json({
        providers: [{ id: "test", name: "Test", models: { first: { id: "first", name: "first" } } }],
        default: { test: "first" },
      })
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
  })
  const prompts: Array<{ parts: Array<{ type: string; text?: string; mime?: string }> }> = []
  const fetch = (async (request: RequestInfo | URL) => {
    if (
      request instanceof Request &&
      request.method === "POST" &&
      new URL(request.url).pathname === `/session/${session.id}/message`
    ) {
      prompts.push(await request.json())
      return json({})
    }
    return calls.fetch(request)
  }) as typeof globalThis.fetch
  let api: TuiPluginApi | undefined
  let disposeSlots: (() => void) | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../../../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch,
        events: createEventSource().source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            // No plugin claims the prompt slots, so the routes render the real Prompt.
            disposeSlots = input.runtime.setupSlots(input.api).dispose
            started()
          },
          async dispose() {
            disposeSlots?.()
          },
        },
      }).pipe(Effect.provide(Global.layerWith({ state: tmp.path }))),
    )
    await ready
    await wait(() => {
      void setup.renderOnce()
      return api?.route.current.name === "session" && setup.renderer.currentFocusedEditor instanceof TextareaRenderable
    }, 5000)
    const editor = setup.renderer.currentFocusedEditor as TextareaRenderable

    await setup.mockInput.typeText("look")
    setup.mockInput.pressKey("v", { ctrl: true })
    setup.mockInput.pressEnter({ ctrl })
    await Bun.sleep(100)
    expect(prompts).toHaveLength(0)

    finishRead({ status: "read", representation: { mimeType: "image/png", bytes: Buffer.from(PNG, "base64") } })
    await wait(() => prompts.length > 0)
    await Bun.sleep(50)

    expect(prompts).toHaveLength(1)
    const parts = prompts[0].parts
    expect(parts.find((part) => part.type === "text" && part.text?.includes("look"))?.text).toContain("[Image 1]")
    expect(parts.find((part) => part.type === "file")?.mime).toBe("image/png")
    expect(editor.plainText).toBe("")

    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})
