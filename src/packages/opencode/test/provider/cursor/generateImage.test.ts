import { describe, expect, test } from "bun:test"
import { mkdir, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir as osTmpdir } from "node:os"
import path from "node:path"
import { remapCursorImageWritePath } from "@/provider/cursor/protocol/generateImage.js"
import { tmpdir } from "../../fixture/fixture"

describe("remapCursorImageWritePath", () => {
  test("keeps root-equal targets and rebases parent and absolute escapes", async () => {
    await using tmp = await tmpdir()
    for (const projectDir of [tmp.path, path.join(tmp.path, "missing", "project")]) {
      const roots = { workspaceRoot: projectDir, projectDir }
      expect(remapCursorImageWritePath(projectDir, roots)).toBe(projectDir)
      expect(remapCursorImageWritePath(".", roots)).toBe(projectDir)
      expect(remapCursorImageWritePath("..", roots)).toBe(
        path.join(projectDir, "assets", ".."),
      )
      const outside = path.join(path.dirname(projectDir), "outside.png")
      expect(remapCursorImageWritePath(outside, roots)).toBe(path.join(projectDir, "assets", "outside.png"))
    }
  })

  test("does not follow a workspace symlink out of the project", async () => {
    const outsideDir = path.join(osTmpdir(), `oc-img-out-${Math.random().toString(36).slice(2)}`)
    const projectDir = path.join(osTmpdir(), `oc-img-proj-${Math.random().toString(36).slice(2)}`)
    await mkdir(outsideDir, { recursive: true })
    await mkdir(projectDir, { recursive: true })
    await writeFile(path.join(outsideDir, "secret.png"), "secret", "utf8")
    const linkPath = path.join(projectDir, "escape.png")
    try {
      await symlink(path.join(outsideDir, "secret.png"), linkPath, "file")
    } catch {
      await rm(outsideDir, { recursive: true, force: true })
      await rm(projectDir, { recursive: true, force: true })
      return
    }
    const mapped = remapCursorImageWritePath(linkPath, { workspaceRoot: projectDir, projectDir })
    expect(mapped).not.toBe(path.resolve(linkPath))
    expect(mapped.startsWith(path.join(projectDir, "assets"))).toBe(true)
    await rm(outsideDir, { recursive: true, force: true })
    await rm(projectDir, { recursive: true, force: true })
  })
})
