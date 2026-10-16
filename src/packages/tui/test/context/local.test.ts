import { expect, test } from "bun:test"
import {
  moveModelFavorite,
  loadModelFavorites,
  parseModel,
  pruneSessionAgents,
  pruneSessionModelOverrides,
  recentModels,
  resolveCurrentModel,
  resolveSessionAgent,
  resolveSessionModel,
  resolveVariant,
  LocalProvider,
  useLocal,
} from "../../src/context/local"
import path from "node:path"
import { createComponent, onCleanup } from "solid-js"
import { testRender, useRenderer } from "@opentui/solid"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { DialogModel } from "../../src/component/dialog-model"
import { tmpdir } from "../fixture/fixture"
import { createFetch, createEventSource, directory, json } from "../fixture/tui-sdk"
import { TestTuiContexts } from "../fixture/tui-environment"
import { ArgsProvider } from "../../src/context/args"
import { ExitProvider } from "../../src/context/exit"
import fs from "node:fs"
import { KVProvider } from "../../src/context/kv"
import { SDKProvider } from "../../src/context/sdk"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { RouteProvider, useRoute } from "../../src/context/route"
import { SyncProvider, useSync } from "../../src/context/sync"
import { ThemeProvider } from "../../src/context/theme"
import { ToastProvider } from "../../src/ui/toast"
import { TuiConfigProvider } from "../../src/config"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { wait } from "../cli/cmd/tui/sync-fixture"

test("variant resolution prefers the session pick, then the model pick, then default", () => {
  const variants = ["low", "high", "thinking"]
  expect(resolveVariant(variants, { variant: "low" }, "high")).toBe("low")
  expect(resolveVariant(variants, {}, "high")).toBe("default")
  expect(resolveVariant(variants, { variant: "default" }, "high")).toBe("default")
  expect(resolveVariant(variants, undefined, "default")).toBe("default")
  expect(resolveVariant(variants, undefined, "thinking")).toBe("thinking")
  expect(resolveVariant(variants, undefined, undefined)).toBe("default")
  expect(resolveVariant(["highThinking"], undefined, "high")).toBe("default")
  expect(resolveVariant([], undefined, "high")).toBe("default")
  expect(resolveVariant(variants, { variant: "removed" }, "high")).toBe("default")
  expect(resolveVariant(variants, undefined, "removed")).toBe("default")
})

