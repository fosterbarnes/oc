import { expect, test } from "bun:test"
import {
  moveModelFavorite,
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
import { createComponent } from "solid-js"
import { testRender } from "@opentui/solid"
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
  let local!: ReturnType<typeof useLocal>
  let route!: ReturnType<typeof useRoute>
  let sync!: ReturnType<typeof useSync>
  let sdk!: ReturnType<typeof import("../../src/context/sdk").useSDK>
  const { useSDK } = await import("../../src/context/sdk")
  function Probe() {
    local = useLocal()
    route = useRoute()
    sync = useSync()
    sdk = useSDK()
    return null
  }
  const app = await testRender(() => createComponent(TestTuiContexts, {
    directory, paths: { state: statePath, home: tmp.path, worktree: tmp.path },
    get children() { return createComponent(ArgsProvider, {
      get children() { return createComponent(TuiConfigProvider, { config: createTuiResolvedConfig(),
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
  }), { width: 100, height: 30 })
  try {
    await wait(() => !!local && local.model.ready && sync.status === "complete")
    await local.model.variant.set("high")
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    expect(local.model.variant.selected()).toBe("high")
    expect(local.model.variant.current()).toBe("high")
    await sdk.client.session.prompt({ sessionID: "new", model: local.model.current(),
      variant: local.model.variant.current(), parts: [{ type: "text", text: "test" }] })
    expect(prompts.at(-1)?.variant).toBe("high")
    route.navigate({ type: "session", sessionID: "explicit" })
    expect(local.model.variant.current()).toBe("low")
    await local.model.select({ providerID: "test", modelID: "first" })
    expect(updates.at(-1)?.variant).toBe("low")
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    route.navigate({ type: "session", sessionID: "providerDefault" })
    expect(local.model.variant.selected()).toBe("default")
    expect(local.model.variant.current()).toBeUndefined()
    await local.model.select({ providerID: "test", modelID: "first" })
    expect(updates.at(-1)?.variant).toBeUndefined()
    await wait(() => !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    for (const [modelID, variant] of [["second", undefined], ["third", "low"], ["unsupported", undefined]] as const) {
      await local.model.select({ providerID: "test", modelID })
      expect(local.model.variant.current()).toBe(variant)
      expect(updates.at(-1)?.variant).toBe(variant)
      await wait(() => JSON.parse(fs.readFileSync(path.join(statePath, "model.json"), "utf8"))
        .session.providerDefault.modelID === modelID &&
        !fs.readdirSync(statePath).some((name) => name.endsWith(".tmp")))
    }
    route.navigate({ type: "home" })
    local.model.set({ providerID: "test", modelID: "first" })
    await local.model.variant.set(undefined)
    expect(local.model.variant.current()).toBeUndefined()
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
