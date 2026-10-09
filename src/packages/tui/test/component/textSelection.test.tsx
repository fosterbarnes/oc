/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { ManualClock, MouseButtons } from "@opentui/core/testing"
import { SyntaxStyle, type TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { createRoot, createSignal, onCleanup } from "solid-js"
import { ClipboardProvider, useClipboard } from "../../src/context/clipboard"
import { KVProvider, useKV } from "../../src/context/kv"
import { ThemeProvider } from "../../src/context/theme"
import { TuiConfigProvider } from "../../src/config"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { DialogProvider, useDialog } from "../../src/ui/dialog"
import { ToastProvider, useToast } from "../../src/ui/toast"
import { Selection } from "../../src/util/selection"
import { InlineToolRow } from "../../src/routes/session"
import { tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { wait } from "../cli/cmd/tui/sync-fixture"

test("native selection expands words, wrapped source lines, and word drags", async () => {
  const clock = new ManualClock()
  const line = "alpha beta gamma delta epsilon"
  const app = await testRender(() => <text width={18}>{`${line}\nnext line`}</text>, {
    width: 30, height: 8, clock, autoFocus: false,
  })
  try {
    await app.renderOnce()
    const selected = () => app.renderer.getSelection()?.getSelectedText() ?? ""
    await app.mockMouse.click(7, 0)
    expect(selected()).toBe("")
    await app.mockMouse.click(7, 0)
    expect(selected()).toBe("beta")
    await app.mockMouse.click(7, 0)
    expect(selected()).toBe(line)

    app.renderer.clearSelection()
    await app.mockMouse.click(7, 0)
    await app.mockMouse.pressDown(7, 0)
    await app.mockMouse.emitMouseEvent("drag", 14, 0, MouseButtons.LEFT)
    await app.mockMouse.release(14, 0)
    expect(selected()).toBe("beta gamma")

    app.renderer.clearSelection()
    await app.mockMouse.click(7, 0)
    clock.advance(501)
    await app.mockMouse.click(7, 0)
    expect(selected()).toBe("")
  } finally {
    app.renderer.destroy()
  }
})

test.each([true, false])("selection copy mode %s retains gestures and respects modal/editor keys", async (automatic) => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, JSON.stringify({ copy_on_select: automatic }))
  const config = createTuiResolvedConfig()
  const writes: string[] = []
  const clipboard = { write: async (text: string) => { writes.push(text) } }
  const line = "alpha beta gamma delta epsilon"
  const syntax = SyntaxStyle.fromStyles({})
  const [markdown, setMarkdown] = createSignal("Streaming alpha beta.")
  let input!: TextareaRenderable
  let dialog!: ReturnType<typeof useDialog>
  let kv!: ReturnType<typeof useKV>
  let toast!: ReturnType<typeof useToast>
  let actions = 0
  let aborts = 0

  function Content() {
    const renderer = useRenderer()
    const service = useClipboard()
    toast = useToast()
    dialog = useDialog()
    kv = useKV()
    return (
      <box width="100%" height="100%"
        onMouseUp={(event) => automatic && Selection.copyOnMouseUp(renderer, toast, event, service)}
        onMouseDown={(event) => !automatic && Selection.copyOnMouseDown(renderer, toast, event, service)}>
        <text id="prose" position="absolute" top={0} width={18}>{`${line}\nnext line`}</text>
        <markdown id="markdown" position="absolute" top={4} width={35} syntaxStyle={syntax}
          streaming internalBlockMode="top-level" content={markdown()} />
        <code id="code" position="absolute" top={7} width={35} syntaxStyle={syntax}
          content="print alpha beta" drawUnstyledText />
        <text id="unicode" position="absolute" top={9} width={18}>wide 日本語 élan beta</text>
        <textarea id="prompt" position="absolute" top={12} width={35} height={2}
          ref={(r: TextareaRenderable) => { input = r }} initialValue="alpha beta" focused />
        <box id="tool" position="absolute" top={16} width={40}>
          <InlineToolRow icon="+" complete pending="Working" onMouseUp={() => { actions++ }}
            failed errorExpanded error="error alpha beta">tool alpha beta</InlineToolRow>
        </box>
        <text selectable={false} position="absolute" top={21}>Control</text>
      </box>
    )
  }

  function SelectionKeys() {
    const keymap = createDefaultOpenTuiKeymap(useRenderer())
    const renderer = useRenderer()
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    onCleanup(Selection.registerKeys(keymap, renderer, useToast(), useClipboard()))
    onCleanup(keymap.registerLayer({ bindings: [{ key: "ctrl+c", cmd: () => { aborts++ } }] }))
    return (
      <OpencodeKeymapProvider keymap={keymap}>
        <DialogProvider><Content /></DialogProvider>
      </OpencodeKeymapProvider>
    )
  }

  const app = await testRender(() => (
    <TestTuiContexts paths={{ state: tmp.path, home: tmp.path }}>
      <TuiConfigProvider config={config}><KVProvider><ThemeProvider mode="dark">
        <ClipboardProvider value={clipboard}><ToastProvider><SelectionKeys /></ToastProvider></ClipboardProvider>
      </ThemeProvider></KVProvider></TuiConfigProvider>
    </TestTuiContexts>
  ), { width: 80, height: 30, kittyKeyboard: true, autoFocus: false })

  try {
    await wait(() => Boolean(kv?.ready))
    await app.waitForVisualIdle()
    const selected = () => app.renderer.getSelection()?.getSelectedText() ?? ""
    const copies = async (count: number) => { await wait(() => writes.length === count) }

    await app.mockMouse.click(7, 0)
    expect(selected()).toBe("")
    expect(writes).toEqual([])
    await app.mockMouse.click(7, 0)
    expect(selected()).toBe("beta")
    if (automatic) await copies(1)
    expect(writes).toEqual(automatic ? ["beta"] : [])
    await app.mockMouse.click(7, 0)
    expect(selected()).toBe(line)
    if (automatic) await copies(2)
    expect(writes).toEqual(automatic ? ["beta", line] : [])
    const before = writes.length
    await app.mockMouse.release(7, 0, MouseButtons.RIGHT)
    expect(writes.length).toBe(before)
    app.mockInput.pressKey("c", { ctrl: true })
    await copies(before + 1)
    expect(writes.at(-1)).toBe(line)
    expect(selected()).toBe(line)
    expect(aborts).toBe(0)
    if (!automatic) {
      await app.mockMouse.click(7, 0, MouseButtons.RIGHT)
      await copies(before + 2)
      expect(selected()).toBe(line)
    }

    app.mockInput.pressEscape()
    expect(selected()).toBe("")
    app.mockInput.pressKey("c", { ctrl: true })
    expect(aborts).toBe(1)

    app.renderer.clearSelection()
    await app.mockMouse.click(7, 0)
    await app.mockMouse.pressDown(7, 0)
    await app.mockMouse.emitMouseEvent("drag", 2, 0, MouseButtons.LEFT)
    await app.mockMouse.release(2, 0)
    expect(selected()).toBe("alpha beta")
    await app.mockInput.typeText("!")
    expect(selected()).toBe("")
    expect(input.plainText).toContain("!")

    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(8, 12)
    expect(selected()).toBe("beta")
    await app.mockInput.typeText("replacement")
    expect(input.plainText).toContain("replacement")
    expect(input.plainText).not.toContain("beta")

    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(11, 4)
    expect(selected()).toBe("alpha")
    setMarkdown("Streaming alpha beta. More output.")
    await app.waitForVisualIdle()
    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(11, 4)
    expect(selected()).toBe("alpha")
    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(8, 7)
    expect(selected()).toBe("alpha")
    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(6, 9)
    expect(selected()).toBe("日本語")
    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(12, 9)
    expect(selected()).toBe("élan")

    app.renderer.clearSelection()
    const tool = app.renderer.root.findDescendantById("tool")!
    await app.mockMouse.doubleClick(tool.x + 11, tool.y)
    expect(selected()).toBe("")
    expect(actions).toBe(2)
    await app.mockMouse.click(tool.x + 3, tool.y)
    expect(actions).toBe(3)

    app.renderer.clearSelection()
    dialog.replace(() => <text id="modal-text">modal alpha beta</text>)
    await app.waitForVisualIdle()
    const modal = app.renderer.root.findDescendantById("modal-text")!
    const count = writes.length
    await app.mockMouse.doubleClick(modal.x + 8, modal.y)
    expect(selected()).toBe("alpha")
    expect(dialog.stack.length).toBe(1)
    if (automatic) await copies(count + 1)
    app.mockInput.pressKey("c", { ctrl: true })
    await copies(count + (automatic ? 2 : 1))
    expect(selected()).toBe("alpha")
    expect(dialog.stack.length).toBe(1)
    app.mockInput.pressEscape()
    expect(selected()).toBe("")
    expect(dialog.stack.length).toBe(1)
    app.mockInput.pressEscape()
    expect(dialog.stack.length).toBe(0)

    dialog.replace(() => <text id="modal-again">modal alpha beta</text>)
    await app.waitForVisualIdle()
    const again = app.renderer.root.findDescendantById("modal-again")!
    await app.mockMouse.doubleClick(again.x + 8, again.y)
    await app.mockMouse.click(0, 0)
    expect(dialog.stack.length).toBe(0)
    expect(toast.currentToast?.variant).not.toBe("error")
  } finally {
    app.renderer.destroy()
    syntax.destroy()
  }
})

