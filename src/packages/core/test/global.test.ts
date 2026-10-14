import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@opencode-ai/core/global"

describe("global paths", () => {
  test("tmp path is under the system temp directory", () => {
    expect(Global.Path.tmp).toBe(path.join(os.tmpdir(), "opencode"))
    expect(Global.make().tmp).toBe(Global.Path.tmp)
  })

  test("tmp path is created on module load", async () => {
    expect((await fs.stat(Global.Path.tmp)).isDirectory()).toBe(true)
  })
})

describe("resolveExecutablePath", () => {
  test("maps the occ hard link to sibling oc", () => {
    expect(Global.resolveExecutablePath("C:\\Apps\\opencode\\occ.exe")).toBe("C:\\Apps\\opencode\\oc.exe")
    expect(Global.resolveExecutablePath("/usr/local/bin/occ")).toBe("/usr/local/bin/oc")
  })

  test("leaves oc, native opencode, and bun unchanged", () => {
    expect(Global.resolveExecutablePath("C:\\Apps\\opencode\\oc.exe")).toBe("C:\\Apps\\opencode\\oc.exe")
    expect(Global.resolveExecutablePath("/opt/opencode/oc")).toBe("/opt/opencode/oc")
    expect(Global.resolveExecutablePath("C:\\Apps\\opencode\\opencode.exe")).toBe("C:\\Apps\\opencode\\opencode.exe")
    expect(Global.resolveExecutablePath("/usr/local/bin/bun")).toBe("/usr/local/bin/bun")
    expect(Global.resolveExecutablePath("C:\\Program Files\\bun\\bun.exe")).toBe("C:\\Program Files\\bun\\bun.exe")
  })
})
