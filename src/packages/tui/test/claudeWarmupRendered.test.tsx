/** @jsxImportSource @opentui/solid */
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { Flock } from "@opencode-ai/core/util/flock"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import path from "path"
import { onCleanup } from "solid-js"
import {
  createClaudeWarmupCommands,
  readWarmupPresets,
  saveWarmupPreset,
  type ClaudeWarmupAccount,
} from "../src/claudeWarmup"
import { CommandPaletteDialog } from "../src/component/command-palette"
import { TuiConfigProvider } from "../src/config"
import { ArgsProvider } from "../src/context/args"
import { ExitProvider } from "../src/context/exit"
import { KVProvider } from "../src/context/kv"
import { PermissionProvider } from "../src/context/permission"
import { ProjectProvider } from "../src/context/project"
import { RouteProvider } from "../src/context/route"
import { SDKProvider } from "../src/context/sdk"
import { SyncProvider } from "../src/context/sync"
import { ThemeProvider } from "../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap, useBindings } from "../src/keymap"
import { DialogProvider, useDialog } from "../src/ui/dialog"
import { DialogSelect } from "../src/ui/dialog-select"
import { ToastProvider } from "../src/ui/toast"
import { tmpdir } from "./fixture/fixture"
import { TestTuiContexts } from "./fixture/tui-environment"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"
import { wait } from "./cli/cmd/tui/sync-fixture"

async function mount(root: string, parent?: "oc" | "all" | "usage", leadingCommands = 0) {
  await Bun.write(path.join(root, "kv.json"), "{}")
  const account: ClaudeWarmupAccount = {
    accountID: "default",
    label: "Test account",
    enabled: false,
    schedule: { mode: "daily", times: ["07:00"] },
  }
  const puts: unknown[] = []
  const calls = createFetch()
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (new URL(request.url).pathname !== "/global/claude/warmup") return calls.fetch(input, init)
    if (request.method === "PUT") {
      const body = await request.json()
      puts.push(body)
      return json({ ...account, ...body })
    }
    return json({ accounts: [account], available: true, timeZone: "UTC", utcOffset: "Z" })
  }) as typeof globalThis.fetch
  let dialog!: ReturnType<typeof useDialog>
  let warmup!: ReturnType<typeof createClaudeWarmupCommands>
  function Probe() {
    dialog = useDialog()
    warmup = createClaudeWarmupCommands()
    useBindings(() => ({
      commands: [
        ...Array.from({ length: leadingCommands }, (_, index) => ({
          namespace: "palette",
          name: `oc.earlier.${index}`,
          title: `Earlier command ${index}`,
          category: "oc",
          run: () => {},
        })),
        ...warmup.commands().map((command) => ({ namespace: "palette", ...command })),
      ],
    }))
    return null
  }
  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({})
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={directory} paths={{ state: root, home: root, worktree: root }}>
        <ArgsProvider>
          <OpencodeKeymapProvider keymap={keymap}>
            <TuiConfigProvider config={config}>
              <KVProvider>
                <SDKProvider url="http://test" directory={directory} events={createEventSource().source} fetch={fetch}>
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
  const app = await testRender(() => <Harness />, { kittyKeyboard: true, width: 120, height: 50 })
  await wait(() => warmup?.commands().length === 1)
  if (parent === "usage") {
    dialog.replace(() => (
      <DialogSelect
        title="Usage"
        options={[
          {
            title: "Schedule Claude warm-up",
            value: "warmup",
            onSelect: () => warmup.commands()[0].run(),
          },
        ]}
      />
    ))
  } else if (parent) {
    dialog.replace(() => <CommandPaletteDialog category={parent === "oc" ? "oc" : undefined} />)
  } else {
    warmup.commands()[0].run()
  }
  async function choose(title: string) {
    await wait(
      () =>
        app.renderer.currentFocusedEditor instanceof InputRenderable && !app.renderer.currentFocusedEditor.isDestroyed,
    )
    const filter = app.renderer.currentFocusedEditor
    if (!(filter instanceof InputRenderable)) throw new Error("Expected picker")
    filter.value = title
    await app.waitForVisualIdle()
    const previous = dialog.stack.at(-1)?.element
    app.mockInput.pressEnter()
    await wait(() => dialog.stack.at(-1)?.element !== previous).catch((error) => {
      throw new Error(`Picker did not select "${title}":\n${app.captureCharFrame()}`, { cause: error })
    })
    await wait(() => app.renderer.currentFocusedEditor !== filter)
    await app.waitForVisualIdle()
  }
  async function textarea() {
    await wait(
      () =>
        app.renderer.currentFocusedEditor instanceof TextareaRenderable &&
        !(app.renderer.currentFocusedEditor instanceof InputRenderable) &&
        !app.renderer.currentFocusedEditor.isDestroyed,
    )
    const editor = app.renderer.currentFocusedEditor
    if (!(editor instanceof TextareaRenderable)) throw new Error("Expected prompt")
    return editor
  }
  async function back() {
    const previous = app.renderer.currentFocusedEditor
    const element = dialog.stack.at(-1)?.element
    app.mockInput.pressEscape()
    await wait(() => dialog.stack.at(-1)?.element !== element && app.renderer.currentFocusedEditor !== previous)
    await app.waitForVisualIdle()
  }
  async function frame() {
    await app.renderOnce()
    return app.captureCharFrame()
  }
  async function unfilter() {
    await wait(
      () =>
        app.renderer.currentFocusedEditor instanceof InputRenderable && !app.renderer.currentFocusedEditor.isDestroyed,
    )
    ;(app.renderer.currentFocusedEditor as InputRenderable).value = ""
    await app.waitForVisualIdle()
  }
  return { app, dialog, puts, choose, textarea, back, frame, unfilter }
}

