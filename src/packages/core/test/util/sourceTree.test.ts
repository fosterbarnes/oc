import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sourceTree } from "../../src/util/sourceTree"

const dirs: string[] = []
afterEach(() => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))))

async function temp() {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "oc-source-tree-test-")))
  dirs.push(dir)
  return dir
}

function git(dir: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString()
}

async function repo() {
  const dir = await temp()
  git(dir, "init", "-q")
  git(dir, "config", "user.name", "test")
  git(dir, "config", "user.email", "test@example.invalid")
  await fs.mkdir(path.join(dir, "sub"))
  await fs.writeFile(path.join(dir, "sub", "a.txt"), "one\n")
  await fs.writeFile(path.join(dir, ".gitignore"), "ignored/\n")
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", "init")
  return dir
}

test("same content gives the same hash, from the root or a subfolder", async () => {
  const dir = await repo()
  const first = await sourceTree(dir)
  expect(first).toMatch(/^[0-9a-f]{40,64}$/)
  expect(await sourceTree(dir)).toBe(first)
  expect(await sourceTree(path.join(dir, "sub"))).toBe(first)
})

test("edits, untracked and staged files change it; ignored files and reverts do not", async () => {
  const dir = await repo()
  const clean = await sourceTree(dir)
  const file = path.join(dir, "sub", "a.txt")

  await fs.mkdir(path.join(dir, "ignored"))
  await fs.writeFile(path.join(dir, "ignored", "x.txt"), "x\n")
  expect(await sourceTree(dir)).toBe(clean)

  await fs.writeFile(file, "two\n")
  const edited = await sourceTree(dir)
  expect(edited).not.toBe(clean)
  git(dir, "add", "sub/a.txt")
  expect(await sourceTree(dir)).toBe(edited)

  await fs.writeFile(file, "one\n")
  expect(await sourceTree(dir)).toBe(clean)

  await fs.writeFile(path.join(dir, "new.txt"), "new\n")
  expect(await sourceTree(dir)).not.toBe(clean)
})

test("leaves the real index and status untouched", async () => {
  const dir = await repo()
  await fs.writeFile(path.join(dir, "sub", "a.txt"), "two\n")
  await fs.writeFile(path.join(dir, "new.txt"), "new\n")
  const before = git(dir, "status", "--porcelain")
  await sourceTree(dir)
  expect(git(dir, "status", "--porcelain")).toBe(before)
})

test("a folder that is not a repo is unknown", async () => {
  expect(await sourceTree(await temp())).toBe("")
  expect(await sourceTree(path.join(os.tmpdir(), "oc-source-tree-missing"))).toBe("")
})
