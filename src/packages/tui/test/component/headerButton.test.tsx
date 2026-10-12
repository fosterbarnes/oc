/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { createSignal } from "solid-js"
import { HeaderButton } from "../../src/routes/session/sidebar-tools/headerButton"

test("minimal buttons stay single-line on hover and after changing styles", async () => {
  const [outlined, setOutlined] = createSignal(false)
  let clicks = 0
  const app = await testRender(
    () => (
      <box flexDirection="column">
        <HeaderButton
          value="Switch Session"
          outlined={outlined()}
          color="#AC98C7"
          hoverColor="#FFFFFF"
          onClick={() => clicks++}
        />
        <text>Next row</text>
      </box>
    ),
    { width: 40, height: 8 },
  )
  try {
    await app.renderOnce()
    const minimal = app.captureCharFrame()
    expect(minimal.split("\n")[0]).toContain("> Switch Session")
    expect(minimal.split("\n")[1]).toContain("Next row")
    await app.mockMouse.moveTo(3, 0)
    await app.renderOnce()
    expect(app.captureCharFrame()).toBe(minimal)
    await app.mockMouse.click(3, 0)
    expect(clicks).toBe(1)
    await app.mockMouse.moveTo(3, 6)
    await app.renderOnce()
    expect(app.captureCharFrame()).toBe(minimal)
    setOutlined(true)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("┌")
    setOutlined(false)
    await app.renderOnce()
    await app.mockMouse.moveTo(3, 0)
    await app.renderOnce()
    expect(app.captureCharFrame()).toBe(minimal)
  } finally {
    app.renderer.destroy()
  }
})

test.each([false, true])("button text cannot be selected in outlined=%s", async (outlined) => {
  let clicks = 0
  const app = await testRender(
    () => (
      <box flexDirection="column">
        <HeaderButton
          value="Switch Session"
          outlined={outlined}
          color="#AC98C7"
          hoverColor="#FFFFFF"
          onClick={() => clicks++}
        />
        <text>Selectable text</text>
      </box>
    ),
    { width: 40, height: 8 },
  )
  try {
    await app.renderOnce()
    const y = outlined ? 1 : 0
    await app.mockMouse.doubleClick(5, y)
    expect(app.renderer.getSelection()?.getSelectedText() ?? "").toBe("")
    expect(clicks).toBe(2)
    if (!outlined) {
      await app.mockMouse.doubleClick(0, y)
      expect(app.renderer.getSelection()?.getSelectedText() ?? "").toBe("")
    }
    await app.mockMouse.doubleClick(5, outlined ? 3 : 1)
    expect(app.renderer.getSelection()?.getSelectedText()).toBe("Selectable")
  } finally {
    app.renderer.destroy()
  }
})

test("minimal prefixes align and stay single-line within a narrow sidebar", async () => {
  const [width, setWidth] = createSignal(24)
  const app = await testRender(
    () => (
      <box flexDirection="column" width={width()}>
        <HeaderButton value="Switch Session" outlined={false} color="#AC98C7" hoverColor="#FFFFFF" onClick={() => {}} />
        <HeaderButton
          value="A longer model label"
          outlined={false}
          color="#AC98C7"
          hoverColor="#FFFFFF"
          onClick={() => {}}
        />
        <HeaderButton value="low" outlined={false} color="#AC98C7" hoverColor="#FFFFFF" onClick={() => {}} />
      </box>
    ),
    { width: 40, height: 8 },
  )
  try {
    await app.renderOnce()
    const rows = app.captureCharFrame().split("\n")
    expect(rows.slice(0, 3).map((row) => row.indexOf("> "))).toEqual([0, 0, 0])
    await app.mockMouse.moveTo(3, 2)
    await app.renderOnce()
    expect(app.captureCharFrame().split("\n").slice(0, 3)).toEqual(rows.slice(0, 3))
    setWidth(12)
    await app.renderOnce()
    const narrow = app.captureCharFrame().split("\n")
    expect(narrow.slice(0, 3).map((row) => row.indexOf("> "))).toEqual([0, 0, 0])
    expect(narrow[2]).toContain("> low")
    expect(narrow.slice(0, 3).every((row) => row.trimEnd().length <= 12)).toBe(true)
  } finally {
    app.renderer.destroy()
  }
})

test("inline model and reasoning buttons stay independently clickable", async () => {
  const clicks: string[] = []
  const [width, setWidth] = createSignal(40)
  const [model, setModel] = createSignal("GPT-6.1 Sol")
  const app = await testRender(
    () => (
      <box flexDirection="row" gap={1} width={width()}>
        <HeaderButton
          value={model()}
          outlined={false}
          color="#AC98C7"
          hoverColor="#FFFFFF"
          onClick={() => clicks.push("model")}
        />
        <HeaderButton
          value="low"
          secondary
          outlined={false}
          color="#AC98C7"
          hoverColor="#FFFFFF"
          onClick={() => clicks.push("reasoning")}
        />
      </box>
    ),
    { width: 40, height: 8 },
  )
  try {
    await app.renderOnce()
    const initial = app.captureCharFrame()
    expect(initial.split("\n")[0]).toContain("> GPT-6.1 Sol >> low")
    await app.mockMouse.click(4, 0)
    await app.mockMouse.click(17, 0)
    await app.renderOnce()
    expect(clicks).toEqual(["model", "reasoning"])
    expect(app.captureCharFrame()).toBe(initial)
    setModel("A much longer model label")
    setWidth(20)
    await app.renderOnce()
    const narrow = app.captureCharFrame().split("\n")
    expect(narrow[0]).toContain(">> low")
    expect(narrow[0]?.trimEnd().length).toBeLessThanOrEqual(20)
    expect(narrow[1]?.trim()).toBe("")
  } finally {
    app.renderer.destroy()
  }
})
