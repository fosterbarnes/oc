/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { onCleanup, createSignal } from "solid-js"
import { OpencodeKeymapProvider, registerOpencodeKeymap, useBindings } from "../../../src/keymap"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TuiKeybind } from "../../../src/config/keybind"

test("Home launch is bound to Ctrl+Enter", () => {
  expect(TuiKeybind.defaultValue("prompt_submit_background")).toBe("ctrl+return")
})

test("Ctrl+Enter launches on Home and inserts a newline in a session", async () => {
  const config = createTuiResolvedConfig()
  const runs: string[] = []
  const [session, setSession] = createSignal(false)
  let input: TextareaRenderable | undefined

  function Prompt() {
    const [target, setTarget] = createSignal<TextareaRenderable>()
    useBindings(() => ({
      commands: [{ title: "Send prompt and stay on Home", name: "prompt.submit.background", run: () => void runs.push("home") }],
    }))
    useBindings(() => ({
      target,
      enabled: target() !== undefined && !session(),
      bindings: config.keybinds.get("prompt.submit.background"),
    }))
    return (
      <textarea
        focused
        ref={(r: TextareaRenderable) => {
          input = r
          setTarget(r)
        }}
      />
    )
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

  const app = await testRender(() => <Harness />, { kittyKeyboard: true })
  try {
    await app.renderOnce()
    await app.mockInput.typeText("a")
    app.mockInput.pressEnter({ ctrl: true })
    expect(runs).toEqual(["home"])
    expect(input?.plainText).toBe("a")
    setSession(true)
    await app.renderOnce()
    app.mockInput.pressEnter({ ctrl: true })
    expect(runs).toEqual(["home"])
    expect(input?.plainText).toBe("a\n")
  } finally {
    app.renderer.destroy()
  }
})
