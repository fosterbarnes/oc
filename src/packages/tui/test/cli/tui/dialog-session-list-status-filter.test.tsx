/** @jsxImportSource @opentui/solid */
import { InputRenderable, TextAttributes, TextRenderable, type Renderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import type { Session } from "@opencode-ai/sdk/v2"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { DialogSessionList } from "../../../src/component/dialog-session-list"
import { TuiConfigProvider } from "../../../src/config"
import { ArgsProvider } from "../../../src/context/args"
import { ExitProvider } from "../../../src/context/exit"
import { KVProvider } from "../../../src/context/kv"
import { LocalProvider, useLocal } from "../../../src/context/local"
import { PermissionProvider } from "../../../src/context/permission"
import { ProjectProvider } from "../../../src/context/project"
import { RouteProvider, useRoute } from "../../../src/context/route"
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

function session(id: string, title: string, flags: Partial<Session> = {}): Session {
  return {
    id,
    title,
    slug: id,
    projectID: "proj_test",
    directory,
    version: "1",
    time: { created: 1, updated: 1 },
    ...flags,
  }
}

function find(root: Renderable, id: string): Renderable | undefined {
  if (root.id === id) return root
  return root.getChildren().map((child) => find(child, id)).find((child) => child !== undefined)
}

type MarkerUpdate = { sessionID: string; sessionInProgress?: boolean; sessionComplete?: boolean; sessionFailed?: boolean }

async function mount(input: {
  root: string
  rows: Session[]
  cached?: Session[]
  current?: string
  pinned?: string[]
  list?: (url: URL) => Response | Promise<Response>
  update?: (payload: MarkerUpdate) => Session | Response
  cycleKey?: string | false
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  await Bun.write(path.join(state, "session.json"), JSON.stringify({ pinned: input.pinned ?? [] }))
  const events = createEventSource()
  const updates: MarkerUpdate[] = []
  const requests: URL[] = []
  const navigated: string[] = []
  const calls = createFetch((url) => {
    if (url.pathname === "/config/providers") return json({ providers: [], default: {} })
    if (url.pathname === "/project/proj_test/directories") return json([{ directory }])
    if (url.pathname !== "/experimental/session") return
    if (!url.searchParams.has("roots")) return json(input.cached ?? input.rows)
    requests.push(url)
    return input.list?.(url) ?? json(input.rows)
  })
  const fetch = (async (request: RequestInfo | URL) => {
    if (request instanceof Request && request.method === "PATCH" && new URL(request.url).pathname.startsWith("/session/")) {
      const payload = {
        ...(await request.json()),
        sessionID: new URL(request.url).pathname.split("/").at(-1),
      } as MarkerUpdate
      updates.push(payload)
      const result = input.update?.(payload)
      if (result instanceof Response) return result
      if (!result) throw new Error("unexpected session update")
      events.emit({
        directory,
        project: "proj_test",
        payload: { id: "evt_test", type: "session.updated", properties: { sessionID: result.id, info: result } },
      })
      return json(result)
    }
    return calls.fetch(request)
  }) as typeof globalThis.fetch

  let dialog!: ReturnType<typeof useDialog>
  let route!: ReturnType<typeof useRoute>
  let sync!: ReturnType<typeof useSync>
  let local!: ReturnType<typeof useLocal>
  let keymap!: ReturnType<typeof createDefaultOpenTuiKeymap>

  function Probe() {
    dialog = useDialog()
    route = useRoute()
    sync = useSync()
    local = useLocal()
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig({
      keybinds: input.cycleKey === undefined ? {} : { "dialog.session.status.cycle": input.cycleKey },
    })
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts directory={directory} paths={{ state, home: input.root, worktree: input.root }}>
        <ArgsProvider>
          <OpencodeKeymapProvider keymap={keymap}>
            <TuiConfigProvider config={config}>
              <KVProvider>
                <SDKProvider url="http://test" directory={directory} events={events.source} fetch={fetch}>
                  <PermissionProvider>
                    <ProjectProvider>
                      <ExitProvider exit={(error) => { throw error }}>
                        <RouteProvider
                          initialRoute={input.current ? { type: "session", sessionID: input.current } : { type: "home" }}
                          onSessionChange={(id) => navigated.push(id)}
                        >
                          <SyncProvider>
                            <ThemeProvider mode="dark">
                              <ToastProvider>
                                <LocalProvider>
                                  <DialogProvider><Probe /></DialogProvider>
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
  const open = async () => {
    dialog.replace(() => <DialogSessionList />)
    await wait(() => app.renderer.currentFocusedEditor instanceof InputRenderable)
    await app.waitForVisualIdle()
  }
  await open()
  const editor = () => {
    const value = app.renderer.currentFocusedEditor
    if (!(value instanceof InputRenderable)) throw new Error("picker input lost focus")
    return value
  }
  return {
    app, dialog, route, sync, local, keymap, updates, requests, navigated, open, editor,
    activeStatus(status: string) {
      const label = find(app.renderer.root, `session-status-${status}`)?.getChildren()[0]
      return label instanceof TextRenderable && (label.attributes & TextAttributes.BOLD) !== 0
    },
    async clickStatus(status: string) {
      await app.waitForVisualIdle()
      const choice = find(app.renderer.root, `session-status-${status}`)
      if (!choice) throw new Error(`missing status choice: ${status}`)
      await app.mockMouse.click(choice.x + 1, choice.y)
      await app.flush()
    },
    async cycle() {
      app.mockInput.pressKey("s", { ctrl: true })
      await app.flush()
    },
    async frame() {
      await app.waitForVisualIdle()
      return app.captureCharFrame()
    },
    async [Symbol.asyncDispose]() { app.renderer.destroy() },
  }
}

test("real picker cycles/clicks all filters, keeps search and attachment, and resets on reopen", async () => {
  await using tmp = await tmpdir()
  const rows = [
    session("unmarked", "Work unmarked", { time: { created: 1, updated: 4 } }),
    session("progress", "Work progress", { sessionInProgress: true, time: { created: 1, updated: 3 } }),
    session("complete", "Work complete", { sessionComplete: true, time: { created: 1, updated: 2 } }),
    session("failed", "Work failed", { sessionFailed: true }),
  ]
  const pinned = session("pinned", "Other pinned", { sessionFailed: true })
  const current = session("current", "Other current", { sessionComplete: true })
  await using picker = await mount({ root: tmp.path, rows, cached: [...rows, pinned, current], current: current.id, pinned: [pinned.id] })
  expect(picker.activeStatus("all")).toBe(true)
  expect(await picker.frame()).toContain("ctrl+s")
  expect(await picker.frame()).toContain("- Work progress")
  expect(await picker.frame()).toContain("\u2713 Work complete")
  expect(await picker.frame()).toContain("\u2717 Work failed")
  expect(await picker.frame()).toContain("Other pinned")
  const editor = picker.editor()
  picker.app.mockInput.typeText("Work")
  await wait(() => picker.requests.some((url) => url.searchParams.get("search") === "Work"))
  for (const [status, title, visible] of [
    ["unmarked", "Unmarked", "Work unmarked"],
    ["in_progress", "In Progress", "Work progress"],
    ["pinned", "Pinned", null],
    ["complete", "Complete", "Work complete"],
    ["failed", "Failed", "Work failed"],
    [null, "All", "Work unmarked"],
  ] as const) {
    await picker.cycle()
    await wait(() =>
      picker.requests.some(
        (url) =>
          url.searchParams.get("search") === "Work" &&
          url.searchParams.get("status") === (status === "pinned" ? null : status) &&
          url.searchParams.get("limit") === "30",
      ),
    )
    const frame = await picker.frame()
    expect(frame).toContain(title)
    expect(picker.activeStatus(status ?? "all")).toBe(true)
    if (visible) expect(frame).toContain(visible)
    if (!visible) expect(frame).toContain("No matching sessions")
    if (status) rows.filter((row) => row.title !== visible).forEach((row) => expect(frame).not.toContain(row.title))
    expect(picker.editor()).toBe(editor)
    expect(editor.plainText).toBe("Work")
    expect(frame).not.toContain("Other pinned")
    expect(frame).not.toContain("Other current")
    expect(picker.route.data).toMatchObject({ type: "session", sessionID: "current" })
    expect(picker.navigated).toEqual([])
  }
  await picker.clickStatus("failed")
  expect(picker.activeStatus("failed")).toBe(true)
  picker.dialog.clear()
  await picker.app.flush()
  const beforeReopen = picker.requests.length
  await picker.open()
  await wait(() =>
    picker.requests.slice(beforeReopen).some((url) => url.searchParams.get("status") === null && url.searchParams.get("limit") === "100" && url.searchParams.get("search") === null),
  )
  expect(picker.activeStatus("all")).toBe(true)
  expect(picker.editor().plainText).toBe("")
  expect(picker.route.data).toMatchObject({ type: "session", sessionID: "current" })
})

test("real picker filters pinned/current extras and retains quick slots without switching sessions", async () => {
  await using tmp = await tmpdir()
  const rows = [session("progress", "Visible progress", { sessionInProgress: true })]
  const cached = [
    ...rows,
    session("pinned-failed", "Hidden pin", { sessionFailed: true }),
    session("current", "Hidden current", { sessionComplete: true }),
  ]
  await using picker = await mount({ root: tmp.path, rows, cached, current: "current", pinned: ["pinned-failed", "progress"] })
  await picker.clickStatus("in_progress")
  const frame = await picker.frame()
  expect(picker.activeStatus("in_progress")).toBe(true)
  expect(frame).toContain("Visible progress")
  expect(frame).not.toContain("Hidden pin")
  expect(frame).not.toContain("Hidden current")
  expect(frame).toMatch(/◆\s+- Visible progress/)
  expect(picker.local.session.slots()).toEqual(["pinned-failed", "progress"])
  expect(picker.route.data).toMatchObject({ type: "session", sessionID: "current" })
  expect(picker.navigated).toEqual([])
  await picker.clickStatus("pinned")
  expect(picker.activeStatus("pinned")).toBe(true)
  expect(await picker.frame()).toContain("Hidden pin")
  expect(await picker.frame()).toContain("Visible progress")
  expect(await picker.frame()).not.toContain("Hidden current")
  picker.local.session.togglePin("pinned-failed")
  await picker.app.waitForFrame((frame) => !frame.includes("Hidden pin"))
  expect(await picker.frame()).toContain("Visible progress")
})

test("real marker actions remove rows, preserve valid selection, do nothing when empty, and recover", async () => {
  await using tmp = await tmpdir()
  const rows = [
    session("first", "First progress", { sessionInProgress: true, time: { created: 1, updated: 2 } }),
    session("second", "Second progress", { sessionInProgress: true }),
  ]
  const current = session("current", "Attached unmarked")
  await using picker = await mount({
    root: tmp.path, rows, cached: [...rows, current], current: "current",
    update(payload) {
      const row = rows.find((row) => row.id === payload.sessionID)
      if (!row) throw new Error("updated a hidden row")
      expect(payload).toEqual({ sessionID: row.id, sessionComplete: true })
      Object.assign(row, { sessionInProgress: false, sessionComplete: true })
      return row
    },
  })
  await picker.cycle()
  await picker.cycle()
  await wait(() => picker.activeStatus("in_progress"))
  picker.app.mockInput.pressArrow("down")
  await picker.app.flush()
  picker.app.mockInput.pressEnter({ ctrl: true, shift: true })
  await wait(() => picker.updates.length === 1)
  expect(picker.updates[0].sessionID).toBe("second")
  await picker.app.waitForFrame((frame) => !frame.includes("Second progress"))
  picker.app.mockInput.pressEnter({ ctrl: true, shift: true })
  await wait(() => picker.updates.length === 2)
  expect(picker.updates[1].sessionID).toBe("first")
  await picker.app.waitForFrame((frame) => frame.includes("No matching sessions"))
  expect(await picker.frame()).not.toContain("ctrl+shift+enter")
  picker.app.mockInput.pressEnter()
  picker.app.mockInput.pressEnter({ ctrl: true, shift: true })
  picker.app.mockInput.pressBackspace({ ctrl: true, shift: true })
  picker.app.mockInput.pressKey("i", { ctrl: true, shift: true })
  await picker.app.flush()
  expect(picker.updates).toHaveLength(2)
  expect(picker.route.data).toMatchObject({ type: "session", sessionID: "current" })
  expect(picker.dialog.stack).toHaveLength(1)
  await picker.cycle()
  expect(picker.activeStatus("pinned")).toBe(true)
  await picker.cycle()
  expect(picker.activeStatus("complete")).toBe(true)
  expect(await picker.frame()).toContain("First progress")
  picker.app.mockInput.pressEnter()
  await picker.app.flush()
  expect(picker.route.data).toMatchObject({ type: "session", sessionID: "first" })
  expect(picker.dialog.stack).toHaveLength(0)
})

test("empty selection recovers even after End and filter changes clear delete confirmation", async () => {
  await using tmp = await tmpdir()
  const rows = [session("first", "First unmarked"), session("second", "Second unmarked")]
  await using picker = await mount({ root: tmp.path, rows })
  for (let i = 0; i < 5; i++) await picker.cycle()
  expect(await picker.frame()).toContain("No matching sessions")
  picker.app.mockInput.pressKey("end")
  picker.app.mockInput.pressEnter()
  await picker.app.flush()
  expect(picker.dialog.stack).toHaveLength(1)
  await picker.cycle()
  await picker.cycle()
  picker.app.mockInput.pressEnter()
  await picker.app.flush()
  expect(picker.route.data).toMatchObject({ type: "session", sessionID: "first" })
})

test("late filter/search responses never replace the active query and successful empty results stay empty", async () => {
  await using tmp = await tmpdir()
  const pending: { url: URL; resolve: (response: Response) => void }[] = []
  const rows = [session("cache", "Cached unmarked")]
  await using picker = await mount({
    root: tmp.path, rows,
    list(url) {
      if (!url.searchParams.get("status") && !url.searchParams.get("search")) return json(rows)
      return new Promise((resolve) => pending.push({ url, resolve }))
    },
  })
  await picker.cycle()
  await wait(() => pending.some((item) => item.url.searchParams.get("status") === "unmarked"))
  await picker.cycle()
  await wait(() => pending.some((item) => item.url.searchParams.get("status") === "in_progress"))
  pending.filter((item) => item.url.searchParams.get("status") === "in_progress").forEach((item) => item.resolve(json([session("new-progress", "New progress", { sessionInProgress: true })])))
  await picker.app.waitForFrame((frame) => frame.includes("New progress"))
  pending.filter((item) => item.url.searchParams.get("status") === "unmarked").forEach((item) => item.resolve(json([session("old-progress", "Old progress", { sessionInProgress: true })])))
  await picker.app.flush()
  expect(await picker.frame()).toContain("New progress")
  expect(await picker.frame()).not.toContain("Old progress")
  picker.app.mockInput.typeText("alpha")
  await wait(() => pending.some((item) => item.url.searchParams.get("search") === "alpha" && item.url.searchParams.get("status") === "in_progress"))
  await picker.cycle()
  expect(picker.activeStatus("pinned")).toBe(true)
  await picker.cycle()
  await wait(() => pending.some((item) => item.url.searchParams.get("search") === "alpha" && item.url.searchParams.get("status") === "complete"))
  pending
    .filter((item) => item.url.searchParams.get("status") === "in_progress" && item.url.searchParams.get("search") === "alpha")
    .forEach((item) => item.resolve(json([session("old-search", "alpha stale", { sessionInProgress: true })])))
  pending
    .filter((item) => item.url.searchParams.get("status") === "complete" && item.url.searchParams.get("search") === "alpha")
    .forEach((item) => item.resolve(json([])))
  await picker.app.waitForFrame((frame) => frame.includes("No matching sessions"))
  expect(await picker.frame()).not.toContain("alpha stale")
  expect(await picker.frame()).not.toContain("Cached unmarked")
  expect(picker.navigated).toEqual([])
})

test("picker cycle shortcut is configurable and remains usable without rows", async () => {
  await using tmp = await tmpdir()
  await using picker = await mount({ root: tmp.path, rows: [], cycleKey: "ctrl+g" })
  expect(await picker.frame()).toContain("ctrl+g")
  await picker.cycle()
  expect(picker.activeStatus("all")).toBe(true)
  picker.app.mockInput.pressKey("g", { ctrl: true })
  await picker.app.flush()
  expect(picker.activeStatus("unmarked")).toBe(true)
  expect(picker.dialog.stack).toHaveLength(1)
})