test("local model shares reasoning for display, outgoing selections and persisted session choices", async () => {
  await using tmp = await tmpdir()
  const statePath = path.join(tmp.path, "state")
  const saved = {
    variant: { "test/second": "default", "test/third": "low" },
    session: {
      explicit: { providerID: "test", modelID: "first", variant: "low" },
      providerDefault: { providerID: "test", modelID: "first" },
    },
  }
  await Bun.write(path.join(statePath, "model.json"), JSON.stringify(saved))
  await Bun.write(path.join(statePath, "kv.json"), "{}")
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary" }])
    if (url.pathname === "/config/providers") return json({
      providers: [{ id: "test", name: "Test", models: Object.fromEntries(
        ["first", "second", "third", "unsupported"].map((id) => [id, {
          id, name: id, variants: id === "unsupported" ? { highThinking: {} } : { low: {}, high: {} },
        }]),
      ) }], default: { test: "first" },
    })
  }, events)
  const updates: Array<{ id: string; providerID: string; variant?: string }> = []
  const prompts: Array<{ variant?: string }> = []
  const fetch = (async (request: RequestInfo | URL) => {
    if (request instanceof Request && request.method === "POST") {
      const url = new URL(request.url)
      if (url.pathname.endsWith("/model")) {
        updates.push((await request.json()).model)
        return json({})
      }
      if (url.pathname.endsWith("/message")) {
        prompts.push(await request.json())
        return json({})
      }
    }
    return calls.fetch(request)
  }) as typeof globalThis.fetch
  const { app, local, route, sync, sdk } = await mountLocal(tmp.path, statePath, fetch, events)
  try {
    await wait(() => !!local() && local().model.ready && sync().status === "complete")
    await local().model.variant.set("high")
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    expect(local().model.variant.selected()).toBe("high")
    expect(local().model.variant.current()).toBe("high")
    await sdk().client.session.prompt({ sessionID: "new", model: local().model.current(),
      variant: local().model.variant.current(), parts: [{ type: "text", text: "test" }] })
    expect(prompts.at(-1)?.variant).toBe("high")
    route().navigate({ type: "session", sessionID: "explicit" })
    expect(local().model.variant.current()).toBe("low")
    await local().model.select({ providerID: "test", modelID: "first" })
    expect(updates.at(-1)?.variant).toBe("low")
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    route().navigate({ type: "session", sessionID: "providerDefault" })
    expect(local().model.variant.selected()).toBe("default")
    expect(local().model.variant.current()).toBeUndefined()
    await local().model.select({ providerID: "test", modelID: "first" })
    expect(updates.at(-1)?.variant).toBeUndefined()
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    for (const [modelID, variant] of [["second", undefined], ["third", "low"], ["unsupported", undefined]] as const) {
      await local().model.select({ providerID: "test", modelID })
      expect(local().model.variant.current()).toBe(variant)
      expect(updates.at(-1)?.variant).toBe(variant)
      await wait(() => JSON.parse(fs.readFileSync(path.join(statePath, "model.json"), "utf8"))
        .session.providerDefault.modelID === modelID &&
        !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    }
    route().navigate({ type: "home" })
    local().model.set({ providerID: "test", modelID: "first" })
    await local().model.variant.set(undefined)
    expect(local().model.variant.current()).toBeUndefined()
    await wait(() => {
      try { return JSON.parse(fs.readFileSync(path.join(statePath, "model.json"), "utf8"))
        .variant["test/first"] === "default" } catch { return false }
    })
    const persisted = await Bun.file(path.join(statePath, "model.json")).json()
    expect(persisted.variant).toEqual({ ...saved.variant, "test/first": "default" })
    expect(persisted.session.explicit.variant).toBe("low")
    expect(persisted.session.providerDefault.variant).toBeUndefined()
  } finally {
    app.renderer.destroy()
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
  }
})

test("a rejected session request keeps the previous model and agent", async () => {
  await using tmp = await tmpdir()
  const statePath = path.join(tmp.path, "state")
  await Bun.write(path.join(statePath, "kv.json"), "{}")
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary" }, { name: "plan", mode: "primary" }])
    if (url.pathname === "/config/providers") return json({
      providers: [{ id: "test", name: "Test", models: { first: { id: "first", name: "first" },
        second: { id: "second", name: "second" } } }], default: { test: "first" },
    })
  }, events)
  let rejected = 0
  const fetch = (async (request: RequestInfo | URL) => {
    if (request instanceof Request && (request.method === "POST" || request.method === "PATCH")) {
      rejected++
      throw new TypeError("fetch failed")
    }
    return calls.fetch(request)
  }) as typeof globalThis.fetch
  const { app, local, route, sync } = await mountLocal(tmp.path, statePath, fetch, events)
  try {
    await wait(() => !!local() && local().model.ready && sync().status === "complete")
    route().navigate({ type: "session", sessionID: "offline" })
    const model = local().model.current()
    const agent = local().agent.current()?.name
    await local().model.select({ providerID: "test", modelID: "second" })
    await local().agent.set(agent === "build" ? "plan" : "build")
    expect(rejected).toBe(2)
    expect(local().model.current()).toEqual(model)
    expect(local().agent.current()?.name).toBe(agent)
    expect(local().model.hasSessionOverride("offline")).toBe(false)
  } finally {
    app.renderer.destroy()
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
  }
})

