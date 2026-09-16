import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"

test("resume restores input when raw mode cannot be re-enabled", async () => {
  const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
  const stdin = setup.renderer.stdin
  const listeners = stdin.listenerCount("data")

  try {
    setup.renderer.suspend()
    stdin.setRawMode = ((enabled) => {
      if (enabled) throw new Error("raw mode unavailable")
      return stdin
    }) as typeof stdin.setRawMode

    expect(() => setup.renderer.resume()).not.toThrow()
    expect(stdin.listenerCount("data")).toBe(listeners)
    expect(stdin.isPaused()).toBe(false)
  } finally {
    setup.renderer.destroy()
  }
})
