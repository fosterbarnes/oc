/** @jsxImportSource @opentui/solid */
import { TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { onCleanup } from "solid-js"
import { tmpdir, wait } from "../../fixture/fixture"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import type { TuiKeybind } from "../../../src/config/keybind"
import { TestTuiContexts } from "../../fixture/tui-environment"

async function mountPrompt(input: {
  root: string
  keybinds: Partial<TuiKeybind.Keybinds>
  onConfirm: (value: string) => void
  actions?: { command: string; title: string; onTrigger: () => void }[]
  value?: string
  numeric?: { min: number; max: number; step: number }
}) {
  const state = path.join(input.root, "state")
  await mkdir(state, { recursive: true })
  await Bun.write(path.join(state, "kv.json"), "{}")

  const [
    { DialogProvider, useDialog },
    { DialogPrompt },
    { KVProvider },
    { ThemeProvider },
    { TuiConfigProvider },
    { ToastProvider },
    { OpencodeKeymapProvider, registerOpencodeKeymap },
  ] = await Promise.all([
    import("../../../src/ui/dialog"),
    import("../../../src/ui/dialog-prompt"),
    import("../../../src/context/kv"),
    import("../../../src/context/theme"),
    import("../../../src/config"),
    import("../../../src/ui/toast"),
    import("../../../src/keymap"),
  ])

  let dialog: ReturnType<typeof useDialog> | undefined

  // Opened through the dialog stack like production callers, so stack bindings (dialog.close) apply.
  function Opener() {
    dialog = useDialog()
    dialog.replace(() => (
      <DialogPrompt
        title="Rename Session"
        value={input.value ?? "draft"}
        numeric={input.numeric}
        actions={input.actions}
        onConfirm={input.onConfirm}
      />
    ))
    return null
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    const resolvedConfig = createTuiResolvedConfig({
      keybinds: input.keybinds,
      leader_timeout: 1000,
    })
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
                    <Opener />
                  </DialogProvider>
                </ToastProvider>
              </ThemeProvider>
            </KVProvider>
          </TuiConfigProvider>
        </OpencodeKeymapProvider>
      </TestTuiContexts>
    )
  }

  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  return {
    app,
    stackSize: () => dialog?.stack.length ?? 0,
    async cleanup() {
      app.renderer.destroy()
    },
  }
}

test("dialog prompt submit wins when return is also input newline", async () => {
  await using tmp = await tmpdir()
  const confirmed: string[] = []
  const prompt = await mountPrompt({
    root: tmp.path,
    keybinds: {
      input_submit: "super+return",
      input_newline: "return,shift+return,alt+return,ctrl+j",
    },
    onConfirm: (value) => confirmed.push(value),
  })

  try {
    await wait(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)
    const textarea = prompt.app.renderer.currentFocusedEditor
    if (!(textarea instanceof TextareaRenderable)) throw new Error("expected focused dialog textarea")

    prompt.app.mockInput.pressEnter()

    expect(confirmed).toEqual(["draft"])
    expect(textarea.plainText).toBe("draft")
  } finally {
    await prompt.cleanup()
  }
})

test("dialog prompt submit can be rebound separately from input submit", async () => {
  await using tmp = await tmpdir()
  const confirmed: string[] = []
  const prompt = await mountPrompt({
    root: tmp.path,
    keybinds: {
      input_submit: "return",
      "dialog.prompt.submit": "ctrl+y",
    },
    onConfirm: (value) => confirmed.push(value),
  })

  try {
    await wait(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)
    const textarea = prompt.app.renderer.currentFocusedEditor
    if (!(textarea instanceof TextareaRenderable)) throw new Error("expected focused dialog textarea")

    prompt.app.mockInput.pressEnter()
    expect(confirmed).toEqual([])
    expect(textarea.plainText).toBe("draft")

    prompt.app.mockInput.pressKey("y", { ctrl: true })

    expect(confirmed).toEqual(["draft"])
  } finally {
    await prompt.cleanup()
  }
})