test("Escape returns through warm-up screens to the menu that opened the editor", async () => {
  await using tmp = await tmpdir()
  for (const parent of ["oc", "all", "usage"] as const) {
    const ui = await mount(tmp.path, parent)
    try {
      await ui.choose("Schedule Claude warm-up")
      await ui.choose("Every day")
      await ui.choose("Monday:")
      await ui.back()
      expect(await ui.frame()).toContain("Monday:")
      await ui.back()
      expect(ui.dialog.stack).toHaveLength(1)
      expect(await ui.frame()).toContain(parent === "usage" ? "Usage" : "Commands")
      if (parent !== "usage") {
        expect(await ui.frame()).toContain(
          parent === "oc" ? "Third party harness management" : "oc Third party harness management",
        )
      }
      await ui.back()
      expect(ui.dialog.stack).toHaveLength(0)
      expect(ui.puts).toEqual([])
    } finally {
      ui.app.renderer.destroy()
    }
  }
}, 15_000)

test("back restores the selected row and search at each menu level", async () => {
  await using tmp = await tmpdir()
  const ui = await mount(tmp.path, "oc")
  try {
    await ui.choose("Schedule Claude warm-up")
    await ui.choose("Every day")
    await ui.unfilter()
    ui.app.mockInput.pressArrow("down")
    ui.app.mockInput.pressArrow("down")
    ui.app.mockInput.pressArrow("down")
    ui.app.mockInput.pressEnter()
    await ui.textarea()
    expect(await ui.frame()).toContain("Wednesday")
    await ui.back()
    expect(ui.app.renderer.currentFocusedEditor).toBeInstanceOf(InputRenderable)
    expect((ui.app.renderer.currentFocusedEditor as InputRenderable).value).toBe("")
    ui.app.mockInput.pressEnter()
    await ui.textarea()
    expect(await ui.frame()).toContain("Wednesday")
    await ui.back()
    await ui.choose("Save preset")
    await ui.back()
    ui.app.mockInput.pressEnter()
    await ui.textarea()
    expect(await ui.frame()).toContain("Save preset")
    await ui.back()
    await ui.back()
    expect((ui.app.renderer.currentFocusedEditor as InputRenderable).value).toBe("Schedule Claude warm-up")
    ui.app.mockInput.pressEnter()
    await wait(
      () =>
        ui.app.renderer.currentFocusedEditor instanceof InputRenderable &&
        ui.app.renderer.currentFocusedEditor.value !== "Schedule Claude warm-up",
    )
    expect(await ui.frame()).toContain("Schedule Claude warm-up: Test account")
    expect(ui.puts).toEqual([])
  } finally {
    ui.app.renderer.destroy()
  }
}, 15_000)

test("back scrolls the restored palette row into view before another key is pressed", async () => {
  await using tmp = await tmpdir()
  const ui = await mount(tmp.path, "oc", 40)
  try {
    await ui.unfilter()
    expect(await ui.frame()).not.toContain("Schedule Claude warm-up: Test account")
    ui.app.mockInput.pressArrow("up")
    await ui.app.waitForVisualIdle()
    expect(await ui.frame()).toContain("Schedule Claude warm-up: Test account")
    const filter = ui.app.renderer.currentFocusedEditor
    ui.app.mockInput.pressEnter()
    await wait(
      () =>
        ui.app.renderer.currentFocusedEditor instanceof InputRenderable &&
        ui.app.renderer.currentFocusedEditor !== filter,
    )
    await ui.app.waitForVisualIdle()
    await ui.back()
    expect(await ui.frame()).toContain("Commands")
    expect(await ui.frame()).toContain("Schedule Claude warm-up: Test account")
    expect((ui.app.renderer.currentFocusedEditor as InputRenderable).value).toBe("")
  } finally {
    ui.app.renderer.destroy()
  }
}, 15_000)

