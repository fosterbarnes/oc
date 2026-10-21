import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, readdirSync } from "node:fs"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { Heap } from "../../src/cli/heap"

afterAll(() => Heap.stop())

const captures = (kind: string) =>
  readdirSync(Global.Path.log).filter((name) => name.startsWith(`${kind}-${process.pid}-`))

describe("on-demand profiling requests", () => {
  test("a running process picks up a CPU profile request and writes the profile to the log dir", async () => {
    mkdirSync(Global.Path.log, { recursive: true })
    Heap.start()
    expect(await Heap.request(process.pid, "cpu", 0.2)).toBe(true)
    const deadline = Date.now() + 10_000
    while (!captures("cpu").length && Date.now() < deadline) await Bun.sleep(100)
    const file = captures("cpu")[0]
    expect(file).toEndWith(".cpuprofile")
    const profile = await Bun.file(path.join(Global.Path.log, file)).json()
    expect(Array.isArray(profile.nodes)).toBe(true)
  })

  test("a request nobody picks up times out and is removed", async () => {
    expect(await Heap.request(999_999_999, "heap", 10, 300)).toBe(false)
    expect(await Bun.file(Heap.requestFile(999_999_999, "heap")).exists()).toBe(false)
  })
})
