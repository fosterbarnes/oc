/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import type { BoxRenderable, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import { testRender, useRenderer } from "@opentui/solid"
import { createSignal, For, onCleanup } from "solid-js"
import { Autocomplete, type AutocompleteRef } from "../../src/component/prompt/autocomplete"
import { TuiConfigProvider } from "../../src/config"
import { ArgsProvider } from "../../src/context/args"
import { DataProvider } from "../../src/context/data"
import { EditorContextProvider } from "../../src/context/editor"
import { ExitProvider } from "../../src/context/exit"
import { KVProvider } from "../../src/context/kv"
import { LocationProvider } from "../../src/context/location"
import { PermissionProvider } from "../../src/context/permission"
import { ProjectProvider } from "../../src/context/project"
import { RouteProvider } from "../../src/context/route"
import { SDKProvider } from "../../src/context/sdk"
import { SyncProvider } from "../../src/context/sync"
import { ThemeProvider } from "../../src/context/theme"
import { OpencodeKeymapProvider, registerOpencodeKeymap } from "../../src/keymap"
import { FrecencyProvider } from "../../src/prompt/frecency"
import { tmpdir } from "../fixture/fixture"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"
import { createFetch, directory, eventSource, json } from "../fixture/tui-sdk"
import { wait } from "../cli/cmd/tui/sync-fixture"

test("session slash menu reserves space, follows output, and preserves manual scrolling", async () => {
  await using tmp = await tmpdir()
  await Bun.write(`${tmp.path}/kv.json`, "{}")
  const config = createTuiResolvedConfig()
  const calls = createFetch((url) => {
    if (url.pathname === "/command") return json(
      Array.from({ length: 15 }, (_, index) => ({
        name: `action${index.toString().padStart(2, "0")}`,
        description: "Command",
        template: "Command",
        source: "command",
      })),
    )
    if (url.pathname === "/api/fs/find") return json({ location: { directory }, data: [] })
  })
  const [lines, setLines] = createSignal(Array.from({ length: 60 }, (_, index) => `Output ${index}`))
  const [value, setValue] = createSignal("")
  const [session, setSession] = createSignal(true)
  const [visible, setVisible] = createSignal(true)
  let chat!: ScrollBoxRenderable
  let dock!: BoxRenderable
  let anchor!: BoxRenderable
  let input!: TextareaRenderable
  let autocomplete!: AutocompleteRef

  function Layout() {
    return (
      <box width="100%" height="100%" minHeight={0} gap={1}>
        <scrollbox ref={(r: ScrollBoxRenderable) => (chat = r)} flexGrow={1}
          stickyScroll stickyStart="bottom" scrollbarOptions={{ visible: false }}>
          <For each={lines()}>{(line) => <text flexShrink={0}>{line}</text>}</For>
        </scrollbox>
        <box ref={(r: BoxRenderable) => (dock = r)} flexShrink={0}>
          <Autocomplete
            sessionID={session() ? "ses_layout" : undefined}
            inlineSlashMenu={session()}
            visible={visible()}
            value={value()}
            anchor={() => anchor}
            input={() => input}
            ref={(r) => (autocomplete = r)}
            setPrompt={(cb) => {
              const draft = { input: input.plainText, parts: [] }
              cb(draft)
              setValue(draft.input)
            }}
            setExtmark={() => {}}
            fileStyleId={0}
            agentStyleId={0}
            promptPartTypeId={() => 0}
          />
          <box ref={(r: BoxRenderable) => (anchor = r)} height={4} visible={visible()}>
            <textarea focused height={1} ref={(r: TextareaRenderable) => (input = r)}
              onContentChange={() => {
                setValue(input.plainText)
                autocomplete?.onInput(input.plainText)
              }} />
            <text>Prompt status</text>
          </box>
        </box>
      </box>
    )
  }

  function Harness() {
    const renderer = useRenderer()
    const keymap = createDefaultOpenTuiKeymap(renderer)
    onCleanup(registerOpencodeKeymap(keymap, renderer, config))
    return (
      <TestTuiContexts paths={{ state: tmp.path, home: tmp.path }}>
        <ArgsProvider>
          <OpencodeKeymapProvider keymap={keymap}>
            <TuiConfigProvider config={config}>
              <KVProvider>
                <SDKProvider url="http://test" directory={directory} fetch={calls.fetch} events={eventSource()}>
                  <PermissionProvider>
                    <ProjectProvider>
                      <ExitProvider exit={(error) => { throw error }}>
                        <RouteProvider initialRoute={{ type: "home" }}>
                          <SyncProvider>
                            <DataProvider>
                              <ThemeProvider mode="dark">
                                <EditorContextProvider integration={{ connection: () => undefined }}>
                                  <FrecencyProvider>
                                    <LocationProvider><Layout /></LocationProvider>
                                  </FrecencyProvider>
                                </EditorContextProvider>
                              </ThemeProvider>
                            </DataProvider>
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

  const app = await testRender(() => <Harness />, { width: 80, height: 30, kittyKeyboard: true })
  try {
    await wait(() => Boolean(autocomplete))
    await app.waitForVisualIdle()
    const originalHeight = chat.viewport.height
    const edit = async (text: string) => {
      input.setText(text)
      input.gotoBufferEnd()
      setValue(text)
      autocomplete.onInput(text)
      await app.waitForVisualIdle()
    }
    const menu = () => dock.getChildren()[0]!
    const expectSeparated = () => {
      expect(chat.viewport.y + chat.viewport.height).toBeLessThanOrEqual(menu().y)
      expect(menu().y + menu().height).toBe(anchor.y)
      expect(anchor.y + anchor.height).toBe(30)
      expect(app.captureCharFrame()).toContain(lines().at(-1)!)
    }

    await edit("/")
    await app.waitForFrame((frame) => frame.includes("/action"))
    expect(menu().height).toBe(10)
    expect(chat.viewport.height).toBe(originalHeight - 10)
    expectSeparated()
    setLines((current) => [...current, "Assistant completed"])
    await app.waitForVisualIdle()
    expectSeparated()
    expect(app.captureCharFrame()).toContain("Assistant completed")

    await edit("/action14")
    expect(menu().height).toBe(2)
    expectSeparated()
    await edit("/zzzzzzzz")
    expect(menu().height).toBe(2)
    expect(app.captureCharFrame()).toContain("No matching items")
    app.mockInput.pressEscape()
    await app.waitForVisualIdle()
    expect(autocomplete.visible).toBe(false)
    expect(chat.viewport.height).toBe(originalHeight)

    chat.scrollTo(10)
    await app.waitForVisualIdle()
    const readingPosition = chat.scrollTop
    await edit("/")
    expect(chat.scrollTop).toBe(readingPosition)
    await edit("/action14")
    expect(chat.scrollTop).toBe(readingPosition)
    app.mockInput.pressEscape()
    await app.waitForVisualIdle()
    expect(chat.scrollTop).toBe(readingPosition)

    chat.scrollTo(chat.scrollHeight)
    await edit("/")
    app.resize(80, 15)
    await app.waitForVisualIdle()
    expect(menu().height).toBe(5)
    expect(chat.viewport.y + chat.viewport.height).toBeLessThanOrEqual(menu().y)
    expect(menu().y + menu().height).toBe(anchor.y)
    expect(app.captureCharFrame()).toContain("Assistant completed")
    app.resize(80, 30)
    await app.waitForVisualIdle()
    expectSeparated()

    setSession(false)
    await app.waitForVisualIdle()
    expect(chat.viewport.height).toBe(originalHeight)
    await wait(() => menu().top === anchor.y - dock.y - menu().height)
    await app.waitForVisualIdle()
    expect(menu().y + menu().height).toBe(anchor.y)
    await edit("")
    setSession(true)
    await edit("@")
    expect(autocomplete.visible).toBe("@")
    expect(chat.viewport.height).toBe(originalHeight)
    await edit("")
    await edit("/")
    setVisible(false)
    await app.waitForVisualIdle()
    expect(menu().visible).toBe(false)
    expect(chat.viewport.height).toBeGreaterThan(originalHeight)
  } finally {
    app.renderer.destroy()
  }
})
