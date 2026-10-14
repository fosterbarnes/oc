import { expect, mock, test } from "bun:test"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/core/global"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { createEventSource, createFetch, directory, json } from "./fixture/tui-sdk"
import { Prompt } from "../src/component/prompt"

test("SIGHUP clears title and disposes scoped resources once", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const titles: string[] = []
  const setTitle = setup.renderer.setTerminalTitle.bind(setup.renderer)
  setup.renderer.setTerminalTitle = (title) => {
    titles.push(title)
    setTitle(title)
  }
  const listeners = new Set(process.listeners("SIGHUP"))
  const events = createEventSource()
  const calls = createFetch()
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })
  let disposes = 0

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start() {
            started()
          },
          async dispose() {
            disposes++
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    process.emit("SIGHUP")
    await task

    expect(setup.renderer.isDestroyed).toBe(true)
    expect(titles.at(-1)).toBe("")
    expect(disposes).toBe(1)
    expect(process.listeners("SIGHUP").every((listener) => listeners.has(listener))).toBe(true)
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("app.exit prints the session epilogue after scoped cleanup", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/experimental/session")
      return json([
        {
          id: "dummy",
          title: "Demo session",
          slug: "dummy",
          projectID: "project",
          directory,
          version: "0.0.0-test",
          time: { created: 0, updated: 0 },
        },
      ])
  })
  const originalWrite = process.stdout.write.bind(process.stdout)
  let stdout = ""
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )

    await ready
    await setup.renderOnce()
    await setup.renderOnce()
    api?.keymap.dispatchCommand("app.exit")
    await task

    expect(stdout).toContain("Demo session")
    expect(stdout).toContain("opencode -s dummy")
  } finally {
    process.stdout.write = originalWrite
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("restart from a session keeps that session after reconnect", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
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
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === "/global/restart") return json({})
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
  })
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    await setup.renderOnce()
    api?.keymap.dispatchCommand("server.restart")
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    events.emit({
      directory,
      project: "proj_test",
      payload: { id: "evt_disposed", type: "server.instance.disposed", properties: { directory } },
    })
    events.reconnect()
    await Bun.sleep(200)
    await setup.renderOnce()
    expect(setup.renderer.isDestroyed).toBe(false)
    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("restart from home returns home after reconnect", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/global/restart") return json({})
  })
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    await setup.renderOnce()
    api?.keymap.dispatchCommand("server.restart")
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    events.emit({
      directory,
      project: "proj_test",
      payload: { id: "evt_disposed", type: "server.instance.disposed", properties: { directory } },
    })
    events.reconnect()
    await Bun.sleep(200)
    await setup.renderOnce()
    expect(setup.renderer.isDestroyed).toBe(false)
    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

