import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect } from "effect"
import * as fs from "fs/promises"
import * as path from "path"
import { tmpdir } from "os"
import { Patch } from "../../src/patch"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(FSUtil.node))

describe("Patch namespace", () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "patch-test-"))
  })

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe("parsePatch", () => {
    test("should parse simple add file patch", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Hello World
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      expect(result.hunks[0]).toEqual({
        type: "add",
        path: "test.txt",
        contents: "Hello World",
      })
    })

    test("should parse delete file patch", () => {
      const patchText = `*** Begin Patch
*** Delete File: old.txt
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      const hunk = result.hunks[0]
      expect(hunk.type).toBe("delete")
      expect(hunk.path).toBe("old.txt")
    })

    test("should parse patch with multiple hunks", () => {
      const patchText = `*** Begin Patch
*** Add File: new.txt
+This is a new file
*** Update File: existing.txt
@@
 old line
-new line
+updated line
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(2)
      expect(result.hunks[0].type).toBe("add")
      expect(result.hunks[1].type).toBe("update")
    })

    test("should parse file move operation", () => {
      const patchText = `*** Begin Patch
*** Update File: old-name.txt
*** Move to: new-name.txt
@@
-Old content
+New content
*** End Patch`

      const result = Patch.parsePatch(patchText)
      expect(result.hunks).toHaveLength(1)
      const hunk = result.hunks[0]
      expect(hunk.type).toBe("update")
      expect(hunk.path).toBe("old-name.txt")
      if (hunk.type === "update") {
        expect(hunk.move_path).toBe("new-name.txt")
      }
    })

    test("identifies the missing patch boundary", () => {
      expect(() => Patch.parsePatch("This is not a valid patch")).toThrow(
        "The first line of the patch must be '*** Begin Patch'",
      )
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Add File: add.txt\n+added")).toThrow(
        "The last line of the patch must be '*** End Patch'",
      )
    })

    const update = (path: string, chunks: Patch.UpdateFileChunk[], move_path?: string): Patch.Hunk => ({
      type: "update",
      path,
      move_path,
      chunks,
    })

    test("parses an empty patch", () => {
      expect(Patch.parsePatch("*** Begin Patch\n*** End Patch").hunks).toEqual([])
    })

    test("ignores a Codex environment preamble", () => {
      expect(
        Patch.parsePatch("*** Begin Patch\n*** Environment ID: remote\n*** Add File: file.txt\n+content\n*** End Patch")
          .hunks,
      ).toEqual([{ type: "add", path: "file.txt", contents: "content" }])
    })

    test("parses an update followed by an add", () => {
      expect(
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: update.txt\n@@\n+line\n*** Add File: add.txt\n+content\n*** End Patch",
        ).hunks,
      ).toEqual([
        update("update.txt", [{ old_lines: [], new_lines: ["line"] }]),
        { type: "add", path: "add.txt", contents: "content" },
      ])
    })

    test("strips quoted heredoc wrappers", () => {
      const patch = "*** Begin Patch\n*** Add File: add.txt\n+added\n*** End Patch"
      const added: Patch.Hunk[] = [{ type: "add", path: "add.txt", contents: "added" }]
      expect(Patch.parsePatch(`<<'EOF'\n${patch}\nEOF`).hunks).toEqual(added)
      expect(Patch.parsePatch(`<<"EOF"\n${patch}\nEOF`).hunks).toEqual(added)
    })

    test("rejects a heredoc wrapper missing the end marker", () => {
      expect(() => Patch.parsePatch("<<EOF\n*** Begin Patch\n*** Add File: add.txt\n+added\nEOF")).toThrow(
        "The last line of the patch must be '*** End Patch'",
      )
    })

    test("parses whitespace-padded hunk headers and patch markers", () => {
      const expected = [update("file.txt", [{ old_lines: ["one"], new_lines: ["two"] }])]
      for (const patch of [
        "*** Begin Patch\n  *** Update File: file.txt\n@@\n-one\n+two\n*** End Patch",
        " *** Begin Patch\n*** Update File: file.txt\n@@\n-one\n+two\n*** End Patch ",
        "*** Begin Patch \n*** Update File: file.txt\n@@\n-one\n+two\n *** End Patch",
      ]) {
        expect(Patch.parsePatch(patch).hunks).toEqual(expected)
      }
    })

    test("parses relative and absolute hunk paths", () => {
      expect(
        Patch.parsePatch(
          "*** Begin Patch\n*** Add File: relative.txt\n+content\n*** Delete File: /tmp/delete.txt\n*** Update File: /tmp/update.txt\n@@\n-old\n+new\n*** End Patch",
        ).hunks,
      ).toEqual([
        { type: "add", path: "relative.txt", contents: "content" },
        { type: "delete", path: "/tmp/delete.txt" },
        update("/tmp/update.txt", [{ old_lines: ["old"], new_lines: ["new"] }]),
      ])
    })

    test("strips one carriage return from CRLF patch lines", () => {
      expect(
        Patch.parsePatch("*** Begin Patch\r\n*** Update File: file.txt\r\n@@\r\n-old\r\n+new\r\n*** End Patch\r\n")
          .hunks,
      ).toEqual([update("file.txt", [{ old_lines: ["old"], new_lines: ["new"] }])])
      expect(
        Patch.parsePatch("*** Begin Patch\r\n*** Update File: file.txt\r\n@@\r\n-old\r\r\n+new\r\n*** End Patch\r\n")
          .hunks,
      ).toEqual([update("file.txt", [{ old_lines: ["old\r"], new_lines: ["new"] }])])
    })

    test("preserves the end-of-file marker", () => {
      expect(
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@\n+quux\n*** End of File\n\n*** End Patch")
          .hunks,
      ).toEqual([update("file.txt", [{ old_lines: [], new_lines: ["quux"], is_end_of_file: true }])])
    })

    test("allows an end-of-file marker before a chunk or move", () => {
      expect(
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n*** End of File\n@@\n-old\n+new\n*** End Patch")
          .hunks,
      ).toEqual([update("file.txt", [{ old_lines: ["old"], new_lines: ["new"] }])])
      expect(
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n*** End of File\n-old\n+new\n*** End Patch")
          .hunks,
      ).toEqual([update("file.txt", [{ old_lines: ["old"], new_lines: ["new"] }])])
      expect(
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: old.txt\n*** End of File\n*** Move to: new.txt\n@@\n-old\n+new\n*** End Patch",
        ).hunks,
      ).toEqual([update("old.txt", [{ old_lines: ["old"], new_lines: ["new"] }], "new.txt")])
    })

    test("parses an update without an explicit first chunk header", () => {
      expect(
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n import foo\n+bar\n*** End Patch").hunks,
      ).toEqual([update("file.txt", [{ old_lines: ["import foo"], new_lines: ["import foo", "bar"] }])])
    })

    test("keeps indented markers as context lines", () => {
      expect(
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: a.txt\n@@\n-old a\n+new a\n *** Update File: b.txt\n@@\n-old b\n+new b\n*** End Patch",
        ).hunks,
      ).toEqual([
        update("a.txt", [
          { old_lines: ["old a", "*** Update File: b.txt"], new_lines: ["new a", "*** Update File: b.txt"] },
          { old_lines: ["old b"], new_lines: ["new b"] },
        ]),
      ])
      const context = ["before", "*** Move to: moved.txt", "*** End of File"]
      expect(
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: file.txt\n@@\n before\n *** Move to: moved.txt\n *** End of File\n*** End Patch",
        ).hunks,
      ).toEqual([update("file.txt", [{ old_lines: context, new_lines: context }])])
    })

    test("preserves update context indentation and bare empty lines", () => {
      expect(
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@   section\n-old\n+new\n*** End Patch").hunks,
      ).toEqual([update("file.txt", [{ old_lines: ["old"], new_lines: ["new"], change_context: "  section" }])])
      const context = ["context before", "", "context after"]
      expect(
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: file.txt\n@@\n context before\n\n context after\n*** End Patch",
        ).hunks,
      ).toEqual([update("file.txt", [{ old_lines: context, new_lines: context }])])
    })

    test("rejects invalid add and delete lines", () => {
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Add File: file.txt\nbad\n*** End Patch")).toThrow(
        "Invalid hunk at line 3: 'bad' is not a valid hunk header",
      )
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Delete File: file.txt\nbad\n*** End Patch")).toThrow(
        "Invalid hunk at line 3: 'bad' is not a valid hunk header",
      )
    })

    test("rejects an empty update hunk", () => {
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n*** End Patch")).toThrow(
        "Invalid hunk at line 2: Update file hunk for path 'file.txt' is empty",
      )
      expect(() =>
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: old.txt\n*** Move to: new.txt\n*** Delete File: other.txt\n*** End Patch",
        ),
      ).toThrow("Invalid hunk at line 2: Update file hunk for path 'old.txt' is empty")
      expect(() =>
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n*** End of File\n*** End Patch"),
      ).toThrow("Invalid hunk at line 2: Update file hunk for path 'file.txt' is empty")
    })

    test("rejects an empty update chunk", () => {
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@\n*** End Patch")).toThrow(
        "Invalid hunk at line 4: Update hunk does not contain any lines",
      )
      expect(() =>
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@\n*** End of File\n*** End Patch"),
      ).toThrow("Invalid hunk at line 4: Update hunk does not contain any lines")
      expect(() =>
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@\n@@\n-old\n+new\n*** End Patch"),
      ).toThrow("Invalid hunk at line 4: Unexpected line found in update hunk: '@@'")
      expect(() =>
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: file.txt\n@@\n*** Update File: other.txt\n@@\n-old\n+new\n*** End Patch",
        ),
      ).toThrow("Invalid hunk at line 4: Unexpected line found in update hunk: '*** Update File: other.txt'")
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@\nbad\n*** End Patch")).toThrow(
        "Invalid hunk at line 4: Unexpected line found in update hunk: 'bad'",
      )
    })

    test("rejects an invalid update line", () => {
      expect(() =>
        Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@\n-old\nbad\n*** End Patch"),
      ).toThrow("Invalid hunk at line 5: Expected update hunk to start with a @@ context marker, got: 'bad'")
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Update File: file.txt\n@@foo\n*** End Patch")).toThrow(
        "Invalid hunk at line 3: Unexpected line found in update hunk: '@@foo'",
      )
      expect(() =>
        Patch.parsePatch(
          "*** Begin Patch\n*** Update File: file.txt\n@@\n-old\n*** Frobnicate File: foo\n*** End Patch",
        ),
      ).toThrow(
        "Invalid hunk at line 5: Expected update hunk to start with a @@ context marker, got: '*** Frobnicate File: foo'",
      )
    })

    test("rejects invalid and pathless hunk headers", () => {
      expect(() => Patch.parsePatch("*** Begin Patch\n*** Frobnicate File: foo\n*** End Patch")).toThrow(
        "Invalid hunk at line 2: '*** Frobnicate File: foo' is not a valid hunk header",
      )
      for (const header of ["*** Add File:", "*** Add File: ", "*** Delete File: ", "*** Update File: "]) {
        expect(() => Patch.parsePatch(`*** Begin Patch\n${header}\n*** End Patch`)).toThrow(
          `Invalid hunk at line 2: '${header.trim()}' is not a valid hunk header`,
        )
      }
      expect(() =>
        Patch.parsePatch("*** Begin Patch\n*** Update File: old.txt\n*** Move to: \n@@\n-old\n+new\n*** End Patch"),
      ).toThrow("Invalid hunk at line 3: '*** Move to:' is not a valid hunk header")
    })
  })

  describe("deriveNewContentsFromChunks", () => {
    test("does not fall back to a non-EOF match", () => {
      expect(() =>
        Patch.deriveNewContentsFromChunks(
          "update.txt",
          [{ old_lines: ["marker", "end"], new_lines: ["changed", "end"], is_end_of_file: true }],
          "marker\nend\nmiddle\n",
        ),
      ).toThrow("Failed to find expected lines")
    })

    test("does not normalize ellipses", () => {
      expect(() =>
        Patch.deriveNewContentsFromChunks("ellipsis.txt", [{ old_lines: ["wait..."], new_lines: ["done"] }], "wait…\n"),
      ).toThrow("Failed to find expected lines")
    })

    test("prefers a later exact match over an earlier normalized match", () => {
      expect(
        Patch.deriveNewContentsFromChunks(
          "quotes.txt",
          [{ old_lines: ['He said "hello"'], new_lines: ['He said "goodbye"'] }],
          'He said “hello”\nmiddle\nHe said "hello"\n',
        ).content,
      ).toBe('He said “hello”\nmiddle\nHe said "goodbye"\n')
    })
  })

  describe("maybeParseApplyPatch", () => {
    test("should parse direct apply_patch command", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Content
*** End Patch`

      const result = Patch.maybeParseApplyPatch(["apply_patch", patchText])
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
      if (result.type === Patch.MaybeApplyPatch.Body) {
        expect(result.args.patch).toBe(patchText)
        expect(result.args.hunks).toHaveLength(1)
      }
    })

    test("should parse applypatch command", () => {
      const patchText = `*** Begin Patch
*** Add File: test.txt
+Content
*** End Patch`

      const result = Patch.maybeParseApplyPatch(["applypatch", patchText])
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
    })

    test("should handle bash heredoc format", () => {
      const script = `apply_patch <<'PATCH'
*** Begin Patch
*** Add File: test.txt
+Content
*** End Patch
PATCH`

      const result = Patch.maybeParseApplyPatch(["bash", "-lc", script])
      expect(result.type).toBe(Patch.MaybeApplyPatch.Body)
      if (result.type === Patch.MaybeApplyPatch.Body) {
        expect(result.args.hunks).toHaveLength(1)
      }
    })

    test("should return NotApplyPatch for non-patch commands", () => {
      const result = Patch.maybeParseApplyPatch(["echo", "hello"])
      expect(result.type).toBe(Patch.MaybeApplyPatch.NotApplyPatch)
    })
  })

  describe("applyPatch", () => {
    it.live("should add a new file", () =>
      Effect.gen(function* () {
        const patchText = `*** Begin Patch
*** Add File: ${tempDir}/new-file.txt
+Hello World
+This is a new file
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.added).toHaveLength(1)
        expect(result.modified).toHaveLength(0)
        expect(result.deleted).toHaveLength(0)

        const content = yield* Effect.promise(() => fs.readFile(result.added[0], "utf-8"))
        expect(content).toBe("Hello World\nThis is a new file")
      }),
    )

    it.live("should delete an existing file", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "to-delete.txt")
        yield* Effect.promise(() => fs.writeFile(filePath, "This file will be deleted"))

        const patchText = `*** Begin Patch
*** Delete File: ${filePath}
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.deleted).toHaveLength(1)
        expect(result.deleted[0]).toBe(filePath)

        const exists = yield* Effect.promise(() =>
          fs
            .access(filePath)
            .then(() => true)
            .catch(() => false),
        )
        expect(exists).toBe(false)
      }),
    )

    it.live("should update an existing file", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "to-update.txt")
        yield* Effect.promise(() => fs.writeFile(filePath, "line 1\nline 2\nline 3\n"))

        const patchText = `*** Begin Patch
