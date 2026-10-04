import { expect, test } from "bun:test"
import { Definitions } from "../src/config/keybind"
import { win32AssertRawMode } from "../src/terminal-win32"

test("win32AssertRawMode does not start a recurring timer", () => {
  const original = globalThis.setInterval
  const delays: number[] = []
  globalThis.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
    delays.push(delay ?? 0)
    return original(handler, delay, ...args)
  }) as typeof setInterval
  try {
    win32AssertRawMode()
    expect(delays).toEqual([])
  } finally {
    globalThis.setInterval = original
  }
})

test("app.exit default does not include ctrl+c or ctrl+d", () => {
  expect(Definitions.app_exit.default).not.toMatch(/ctrl\+[cd]/)
})
