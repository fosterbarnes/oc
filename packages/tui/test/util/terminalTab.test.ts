import { expect, test } from "bun:test"
import { nearestAgentSquare } from "../../src/util/terminalTab"
import { destroyRenderer, writeTerminalEscape } from "../../src/util/renderer"

test.each([
  [[255, 0, 0], "🟥"],
  [[255, 128, 0], "🟧"],
  [[255, 255, 0], "🟨"],
  [[0, 180, 0], "🟩"],
  [[0, 100, 255], "🟦"],
  [[160, 50, 200], "🟪"],
  [[130, 80, 40], "🟫"],
  [[0, 0, 0], "⬛"],
  [[255, 255, 255], "⬜"],
] as const)("maps RGB %j to %s", (rgb, square) => {
  expect(nearestAgentSquare(rgb)).toBe(square)
})

test("uses renderer output and clears progress before destruction", () => {
  const calls: string[] = []
  const renderer = {
    isDestroyed: false,
    setTerminalTitle: (title: string) => calls.push(`title:${title}`),
    writeOut: (escape: string) => {
      calls.push(escape)
      return true
    },
    destroy: () => calls.push("destroy"),
  }
  writeTerminalEscape(renderer, "\x1b]9;4;3\x1b\\")
  destroyRenderer(renderer)
  expect(calls[0]).toBe("\x1b]9;4;3\x1b\\")
  expect(calls[1]).toBe("title:")
  expect(calls[2]).toBe("\x1b]9;4;0\x1b\\")
  expect(calls.at(-1)).toBe("destroy")
  renderer.isDestroyed = true
  writeTerminalEscape(renderer, "ignored")
  expect(calls.at(-1)).toBe("destroy")
})
