import { expect, test } from "bun:test"
import { copyCommand, read } from "../src/clipboard"
import path from "node:path"
import { tmpdir } from "node:os"

test("prefers Wayland clipboard when available", () => {
  expect(copyCommand("linux", true, (name) => name === "wl-copy")).toEqual(["wl-copy"])
})

test("uses osascript on macOS", () => {
  expect(copyCommand("darwin", false, (name) => name === "osascript")).toEqual(["osascript"])
})

test("falls back through X11 clipboard commands", () => {
  expect(copyCommand("linux", true, (name) => name === "xclip")).toEqual(["xclip", "-selection", "clipboard"])
  expect(copyCommand("linux", false, (name) => name === "xsel")).toEqual(["xsel", "--clipboard", "--input"])
})

test("returns undefined when native clipboard is unavailable", () => {
  expect(copyCommand("linux", false, () => false)).toBeUndefined()
})

test("prefers an image file path from the Windows clipboard", async () => {
  const file = path.join(tmpdir(), "clipboard-image.png")
  let script = ""
  const result = await read({
    os: "win32",
    command: async (_command, args) => {
      script = args?.[3] ?? ""
      return Buffer.from(`path:${file}`)
    },
  })

  expect(script.indexOf("GetFileDropList")).toBeLessThan(script.indexOf("GetImage"))
  expect(script).not.toContain("{;")
  expect(script).not.toContain("-and;")
  expect(result).toEqual({ data: file, mime: "text/plain" })
})

test("returns a temporary path for image-only Windows clipboard data", async () => {
  const outputPath = path.join(tmpdir(), `opencode-clipboard-${process.pid}.png`)
  const escapedOutputPath = outputPath.replace(/'/g, "''")
  const result = await read({
    os: "win32",
    command: async (_command, args) => {
      expect(args?.[0]).toBe("-NonInteractive")
      expect(args?.[3]).toContain("GetFileDropList")
      expect(args?.[3]).toContain("GetImage")
      expect(args?.[3]).toContain(`$outputPath = '${escapedOutputPath}'`)
      return Buffer.from(`image:${outputPath}`)
    },
  })

  expect(result).toEqual({
    data: outputPath,
    mime: "text/plain",
  })
})

test("keeps ordinary Windows clipboard text as the fallback", async () => {
  const result = await read({
    os: "win32",
    command: async () => Buffer.alloc(0),
    text: async () => "clipboard text",
  })

  expect(result).toEqual({ data: "clipboard text", mime: "text/plain" })
})
