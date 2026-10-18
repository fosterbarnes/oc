import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { mapCursorArgsToOpencode, parseExecServerMessage } from "@/provider/cursor/protocol/execParse.js"
import { buildTypedExecResult } from "@/provider/cursor/protocol/execResult.js"

const root = mkdtempSync(path.join(tmpdir(), "cursorToolMapping-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

test("a negative read offset counts back from the end", () => {
  const file = path.join(root, "big.txt")
  writeFileSync(file, Array.from({ length: 300 }, (_, i) => `line ${i + 1}`).join("\n") + "\n")
  expect(mapCursorArgsToOpencode("read", { path: file, offset: -1, limit: 0 }, "read_args").args).toEqual({
    filePath: file,
    offset: 300,
  })
  expect(mapCursorArgsToOpencode("read", { path: file, offset: -5, limit: 2 }, "read_args").args).toEqual({
    filePath: file,
    offset: 296,
    limit: 2,
  })
  expect(mapCursorArgsToOpencode("read", { path: file, offset: -900 }, "read_args").args.offset).toBe(1)
})

test("grep case_insensitive becomes an inline ripgrep flag", () => {
  expect(mapCursorArgsToOpencode("grep", { pattern: "needle", path: root, case_insensitive: true }).args).toEqual({
    pattern: "(?i)needle",
    path: root,
  })
  expect(mapCursorArgsToOpencode("grep", { pattern: "needle", case_insensitive: false }).args).toEqual({
    pattern: "needle",
  })
})

test("grep_result lists only files, keyed by the searched folder, with forward slashes", () => {
  const parsed = parseExecServerMessage({ id: 1, grep_args: { pattern: "foo", path: root } })
  expect(parsed?.resultMetadata).toEqual({ path: root })

  const slash = (file: string) => file.replaceAll("\\", "/")
  const key = slash(path.resolve(root))
  const a = path.join(root, "src", "a.ts")
  const b = path.join(root, "src", "deep", "b.ts")
  const grepOutput = [
    "Found 2 matches",
    `${b}:`,
    "  Line 1: const c = foo(333)",
    "",
    "",
    `${a}:`,
    "  Line 1: foo(1)",
    "",
  ].join("\n")
  const grep = buildTypedExecResult("grep_result", grepOutput, undefined, "grep", { path: root }) as any
  expect(grep.success.workspace_results[key].files.files).toEqual([slash(b), slash(a)])

  const glob = buildTypedExecResult("grep_result", [b, a].join("\n"), undefined, "glob", { path: root }) as any
  expect(glob.success.workspace_results[key].files.files).toEqual([slash(b), slash(a)])

  const none = buildTypedExecResult("grep_result", "No files found", undefined, "glob", { path: root }) as any
  expect(none.success.workspace_results[key].files).toMatchObject({ files: [], total_files: 0 })
})

test("ls_result splits OpenCode's directory read into files and folders", () => {
  const dir = path.join(root, "src")
  const output = [
    `<path>${dir}</path>`,
    "<type>directory</type>",
    "<entries>",
    "a.ts\ndeep/",
    "\n(2 entries)",
    "</entries>",
  ].join("\n")
  const ls = buildTypedExecResult("ls_result", output, undefined, "read") as any
  expect(ls.success.directory_tree_root).toEqual({
    abs_path: dir,
    children_dirs: [{ abs_path: path.join(dir, "deep") }],
    children_files: [{ name: "a.ts" }],
    num_files: 1,
  })
})
