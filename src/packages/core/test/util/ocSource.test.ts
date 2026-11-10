import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { OcSource } from "../../src/util/ocSource"

// Guards /update's warning: every local change it would overwrite must show up before the reset.

const dirs: string[] = []
afterEach(() => Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))))

async function temp() {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "oc-source-test-")))
  dirs.push(dir)
  return dir
}

function git(dir: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
  return result.stdout.toString().trim()
}

async function commit(dir: string, file: string, content: string) {
  await fs.writeFile(path.join(dir, file), content)
  git(dir, "add", "-A")
  git(dir, "commit", "-q", "-m", file)
}

// `upstream` stands in for GitHub; `local` is the revive source cloned from it.
async function setup() {
  const upstream = await temp()
  git(upstream, "init", "-q", "-b", "main")
  git(upstream, "config", "user.name", "test")
  git(upstream, "config", "user.email", "test@example.invalid")
  await commit(upstream, "a.txt", "one\n")
  const local = path.join(await temp(), "oc")
  git(upstream, "clone", "-q", upstream, local)
  git(local, "config", "user.name", "test")
  git(local, "config", "user.email", "test@example.invalid")
  return { upstream, local }
}

test("a clean clone at main has nothing to warn about", async () => {
  const { upstream, local } = await setup()
  expect(await OcSource.status(local, upstream)).toEqual({
    branch: "main",
    target: git(upstream, "rev-parse", "HEAD"),
    dirty: [],
    ahead: 0,
    behind: 0,
  })
})

test("lists edited tracked files and local commits, not untracked files", async () => {
  const { upstream, local } = await setup()
  await commit(upstream, "b.txt", "upstream\n")
  await commit(local, "c.txt", "local\n")
  await fs.writeFile(path.join(local, "a.txt"), "edited\n")
  await fs.writeFile(path.join(local, "scratch.txt"), "untracked\n")
  const status = await OcSource.status(local, upstream)
  expect(status).toMatchObject({ dirty: ["a.txt"], ahead: 1, behind: 1 })
})

// /update once ran `reset --hard` over uncommitted work that had no other copy.
test("reset refuses changed tracked files and local commits, and keeps them", async () => {
  const { upstream, local } = await setup()
  await commit(upstream, "b.txt", "upstream\n")
  await fs.writeFile(path.join(local, "a.txt"), "edited\n")
  const head = git(local, "rev-parse", "HEAD")
  const dirty = await OcSource.status(local, upstream)
  await expect(OcSource.reset(local, dirty.target)).rejects.toThrow("oc source is not clean")
  expect(await fs.readFile(path.join(local, "a.txt"), "utf8")).toBe("edited\n")
  expect(git(local, "rev-parse", "HEAD")).toBe(head)

  git(local, "checkout", "-q", "--", "a.txt")
  await commit(local, "c.txt", "local\n")
  const ahead = await OcSource.status(local, upstream)
  await expect(OcSource.reset(local, ahead.target)).rejects.toThrow("oc source is not clean")
  expect(git(local, "log", "-1", "--format=%s")).toBe("c.txt")
})

test("a clean clone behind main updates and keeps untracked files", async () => {
  const { upstream, local } = await setup()
  await commit(upstream, "b.txt", "upstream\n")
  await fs.writeFile(path.join(local, "scratch.txt"), "untracked\n")
  const status = await OcSource.status(local, upstream)
  expect(OcSource.unsafe(status)).toBeUndefined()
  await OcSource.reset(local, status.target)
  expect(git(local, "rev-parse", "HEAD")).toBe(git(upstream, "rev-parse", "HEAD"))
  expect(await fs.readFile(path.join(local, "scratch.txt"), "utf8")).toBe("untracked\n")
  expect(await OcSource.status(local, upstream)).toMatchObject({ dirty: [], ahead: 0, behind: 0 })
})

test("reset refuses a branch other than main", async () => {
  const { upstream, local } = await setup()
  git(local, "checkout", "-q", "-b", "feature")
  const status = await OcSource.status(local, upstream)
  expect(status.branch).toBe("feature")
  await expect(OcSource.reset(local, status.target)).rejects.toThrow("oc source is on feature")
})
