import { afterEach, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  discoverEditorConnection,
  normalizePromptContent,
  openEditor,
  openFileAtLocation,
  resolveEditorForFile,
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
  // Windows drive paths only resolve with win32 path semantics.
  if (process.platform !== "win32") return
  expect(resolveFilePath("src/app.ts", "C:\\workspace")).toBe("C:\\workspace\\src\\app.ts")
  expect(resolveFilePath("C:\\other\\app.ts", "C:\\workspace")).toBe("C:\\other\\app.ts")
})

test("a Windows batch editor gets a path with spaces and & as one argument", async () => {
  if (process.platform !== "win32") return
  const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-editor-"))
  const shim = path.join(dir, "editor.cmd")
  const target = path.join(dir, "a b&mkdir injected.md")
  await writeFile(shim, '@echo %*> "%~dp0args.txt"\r\n')
  await writeFile(target, "")
  await openFileAtLocation({ filePath: target, cwd: dir, editor: shim })
  const record = path.join(dir, "args.txt")
  const deadline = Date.now() + 5_000
  while (!existsSync(record) && Date.now() < deadline) await Bun.sleep(50)
  expect((await readFile(record, "utf8")).trim()).toBe(`"${target}"`)
  expect(existsSync(path.join(dir, "injected.md"))).toBe(false)
}, 10_000)

test("picks the editor by file extension before default and env", () => {
  const env = { EDITOR: "env-editor" }
  const setting = { default: "default-editor", ".md": "md-editor" }
  expect(resolveEditorForFile("notes.md", setting, env)).toBe("md-editor")
  expect(resolveEditorForFile("NOTES.MD", setting, env)).toBe("md-editor")
  expect(resolveEditorForFile("app.ts", setting, env)).toBe("default-editor")
  expect(resolveEditorForFile("Makefile", setting, env)).toBe("default-editor")
  expect(resolveEditorForFile("app.ts", { ".md": "md-editor" }, env)).toBe("env-editor")
  expect(resolveEditorForFile("app.ts", "string-editor", env)).toBe("string-editor")
})

test("falls back to VISUAL then EDITOR then Notepad on Windows only", () => {
  const setting = { ".md": "md-editor" }
  expect(resolveEditorForFile("app.ts", setting, { VISUAL: "visual-editor", EDITOR: "env-editor" }, "linux")).toBe(
    "visual-editor",
  )
  expect(resolveEditorForFile("app.ts", setting, { EDITOR: "env-editor" }, "linux")).toBe("env-editor")
  expect(resolveEditorForFile("app.ts", "", { EDITOR: "env-editor" }, "linux")).toBe("env-editor")
  expect(resolveEditorForFile("app.ts", setting, {}, "linux")).toBeUndefined()
  expect(resolveEditorForFile("app.ts", undefined, {}, "linux")).toBeUndefined()
  expect(resolveEditorForFile("app.ts", setting, {}, "win32")).toBe("notepad")
  expect(resolveEditorForFile("app.ts", undefined, {}, "win32")).toBe("notepad")
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
