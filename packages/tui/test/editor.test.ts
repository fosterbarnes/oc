import { afterEach, expect, test } from "bun:test"
import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  discoverEditorConnection,
  editorLaunchSpec,
  normalizePromptContent,
  openEditor,
  openFileAtLocation,
  resolveFilePath,
} from "../src/editor"

const editor = process.env.EDITOR
const visual = process.env.VISUAL

afterEach(() => {
  process.env.EDITOR = editor
  process.env.VISUAL = visual
})

test("rejects when the external editor cannot start", async () => {
  delete process.env.VISUAL
  process.env.EDITOR = "opencode-editor-that-does-not-exist"
  const renderer = {
    suspend() {},
    resume() {},
    requestRender() {},
    currentRenderBuffer: { clear() {} },
  }

  await expect(openEditor({ value: "original", renderer: renderer as never })).rejects.toThrow()
})

test("normalizes a single trailing editor newline for one-line prompts", () => {
  expect(normalizePromptContent("hello\n")).toBe("hello")
  expect(normalizePromptContent("hello\r\n")).toBe("hello")
})

test("preserves multiline prompts that end with a newline", () => {
  expect(normalizePromptContent("hello\nworld\n")).toBe("hello\nworld\n")
})

test("resolves relative file paths from the working directory", () => {
  expect(resolveFilePath("src/app.ts", "C:\\workspace")).toBe("C:\\workspace\\src\\app.ts")
  expect(resolveFilePath("C:\\other\\app.ts", "C:\\workspace")).toBe("C:\\other\\app.ts")
})

test("splits editor commands and enables a Windows shell for file opens", () => {
  const launch = editorLaunchSpec("code -g", "C:\\workspace\\src\\app.ts")
  expect(launch.command).toBe("code")
  expect(launch.args).toEqual(["-g", "C:\\workspace\\src\\app.ts"])
  expect(launch.options.shell).toBe(process.platform === "win32")
  expect(launch.options.detached).toBe(true)
  expect(launch.options.stdio).toBe("ignore")
})

test("skips dead IDE lock files and prefers a live port", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "opencode-ide-"))
  const directory = path.join(root, "workspace")
  const lockDir = path.join(root, ".claude", "ide")
  await mkdir(directory, { recursive: true })
  await mkdir(lockDir, { recursive: true })
  await writeFile(
    path.join(lockDir, "3001.lock"),
    JSON.stringify({
      transport: "ws",
      workspaceFolders: [directory],
    }),
  )
  await writeFile(
    path.join(lockDir, "3002.lock"),
    JSON.stringify({
      transport: "ws",
      workspaceFolders: [directory],
    }),
  )

  const open = await discoverEditorConnection(directory, {
    lockDir,
    isPortOpen: (port) => port === 3002,
  })
  expect(open).toEqual({
    url: "ws://127.0.0.1:3002",
    authToken: undefined,
    source: "lock:3002",
  })
})