async function focusedTextarea(prompt: Awaited<ReturnType<typeof mountPrompt>>) {
  await wait(() => prompt.app.renderer.currentFocusedEditor instanceof TextareaRenderable)
  const textarea = prompt.app.renderer.currentFocusedEditor
  if (!(textarea instanceof TextareaRenderable)) throw new Error("expected focused dialog textarea")
  return textarea
}

test("numeric dialog arrows step editable decimals and clamp without confirming; Escape cancels", async () => {
  await using tmp = await tmpdir()
  const confirmed: string[] = []
  const prompt = await mountPrompt({
    root: tmp.path,
    keybinds: {},
    value: "12.5",
    numeric: { min: 4, max: 48, step: 1 },
    onConfirm: (value) => confirmed.push(value),
  })
  try {
    const textarea = await focusedTextarea(prompt)
    expect(textarea.plainText).toBe("12.5")
    prompt.app.mockInput.pressArrow("up")
    expect(textarea.plainText).toBe("13.5")
    prompt.app.mockInput.pressArrow("down")
    expect(textarea.plainText).toBe("12.5")
    for (const [value, direction, expected] of [
      ["48", "up", "48"],
      ["4", "down", "4"],
      ["", "up", "4"],
      ["", "down", "4"],
      ["invalid", "up", "4"],
      ["Infinity", "down", "4"],
    ] as const) {
      textarea.setText(value)
      prompt.app.mockInput.pressArrow(direction)
      expect(textarea.plainText).toBe(expected)
    }
    expect(confirmed).toEqual([])
    textarea.setText("")
    await prompt.app.mockInput.typeText("15.75")
    prompt.app.mockInput.pressEnter()
    expect(confirmed).toEqual(["15.75"])
    prompt.app.mockInput.pressArrow("up")
    prompt.app.mockInput.pressEscape()
    expect(prompt.stackSize()).toBe(0)
    expect(confirmed).toEqual(["15.75"])
  } finally {
    await prompt.cleanup()
  }
})

test("text dialog arrows retain textarea navigation", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountPrompt({ root: tmp.path, keybinds: {}, value: "first\nsecond", onConfirm: () => {} })
  try {
    const textarea = await focusedTextarea(prompt)
    textarea.gotoBufferEnd()
    prompt.app.mockInput.pressArrow("up")
    expect(textarea.cursorOffset).toBe(5)
    prompt.app.mockInput.pressArrow("down")
    expect(textarea.cursorOffset).toBe(12)
    expect(textarea.plainText).toBe("first\nsecond")
  } finally {
    await prompt.cleanup()
  }
})

test("dialog prompt action wins over ctrl+c dialog close", async () => {
  await using tmp = await tmpdir()
  let copies = 0
  const prompt = await mountPrompt({
    root: tmp.path,
    keybinds: { "dialog.close": "ctrl+c", "dialog.session_rename.copy": "ctrl+c" },
    onConfirm: () => {},
    actions: [{ command: "dialog.session_rename.copy", title: "copy", onTrigger: () => copies++ }],
  })

  try {
    const textarea = await focusedTextarea(prompt)
    prompt.app.mockInput.pressKey("c", { ctrl: true })

    expect(copies).toBe(1)
    expect(prompt.stackSize()).toBe(1)
    expect(textarea.plainText).toBe("draft")
  } finally {
    await prompt.cleanup()
  }
})

test("oc layout keeps dialogs open on ctrl+c", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountPrompt({ root: tmp.path, keybinds: {}, onConfirm: () => {} })

  try {
    await focusedTextarea(prompt)
    prompt.app.mockInput.pressKey("c", { ctrl: true })

    expect(prompt.stackSize()).toBe(1)
  } finally {
    await prompt.cleanup()
  }
})

test("dialog.close override restores ctrl+c close", async () => {
  await using tmp = await tmpdir()
  const prompt = await mountPrompt({ root: tmp.path, keybinds: { "dialog.close": "ctrl+c" }, onConfirm: () => {} })

  try {
    await focusedTextarea(prompt)
    prompt.app.mockInput.pressKey("c", { ctrl: true })

    expect(prompt.stackSize()).toBe(0)
  } finally {
    await prompt.cleanup()
  }
})
