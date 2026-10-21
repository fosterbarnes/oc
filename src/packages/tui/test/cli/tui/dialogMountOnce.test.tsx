/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createSignal, onCleanup, onMount } from "solid-js"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

test("a dialog whose root reads a signal mounts once while the signal changes", async () => {
  await using tmp = await tmpdir()
  const state = path.join(tmp.path, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const config = createTuiResolvedConfig()
  const [
    { TuiConfigProvider },
    { KVProvider },
    { ThemeProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
    { DialogProvider, useDialog },
    { ToastProvider },
  ] = await Promise.all([
    import("../../../src/config"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/keymap"),
    import("../../../src/ui/dialog"),
    import("../../../src/ui/toast"),
  ])

  const [pending, setPending] = createSignal(false)
  let mounts = 0

  function Pending() {
    onMount(() => mounts++)
    return <text>{pending() ? "Working" : "Idle"}</text>
  }

  function Fixture() {
    const dialog = useDialog()
    onMount(() =>
      dialog.replace(() => {
        // A signal read at the dialog root, as a top-level early return would do.
        pending()
        return <Pending />
      }),
    )
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={tmp.path} paths={{ home: tmp.path, state, worktree: tmp.path }}>
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={config}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <DialogProvider>
                    <Fixture />
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { width: 60, height: 12 })
  try {
    app.renderer.start()
    await app.waitForFrame((frame) => frame.includes("Idle"))
    setPending(true)
    await app.waitForFrame((frame) => frame.includes("Working"))
    setPending(false)
    await app.waitForFrame((frame) => frame.includes("Idle"))
    expect(mounts).toBe(1)
  } finally {
    app.renderer.destroy()
  }
})