async function mountLocal(
  home: string,
  statePath: string,
  fetch: typeof globalThis.fetch,
  events: ReturnType<typeof createEventSource>,
) {
  let local!: ReturnType<typeof useLocal>
  let route!: ReturnType<typeof useRoute>
  let sync!: ReturnType<typeof useSync>
  let sdk!: ReturnType<typeof import("../../src/context/sdk").useSDK>
  let dialog!: ReturnType<typeof useDialog>
  const { useSDK } = await import("../../src/context/sdk")
  function Probe() {
    local = useLocal()
    route = useRoute()
    sync = useSync()
    sdk = useSDK()
    dialog = useDialog()
    return null
  }
  const app = await testRender(() => {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createTuiResolvedConfig()
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return createComponent(OpencodeKeymapProvider, { keymap,
    get children() { return createComponent(TestTuiContexts, {
    directory, paths: { state: statePath, home, worktree: home },
    get children() { return createComponent(ArgsProvider, {
      get children() { return createComponent(TuiConfigProvider, { config,
        get children() { return createComponent(KVProvider, {
          get children() { return createComponent(SDKProvider, { url: "http://test", directory, fetch, events: events.source,
            get children() { return createComponent(PermissionProvider, {
              get children() { return createComponent(ProjectProvider, {
                get children() { return createComponent(ExitProvider, { exit: (error) => { throw error },
                get children() { return createComponent(RouteProvider, {
                  get children() { return createComponent(SyncProvider, {
                    get children() { return createComponent(ThemeProvider, { mode: "dark",
                      get children() { return createComponent(ToastProvider, {
                        get children() { return createComponent(LocalProvider, {
                          get children() { return createComponent(DialogProvider, {
                            get children() { return createComponent(Probe, {}) },
                          }) },
                        }) },
                      }) },
                    }) },
                  }) },
                }) },
                }) },
              }) },
            }) },
          }) },
        }) },
      }) },
    }) },
  }) },
  }) }, { kittyKeyboard: true, width: 100, height: 50 })
  await wait(() => !!local && local.model.ready && sync.status === "complete")
  return { app, local: () => local, route: () => route, sync: () => sync, sdk: () => sdk, dialog: () => dialog }
}

test("favorite categories load old favorites and discard unknown or malformed category metadata", () => {
  const model = { providerID: "test", modelID: "first" }
  expect(loadModelFavorites({ favorite: [model] })).toEqual({ favorite: [model], favoriteCategories: [] })
  expect(
    loadModelFavorites({
      favoriteCategories: ["Code", "Code", "", null, "bad\nname", "Research"],
      favorite: [
        { ...model, category: "Code" },
        { providerID: "test", modelID: "second", category: "missing" },
        null,
        {},
      ],
    }),
  ).toEqual({
    favoriteCategories: ["Code", "Research"],
    favorite: [
      { ...model, category: "Code" },
      { providerID: "test", modelID: "second" },
    ],
  })
})

