import { expect, test } from "bun:test"
import { Killall } from "../../src/cli/killall"

const row = (
  pid: number,
  parentPid: number,
  created: number,
  name: string,
  command = "",
  executable = `C:\\${name}`,
) => ({
  pid,
  parentPid,
  created: String(created),
  executable,
  name,
  command,
  workingSetMB: 1,
  cpuMs: 0,
})

// claude.exe (2) started the shell (3) that runs this killall (4, with its console 5).
const rows = [
  row(1, 0, 10, "explorer.exe"),
  row(2, 1, 20, "claude.exe"),
  row(3, 2, 30, "pwsh.exe"),
  row(4, 3, 40, "bun.exe", "bun src/index.ts oc killall"),
  row(5, 4, 41, "conhost.exe"),
  row(6, 2, 50, "node.exe"),
  row(7, 6, 60, "node.exe"),
  // Claims claude.exe as parent but started before it: the PID was reused, so it is not claude's child.
  row(8, 2, 5, "cmd.exe"),
  row(9, 1, 70, "oc.exe"),
  row(10, 9, 80, "pwsh.exe"),
  row(11, 99, 100, "node.exe", "node C:\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"),
  // Its oc server 555 exited and left the Claude temp folder behind.
  row(12, 555, 200, "node.exe"),
  row(13, 1, 210, "Claude.exe", "", ""),
]

test("killall keeps itself and the shells above it, and stops children before parents", () => {
  const byPid = new Map(rows.map((item) => [item.pid, item]))
  const dead = Killall.deadOwners(
    [
      { name: "opencode-claude-code-555", createdTicks: 150n },
      { name: "opencode-claude-code-9", createdTicks: 90n },
    ],
    byPid,
    "win32",
  )
  expect([...dead.keys()]).toEqual([555])

  const selection = Killall.select(rows, 4, "win32", dead)
  expect([...selection.keep].toSorted((a, b) => a - b)).toEqual([3, 4, 5])
  expect(selection.ordered.map((member) => member.pid).toSorted((a, b) => a - b)).toEqual([2, 6, 7, 9, 10, 11, 12, 13])

  const batches = Killall.stopBatches(selection.ordered)
  for (const batch of batches) {
    batch.forEach((member, index) => {
      const parentIndex = batch.findIndex((item) => item.pid === member.parentPid)
      if (parentIndex !== -1) expect(parentIndex).toBeGreaterThan(index)
    })
  }
  expect(batches.find((batch) => batch.at(-1)?.pid === 2)?.map((member) => member.pid)).toEqual([7, 6, 2])
  // No executable means no identity to verify, so it is never handed to stopTree.
  expect(batches.flat().some((member) => member.pid === 13)).toBe(false)
})

test("killall on macOS matches AI app bundles and CLIs, not system processes with similar names", () => {
  const mac = (executable: string, command = executable) =>
    row(1, 0, 1, Killall.darwinName(executable, command), command, executable)
  const roots = [
    "/Applications/Cursor.app/Contents/Frameworks/Cursor Helper.app/Contents/MacOS/Cursor Helper",
    "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
    "/Users/foster/.local/share/claude/versions/2.1.3",
    "/Users/foster/.local/bin/opencode",
  ]
  const others = [
    "/System/Library/PrivateFrameworks/TextInputUIMacHelper.framework/Versions/A/XPCServices/CursorUIViewService.xpc/Contents/MacOS/CursorUIViewService",
    "/bin/zsh",
    "/Applications/WezTerm.app/Contents/MacOS/wezterm-gui",
  ]
  expect(roots.map((executable) => Killall.isRoot(mac(executable), "darwin"))).toEqual(roots.map(() => true))
  expect(others.map((executable) => Killall.isRoot(mac(executable), "darwin"))).toEqual(others.map(() => false))
})