// Disposal bootstrap is nonfatal (/reload), so a cancelled restart shows up as an ordinary resync, not an exit.
test("failed restart cancels recovery so a later disposal takes the ordinary resync path", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  let failNextProviders = false
  let failedProviderCalls = 0
  const calls = createFetch((url) => {
    if (url.pathname === "/global/restart") throw new Error("unavailable")
    if (url.pathname === "/config/providers") {
      if (failNextProviders) {
        failedProviderCalls++
        throw new Error("disposed")
      }
      return json({ providers: {}, default: {} })
    }
  })
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    await setup.renderOnce()
    api?.keymap.dispatchCommand("server.restart")
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await Bun.sleep(100)
    await setup.renderOnce()
    failNextProviders = true
    events.emit({
      directory,
      project: "proj_test",
      payload: { id: "evt_disposed", type: "server.instance.disposed", properties: { directory } },
    })
    events.reconnect()
    // A still-pending restart would retry the failing bootstrap every 50ms; the ordinary path tries once.
    await Bun.sleep(300)
    await setup.renderOnce()
    expect(failedProviderCalls).toBe(1)
    expect(setup.renderer.isDestroyed).toBe(false)
    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("restart recovery issues no prompt replay and allows deliberate prompt", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const session = {
    id: "dummy",
    title: "Demo session",
    slug: "dummy",
    projectID: "project",
    directory,
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
  }
  // Interrupted turn: last assistant message never completed
  const interruptedMessages = [
    {
      id: "msg_user",
      sessionID: session.id,
      role: "user" as const,
      time: { created: 1, completed: 1 },
    },
    {
      id: "msg_assistant",
      sessionID: session.id,
      role: "assistant" as const,
      providerID: "test-provider",
      modelID: "test-model",
      time: { created: 2 },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    },
  ]
  const promptRequests: string[] = []
  const calls = createFetch((url) => {
    const pathname = url.pathname
    // Record any prompt/provider-shell/command turn submission
    if (
      pathname.endsWith("/prompt") ||
      pathname.endsWith("/prompt_async") ||
      pathname.endsWith("/shell") ||
      (pathname.includes("/session/") && pathname.includes("/command"))
    ) {
      promptRequests.push(pathname)
      return json({})
    }
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === "/global/restart") return json({})
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`)
      return json(interruptedMessages.map((info) => ({ info, parts: [] })))
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
    return undefined
  })
  let api: TuiPluginApi | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: { continue: true },
        pluginHost: {
          async start(input) {
            api = input.api
            started()
          },
          async dispose() {},
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    await setup.renderOnce()
    // Capture session then request restart
    api?.keymap.dispatchCommand("server.restart")
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    events.emit({
      directory,
      project: "proj_test",
      payload: { id: "evt_disposed", type: "server.instance.disposed", properties: { directory } },
    })
    events.reconnect()
    await Bun.sleep(250)
    await setup.renderOnce()
    await setup.renderOnce()
    await Bun.sleep(100)
    await setup.renderOnce()

    // No automatic prompt or provider turn replay during SSE reconnect
    expect(promptRequests.length).toBe(0)
    expect(setup.renderer.isDestroyed).toBe(false)

    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})

test("recovery keeps the main prompt focused and palette usable with no replay", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: true, kittyKeyboard: true })
  const core = await import("@opentui/core")
  mock.module("@opentui/core", () => ({ ...core, createCliRenderer: async () => setup.renderer }))
  const events = createEventSource()
  const session = {
    id: "dummy",
    title: "Demo session",
    slug: "dummy",
    projectID: "project",
    directory,
    version: "0.0.0-test",
    time: { created: 0, updated: 0 },
  }
  const promptRequests: string[] = []
  const calls = createFetch((url) => {
    const pathname = url.pathname
    if (
      pathname.endsWith("/prompt") ||
      pathname.endsWith("/prompt_async") ||
      pathname.endsWith("/shell") ||
      (pathname.includes("/session/") && pathname.includes("/command"))
    ) {
      promptRequests.push(pathname)
      return json({})
    }
    if (url.pathname === "/experimental/session") return json([session])
    if (url.pathname === "/global/restart") return json({})
    if (url.pathname === `/session/${session.id}`) return json(session)
    if (url.pathname === `/session/${session.id}/message`) return json([])
    if (url.pathname === `/session/${session.id}/todo` || url.pathname === `/session/${session.id}/diff`)
      return json([])
    return undefined
  })
  let api: TuiPluginApi | undefined
  let disposeSlots: (() => void) | undefined
  let started!: () => void
  const ready = new Promise<void>((resolve) => {
    started = resolve
  })

  try {
    const { run } = await import("../src/app")
    const task = Effect.runPromise(
      run({
        url: "http://test",
        directory,
        config: createTuiResolvedConfig({ plugin_enabled: {} }),
        fetch: calls.fetch,
        events: events.source,
        args: {},
        pluginHost: {
          async start(input) {
            api = input.api
            const slots = input.runtime.setupSlots(input.api)
            disposeSlots = slots.register({
              id: "test-passthrough",
              slots: {
                home_prompt: () => <Prompt />,
                session_prompt: () => <Prompt />,
              },
            })
            started()
          },
          async dispose() {
            disposeSlots?.()
          },
        },
      }).pipe(Effect.provide(AppNodeBuilder.build(Global.node))),
    )
    await ready
    await setup.renderOnce()
    api?.keymap.dispatchCommand("server.restart")
    await setup.renderOnce()
    setup.mockInput.pressEnter()
    await setup.renderOnce()
    events.emit({
      directory,
      project: "proj_test",
      payload: { id: "evt_disposed", type: "server.instance.disposed", properties: { directory } },
    })
    events.reconnect()
    await Bun.sleep(250)
    await setup.renderOnce()
    await setup.renderOnce()
    await Bun.sleep(1000)
    await setup.renderOnce()
    setup.mockInput.pressEscape()
    await setup.renderOnce()
    // no prompt replay during recovery
    expect(promptRequests.length).toBe(0)
    expect(setup.renderer.isDestroyed).toBe(false)
    const editors: TextareaRenderable[] = []
    const visit = (node: any) => {
      if (node instanceof TextareaRenderable) editors.push(node)
      for (const child of node.getChildren?.() ?? []) visit(child)
    }
    visit(setup.renderer.root)
    expect(editors.length).toBeGreaterThan(0)
    const mainPrompt = editors[0]
    expect(mainPrompt.focused).toBe(true)
    expect(setup.renderer.currentFocusedEditor).toBe(mainPrompt)
    await setup.mockInput.typeText("x")
    await setup.renderOnce()
    expect(mainPrompt.plainText).toContain("x")

    // palette remains usable after recovery without stealing the main prompt's ownership
    api?.keymap.dispatchCommand("command.palette.show")
    await setup.renderOnce()
    expect(setup.renderer.isDestroyed).toBe(false)
    const paletteInput = setup.renderer.currentFocusedEditor
    setup.mockInput.pressKey("p")
    setup.mockInput.pressEscape()
    await setup.renderOnce()
    expect(paletteInput === null || paletteInput !== mainPrompt).toBe(true)
    expect(promptRequests.length).toBe(0)

    setup.renderer.destroy()
    await task
  } finally {
    if (!setup.renderer.isDestroyed) setup.renderer.destroy()
    mock.restore()
  }
})
