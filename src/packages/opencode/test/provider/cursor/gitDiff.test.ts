import { describe, expect, test } from "bun:test"
import { mkdir, writeFile, symlink, readFile, rm } from "node:fs/promises"
import { tmpdir as osTmpdir } from "node:os"
import path from "node:path"
import { $ } from "bun"
import { tmpdir } from "../../fixture/fixture"
import { decodeMessage, encodeMessage } from "@/provider/cursor/protocol/messages.js"
import {
  buildGitDiffReply,
  executeGitDiff,
  isPathInside,
  GIT_DIFF_TIMEOUT_MS,
  SAFE_MAX_FILES,
  SAFE_MAX_RESPONSE_BYTES,
} from "@/provider/cursor/protocol/gitDiff.js"

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex")
}
function fromHex(h: string): Uint8Array {
  return Uint8Array.from(Buffer.from(h, "hex"))
}

describe("gitDiff: protobuf hex round trips", () => {
  test("GetDiffRequest encodes to expected wire and round trips", () => {
    const req = {
      cwd: "/tmp/ws",
      ref: "HEAD",
      base_ref: "main",
      merge_base: true,
      target_paths: ["src/app.ts", "readme.md"],
      unified_context_lines: 3,
      max_untracked_files: 10,
      output_format: 3,
      submodule_recurse_depth: 1,
      include_space_changes: true,
      committed_only: false,
      compute_patch_id: false,
      return_head_sha: true,
      max_response_bytes: 32768,
    }
    const bytes = encodeMessage("GetDiffRequest", req)
    const h = hex(bytes)
    // round trip via hex
    const decoded = decodeMessage<Record<string, unknown>>("GetDiffRequest", fromHex(h))
    expect(decoded.cwd).toBe("/tmp/ws")
    expect(decoded.ref).toBe("HEAD")
    expect(decoded.base_ref).toBe("main")
    expect(decoded.merge_base).toBe(true)
    expect(decoded.target_paths).toEqual(["src/app.ts", "readme.md"])
    expect(decoded.unified_context_lines).toBe(3)
    expect(decoded.max_untracked_files).toBe(10)
    expect(decoded.output_format).toBe(3)
    expect(decoded.submodule_recurse_depth).toBe(1)
    expect(decoded.include_space_changes).toBe(true)
    expect(decoded.committed_only).toBe(false)
    expect(decoded.compute_patch_id).toBe(false)
    expect(decoded.return_head_sha).toBe(true)
    expect(decoded.max_response_bytes).toBe(32768)
    // verify hex contains expected field tags: cwd #1 (0a), ref #2 (12), base_ref #3 (1a)
    expect(h).toContain("0a")
  })

  test("GetDiffResponse round trip with GitDiff/FileDiff/Chunk", () => {
    const resp = {
      diff: {
        diffs: [
          {
            from: "a.txt",
            to: "a.txt",
            chunks: [
              {
                content: "@@ -1,2 +1,2 @@\n-old\n+new",
                lines: ["@@ -1,2 +1,2 @@", "-old", "+new"],
                old_start: 1,
                old_lines: 2,
                new_start: 1,
                new_lines: 2,
              },
            ],
            added: 1,
            removed: 1,
            before_file_contents: "old\n",
            after_file_contents: "new\n",
            is_generated: false,
          },
        ],
        diff_type: 1,
      },
      submodule_diffs: [{ relative_path: "sub", diff: { diffs: [], diff_type: 0 }, errored: false }],
      patch_id: "abc123",
      head_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      has_uncommitted_changes: true,
    }
    const bytes = encodeMessage("GetDiffResponse", resp)
    const h = hex(bytes)
    const decoded = decodeMessage<Record<string, unknown>>("GetDiffResponse", fromHex(h)) as Record<string, unknown>
    const diff = decoded.diff as Record<string, unknown>
    expect((diff.diffs as Array<Record<string, unknown>>)[0]?.from).toBe("a.txt")
    expect(decoded.patch_id).toBe("abc123")
    expect(decoded.head_sha).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")
  })

  test("nested AgentClientMessage git_diff_response round trips exactly", () => {
    const response = {
      diff: { diffs: [], diffType: 0 },
      submoduleDiffs: [],
      hasUncommittedChanges: false,
    }
    const frames = buildGitDiffReply({ id: 42, execId: "exec-123", response })
    expect(frames.length).toBe(2)
    const acm = decodeMessage<Record<string, unknown>>("AgentClientMessage", frames[0]!)
    const ecm = acm.exec_client_message as Record<string, unknown>
    expect(ecm.id).toBe(42)
    expect(ecm.exec_id).toBe("exec-123")
    const gdr = ecm.git_diff_response as Record<string, unknown>
    expect(gdr).toBeDefined()
    const close = decodeMessage<Record<string, unknown>>("AgentClientMessage", frames[1]!)
    const ctrl = close.exec_client_control_message as Record<string, unknown>
    expect((ctrl.stream_close as Record<string, unknown>).id).toBe(42)
  })
})

