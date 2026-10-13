/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { onCleanup } from "solid-js"
import { createTodoCommand } from "../src/todos"
import { CommandPaletteDialog } from "../src/component/command-palette"
import { TuiConfigProvider } from "../src/config"
import { ArgsProvider } from "../src/context/args"
import { ClipboardProvider } from "../src/context/clipboard"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { PermissionProvider } from "../src/context/permission"
import { ProjectProvider } from "../src/context/project"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncProvider, useSync } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap, useBindings } from "../src/keymap"
import { DialogProvider, useDialog } from "../src/ui/dialog"
import { ToastProvider, useToast } from "../src/ui/toast"
import { tmpdir } from "./fixture/fixture"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"
import { wait } from "./cli/cmd/tui/sync-fixture"

test("todo palette persists confirmed changes and waits for configuration reload", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const config = createTuiResolvedConfig()
  const events = createEventSource()
  const writes: boolean[] = []
  const state: {
    global?: boolean
    project?: boolean
    fail: boolean
    response?: ReturnType<typeof Promise.withResolvers<Response>>
  } = {
    fail: false,
  }
  const fallback = createFetch((url) => {
    if (url.pathname === "/config") return json({ todos: state.project ?? state.global })
  })
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (new URL(request.url).pathname !== "/global/config") return fallback.fetch(input, init)
    if (request.method === "GET") return json({ todos: state.global })
    if (state.fail) return json({ message: "Cannot write config" }, { status: 500 })
    const body = (await request.json()) as { todos: boolean }
    state.global = body.todos
    writes.push(body.todos)
    if (state.response) return state.response.promise
    return json({ todos: body.todos })
  }) as typeof globalThis.fetch
  let command!: ReturnType<typeof createTodoCommand>
  let sync!: ReturnType<typeof useSync>
  let toast!: ReturnType<typeof useToast>
  let dialog!: ReturnType<typeof useDialog>

  function Probe() {
    sync = useSync()
    toast = useToast()
    dialog = useDialog()
    command = createTodoCommand()
    useBindings(() => ({ commands: [{ namespace: "palette", ...command }] }))
    return <text>{command.title}</text>
  }

  function Harness() {
    const keymap = createDefaultOpenTuiKeymap(useRenderer())
    onCleanup(registerOpencodeKeymap(keymap, useRenderer(), config))
    return (
      <TestTuiContexts paths={{ state: tmp.path, home: tmp.path }}>
        <ArgsProvider>
          <OpencodeKeymapProvider keymap={keymap}>
            <TuiConfigProvider config={config}>
              <KVProvider>
                <SDKProvider url="http://test" directory={directory} fetch={fetcher} events={events.source}>
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
                              <ClipboardProvider value={{ write: async () => {} }}>
                                <ToastProvider>
                                  <DialogProvider>
                                    <Probe />
                                  </DialogProvider>
                                </ToastProvider>
                              </ClipboardProvider>
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

  const app = await testRender(() => <Harness />, { width: 90, height: 30, kittyKeyboard: true })
  const reload = async () => {
    const epoch = sync.configReloadEpoch
    events.emit({
      directory: "global",
      project: "proj_test",
      payload: { id: "evt_disposed", type: "server.instance.disposed", properties: { directory: "global" } },
    })
    await wait(() => sync.configReloadEpoch > epoch)
  }
  const confirm = async () => {
    await app.waitForFrame((frame) => frame.includes("reload configuration?"))
    app.mockInput.pressEnter()
  }
  try {
    await wait(() => sync?.status === "complete")
    expect(command.name).toBe("oc.todos.toggle")
    expect(command.category).toBe("oc")
    expect(command.group).toBe("Defaults")
    expect(command.desc).toBe("off")
    expect(command.enabled).toBe(true)

    dialog.replace(() => <CommandPaletteDialog />)
    await app.waitForFrame((frame) => frame.includes("oc Defaults") && frame.includes("Todos off"))
    dialog.replace(() => <CommandPaletteDialog category="oc" />)
    await app.waitForFrame((frame) => !frame.includes("oc Defaults") && frame.includes("Defaults"))
    app.mockInput.pressEnter()
    await app.waitForFrame((frame) => frame.includes("Enable todos?"))
    app.mockInput.pressEscape()
    await wait(() => command.enabled)
    expect(writes).toEqual([])
    expect(command.enabled).toBe(true)

    state.response = Promise.withResolvers<Response>()
    const enabled = command.run()
    await reload() // A reload while the confirmation is open cannot settle this save.
    await confirm()
    await wait(() => writes.length === 1)
    expect(command.enabled).toBe(false)
    await command.run()
    expect(writes).toEqual([true])
    await reload() // SSE/bootstrap can finish before the PATCH response.
    expect(command.enabled).toBe(false)
    state.response.resolve(json({ todos: true }))
    await enabled
    await wait(() => command.enabled)
    state.response = undefined
    expect(command.desc).toBe("on")
    expect(toast.currentToast?.message).toBe("Todos enabled")

    const disabled = command.run()
    await confirm()
    await disabled
    expect(command.enabled).toBe(false)
    expect(command.desc).toBe("on")
    await reload()
    await wait(() => command.enabled)
    expect(command.desc).toBe("off")
    expect(writes).toEqual([true, false])

    state.fail = true
    const failed = command.run()
    await confirm()
    await failed
    expect(command.enabled).toBe(true)
    expect(command.desc).toBe("off")
    expect(toast.currentToast?.variant).toBe("error")
    expect(writes).toEqual([true, false])
    state.fail = false

    state.project = true
    await sync.bootstrap()
    expect(command.desc).toBe("on")
    const overridden = command.run()
    await confirm()
    await overridden // Global is already false; no disposal event will be emitted.
    expect(command.enabled).toBe(true)
    expect(command.desc).toBe("on")
    expect(toast.currentToast?.message).toContain("project configuration overrides")
    expect(writes).toEqual([true, false])

    state.project = undefined
    await sync.bootstrap()
    expect(command.desc).toBe("off")
    state.global = true
    await reload() // Another TUI's saved preference follows the same lifecycle.
    expect(command.desc).toBe("on")
  } finally {
    app.renderer.destroy()
  }
})
