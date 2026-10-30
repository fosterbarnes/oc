/** @jsxImportSource @opentui/solid */
import { InputRenderable, type RGBA } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createSignal, onCleanup, onMount } from "solid-js"
import type { DialogSelectOption, DialogSelectProps } from "../../../src/ui/dialog-select"
import { tmpdir } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"

type ExtraProps<T> = Partial<Omit<DialogSelectProps<T>, "title" | "options" | "onMove" | "onSelect">>

async function mountSelect<T = string>(root: string, initial: DialogSelectOption<T>[], extra: ExtraProps<T> = {}) {
  const state = path.join(root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")
  const config = createTuiResolvedConfig()
  const [
    { TuiConfigProvider },
    { KVProvider },
    { ThemeProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
    { DialogProvider, useDialog },
    { DialogSelect },
    { ToastProvider },
  ] = await Promise.all([
    import("../../../src/config"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/keymap"),
    import("../../../src/ui/dialog"),
    import("../../../src/ui/dialog-select"),
    import("../../../src/ui/toast"),
  ])

  const selected: T[] = []
  const moved: T[] = []
  let keymap!: ReturnType<typeof createDefaultOpenTuiKeymap>
  let replaceOptions!: (options: DialogSelectOption<T>[]) => void
  let replaceCurrent!: (value: T | undefined) => void

  function Harness() {
    const renderer = useRenderer()
    keymap = createDefaultOpenTuiKeymap(renderer)
    const off = registerOpencodeKeymap(keymap, renderer, config)
    const [options, setOptions] = createSignal(initial)
    replaceOptions = setOptions
    const [current, setCurrent] = createSignal(extra.current)
    replaceCurrent = (value) => setCurrent(() => value)
    onCleanup(off)

    // oc DialogSelect bindings use modal mode, which is only active inside an open dialog.
    function Fixture() {
      const dialog = useDialog()
      onMount(() =>
        dialog.replace(() => (
          <DialogSelect
            {...extra}
            title="Items"
            options={options()}
            current={current()}
            onMove={(option) => moved.push(option.value)}
            onSelect={(option) => selected.push(option.value)}
          />
        )),
      )
      return null
    }

    return (
      <TestTuiContexts directory={root} paths={{ home: root, state, worktree: root }}>
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

  const app = await testRender(() => <Harness />, { width: 80, height: 24, kittyKeyboard: true })
  app.renderer.start()
  await app.waitForFrame((frame) => frame.includes("Items"))
  await app.waitFor(() => app.renderer.currentFocusedEditor instanceof InputRenderable)
  return { app, keymap, moved, replaceOptions, replaceCurrent, selected }
}

async function renderSelect(
  root: string,
  options: DialogSelectOption<string>[],
  onGlobal: () => void,
  onRow: (option: DialogSelectOption<string>) => void,
) {
  const commands = ["dialog.move_session.delete", "dialog.move_session.new"]
  const { app, keymap } = await mountSelect(root, options, {
    actions: [
      { command: commands[0], title: "delete", onTrigger: onRow },
      { command: commands[1], title: "new", selection: "none", onTrigger: onGlobal },
    ],
  })
  await app.waitFor(() => {
    const bindings = keymap.getCommandBindings({ visibility: "active", commands })
    return commands.every((command) => !!bindings.get(command)?.length)
  })
  return app
}

test("dialog actions run without options while row actions still require a selection", async () => {
  await using tmp = await tmpdir()
  let global = 0
  const rows: string[] = []
  const app = await renderSelect(
    tmp.path,
    [],
    () => global++,
    (option) => rows.push(option.value),
  )

  try {
    app.mockInput.pressKey("m", { ctrl: true })
    app.mockInput.pressKey("d", { ctrl: true })

    expect(global).toBe(1)
    expect(rows).toEqual([])
  } finally {
    app.renderer.destroy()
  }
})

test("footer actions run when filtering leaves no selected row", async () => {
  await using tmp = await tmpdir()
  let global = 0
  const rows: string[] = []
  const app = await renderSelect(
    tmp.path,
    [{ title: "Alpha", value: "alpha" }],
    () => global++,
    (option) => rows.push(option.value),
  )

  try {
    for (const key of "missing") app.mockInput.pressKey(key)
    await app.waitForFrame((frame) => frame.includes("No results found"))

    app.mockInput.pressKey("d", { ctrl: true })
    app.mockInput.pressTab()
    app.mockInput.pressEnter()

    expect(global).toBe(1)
    expect(rows).toEqual([])
  } finally {
    app.renderer.destroy()
  }
})

test("row actions receive the selected option", async () => {
  await using tmp = await tmpdir()
  const rows: string[] = []
  const app = await renderSelect(
    tmp.path,
    [{ title: "Alpha", value: "alpha" }],
    () => {},
    (option) => rows.push(option.value),
  )

  try {
    app.mockInput.pressKey("d", { ctrl: true })

    expect(rows).toEqual(["alpha"])
  } finally {
    app.renderer.destroy()
  }
})

test("selects the new final option immediately after removing the selected final option", async () => {
  await using tmp = await tmpdir()
  const options = ["first", "second", "third"].map((value) => ({ title: value, value }))
  const select = await mountSelect(tmp.path, options)

  try {
    select.app.mockInput.pressArrow("down")
    await select.app.waitFor(() => select.moved.at(-1) === "second")
    select.app.mockInput.pressArrow("down")
    await select.app.waitFor(() => select.moved.at(-1) === "third")
    select.replaceOptions(options.slice(0, -1))
    await select.app.waitForFrame((frame) => !frame.includes("third"))

    select.app.mockInput.pressEnter()
    await select.app.waitFor(() => select.selected.length === 1)

    expect(select.selected).toEqual(["second"])
  } finally {
    select.app.renderer.destroy()
  }
})

test("selects a repopulated option after removing the only option", async () => {
  await using tmp = await tmpdir()
  const select = await mountSelect(tmp.path, [{ title: "only", value: "only" }])

  try {
    select.replaceOptions([])
    await select.app.waitForFrame((frame) => frame.includes("No items available"))
    select.app.mockInput.pressEnter()
    expect(select.selected).toEqual([])

    select.replaceOptions([{ title: "replacement", value: "replacement" }])
    await select.app.waitForFrame((frame) => frame.includes("replacement"))
    select.app.mockInput.pressEnter()
    await select.app.waitFor(() => select.selected.length === 1)

    expect(select.selected).toEqual(["replacement"])
  } finally {
    select.app.renderer.destroy()
  }
})

test("keeps the current option selected when options reorder", async () => {
  await using tmp = await tmpdir()
  const options = ["first", "current", "third"].map((value) => ({ title: value, value }))
  const select = await mountSelect(tmp.path, options, { current: "current" })

  try {
    select.replaceOptions([options[1], options[2], options[0]])
    await select.app.waitForFrame((frame) => frame.indexOf("current") < frame.indexOf("third"))
    select.app.mockInput.pressEnter()
    await select.app.waitFor(() => select.selected.length === 1)

    expect(select.selected).toEqual(["current"])
  } finally {
    select.app.renderer.destroy()
  }
})

// Palette Suggested rows repeat a command's value under another heading.
test("a hovered repeated value stays on its own row when options rebuild", async () => {
  await using tmp = await tmpdir()
  const ran: string[] = []
  const row = (title: string, value: string, category: string) => ({
    title,
    value,
    category,
    onSelect: () => ran.push(`${value}@${category}`),
  })
  const options = [row("Alpha", "alpha", "Suggested"), row("Beta", "beta", "Session"), row("Alpha", "alpha", "Session")]
  const select = await mountSelect(tmp.path, options, { preserveSelection: true })

  try {
    const lines = select.app.captureCharFrame().split("\n")
    const y = lines.findLastIndex((line) => line.includes("Alpha"))
    await select.app.mockMouse.moveTo(lines[y].indexOf("Alpha") + 1, y)
    select.replaceOptions(options.map((option) => ({ ...option })))
    await select.app.waitForFrame((frame) => frame.includes("Alpha"))
    select.app.mockInput.pressEnter()
    await select.app.waitFor(() => ran.length === 1)

    expect(ran).toEqual(["alpha@Session"])
  } finally {
    select.app.renderer.destroy()
  }
})

test("shows no-match and still closes after a flat filter goes empty", async () => {
  await using tmp = await tmpdir()
  const select = await mountSelect(
    tmp.path,
    [
      { title: "models.dev", value: "models.dev", category: "Projects" },
      { title: "opencode2", value: "opencode2", category: "Projects" },
    ],
    { flat: true },
  )

  try {
    await select.app.waitForFrame((frame) => frame.includes("models.dev"))
    await select.app.mockInput.typeText("models")
    await select.app.waitForFrame((frame) => frame.includes("models.dev") && !frame.includes("opencode2"))
    await select.app.mockInput.typeText(" missing")
    await select.app.waitForFrame((frame) => frame.includes("No results found"))
    expect(select.app.captureCharFrame()).not.toContain("models.dev")

    select.app.mockInput.pressEscape()
    await select.app.waitForFrame((frame) => !frame.includes("Items") && !frame.includes("No results found"))
  } finally {
    select.app.renderer.destroy()
  }
})

test("passes the row foreground color to gutters", async () => {
  await using tmp = await tmpdir()
  const colors = new Map<string, RGBA>()
  const gutter = (item: string) => (color: RGBA) => {
    colors.set(item, color)
    return <text fg={color}>*</text>
  }
  const select = await mountSelect(tmp.path, [
    { title: "Alpha", value: "alpha", gutter: gutter("alpha") },
    { title: "Beta", value: "beta", gutter: gutter("beta") },
  ])

  try {
    await select.app.waitFor(() => colors.size === 2)
    const selected = colors.get("alpha")!.toInts()
    const idle = colors.get("beta")!.toInts()
    expect(selected).not.toEqual(idle)

    select.app.mockInput.pressArrow("down")
    await select.app.waitFor(() =>
      colors
        .get("alpha")!
        .toInts()
        .every((value, index) => value === idle[index]),
    )
    expect(colors.get("beta")!.toInts()).toEqual(selected)
  } finally {
    select.app.renderer.destroy()
  }
})

test.each([false, 0, "", null, "current", undefined])("focuses current %p when it changes", async (current) => {
  await using tmp = await tmpdir()
  const select = await mountSelect<string | typeof current>(
    tmp.path,
    [
      { title: "First", value: "first" },
      { title: "Current", value: current === undefined ? "current" : current },
    ],
    { current: "first" },
  )

  try {
    select.replaceCurrent(current)
    await select.app.waitForVisualIdle()
    select.app.mockInput.pressEnter()
    await select.app.waitFor(() => select.selected.length === 1)

    expect(select.selected).toEqual([current === undefined ? "first" : current])
  } finally {
    select.app.renderer.destroy()
  }
})

test.each([false, 0, "", null, "current", undefined])(
  "restores current %p after clearing a filter",
  async (current) => {
    await using tmp = await tmpdir()
    const select = await mountSelect<string | typeof current>(
      tmp.path,
      [
        ...Array.from({ length: 6 }, (_, index) => ({ title: `Item-${index}`, value: `item-${index}` })),
        { title: "Current", value: current === undefined ? "current" : current },
      ],
      { current },
    )

    try {
      await select.app.mockInput.typeText("Item-0")
      await select.app.waitForFrame((frame) => frame.includes("Item-0") && !frame.includes("Item-1"))
      // oc binds ctrl+c to dialog.close, so clear the filter with backspace.
      for (let i = 0; i < "Item-0".length; i++) select.app.mockInput.pressBackspace()
      await select.app.waitForVisualIdle()
      select.app.mockInput.pressEnter()
      await select.app.waitFor(() => select.selected.length === 1)

      expect(select.selected).toEqual([current === undefined ? "item-0" : current])
      expect(select.app.captureCharFrame().includes("Current")).toBe(current !== undefined)
    } finally {
      select.app.renderer.destroy()
    }
  },
)

test("search replaces the fuzzy filter and lists results flat in its order", async () => {
  await using tmp = await tmpdir()
  const queries: string[] = []
  const options: DialogSelectOption<string>[] = [
    { title: "Alpha", value: "alpha", category: "One" },
    { title: "Beta", value: "beta", category: "Two" },
  ]
  const { app, selected } = await mountSelect(tmp.path, options, {
    search: (query) => {
      queries.push(query)
      return query ? options.toReversed() : options
    },
  })

  try {
    expect(queries).toContain("")
    // Flat: categories show beside rows instead of as headings
    expect(
      app
        .captureCharFrame()
        .split("\n")
        .map((line) => line.trim()),
    ).not.toContain("One")
    app.mockInput.pressKey("z")
    await app.waitFor(() => queries.includes("z"))
    app.mockInput.pressEnter()
    expect(selected).toEqual(["beta"])
  } finally {
    app.renderer.destroy()
  }
})

test("actions with bind trigger by that key and show it in the footer", async () => {
  await using tmp = await tmpdir()
  const rows: string[] = []
  const command = "plugin.dialog.select.test.0"
  const { app, keymap } = await mountSelect(tmp.path, [{ title: "Alpha", value: "alpha" }], {
    actions: [{ command, title: "remove", bind: "ctrl+r", onTrigger: (option) => rows.push(option.value) }],
  })

  try {
    await app.waitFor(
      () => !!keymap.getCommandBindings({ visibility: "active", commands: [command] }).get(command)?.length,
    )
    await app.waitForFrame((frame) => frame.includes("remove"))
    app.mockInput.pressKey("r", { ctrl: true })
    expect(rows).toEqual(["alpha"])
  } finally {
    app.renderer.destroy()
  }
})
