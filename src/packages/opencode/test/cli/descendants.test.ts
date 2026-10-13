import { expect, test } from "bun:test"
import { ProcessTree } from "@opencode-ai/core/util/processTree"
import { captureDescendants, stopDescendants } from "../../src/cli/tui/descendants"

test("single shutdown selects only verified descendants, leaves helpers and their subtrees alone", () => {
  const item = (pid: number, parentPid: number, created: string, protectedProcess = false) => ({
    pid,
    parentPid,
    created,
    protected: protectedProcess,
  })
  const processes = [
    item(1, 99, "100"),
    item(2, 1, "101"),
    item(3, 2, "102"),
    item(4, 1, "99"),
    item(5, 4, "103"),
    item(6, 1, "104", true),
    item(7, 6, "105"),
    item(8, 99, "106"),
    item(99, 100, "90"),
  ]
  expect(ProcessTree.selectDescendants(processes, 1).map((entry) => entry.pid)).toEqual([3, 2])
  expect(() => ProcessTree.selectDescendants(processes, 10)).toThrow("identity unavailable")
})

test.skipIf(process.platform !== "win32")(
  "single cleanup rechecks CIM identity and leaves unrelated live processes alone",
  async () => {
    const root = Bun.spawn(
      [
        process.execPath,
        "--eval",
        [
          "const child = Bun.spawn(['pwsh', '-NoProfile', '-NonInteractive', '-Command', '[Console]::ReadLine()'],",
          "  { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore', windowsHide: true });",
          "console.log(child.pid);",
          "try { await Bun.stdin.text() } finally { child.kill(); await child.exited }",
        ].join("\n"),
      ],
      { stdin: "pipe", stdout: "pipe", stderr: "pipe", windowsHide: true },
    )
    const unrelated = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", "[Console]::ReadLine()"], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
      windowsHide: true,
    })
    try {
      const reader = root.stdout.getReader()
      const line = await reader.read()
      reader.releaseLock()
      const leafPid = Number(Buffer.from(line.value!).toString().trim())
      const captured = await captureDescendants(root.pid)
      expect(captured.map((item) => item.pid)).toEqual([leafPid])
      await expect(stopDescendants(captured.map((item) => ({ ...item, created: "1" })))).rejects.toThrow(
        `Process identity changed: ${leafPid}`,
      )
      expect(processExists(leafPid)).toBe(true)
      await stopDescendants(captured)
      expect(processExists(leafPid)).toBe(false)
      expect(processExists(root.pid)).toBe(true)
      expect(processExists(unrelated.pid)).toBe(true)
    } finally {
      root.stdin.end()
      unrelated.kill()
      await Promise.all([root.exited, unrelated.exited])
    }
  },
  30_000,
)

function processExists(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
