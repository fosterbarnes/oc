/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup, onMount } from "solid-js"
import type { DialogSelectOption } from "../../../src/ui/dialog-select"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"

async function wait(fn: () => boolean, timeout = 2000) {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error("timed out waiting for condition")
    await Bun.sleep(10)
  }
}

type SessionValue = { id: string; sessionComplete: boolean; sessionFailed: boolean }

async function waitForActiveCommand(
  app: TestRendererSetup,
  keymap: ReturnType<typeof createDefaultOpenTuiKeymap>,
  command: string,
) {
  await app.waitFor(() => {
    const bindings = keymap.getCommandBindings({ visibility: "active", commands: [command] }).get(command)
    return !!bindings?.length
  })
}

async function mountSessionMarkerDialog(input: {
  root: string
  onComplete: (id: string) => void
  onFailed: (id: string) => void
  onSelect: (id: string) => void
  onBlocked: (key: string) => void
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const [
    { DialogProvider, useDialog },
    { DialogSelect },
    { KVProvider },
    { ThemeProvider, useTheme },
    { TuiConfigProvider },
    { ToastProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
  ] = await Promise.all([
    import("../../../src/ui/dialog"),
    import("../../../src/ui/dialog-select"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/ui/toast"),
    import("../../../src/keymap"),
  ])

  const moves: string[] = []
  let dialogOpen = false

  function SessionTitle(props: { title: string; sessionComplete: boolean; sessionFailed: boolean }) {
    const { theme } = useTheme()
    if (!props.sessionComplete && !props.sessionFailed) return <>{props.title}</>
    return (
      <>
        <span style={{ fg: props.sessionFailed ? theme.error : theme.success }}>
          {props.sessionFailed ? "\u2717" : "\u2713"}
        </span>{" "}
        {props.title}
      </>
    )
  }

  function buildOptions(): DialogSelectOption<SessionValue>[] {
    return [
      {
        title: "Complete session",
        titleView: <SessionTitle title="Complete session" sessionComplete={true} sessionFailed={false} />,
        value: { id: "complete", sessionComplete: true, sessionFailed: false },
      },
      {
        title: "Failed session",
        titleView: <SessionTitle title="Failed session" sessionComplete={false} sessionFailed={true} />,
        value: { id: "failed", sessionComplete: false, sessionFailed: true },
      },
    ]
  }

  function MarkerDialog() {
    const dialog = useDialog()

    function CompetingInputBinding() {
      onMount(() => {
        const off = keymap.registerLayer({
          bindings: [
            {
              key: "ctrl+shift+return",
              desc: "Competing input binding",
              group: "Input",
              cmd: () => input.onBlocked("complete"),
            },
            {
              key: "ctrl+shift+backspace",
              desc: "Competing input binding",
              group: "Input",
              cmd: () => input.onBlocked("failed"),
            },
          ],
        })
        onCleanup(off)
      })

      return null
    }

    onMount(() => {
      dialog.replace(
        () => (
          <>
            <DialogSelect
              title="Sessions"
              options={buildOptions()}
              skipFilter={true}
              onMove={(option) => moves.push(option.value.id)}
              onSelect={(option) => {
                input.onSelect(option.value.id)
                dialog.clear()
              }}
              actions={[
                {
                  command: "session.complete.toggle",
                  title: "complete/incomplete",
                  hidden: (option) => !option,
                  onTrigger: (option) => input.onComplete(option.value.id),
                },
                {
                  command: "session.failed.toggle",
                  title: "failed/not failed",
                  onTrigger: (option) => input.onFailed(option.value.id),
                },
              ]}
            />
            <CompetingInputBinding />
          </>
        ),
        () => {
          dialogOpen = false
        },
      )
      dialogOpen = true
    })

    return null
  }

  let keymap!: ReturnType<typeof createDefaultOpenTuiKeymap>

  function Harness() {
    const renderer = useRenderer()
    keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({ leader_timeout: 1000 })
    const off = registerOpencodeKeymap(keymap, renderer, resolvedConfig)
    onCleanup(off)

    return (
      <TestTuiContexts
        directory={input.root}
        paths={{
          home: input.root,
          state,
          worktree: input.root,
        }}
      >
        <OpencodeKeymapProvider keymap={keymap}>
          <TuiConfigProvider config={resolvedConfig}>
            <KVProvider>
              <ThemeProvider mode="dark">
                <ToastProvider>
                  <DialogProvider>
                    <MarkerDialog />
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true, width: 80, height: 24 })
  return {
    app,
    moves,
    isOpen: () => dialogOpen,
    keymap,
    async cleanup() {
      app.renderer.destroy()
    },
  }
}

test("dialog select session marker shortcuts toggle without closing and return still selects", async () => {
  await using tmp = await tmpdir()
  const complete: string[] = []
  const failed: string[] = []
  const selected: string[] = []
  const blocked: string[] = []
  const dialog = await mountSessionMarkerDialog({
    root: tmp.path,
    onComplete: (id) => complete.push(id),
    onFailed: (id) => failed.push(id),
    onSelect: (id) => selected.push(id),
    onBlocked: (key) => blocked.push(key),
  })

  try {
    await wait(() => dialog.isOpen())
    await dialog.app.waitForVisualIdle()

    await waitForActiveCommand(dialog.app, dialog.keymap, "session.complete.toggle")
    dialog.app.mockInput.pressEnter({ ctrl: true, shift: true })
    await dialog.app.flush()
    await wait(() => complete.length === 1)
    expect(complete).toEqual(["complete"])
    expect(blocked).toEqual([])
    expect(failed).toEqual([])
    expect(selected).toEqual([])
    expect(dialog.isOpen()).toBe(true)

    await waitForActiveCommand(dialog.app, dialog.keymap, "dialog.select.next")
    dialog.app.mockInput.pressArrow("down")
    await dialog.app.flush()
    await wait(() => dialog.moves.at(-1) === "failed")

    await waitForActiveCommand(dialog.app, dialog.keymap, "dialog.select.prev")
    dialog.app.mockInput.pressArrow("up")
    await dialog.app.flush()
    await wait(() => dialog.moves.at(-1) === "complete")

    await waitForActiveCommand(dialog.app, dialog.keymap, "dialog.select.next")
    dialog.app.mockInput.pressArrow("down")
    await dialog.app.flush()
    await wait(() => dialog.moves.at(-1) === "failed")

    await waitForActiveCommand(dialog.app, dialog.keymap, "session.complete.toggle")
    dialog.app.mockInput.pressEnter({ ctrl: true, shift: true })
    await dialog.app.flush()
    await wait(() => complete.length === 2)
    expect(complete).toEqual(["complete", "failed"])
    expect(blocked).toEqual([])

    await waitForActiveCommand(dialog.app, dialog.keymap, "session.failed.toggle")
    dialog.app.mockInput.pressBackspace({ ctrl: true, shift: true })
    dialog.app.mockInput.pressBackspace({ ctrl: true, shift: true })
    await dialog.app.flush()
    await wait(() => failed.length === 2)
    expect(failed).toEqual(["failed", "failed"])
    expect(blocked).toEqual([])
    expect(selected).toEqual([])
    expect(dialog.isOpen()).toBe(true)

    await waitForActiveCommand(dialog.app, dialog.keymap, "dialog.select.submit")
    dialog.app.mockInput.pressEnter()
    await dialog.app.flush()
    await wait(() => selected.length === 1)
    expect(selected).toEqual(["failed"])
    expect(dialog.isOpen()).toBe(false)
  } finally {
    await dialog.cleanup()
  }
})