test("clickable tool rows are not selectable and fire despite existing selection", async () => {
  let actions = 0
  const app = await testRender(() => (
    <box width="100%" height="100%">
      <text id="prose" position="absolute" top={0} width={30}>alpha beta gamma</text>
      <box id="tool" position="absolute" top={2} width={40}>
        <InlineToolRow icon="+" complete pending="Working" onMouseUp={() => { actions++ }}>tool alpha beta</InlineToolRow>
      </box>
      <box id="pending" position="absolute" top={4} width={40}>
        <InlineToolRow icon="+" complete={undefined} pending="Working hard" onMouseUp={() => { actions++ }}>tool alpha beta</InlineToolRow>
      </box>
      <box id="plain" position="absolute" top={6} width={40}>
        <InlineToolRow icon="+" complete pending="Working">plain alpha beta</InlineToolRow>
      </box>
    </box>
  ), { width: 80, height: 10, autoFocus: false })
  try {
    await app.renderOnce()
    const selected = () => app.renderer.getSelection()?.getSelectedText() ?? ""

    const tool = app.renderer.root.findDescendantById("tool")!
    await app.mockMouse.doubleClick(tool.x + 11, tool.y)
    expect(selected()).toBe("")
    expect(actions).toBe(2)

    const pending = app.renderer.root.findDescendantById("pending")!
    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(pending.x + 11, pending.y)
    expect(selected()).toBe("")
    expect(actions).toBe(4)

    await app.mockMouse.doubleClick(7, 0)
    expect(selected()).toBe("beta")
    const before = actions
    await app.mockMouse.click(tool.x + 3, tool.y)
    expect(actions).toBe(before + 1)

    const plain = app.renderer.root.findDescendantById("plain")!
    app.renderer.clearSelection()
    await app.mockMouse.doubleClick(plain.x + 11, plain.y)
    expect(selected()).toBe("alpha")
    expect(actions).toBe(before + 1)
  } finally {
    app.renderer.destroy()
  }
})