test("favorite categories persist assignments, rename and reorder, preserving models and cycling", async () => {
  await using tmp = await tmpdir()
  const statePath = path.join(tmp.path, "state")
  const file = path.join(statePath, "model.json")
  const favorites = ["first", "second", "third", "fourth"].map((modelID) => ({ providerID: "test", modelID }))
  await Bun.write(file, JSON.stringify({ favorite: favorites }))
  await Bun.write(path.join(statePath, "kv.json"), "{}")
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary" }])
    if (url.pathname === "/config/providers")
      return json({
        providers: [
          {
            id: "test",
            name: "Test",
            models: Object.fromEntries(
              favorites.map((item) => [item.modelID, { id: item.modelID, name: item.modelID }]),
            ),
          },
        ],
        default: { test: "first" },
      })
  }, events)
  const mounted = await mountLocal(tmp.path, statePath, calls.fetch, events)
  const model = mounted.local().model
  try {
    await wait(() => model.ready && mounted.sync().status === "complete")
    expect(model.favorite()).toEqual(favorites)
    expect(model.favoriteCategories()).toEqual([])
    model.renameFavoriteCategory(undefined, "Code")
    model.renameFavoriteCategory(undefined, "Research")
    expect(model.renameFavoriteCategory(undefined, "  Code  ")).toBe("Category already exists")
    expect(model.renameFavoriteCategory(undefined, "\n")).toBeDefined()
    model.assignFavoriteCategory(favorites[0]!, "Code")
    model.assignFavoriteCategory(favorites[2]!, "Code")
    model.assignFavoriteCategory(favorites[1]!, "Research")
    model.assignFavoriteCategory(favorites[3]!, "missing")
    expect(model.favorite()[3]!.category).toBeUndefined()
    model.moveFavorite(favorites[2]!, -1)
    expect(model.favorite().map((item) => item.modelID)).toEqual(["third", "second", "first", "fourth"])
    model.moveFavorite(favorites[2]!, -1)
    expect(model.favorite()[0]!.modelID).toBe("third")
    model.moveFavoriteCategory("Research", -1)
    model.moveFavoriteCategory("Research", -1)
    expect(model.favoriteCategories()).toEqual(["Research", "Code"])
    model.renameFavoriteCategory("Code", "Coding")
    expect(model.favorite().filter((item) => item.category === "Coding").length).toBe(2)
    await wait(() => JSON.parse(fs.readFileSync(file, "utf8")).favoriteCategories?.includes("Coding"))
    const saved = await Bun.file(file).json()
    expect(loadModelFavorites(saved)).toEqual({
      favorite: [...model.favorite()],
      favoriteCategories: ["Research", "Coding"],
    })
    const current = model.current()?.modelID
    await model.cycleFavorite(1)
    expect(model.current()?.modelID).toBe("fourth")
    await model.cycleFavorite(-1)
    expect(model.current()?.modelID).toBe(current)
    expect(model.current()).toEqual({ providerID: "test", modelID: "first" })
    model.deleteFavoriteCategory("Coding")
    expect(model.favorite().map((item) => item.modelID)).toEqual(["third", "second", "first", "fourth"])
    expect(model.favorite().filter((item) => item.category === "Coding")).toEqual([])
    model.assignFavoriteCategory(favorites[1]!)
    expect(model.favorite().find((item) => item.modelID === "second")?.category).toBeUndefined()
    model.assignFavoriteCategory(favorites[1]!, "Research")
    model.toggleFavorite(favorites[0]!)
    expect(model.favorite().find((item) => item.modelID === "second")?.category).toBe("Research")
    model.toggleFavorite(favorites[1]!)
    model.toggleFavorite(favorites[1]!)
    expect(model.favorite()[0]!.category).toBeUndefined()
    model.assignFavoriteCategory(favorites[1]!, "Research")
    model.toggleHidden(favorites[1]!)
    model.toggleHidden(favorites[1]!)
    model.toggleFavorite(favorites[1]!)
    expect(model.favorite()[0]!.category).toBeUndefined()
    model.deleteFavoriteCategory("Research")
    await wait(() => JSON.parse(fs.readFileSync(file, "utf8")).favoriteCategories?.length === 0)
    expect((await Bun.file(file).json()).favorite).toEqual(model.favorite())
  } finally {
    mounted.app.renderer.destroy()
    await wait(() => {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"))
      return (
        JSON.stringify(saved.favorite) === JSON.stringify(model.favorite()) &&
        JSON.stringify(saved.favoriteCategories) === JSON.stringify(model.favoriteCategories())
      )
    })
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
  }
})

