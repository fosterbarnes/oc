import { expect, test } from "bun:test"
import { copyCommand, read } from "../src/clipboard"
import { existsSync } from "node:fs"
import { rm, writeFile } from "node:fs/promises"
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

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test("returns the image file dropped on the Windows clipboard as image data", async () => {
  const file = path.join(tmpdir(), `clipboard-drop-${process.pid}.png`)
  await writeFile(file, pngBytes)
  let script = ""
  try {
    const result = await read({
      os: "win32",
      host: async () => undefined,
      command: async (_command, args) => {
        script = args?.[3] ?? ""
        return Buffer.from(`path:${file}`)
      },
    })

    expect(script.indexOf("GetFileDropList")).toBeLessThan(script.indexOf("GetImage"))
    expect(script).not.toContain("{;")
    expect(script).not.toContain("-and;")
    expect(result).toEqual({ data: pngBytes.toString("base64"), mime: "image/png", filepath: file })
    expect(existsSync(file)).toBe(true)
  } finally {
    await rm(file, { force: true })
  }
})

test("returns and removes the temporary image for image-only Windows clipboard data", async () => {
  const outputPath = path.join(tmpdir(), `opencode-clipboard-${process.pid}.png`)
  const escapedOutputPath = outputPath.replace(/'/g, "''")
  await writeFile(outputPath, pngBytes)
  const result = await read({
    os: "win32",
    host: async () => undefined,
    command: async (_command, args) => {
      expect(args?.[0]).toBe("-NonInteractive")
      expect(args?.[3]).toContain("GetFileDropList")
      expect(args?.[3]).toContain("GetImage")
      expect(args?.[3]).toContain(`$outputPath = '${escapedOutputPath}'`)
      return Buffer.from(`image:${outputPath}`)
    },
  })

  expect(result).toEqual({ data: pngBytes.toString("base64"), mime: "image/png" })
  expect(existsSync(outputPath)).toBe(false)
})

test("keeps ordinary Windows clipboard text as the fallback", async () => {
  const result = await read({
    os: "win32",
    host: async () => undefined,
    command: async () => Buffer.alloc(0),
    text: async () => "clipboard text",
  })

  expect(result).toEqual({ data: "clipboard text", mime: "text/plain" })
})

test("skips the PowerShell read when the native Windows clipboard has content", async () => {
  let ran = false
  const result = await read({
    os: "win32",
    host: async () => ({ data: "clipboard text", mime: "text/plain" }),
    command: async () => {
      ran = true
      return Buffer.alloc(0)
    },
  })

  expect(result).toEqual({ data: "clipboard text", mime: "text/plain" })
  expect(ran).toBe(false)
})
