/** @jsxImportSource @opentui/solid */
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { createBindingLookup } from "@opentui/keymap/extras"
import { TextareaRenderable } from "@opentui/core"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createSignal, onCleanup } from "solid-js"
import { TuiKeybind } from "../src/config/keybind"
import {
  getOpencodeModeStack,
  OPENCODE_BASE_MODE,
  OpencodeKeymapProvider,
  registerOpencodeKeymap,
  useBindings,
  useCommandSlashes,
} from "../src/keymap"

function createResolvedKeymapConfig(input: TuiKeybind.KeybindOverrides = {}) {
  const keybinds = TuiKeybind.parse(input)
  return {
    keybinds: createBindingLookup(TuiKeybind.toBindingConfig(keybinds), {
      commandMap: TuiKeybind.CommandMap,
      bindingDefaults: TuiKeybind.bindingDefaults(),
    }),
    leader_timeout: 2000,
  }
}

test("legacy page key aliases compile as page keys", async () => {
  const sequences: Record<string, string[][]> = {}

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createResolvedKeymapConfig({
      messages_page_up: "pgup",
      messages_page_down: "pgdown",
    })
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
    const offLayer = keymap.registerLayer({
      bindings: config.keybinds.gather("session", ["session.page.up", "session.page.down"]),
    })
    const bindings = keymap.getCommandBindings({
      visibility: "registered",
      commands: ["session.page.up", "session.page.down"],
    })
    sequences.up =
      bindings.get("session.page.up")?.map((binding) => binding.sequence.map((part) => part.stroke.name)) ?? []
    sequences.down =
      bindings.get("session.page.down")?.map((binding) => binding.sequence.map((part) => part.stroke.name)) ?? []
    onCleanup(() => {
      offLayer()
      offKeymap()
    })

    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <box />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    expect(sequences).toEqual({
      up: [["pageup"]],
      down: [["pagedown"]],
    })
  } finally {
    app.renderer.destroy()
  }
})

test("mode-less bindings stay active when opencode mode changes", async () => {
  const counts: Record<string, Record<string, number>> = {}

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const config = createResolvedKeymapConfig()
    const offKeymap = registerOpencodeKeymap(keymap, renderer, config)
    const offGlobal = keymap.registerLayer({
      commands: [
        { name: "session.list", run() {} },
        { name: "session.new", run() {} },
        { name: "session.page.up", run() {} },
        { name: "session.first", run() {} },
      ],
      bindings: config.keybinds.gather("test.global", [
        "session.list",
        "session.new",
        "session.page.up",
        "session.first",
      ]),
    })
    const offBase = keymap.registerLayer({
      mode: OPENCODE_BASE_MODE,
      commands: [{ name: "model.list", run() {} }],
      bindings: config.keybinds.gather("test.base", ["model.list"]),
    })
    const activeCounts = () =>
      Object.fromEntries(
        Array.from(
          keymap.getCommandBindings({
            visibility: "active",
            commands: ["session.list", "session.new", "session.page.up", "session.first", "model.list"],
          }),
          ([command, bindings]) => [command, bindings.length],
        ),
      )

    counts.base = activeCounts()
    const popQuestion = getOpencodeModeStack(keymap).push("question")
    counts.question = activeCounts()
    popQuestion()
    const popAutocomplete = getOpencodeModeStack(keymap).push("autocomplete")
    counts.autocomplete = activeCounts()
    popAutocomplete()

    onCleanup(() => {
      offBase()
      offGlobal()
      offKeymap()
    })

    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <box />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    expect(counts).toEqual({
      base: { "session.list": 1, "session.new": 1, "session.page.up": 2, "session.first": 2, "model.list": 1 },
      question: { "session.list": 1, "session.new": 1, "session.page.up": 2, "session.first": 2, "model.list": 0 },
      autocomplete: {
        "session.list": 1,
        "session.new": 1,
        "session.page.up": 2,
        "session.first": 2,
        "model.list": 0,
      },
    })
  } finally {
    app.renderer.destroy()
  }
})

test("slash favorite binding consumes Ctrl+F only while slash autocomplete is open", async () => {
  const config = createResolvedKeymapConfig()
  const [visible, setVisible] = createSignal<false | "/" | "@">("/")
  const [target, setTarget] = createSignal<TextareaRenderable>()
  const runs: string[] = []

  function Prompt() {
    useBindings(() => ({
      target,
      enabled: () => visible() === "/",
      priority: 1,
      commands: [{ name: "prompt.autocomplete.favorite", run: () => void runs.push("favorite") }],
      bindings: config.keybinds.gather("prompt.autocomplete.favorite", ["prompt.autocomplete.favorite"]),
    }))
    return <textarea focused initialValue="/alpha" ref={setTarget} />
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <Prompt />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    await app.renderOnce()
    target()!.cursorOffset = 1
    app.mockInput.pressKey("f", { ctrl: true })
    expect(runs).toEqual(["favorite"])
    expect(target()!.cursorOffset).toBe(1)
    expect(target()!.plainText).toBe("/alpha")
    setVisible("@")
    await app.renderOnce()
    app.mockInput.pressKey("f", { ctrl: true })
    expect(runs).toEqual(["favorite"])
    expect(target()!.cursorOffset).toBe(2)
    setVisible(false)
    await app.renderOnce()
    app.mockInput.pressKey("f", { ctrl: true })
    expect(runs).toEqual(["favorite"])
    expect(target()!.cursorOffset).toBe(3)
  } finally {
    app.renderer.destroy()
  }
})

test("native slash favorite identity follows command ID rather than label or alias", async () => {
  let slashes: ReturnType<typeof useCommandSlashes>

  function Slashes() {
    slashes = useCommandSlashes()
    return <box />
  }

  function Harness() {
    const keymap = createDefaultOpenTuiKeymap(useRenderer())
    onCleanup(keymap.registerLayer({
      commands: [{
        namespace: "palette",
        name: "session.new",
        title: "Home",
        slashName: "new",
        slashAliases: ["fresh"],
        run() {},
      }],
    }))
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <Slashes />
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => <Harness />)
  try {
    await app.renderOnce()
    expect(slashes!()[0]).toMatchObject({
      favoriteKey: "tui:session.new",
      display: "/new",
      aliases: ["/fresh"],
    })
  } finally {
    app.renderer.destroy()
  }
})