*** Update File: ${filePath}
@@
 line 1
-line 2
+line 2 updated
 line 3
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.modified).toHaveLength(1)
        expect(result.modified[0]).toBe(filePath)

        const content = yield* Effect.promise(() => fs.readFile(filePath, "utf-8"))
        expect(content).toBe("line 1\nline 2 updated\nline 3\n")
      }),
    )

    it.live("should move and update a file", () =>
      Effect.gen(function* () {
        const oldPath = path.join(tempDir, "old-name.txt")
        const newPath = path.join(tempDir, "new-name.txt")
        yield* Effect.promise(() => fs.writeFile(oldPath, "old content\n"))

        const patchText = `*** Begin Patch
*** Update File: ${oldPath}
*** Move to: ${newPath}
@@
-old content
+new content
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.modified).toHaveLength(1)
        expect(result.modified[0]).toBe(newPath)

        const oldExists = yield* Effect.promise(() =>
          fs
            .access(oldPath)
            .then(() => true)
            .catch(() => false),
        )
        expect(oldExists).toBe(false)

        const newContent = yield* Effect.promise(() => fs.readFile(newPath, "utf-8"))
        expect(newContent).toBe("new content\n")
      }),
    )

    it.live("should handle multiple operations in one patch", () =>
      Effect.gen(function* () {
        const file1 = path.join(tempDir, "file1.txt")
        const file2 = path.join(tempDir, "file2.txt")
        const file3 = path.join(tempDir, "file3.txt")

        yield* Effect.promise(() => fs.writeFile(file1, "content 1"))
        yield* Effect.promise(() => fs.writeFile(file2, "content 2"))

        const patchText = `*** Begin Patch
*** Add File: ${file3}
+new file content
*** Update File: ${file1}
@@
-content 1
+updated content 1
*** Delete File: ${file2}
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.added).toHaveLength(1)
        expect(result.modified).toHaveLength(1)
        expect(result.deleted).toHaveLength(1)
      }),
    )

    it.live("should create parent directories when adding files", () =>
      Effect.gen(function* () {
        const nestedPath = path.join(tempDir, "deep", "nested", "file.txt")

        const patchText = `*** Begin Patch
*** Add File: ${nestedPath}
+Deep nested content
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.added).toHaveLength(1)
        expect(result.added[0]).toBe(nestedPath)

        const exists = yield* Effect.promise(() =>
          fs
            .access(nestedPath)
            .then(() => true)
            .catch(() => false),
        )
        expect(exists).toBe(true)
      }),
    )
  })

  describe("error handling", () => {
    it.live("should fail when updating non-existent file", () =>
      Effect.gen(function* () {
        const nonExistent = path.join(tempDir, "does-not-exist.txt")

        const patchText = `*** Begin Patch
*** Update File: ${nonExistent}
@@
-old line
+new line
*** End Patch`

        const exit = yield* Effect.exit(Patch.applyPatch(patchText))
        expect(exit._tag).toBe("Failure")
      }),
    )

    it.live("should fail when deleting non-existent file", () =>
      Effect.gen(function* () {
        const nonExistent = path.join(tempDir, "does-not-exist.txt")

        const patchText = `*** Begin Patch
*** Delete File: ${nonExistent}
*** End Patch`

        const exit = yield* Effect.exit(Patch.applyPatch(patchText))
        expect(exit._tag).toBe("Failure")
      }),
    )
  })

  describe("edge cases", () => {
    it.live("should handle empty files", () =>
      Effect.gen(function* () {
        const emptyFile = path.join(tempDir, "empty.txt")
        yield* Effect.promise(() => fs.writeFile(emptyFile, ""))

        const patchText = `*** Begin Patch
*** Update File: ${emptyFile}
@@
+First line
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.modified).toHaveLength(1)

        const content = yield* Effect.promise(() => fs.readFile(emptyFile, "utf-8"))
        expect(content).toBe("First line\n")
      }),
    )

    it.live("should handle files with no trailing newline", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "no-newline.txt")
        yield* Effect.promise(() => fs.writeFile(filePath, "no newline"))

        const patchText = `*** Begin Patch
*** Update File: ${filePath}
@@
-no newline
+has newline now
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.modified).toHaveLength(1)

        const content = yield* Effect.promise(() => fs.readFile(filePath, "utf-8"))
        expect(content).toBe("has newline now\n")
      }),
    )

    it.live("should handle multiple update chunks in single file", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "multi-chunk.txt")
        yield* Effect.promise(() => fs.writeFile(filePath, "line 1\nline 2\nline 3\nline 4\n"))

        const patchText = `*** Begin Patch
*** Update File: ${filePath}
@@
 line 1
-line 2
+LINE 2
@@
 line 3
-line 4
+LINE 4
*** End Patch`

        const result = yield* Patch.applyPatch(patchText)
        expect(result.modified).toHaveLength(1)

        const content = yield* Effect.promise(() => fs.readFile(filePath, "utf-8"))
        expect(content).toBe("line 1\nLINE 2\nline 3\nLINE 4\n")
      }),
    )
  })
})