test("clipboard copies finish in gesture order and failures preserve selected text", async () => {
  const app = await testRender(() => <text>alpha beta gamma</text>, { width: 30, height: 4 })
  const writes: string[] = []
  const errors: unknown[] = []
  const toast = { show: () => {}, error: (error: unknown) => { errors.push(error) } }
  let finish!: () => void
  const first = new Promise<void>((resolve) => { finish = resolve })
  const failure = new Error("clipboard unavailable")
  const clipboard = {
    write: async (text: string) => {
      writes.push(text)
      if (writes.length === 1) return first
      if (writes.length === 2) throw failure
    },
  }
  try {
    await app.renderOnce()
    await app.mockMouse.doubleClick(7, 0)
    expect(Selection.copy(app.renderer, toast, {})).toBe(false)
    expect(Selection.copy(app.renderer, toast, clipboard)).toBe(true)
    await app.mockMouse.click(7, 0)
    expect(Selection.copy(app.renderer, toast, clipboard)).toBe(true)
    expect(writes).toEqual(["beta"])
    finish()
    await wait(() => errors.length === 1)
    expect(writes).toEqual(["beta", "alpha beta gamma"])
    expect(errors).toEqual([failure])
    expect(app.renderer.getSelection()?.getSelectedText()).toBe("alpha beta gamma")
    expect(Selection.copy(app.renderer, toast, clipboard)).toBe(true)
    await wait(() => writes.length === 3)
    expect(writes.at(-1)).toBe("alpha beta gamma")
  } finally {
    app.renderer.destroy()
  }
})

test("migrated Solid patch parses in every runtime and keeps cleanup reentrant", async () => {
  const parser = new Bun.Transpiler({ loader: "js" })
  for (const file of ["solid.js", "solid.cjs", "dev.js", "dev.cjs", "server.js", "server.cjs"]) {
    expect(parser.scanImports(await Bun.file(new URL(file, import.meta.resolve("solid-js"))).text())).toBeDefined()
  }
  let cleanups = 0
  createRoot((dispose) => {
    onCleanup(() => {
      cleanups++
      dispose()
    })
    dispose()
  })
  expect(cleanups).toBe(1)
})