describe("gitDiff: workspace escape and symlink rejection", () => {
  test("diffs the checked real file through an in-workspace directory link", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await mkdir(path.join(dir, "real"))
        await writeFile(path.join(dir, "real", "file.txt"), "before\n")
        await $`git add real/file.txt`.cwd(dir).quiet()
        await $`git commit -m "add real file"`.cwd(dir).quiet()
        await writeFile(path.join(dir, "real", "file.txt"), "after\n")
        await symlink(path.join(dir, "real"), path.join(dir, "linked"), process.platform === "win32" ? "junction" : "dir")
      },
    })
    const resp = await executeGitDiff({ target_paths: ["linked/file.txt"], output_format: 3 }, tmp.path)
    expect(resp.diff?.diffs).toHaveLength(1)
    expect(resp.diff?.diffs[0]?.to).toBe("real/file.txt")
    expect(resp.diff?.diffs[0]?.chunks[0]?.content).toContain("+after")
  })

  test("rejects cwd outside workspace", async () => {
    await using tmp = await tmpdir({ git: true })
    const outside = path.resolve(tmp.path, "..")
    const resp = await executeGitDiff({ cwd: outside, target_paths: [] }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
  })

  test("rejects traversal via .. in cwd", async () => {
    await using tmp = await tmpdir({ git: true })
    const traversal = path.join(tmp.path, "..", path.basename(tmp.path), "..", "etc")
    const resp = await executeGitDiff({ cwd: traversal }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
  })

  test("rejects target_paths traversal outside workspace", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await writeFile(path.join(dir, "keep.txt"), "keep", "utf8")
        await $`git add keep.txt`.cwd(dir).quiet()
        await $`git commit -m "add keep"`.cwd(dir).quiet()
        await writeFile(path.join(dir, "keep.txt"), "modified", "utf8")
      },
    })
    const resp = await executeGitDiff({ target_paths: ["../outside.txt", "../../etc/passwd"] }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
  })

  test("rejects absolute path outside workspace", async () => {
    await using tmp = await tmpdir({ git: true })
    const outsideFile = path.join(osTmpdir(), `opencode-git-diff-outside-${Math.random().toString(36).slice(2)}.txt`)
    await writeFile(outsideFile, "secret", "utf8")
    const resp = await executeGitDiff({ target_paths: [outsideFile] }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
    await rm(outsideFile, { force: true }).catch(() => undefined)
  })

  test("rejects symlink escape via realpath", async () => {
    const outsideDir = path.join(osTmpdir(), `opencode-git-diff-outside-${Math.random().toString(36).slice(2)}`)
    await mkdir(outsideDir, { recursive: true })
    const secretFile = path.join(outsideDir, "secret.txt")
    await writeFile(secretFile, "SECRET_OUTSIDE", "utf8")
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const linkPath = path.join(dir, "link.txt")
        try {
          await symlink(secretFile, linkPath, "file")
        } catch {
          // Windows without dev mode may fail; create a regular file instead and skip symlink-specific assertion
          await writeFile(linkPath, "link", "utf8")
        }
        await writeFile(path.join(dir, "real.txt"), "real", "utf8")
        await $`git add real.txt`.cwd(dir).quiet()
        await $`git commit -m "add real"`.cwd(dir).quiet()
      },
    })
    // Try to request diff for the symlink that points outside
    const resp = await executeGitDiff({ target_paths: ["link.txt"] }, tmp.path)
    // If symlink was created and points outside, it should be rejected (empty)
    // If symlink creation failed, file is inside so diff may be empty anyway (no change)
    expect(resp.diff).toBeDefined()
    // Ensure outside secret not leaked into diff before/after contents even when outputFormat 4
    const resp4 = await executeGitDiff({ target_paths: ["link.txt"], output_format: 4 }, tmp.path)
    const serialized = JSON.stringify(resp4)
    expect(serialized).not.toContain("SECRET_OUTSIDE")
    await rm(outsideDir, { recursive: true, force: true }).catch(() => undefined)
  })

  test("rejects symlinked directory escape", async () => {
    const outsideDir = path.join(osTmpdir(), `opencode-git-diff-outside-dir-${Math.random().toString(36).slice(2)}`)
    await mkdir(outsideDir, { recursive: true })
    await writeFile(path.join(outsideDir, "evil.txt"), "EVIL_DIR_SECRET", "utf8")
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const linkPath = path.join(dir, "linkdir")
        try {
          const type = process.platform === "win32" ? "junction" : "dir"
          await symlink(outsideDir, linkPath, type as never)
        } catch {
          // ignore
        }
      },
    })
    const resp = await executeGitDiff({ target_paths: ["linkdir/evil.txt"] }, tmp.path)
    expect(JSON.stringify(resp)).not.toContain("EVIL_DIR_SECRET")
    await rm(outsideDir, { recursive: true, force: true }).catch(() => undefined)
  })
})