test("model menu nests category headings and creates, assigns and manages them without selecting a model", async () => {
  await using tmp = await tmpdir()
  const statePath = path.join(tmp.path, "state")
  const file = path.join(statePath, "model.json")
  const favorites = ["first", "second", "third"].map((modelID) => ({ providerID: "test", modelID }))
  await Bun.write(file, JSON.stringify({ favorite: favorites }))
  await Bun.write(path.join(statePath, "kv.json"), "{}")
  const events = createEventSource()
  const calls = createFetch((url) => {
    if (url.pathname === "/agent") return json([{ name: "build", mode: "primary" }])
    if (url.pathname === "/config/providers")
      return json({
        providers: [
          {
            id: "test",
            name: "Test",
            models: Object.fromEntries(
              [...favorites, { modelID: "recent" }, { modelID: "other" }].map((item) => [
                item.modelID,
                { id: item.modelID, name: item.modelID },
              ]),
            ),
          },
        ],
        default: { test: "first" },
      })
  }, events)
  const mounted = await mountLocal(tmp.path, statePath, calls.fetch, events)
  const model = mounted.local().model
  const app = mounted.app
  async function key(run: () => void) {
    run()
    await app.flush()
    await app.waitForVisualIdle()
  }
  function frame() {
    return app.captureCharFrame()
  }
  try {
    await wait(() => model.ready && mounted.sync().status === "complete")
    model.set({ providerID: "test", modelID: "recent" }, { recent: true })
    model.set(favorites[0]!)
    mounted.dialog().replace(() => createComponent(DialogModel, {}))
    await app.waitForVisualIdle()
    expect(frame()).toContain("Category…")
    await key(() => app.mockInput.pressArrow("down"))
    await key(() => app.mockInput.pressKey("g", { ctrl: true }))
    expect(frame()).toContain("No category")
    expect(frame()).toContain("Manage categories…")
    await key(() => app.mockInput.pressArrow("down"))
    await key(() => app.mockInput.pressEnter())
    expect(frame()).toContain("New category")
    await app.mockInput.typeText("Code")
    await key(() => app.mockInput.pressEnter())
    expect(model.favorite()[1]!.category).toBe("Code")
    expect(model.current()?.modelID).toBe("first")
    expect(frame()).toContain("Select model")
    const lines = frame().split("\n")
    const at = (text: string) => lines.findIndex((line) => line.trim() === text)
    expect(at("Favorites")).toBeLessThan(at("Code"))
    expect(at("Code")).toBeLessThan(at("Recent"))
    expect(lines[at("Code")]!.indexOf("Code")).toBeGreaterThan(lines[at("Favorites")]!.indexOf("Favorites"))
    expect(lines.findIndex((line) => line.includes("first Test"))).toBeLessThan(at("Code"))
    expect(lines.findIndex((line) => line.includes("third Test"))).toBeLessThan(at("Code"))
    expect(lines.find((line) => line.includes("second Test"))!.indexOf("second")).toBeGreaterThan(
      lines[at("Code")]!.indexOf("Code"),
    )
    // Reopening keeps the highlighted favorite even after it moves below uncategorized rows.
    await key(() => app.mockInput.pressKey("g", { ctrl: true }))
    expect(frame()).toContain("Favorite category")
    await key(() => app.mockInput.pressArrow("down"))
    await key(() => app.mockInput.pressArrow("down"))
    await key(() => app.mockInput.pressEnter())
    expect(frame()).toContain("Manage categories")
    await key(() => app.mockInput.pressEnter())
    expect(frame()).toContain("Delete category")
    await key(() => app.mockInput.pressEnter())
    expect(frame()).toContain("Rename category")
    await key(() => app.mockInput.pressEscape())
    expect(frame()).toContain("Manage categories")
    await key(() => app.mockInput.pressEscape())
    expect(frame()).toContain("Favorite category")
    await key(() => app.mockInput.pressEscape())
    expect(frame()).toContain("Select model")
    expect(model.current()?.modelID).toBe("first")
    model.renameFavoriteCategory(undefined, "Research")
    model.renameFavoriteCategory(undefined, "Empty")
    model.assignFavoriteCategory(favorites[2]!, "Research")
    await app.waitForVisualIdle()
    const multiple = frame().split("\n")
    const headings = ["Favorites", "Code", "Research", "Recent", "Test"].map((text) =>
      multiple.findIndex((line) => line.trim() === text),
    )
    expect(headings.every((row, index) => row >= 0 && (index === 0 || row > headings[index - 1]!))).toBe(true)
    expect(frame()).not.toContain("Empty")
    model.moveFavoriteCategory("Research", -1)
    await app.waitForVisualIdle()
    expect(frame().indexOf("Research")).toBeLessThan(frame().indexOf("Code"))
    await app.mockInput.typeText("second")
    await app.flush()
    await app.waitForVisualIdle()
    expect(frame()).toContain("second")
    expect(frame()).not.toContain("Research")
    expect(model.current()?.modelID).toBe("first")
  } finally {
    app.renderer.destroy()
    await wait(() => {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"))
      return (
        JSON.stringify(saved.favorite) === JSON.stringify(model.favorite()) &&
        JSON.stringify(saved.favoriteCategories) === JSON.stringify(model.favoriteCategories())
      )
    })
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
  }
})

test("moves a favorite one place and leaves it unchanged at the edge", () => {
  const favorites = [
    { providerID: "provider", modelID: "first" },
    { providerID: "provider", modelID: "second" },
    { providerID: "provider", modelID: "third" },
  ]

  expect(moveModelFavorite(favorites, favorites[1]!, -1)).toEqual([favorites[1], favorites[0], favorites[2]])
  expect(moveModelFavorite(favorites, favorites[0]!, -1)).toBe(favorites)
  expect(moveModelFavorite(favorites, favorites[2]!, 1)).toBe(favorites)
})

