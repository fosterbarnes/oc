import { expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { createLiveConfig, watchConfigFiles } from "../src/config/live"

test("live config forwards reads, getters, and spreads to the replaced value", () => {
  const live = createLiveConfig<{ theme: string; readonly mode: string }>({
    theme: "a",
    get mode() {
      return "getter-a"
    },
  })
  const seen = live.config
  expect(seen.theme).toBe("a")
  live.replace({ theme: "b", mode: "getter-b" })
  expect(seen.theme).toBe("b")
  expect(seen.mode).toBe("getter-b")
  expect({ ...seen }).toEqual({ theme: "b", mode: "getter-b" })
  expect("theme" in seen).toBe(true)
})

test("watcher fires once per save burst for watched names only", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-tui-live-"))
  const file = path.join(dir, "tui.json")
  let calls = 0
  let fired!: () => void
  const changed = new Promise<void>((resolve) => (fired = resolve))
  const stop = watchConfigFiles(
    [file, path.join(dir, "missing", "tui.json")],
    () => {
      calls++
      fired()
    },
    50,
  )
  try {
    await fs.writeFile(path.join(dir, "other.json"), "{}")
    await fs.writeFile(file, "{}")
    await fs.writeFile(file, '{ "theme": "x" }')
    await changed
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(calls).toBe(1)
  } finally {
    stop()
    await fs.rm(dir, { recursive: true, force: true })
  }
})

// Windows reports a read's last-access update (NTFS, at most hourly) as a change event.
test("reading a watched file does not fire", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-tui-live-"))
  const file = path.join(dir, "tui.json")
  await fs.writeFile(file, "{}")
  await fs.utimes(file, new Date(Date.now() - 2 * 60 * 60_000), (await fs.stat(file)).mtime)
  let calls = 0
  const stop = watchConfigFiles([file], () => calls++, 50)
  try {
    await fs.readFile(file)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(calls).toBe(0)
    await fs.writeFile(file, '{ "theme": "x" }')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(calls).toBe(1)
  } finally {
    stop()
    await fs.rm(dir, { recursive: true, force: true })
  }
})
