/** @jsxImportSource @opentui/solid */
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { DialogSubagents } from "../../../src/component/dialog-subagents"
import { TuiConfigProvider } from "../../../src/config"
import { ArgsProvider } from "../../../src/context/args"
import { ExitProvider } from "../../../src/context/exit"
import { KVProvider } from "../../../src/context/kv"
import { LocalProvider, useLocal } from "../../../src/context/local"
import { PermissionProvider } from "../../../src/context/permission"
import { ProjectProvider } from "../../../src/context/project"
import { RouteProvider } from "../../../src/context/route"
import { SDKProvider } from "../../../src/context/sdk"
import { SyncProvider, useSync } from "../../../src/context/sync"
import { ThemeProvider } from "../../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../src/keymap"
import { DialogProvider, useDialog } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "../../fixture/tui-sdk"
import { wait } from "../cmd/tui/sync-fixture"

async function mount(root: string, variants: Record<string, object>) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const events = createEventSource()
  const model = {
    id: "sample",
    providerID: "test",
    name: "Sample",
    variants,
    status: "active",
    release_date: "2026-01-01",
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 10000, output: 1000 },
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: false,
      toolcall: true,
      input: { text: true },
      output: { text: true },
    },
  }
  const calls = createFetch((url) => {
    if (url.pathname === "/config/providers")
      return json({ providers: [{ id: "test", name: "Test", models: { sample: model } }], default: { test: "sample" } })
    if (url.pathname === "/provider")
      return json({
        all: [{ id: "test", name: "Test", models: { sample: model } }],
        connected: ["test"],
        default: { test: "sample" },
      })
    if (url.pathname === "/agent")
      return json([
        { name: "editable", mode: "subagent", native: false },
        { name: "foreign", mode: "subagent", native: false },
      ])
    if (url.pathname === "/agent/sub") return json(["editable"])
  })
  let dialog!: ReturnType<typeof useDialog>
  let sync!: ReturnType<typeof useSync>
  let local!: ReturnType<typeof useLocal>
  function Probe() {
    dialog = useDialog()
    sync = useSync()
    local = useLocal()
    return null
  }
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({})
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={directory} paths={{ state, home: root, worktree: root }}>
        <ArgsProvider>
          <OpencodeKeymapProvider keymap={keymap}>
            <TuiConfigProvider config={config}>
              <KVProvider>
                <SDKProvider url="http://test" directory={directory} events={events.source} fetch={calls.fetch}>
                  <PermissionProvider>
                    <ProjectProvider>
                      <ExitProvider
                        exit={(error) => {
                          throw error
                        }}
                      >
                        <RouteProvider initialRoute={{ type: "home" }}>
                          <SyncProvider>
                            <ThemeProvider mode="dark">
                              <ToastProvider>
                                <LocalProvider>
                                  <DialogProvider>
                                    <Probe />
                                  </DialogProvider>
                                </LocalProvider>
                              </ToastProvider>
                            </ThemeProvider>
                          </SyncProvider>
                        </RouteProvider>
                      </ExitProvider>
                    </ProjectProvider>
                  </PermissionProvider>
                </SDKProvider>
              </KVProvider>
            </TuiConfigProvider>
          </OpencodeKeymapProvider>
        </ArgsProvider>
      </TestTuiContexts>
    )
  }
  const app = await testRender(() => <Harness />, { kittyKeyboard: true, width: 120, height: 40 })
  await wait(() => !!dialog && sync.status === "complete" && local.session.ready)
  dialog.replace(() => <DialogSubagents />)
  await wait(() => app.renderer.currentFocusedEditor instanceof InputRenderable)
  await app.waitForVisualIdle()
  return { app, dialog }
}

test.each([false, true])(
  "model and effort selections hand off to the name prompt (default also selected: %s)",
  async (includeDefault) => {
    await using tmp = await tmpdir()
    const { app, dialog } = await mount(tmp.path, { high: {} })
    try {
      app.mockInput.pressEnter()
      await app.waitForVisualIdle()
      app.mockInput.pressEnter()
      await app.waitForVisualIdle()
      expect(dialog.stack.length).toBe(1)
      // Select high, then move past No effort to the confirmation row.
      app.mockInput.pressEnter()
      app.mockInput.pressArrow("down")
      if (includeDefault) {
        app.mockInput.pressEnter()
        await app.waitForVisualIdle()
        // The options update after toggling; select the confirmation by filtering.
        const filter = app.renderer.currentFocusedEditor
        if (!(filter instanceof InputRenderable)) throw new Error("expected effort picker")
        filter.value = "Add 2"
        await app.waitForVisualIdle()
        app.mockInput.pressEnter()
      }
      if (!includeDefault) {
        app.mockInput.pressArrow("down")
        app.mockInput.pressEnter()
      }
      await wait(() => app.renderer.currentFocusedEditor instanceof TextareaRenderable)
      await app.waitForVisualIdle()
      expect(dialog.stack.length).toBe(1)
      const editor = app.renderer.currentFocusedEditor
      expect(editor instanceof TextareaRenderable && editor.plainText).toBe(
        includeDefault ? "general-sample" : "general-sample-high",
      )
    } finally {
      app.renderer.destroy()
    }
  },
)

test("model without efforts opens the name prompt directly", async () => {
  await using tmp = await tmpdir()
  const { app, dialog } = await mount(tmp.path, {})
  try {
    app.mockInput.pressEnter()
    await app.waitForVisualIdle()
    app.mockInput.pressEnter()
    await wait(() => app.renderer.currentFocusedEditor instanceof TextareaRenderable)
    expect(dialog.stack.length).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})

test("Ctrl+D only opens confirmation for names in the writable file", async () => {
  await using tmp = await tmpdir()
  const { app } = await mount(tmp.path, {})
  try {
    const editor = app.renderer.currentFocusedEditor
    if (!(editor instanceof InputRenderable)) throw new Error("expected picker")
    editor.value = "foreign"
    await app.waitForVisualIdle()
    app.mockInput.pressKey("d", { ctrl: true })
    await app.waitForVisualIdle()
    expect(app.renderer.currentFocusedEditor).toBe(editor)
    editor.value = "editable"
    await app.waitForVisualIdle()
    app.mockInput.pressKey("d", { ctrl: true })
    await app.waitForVisualIdle()
    expect(app.renderer.currentFocusedEditor).not.toBe(editor)
  } finally {
    app.renderer.destroy()
  }
})