test("parses model IDs containing slashes", () => {
  expect(parseModel("provider/family/model")).toEqual({
    providerID: "provider",
    modelID: "family/model",
  })
})

test("moves a model to the front, deduplicates, and limits recents", () => {
  const recent = Array.from({ length: 12 }, (_, index) => ({
    providerID: "provider",
    modelID: `model-${index}`,
  }))

  expect(recentModels({ providerID: "provider", modelID: "model-5" }, recent)).toEqual([
    { providerID: "provider", modelID: "model-5" },
    ...recent.slice(0, 5),
    ...recent.slice(6, 10),
  ])
})

test("uses the explicit CLI model before agent and recent fallbacks", () => {
  const cli = { providerID: "cli", modelID: "model" }
  const agent = { providerID: "agent", modelID: "model" }
  const recent = { providerID: "recent", modelID: "model" }

  expect(resolveCurrentModel(undefined, cli, agent, recent)).toEqual(cli)
  expect(resolveCurrentModel(undefined, undefined, agent, recent)).toEqual(agent)
})

test("keeps an in-session model selection ahead of the CLI seed", () => {
  const selected = { providerID: "selected", modelID: "model" }
  const cli = { providerID: "cli", modelID: "model" }

  expect(resolveCurrentModel(selected, cli, undefined, undefined)).toEqual(selected)
})

test("matches existing resolution when no session override exists", () => {
  const selected = { providerID: "selected", modelID: "a" }
  const cli = { providerID: "cli", modelID: "c" }
  const agent = { providerID: "agent", modelID: "d" }
  const fallback = { providerID: "fallback", modelID: "e" }

  expect(
    resolveSessionModel(undefined, selected, cli, agent, fallback),
  ).toEqual(resolveCurrentModel(selected, cli, agent, fallback))
})

test("uses an explicit session selection across agent names", () => {
  const session = { providerID: "session", modelID: "model", variant: "high" }
  const agentA = { providerID: "agent-a", modelID: "model" }
  const agentB = { providerID: "agent-b", modelID: "model" }

  expect(
    resolveSessionModel(session, undefined, undefined, agentA, agentB),
  ).toEqual(session)
  expect(
    resolveSessionModel(session, undefined, undefined, agentB, agentA),
  ).toEqual(session)
})

test("keeps agent defaults for a session without an override", () => {
  const agent = { providerID: "agent", modelID: "configured" }
  const fallback = { providerID: "fallback", modelID: "model" }

  expect(resolveSessionModel(undefined, undefined, undefined, agent, fallback)).toEqual(agent)
})

test("keeps a session override ahead of CLI and fallback choices", () => {
  const session = { providerID: "session", modelID: "model" }
  const cli = { providerID: "cli", modelID: "model" }
  const agent = { providerID: "agent", modelID: "model" }
  const fallback = { providerID: "fallback", modelID: "model" }

  expect(

    resolveSessionModel(session, undefined, cli, agent, fallback),
  ).toEqual(session)
  expect(resolveSessionModel(undefined, undefined, cli, agent, fallback)).toEqual(cli)
})

test("prunes only the deleted session override", () => {
  expect(
    pruneSessionModelOverrides(
      {
        first: { providerID: "provider", modelID: "first", variant: "high" },
        second: { providerID: "provider", modelID: "second" },
      },
      "first",
    ),
  ).toEqual({ second: { providerID: "provider", modelID: "second" } })
})

test("uses the session agent ahead of the last selected and CLI agents", () => {
  expect(resolveSessionAgent("plan", "build", "explore", "build")).toBe("plan")
  expect(resolveSessionAgent(undefined, "plan", "explore", "build")).toBe("plan")
  expect(resolveSessionAgent(undefined, undefined, "explore", "build")).toBe("explore")
  expect(resolveSessionAgent(undefined, undefined, undefined, "build")).toBe("build")
})

test("prunes only the deleted session agent", () => {
  expect(pruneSessionAgents({ first: "plan", second: "build" }, "first")).toEqual({ second: "build" })

})