test("rendered presets preserve drafts, confirm replacement, and activate only on Save", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "claudeWarmupPresets.json")
  await saveWarmupPreset(file, "Weekly", {
    mode: "weekly",
    days: { mon: ["08:00"], tue: [], wed: [], thu: [], fri: [], sat: [], sun: ["22:00"] },
  })
  const ui = await mount(tmp.path)
  try {
    await ui.choose("Times:")
    ;(await ui.textarea()).setText("09:00")
    ui.app.mockInput.pressEnter()
    await ui.choose("Save preset")
    ;(await ui.textarea()).setText("Draft")
    await ui.back()
    await ui.unfilter()
    expect(await ui.frame()).toContain("Times: 09:00")
    await ui.choose("Save preset")
    ;(await ui.textarea()).setText("Draft")
    ui.app.mockInput.pressEnter()
    await wait(asyncReady)
    function asyncReady() {
      return ui.app.renderer.currentFocusedEditor instanceof InputRenderable
    }
    expect(await readWarmupPresets(file)).toContainEqual({
      name: "Draft",
      schedule: { mode: "daily", times: ["09:00"] },
    })
    await ui.choose("Save preset")
    ;(await ui.textarea()).setText(" draft ")
    const firstPrompt = ui.dialog.stack.at(-1)?.element
    ui.app.mockInput.pressEnter()
    await wait(() => ui.dialog.stack.at(-1)?.element !== firstPrompt)
    expect(await ui.frame()).toContain('Replace preset "Draft"?')
    await ui.back()
    expect((await ui.textarea()).plainText).toBe(" draft ")
    const retryPrompt = ui.dialog.stack.at(-1)?.element
    ui.app.mockInput.pressEnter()
    await wait(() => ui.dialog.stack.at(-1)?.element !== retryPrompt)
    expect(await ui.frame()).toContain('Replace preset "Draft"?')
    ui.app.mockInput.pressArrow("right")
    ui.app.mockInput.pressEnter()
    expect((await ui.textarea()).plainText).toBe(" draft ")
    const secondPrompt = ui.dialog.stack.at(-1)?.element
    ui.app.mockInput.pressEnter()
    await wait(() => ui.dialog.stack.at(-1)?.element !== secondPrompt)
    ui.app.mockInput.pressEnter()
    await wait(() => ui.app.renderer.currentFocusedEditor instanceof InputRenderable)
    expect((await readWarmupPresets(file)).find((preset) => preset.name === "draft")).toBeDefined()
    await ui.choose("Load preset")
    await ui.back()
    await ui.unfilter()
    expect(await ui.frame()).toContain("Times: 09:00")
    await ui.choose("Load preset")
    await ui.choose("Weekly")
    await ui.unfilter()
    expect(await ui.frame()).toContain("Monday: 08:00")
    expect(await ui.frame()).toContain("Tuesday: (none)")
    expect(await ui.frame()).toContain("Sunday 22:00")
    expect(ui.puts).toEqual([])
    await ui.choose("Save")
    await wait(() => ui.dialog.stack.length === 0)
    expect(ui.puts).toEqual([
      { accountID: "default", enabled: true, schedule: (await readWarmupPresets(file))[0].schedule },
    ])
  } finally {
    ui.app.renderer.destroy()
  }
}, 15_000)

test("rendered pending preset save ignores duplicate submit and never reopens dismissed dialogs", async () => {
  await using tmp = await tmpdir()
  const file = path.join(tmp.path, "claudeWarmupPresets.json")
  const ui = await mount(tmp.path)
  const lock = await Flock.acquire(file, { dir: path.join(tmp.path, "locks") })
  try {
    await ui.choose("Save preset")
    ;(await ui.textarea()).setText("Pending")
    ui.app.mockInput.pressEnter()
    ui.app.mockInput.pressEnter()
    await ui.back()
    expect(await ui.frame()).toContain("Schedule Claude warm-up: Test account")
    expect((ui.app.renderer.currentFocusedEditor as InputRenderable).value).toBe("Save preset")
    ui.dialog.clear()
  } finally {
    await lock.release()
  }
  try {
    await wait(() => Bun.file(file).size > 0)
    // Acquiring the same lock waits for the write and release, not a timing guess.
    await Flock.withLock(file, async () => {}, { dir: path.join(tmp.path, "locks") })
    await ui.app.waitForVisualIdle()
    expect(ui.dialog.stack).toHaveLength(0)
    expect(await readWarmupPresets(file)).toHaveLength(1)
    expect(ui.puts).toEqual([])
  } finally {
    ui.app.renderer.destroy()
  }
}, 15_000)
