import { describe, expect, test } from "bun:test"
import { ProcessTree } from "@opencode-ai/core/util/processTree"

const windows = process.platform === "win32" ? test : test.skip

const proc = (pid: number, parentPid: number, created: string, extra: Partial<ProcessTree.ProcessIdentity> = {}) => ({
  pid,
  parentPid,
  created,
  executable: `C:\\bin\\${pid}.exe`,
  ...extra,
})

describe("ProcessTree.selectDescendants", () => {
  test("returns descendants deepest first and skips unrelated processes", () => {
    const processes = [
      proc(10, 1, "100"),
      proc(11, 10, "110"),
      proc(12, 11, "120"),
      proc(13, 10, "130"),
      proc(20, 1, "200"),
    ]
    // Reversed breadth-first order: every child precedes its parent.
    expect(ProcessTree.selectDescendants(processes, 10).map((item) => item.pid)).toEqual([12, 13, 11])
  })

  test("refuses a child whose creation predates its parent (reused PID)", () => {
    const processes = [proc(10, 1, "500"), proc(11, 10, "400")]
    expect(ProcessTree.selectDescendants(processes, 10)).toEqual([])
  })

  test("never selects protected processes or their subtree", () => {
    const processes = [proc(10, 1, "100"), proc(11, 10, "110", { protected: true }), proc(12, 11, "120")]
    expect(ProcessTree.selectDescendants(processes, 10)).toEqual([])
  })

  test("throws when the root identity is missing", () => {
    expect(() => ProcessTree.selectDescendants([proc(11, 10, "110")], 10)).toThrow("Process identity unavailable: 10")
  })
})

describe("ProcessTree.stopTree", () => {
  windows("refuses a live identity without executable and stops nothing", async () => {
    // The created value is wrong too, so even a missed check could not stop the test process.
    const identity = { pid: process.pid, parentPid: 0, created: "1" }
    await expect(ProcessTree.stopTree([identity])).rejects.toThrow(`Process identity unavailable: ${process.pid}`)
  })

  windows("skips an incomplete identity whose process already exited", async () => {
    await ProcessTree.stopTree([{ pid: 2147483640, parentPid: 0, created: "1" }])
  })

  windows("stops a live child tree with a verified identity", async () => {
    const parent = Bun.spawn(
      ["pwsh", "-NoProfile", "-NonInteractive", "-Command", "& pwsh -NoProfile -NonInteractive -Command 'Start-Sleep 120'"],
      { stdout: "ignore", stderr: "ignore", windowsHide: true },
    )
    const tree = await waitForTree(parent.pid, 2)
    await ProcessTree.stopTree(tree)
    await expect(parent.exited).resolves.toBeNumber()
    expect(tree.at(-1)?.pid).toBe(parent.pid)
  })
})

describe("ProcessTree.killTree", () => {
  windows("stops a spawned root and its child", async () => {
    const from = Date.now()
    const parent = Bun.spawn(
      ["pwsh", "-NoProfile", "-NonInteractive", "-Command", "& pwsh -NoProfile -NonInteractive -Command 'Start-Sleep 120'"],
      { stdout: "ignore", stderr: "ignore", windowsHide: true },
    )
    const root = { pid: parent.pid, from, to: Date.now() }
    const child = (await waitForTree(parent.pid, 2))[0]
    await ProcessTree.killTree(root, () => parent.exitCode === null)
    await expect(parent.exited).resolves.toBeNumber()
    expect(await ProcessTree.processIdentity(child.pid).then((live) => live?.created)).not.toBe(child.created)
  })

  // Stopping the shell's child ends pwsh, so its console host is mid-exit when its turn comes. CIM can then
  // read it back without its path; that used to fail the stop in about one run of three.
  windows("stops a shell tree whose console host exits during the stop", async () => {
    for (const _ of Array.from({ length: 6 })) {
      const from = Date.now()
      const shell = Bun.spawn(
        ["pwsh", "-NoProfile", "-NonInteractive", "-Command", `& "${process.execPath}" -e "await Bun.sleep(60000)"`],
        { stdout: "ignore", stderr: "ignore", windowsHide: true },
      )
      const root = { pid: shell.pid, from, to: Date.now() }
      await waitForTree(shell.pid, 3)
      await ProcessTree.killTree(root, () => shell.exitCode === null)
      await expect(shell.exited).resolves.toBeNumber()
    }
  }, 90_000)

  windows("refuses a live root created outside its spawn window (reused PID)", async () => {
    const proc = sleeper()
    await expect(ProcessTree.killTree({ pid: proc.pid, from: 0, to: 0 }, () => true)).rejects.toThrow(
      `Process identity changed: ${proc.pid}`,
    )
    expect(proc.exitCode).toBeNull()
    proc.kill()
  })

  windows("leaves the root alone when its handle was released during the snapshot", async () => {
    const proc = sleeper()
    const checks = { count: 0 }
    await ProcessTree.killTree({ pid: proc.pid, from: 0, to: 0 }, () => checks.count++ === 0)
    expect(checks.count).toBe(2)
    expect(proc.exitCode).toBeNull()
    proc.kill()
  })
})

function sleeper() {
  return Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 60000)"], { stdout: "ignore", stderr: "ignore" })
}

async function waitForTree(rootPid: number, size: number) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const tree = await ProcessTree.captureTree(rootPid).catch(() => [])
    // A process still starting has no executable path yet; stopTree rightly refuses it.
    if (tree.length >= size && tree.every((item) => item.executable)) return tree
    await Bun.sleep(200)
  }
  throw new Error(`process tree for ${rootPid} did not reach ${size} processes`)
}
