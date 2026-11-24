/** @jsxImportSource @opentui/solid */
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { afterAll, expect, mock, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { TuiConfigProvider } from "../../../src/config"
import { ArgsProvider } from "../../../src/context/args"
import { ExitProvider } from "../../../src/context/exit"
import { KVProvider } from "../../../src/context/kv"
import { PermissionProvider } from "../../../src/context/permission"
import { ProjectProvider } from "../../../src/context/project"
import { RouteProvider } from "../../../src/context/route"
import { SDKProvider } from "../../../src/context/sdk"
import { SyncProvider } from "../../../src/context/sync"
import { ThemeProvider } from "../../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../../src/keymap"
import { DialogProvider, useDialog } from "../../../src/ui/dialog"
import { ToastProvider } from "../../../src/ui/toast"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { createEventSource, createFetch, directory } from "../../fixture/tui-sdk"

const originalSettings = { ...(await import("../../../src/ocSettings")) }
const saves: { resolve: (saved: boolean) => void }[] = []
mock.module("../../../src/ocSettings", () => ({
  ...originalSettings,
  persistOcConfig: () => new Promise<boolean>((resolve) => saves.push({ resolve })),
}))
const { createOcCommands } = await import("../../../src/ocCommands")
afterAll(() => mock.module("../../../src/ocSettings", () => originalSettings))

test("setting saves do not close a dialog opened while saving", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const events = createEventSource()
  const calls = createFetch()
  const config = createTuiResolvedConfig()
  let dialog!: ReturnType<typeof useDialog>
  let open!: (name: string) => void

  function Probe() {
    dialog = useDialog()
    const commands = createOcCommands({
      claudeCliPath: () => path.join(tmp.path, "missing-claude"),
      controlServer: async () => {},
      reloadInstance: async () => {},
    })
    open = (name) => {
      const command = commands.settings.find((item) => item.name === name)
      if (!command) throw new Error(`Missing command: ${name}`)
      command.run()
    }
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={directory} paths={{ home: tmp.path, state, worktree: tmp.path }}>
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
                                <DialogProvider>
                                  <Probe />
                                </DialogProvider>
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

  const app = await testRender(() => <Harness />, {
    kittyKeyboard: true,
    width: 100,
    height: 30,
  })
  app.renderer.start()
  try {
    await app.waitFor(() => !!open && !!dialog)
    for (const [index, name] of ["oc.home_dir", "oc.home_dir_sort", "oc.oc_dir", "oc.server_startup"].entries()) {
      open(name)
      const prompt = name === "oc.home_dir" || name === "oc.oc_dir"
      await app.waitFor(() =>
        prompt
          ? app.renderer.currentFocusedEditor instanceof TextareaRenderable
          : app.renderer.currentFocusedEditor instanceof InputRenderable,
      )
      if (prompt) {
        const editor = app.renderer.currentFocusedEditor
        if (!(editor instanceof TextareaRenderable)) throw new Error("Expected folder prompt")
        editor.setText(tmp.path)
      }
      app.mockInput.pressEnter()
      await app.waitFor(() => saves.length === index + 1 && dialog.stack.length === 1)

      dialog.escape()
      dialog.replace(() => <box />)
      const unrelated = dialog.stack.at(-1)
      saves[index].resolve(true)
      await Promise.resolve()

      expect(dialog.stack.length).toBe(1)
      expect(dialog.stack.at(-1)).toBe(unrelated)
      dialog.clear()
    }

    const count = saves.length
    open("oc.home_dir_sort")
    await app.waitFor(() => app.renderer.currentFocusedEditor instanceof InputRenderable)
    app.mockInput.pressEnter()
    await app.waitFor(() => saves.length === count + 1)
    saves.at(-1)!.resolve(true)
    await Promise.resolve()
    expect(dialog.stack.length).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})
