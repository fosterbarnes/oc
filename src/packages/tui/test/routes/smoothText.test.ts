import { afterEach, expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { smoothText } from "../../src/routes/session/smoothText"

const roots: (() => void)[] = []

afterEach(() => {
  for (const dispose of roots.splice(0)) dispose()
})

function setup(input: { text?: string; done?: boolean; enabled?: boolean }) {
  return createRoot((dispose) => {
    roots.push(dispose)
    const [text, setText] = createSignal(input.text ?? "")
    const [done, setDone] = createSignal(input.done ?? false)
    const [enabled, setEnabled] = createSignal(input.enabled ?? true)
    return { shown: smoothText(text, done, enabled), setText, setDone, setEnabled }
  })
}

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) await Bun.sleep(20)
  return check()
}

test("off passes text through unchanged", () => {
  const smooth = setup({ enabled: false })
  smooth.setText("a burst of streamed text")
  expect(smooth.shown()).toBe("a burst of streamed text")
})

test("on reveals a burst over several ticks and catches up exactly", async () => {
  const smooth = setup({})
  const full = "x".repeat(40)
  smooth.setText(full)
  expect(smooth.shown()).toBe("")
  await Bun.sleep(50)
  // The first tick reveals a quarter of the backlog, not all of it.
  expect(smooth.shown().length).toBeGreaterThan(0)
  expect(smooth.shown().length).toBeLessThan(full.length)
  expect(await waitFor(() => smooth.shown() === full)).toBe(true)
})

test("done snaps to the full text", () => {
  const smooth = setup({})
  smooth.setText("the whole final reply")
  expect(smooth.shown()).toBe("")
  smooth.setDone(true)
  expect(smooth.shown()).toBe("the whole final reply")
})

test("text present at mount or when turned on shows at once", () => {
  const mounted = setup({ text: "already here" })
  expect(mounted.shown()).toBe("already here")

  const toggled = setup({ enabled: false })
  toggled.setText("arrived while off")
  toggled.setEnabled(true)
  expect(toggled.shown()).toBe("arrived while off")
})

test("a shorter rewrite does not reveal later text early", async () => {
  const smooth = setup({ text: "**Title" })
  smooth.setText("")
  smooth.setText("Body text after the title")
  expect(smooth.shown()).toBe("")
  expect(await waitFor(() => smooth.shown() === "Body text after the title")).toBe(true)
})