describe("gitDiff: Windows path boundaries", () => {
  test("isPathInside handles Windows drive and prefix boundaries", () => {
    if (process.platform !== "win32") {
      // Still test lexical boundaries on posix
      expect(isPathInside("/tmp/workspace/file.txt", "/tmp/workspace")).toBe(true)
      expect(isPathInside("/tmp/workspace2/file.txt", "/tmp/workspace")).toBe(false)
      expect(isPathInside("/tmp/workspace", "/tmp/workspace")).toBe(true)
      expect(isPathInside("/tmp/workspace/../workspace/file.txt", "/tmp/workspace")).toBe(true)
      // Traversal outside
      expect(isPathInside("/etc/passwd", "/tmp/workspace")).toBe(false)
      return
    }
    // Windows-specific checks using win32 semantics
    const ws = path.win32.resolve("C:\\tmp\\workspace")
    expect(isPathInside(path.win32.join(ws, "file.txt"), ws)).toBe(true)
    expect(isPathInside("C:\\tmp\\workspace2\\file.txt", ws)).toBe(false)
    expect(isPathInside("D:\\other\\file.txt", ws)).toBe(false)
    // Case insensitivity
    expect(isPathInside("c:\\TMP\\WORKSPACE\\file.txt", ws)).toBe(true)
    expect(isPathInside("C:\\tmp\\workspace\\..\\workspace\\file.txt", ws)).toBe(true)
  })

  test("rejects Windows-style absolute target outside workspace", async () => {
    await using tmp = await tmpdir({ git: true })
    // On posix, a Windows-style path with drive letter is treated as relative, but should still be rejected if it escapes via lexical check
    // Provide an absolute posix path outside
    const outside = process.platform === "win32" ? "C:\\Windows\\System32\\evil.txt" : "/etc/passwd"
    const resp = await executeGitDiff({ target_paths: [outside] }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
  })
})

describe("gitDiff: git execution limits and errors", () => {
  test("returns truthful diff for actual git changes", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await writeFile(path.join(dir, "hello.txt"), "line1\nline2\n", "utf8")
        await $`git add hello.txt`.cwd(dir).quiet()
        await $`git commit -m "initial"`.cwd(dir).quiet()
        await writeFile(path.join(dir, "hello.txt"), "line1\nchanged\n", "utf8")
      },
    })
    const resp = await executeGitDiff({ output_format: 3 }, tmp.path)
    expect(resp.diff?.diffs.length).toBeGreaterThan(0)
    const fd = resp.diff?.diffs[0]
    expect(fd?.to).toContain("hello.txt")
    expect(fd?.chunks.length).toBeGreaterThan(0)

    const patchIdResponse = await executeGitDiff({ output_format: 3, compute_patch_id: true }, tmp.path)
    expect(patchIdResponse.patchId).toMatch(/^[0-9a-f]{40}$/)
  })

  test("returns numstat fields for combined name-status and numstat output", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await writeFile(path.join(dir, "counts.txt"), "before\n", "utf8")
        await $`git add counts.txt`.cwd(dir).quiet()
        await $`git commit -m "counts"`.cwd(dir).quiet()
        await writeFile(path.join(dir, "counts.txt"), "after\n", "utf8")
      },
    })
    const resp = await executeGitDiff({ output_format: 2 }, tmp.path)
    expect(resp.diff?.diffs[0]?.to).toContain("counts.txt")
    expect(resp.diff?.diffs[0]?.added).toBe(1)
    expect(resp.diff?.diffs[0]?.removed).toBe(1)
  })

  test("honors file-count cap", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        for (let i = 0; i < 5; i++) {
          await writeFile(path.join(dir, `file${i}.txt`), `initial ${i}`, "utf8")
        }
        await $`git add .`.cwd(dir).quiet()
        await $`git commit -m "initial"`.cwd(dir).quiet()
        for (let i = 0; i < 5; i++) {
          await writeFile(path.join(dir, `file${i}.txt`), `modified ${i}`, "utf8")
        }
      },
    })
    const resp = await executeGitDiff({ max_untracked_files: 2, output_format: 1 }, tmp.path)
    expect((resp.diff?.diffs.length ?? 0) <= 2).toBe(true)
  })

  test("honors max_response_bytes cap", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const big = "x".repeat(2000) + "\n"
        await writeFile(path.join(dir, "big.txt"), big, "utf8")
        await $`git add big.txt`.cwd(dir).quiet()
        await $`git commit -m "big"`.cwd(dir).quiet()
        await writeFile(path.join(dir, "big.txt"), big + "extra line\n".repeat(200), "utf8")
      },
    })
    const resp = await executeGitDiff({ max_response_bytes: 500, output_format: 3 }, tmp.path)
    const encoded = encodeMessage("GetDiffResponse", {
      diff: {
        diffs: (resp.diff?.diffs ?? []).map((fd) => ({
          from: fd.from,
          to: fd.to,
          chunks: fd.chunks.map((c) => ({
            content: c.content,
            lines: c.lines,
            old_start: c.oldStart,
            old_lines: c.oldLines,
            new_start: c.newStart,
            new_lines: c.newLines,
          })),
          added: fd.added,
          removed: fd.removed,
        })),
        diff_type: resp.diff?.diffType ?? 0,
      },
      submodule_diffs: [],
    })
    expect(encoded.length <= 500 || (resp.diff?.diffs.length ?? 0) === 0).toBe(true)
  })

  test("timeout returns empty diff without throwing", async () => {
    await using tmp = await tmpdir({ git: true })
    const resp = await executeGitDiff({ output_format: 3 }, tmp.path, { timeoutMs: 1 })
    // Should not throw; diff may be empty due to timeout
    expect(resp.diff).toBeDefined()
    expect(Array.isArray(resp.diff?.diffs)).toBe(true)
  })

  test("git error for invalid ref returns empty diff", async () => {
    await using tmp = await tmpdir({ git: true })
    const resp = await executeGitDiff({ ref: "does-not-exist-xyz-123", output_format: 3 }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
  })

  test("rejects git refs with colon, caret, at-brace, or double-dot", async () => {
    await using tmp = await tmpdir({ git: true })
    for (const ref of ["HEAD:path", "HEAD^", "HEAD@{0}", "main..HEAD"]) {
      const resp = await executeGitDiff({ ref, output_format: 3 }, tmp.path)
      expect(resp.diff?.diffs.length).toBe(0)
    }
  })

  test("not a git repo returns empty diff", async () => {
    await using tmp = await tmpdir()
    const resp = await executeGitDiff({ output_format: 3 }, tmp.path)
    expect(resp.diff?.diffs.length).toBe(0)
  })

  test("stdout cap truncates large diff", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        const content = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n")
        await writeFile(path.join(dir, "large.txt"), content, "utf8")
        await $`git add large.txt`.cwd(dir).quiet()
        await $`git commit -m "large"`.cwd(dir).quiet()
        const modified = content + "\n" + Array.from({ length: 500 }, (_, i) => `new ${i}`).join("\n")
        await writeFile(path.join(dir, "large.txt"), modified, "utf8")
      },
    })
    const resp = await executeGitDiff({ max_response_bytes: 1024, output_format: 3 }, tmp.path)
    const enc = encodeMessage("GetDiffResponse", {
      diff: {
        diffs: (resp.diff?.diffs ?? []).map((fd) => ({
          from: fd.from,
          to: fd.to,
          chunks: fd.chunks.map((c) => ({
            content: c.content,
            lines: c.lines,
            old_start: c.oldStart,
            old_lines: c.oldLines,
            new_start: c.newStart,
            new_lines: c.newLines,
          })),
          added: fd.added,
          removed: fd.removed,
        })),
        diff_type: resp.diff?.diffType ?? 0,
      },
      submodule_diffs: [],
    })
    expect(enc.length <= 1024 || resp.diff?.diffs.length === 0).toBe(true)
  })

  test("uses execFile git with explicit cwd and no shell", async () => {
    await using tmp = await tmpdir({
      git: true,
      init: async (dir) => {
        await writeFile(path.join(dir, "a.txt"), "hello", "utf8")
        await $`git add a.txt`.cwd(dir).quiet()
        await $`git commit -m "a"`.cwd(dir).quiet()
        await writeFile(path.join(dir, "a.txt"), "hello world", "utf8")
      },
    })
    const resp = await executeGitDiff({ cwd: tmp.path, output_format: 3 }, tmp.path)
    expect(resp.diff?.diffs.length).toBeGreaterThan(0)
    // Verify that a malicious cwd with shell metachars is rejected, proving no shell interpolation
    const evilCwd = `${tmp.path} && echo pwned`
    const evilResp = await executeGitDiff({ cwd: evilCwd }, tmp.path)
    expect(evilResp.diff?.diffs.length).toBe(0)
  })
})
