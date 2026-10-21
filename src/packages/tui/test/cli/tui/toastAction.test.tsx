/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

async function mountToast(root: string) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const [{ TuiConfigProvider }, { KVProvider }, { ThemeProvider }, { Toast, ToastProvider, useToast }] =
    await Promise.all([
      import("../../../src/config"),
      import("../../../src/context/kv"),
      import("../../../src/context/theme"),
      import("../../../src/ui/toast"),
    ])

  let toast: ReturnType<typeof useToast> | undefined
  function Probe() {
    toast = useToast()
    return <Toast />
  }
  const app = await testRender(
    () => (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
        <TuiConfigProvider config={createTuiResolvedConfig()}>
          <KVProvider>
            <ThemeProvider mode="dark">
              <ToastProvider>
                <Probe />
              </ToastProvider>
            </ThemeProvider>
          </KVProvider>
        </TuiConfigProvider>
      </TestTuiContexts>
    ),
    { width: 80, height: 24 },
  )
  app.renderer.start()
  await app.waitFor(() => toast !== undefined)
  return { app, toast: toast! }
}

test("action toast shows its label, click runs it, and Notices keeps the action", async () => {
  await using tmp = await tmpdir()
  const { app, toast } = await mountToast(tmp.path)
  try {
    let runs = 0
    toast.show({
      variant: "error",
      title: "MCP server failed: docs",
      message: "boom",
      action: { label: "View details", run: () => runs++ },
    })
    await app.waitForFrame((frame) => frame.includes("View details"))
    expect(toast.notices[0]?.action?.label).toBe("View details")

    toast.activate()
    expect(runs).toBe(1)
    expect(toast.currentToast).toBeNull()
    toast.notices[0]?.action?.run()
    expect(runs).toBe(2)
  } finally {
    app.renderer.destroy()
  }
})

test("hover pause keeps the toast past its duration until resume", async () => {
  await using tmp = await tmpdir()
  const { app, toast } = await mountToast(tmp.path)
  try {
    toast.show({ variant: "info", message: "hello", duration: 40 })
    toast.pause()
    await Bun.sleep(80)
    expect(toast.currentToast?.message).toBe("hello")
    toast.resume()
    await Bun.sleep(80)
    expect(toast.currentToast).toBeNull()
  } finally {
    app.renderer.destroy()
  }
})
