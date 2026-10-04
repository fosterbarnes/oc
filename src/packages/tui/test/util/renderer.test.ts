import { expect, test } from "bun:test"
import { destroyRenderer, writeTerminalEscape } from "../../src/util/renderer"

test("clears the terminal title before destroying the renderer", () => {
  const calls: string[] = []
  destroyRenderer({
    isDestroyed: false,
    setTerminalTitle(title) {
      calls.push(`title:${title}`)
    },
    destroy() {
      calls.push("destroy")
    },
  })
  expect(calls).toEqual(["title:", "destroy"])
})

test("still clears the title after renderer destruction", () => {
  const calls: string[] = []
  destroyRenderer({
    isDestroyed: true,
    setTerminalTitle(title) {
      calls.push(`title:${title}`)
    },
    destroy() {
      calls.push("destroy")
    },
  })
  expect(calls).toEqual(["title:"])
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
