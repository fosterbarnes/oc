import { afterEach, expect, test } from "bun:test"
import { normalizePromptContent, openEditor, openFileAtLocation, resolveFilePath } from "../src/editor"

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

test("rejects missing files before starting the editor", async () => {
  await expect(openFileAtLocation({ filePath: "missing-file.ts", cwd: import.meta.dir })).rejects.toThrow(
    "File does not exist",
  )
})
