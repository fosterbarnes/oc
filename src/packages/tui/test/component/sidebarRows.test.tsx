/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import type { BoxRenderable } from "@opentui/core"
import { expect, test } from "bun:test"
import { createSignal, For } from "solid-js"
import {
  clipEnd,
  reconcileScripts,
  reconcileTree,
  type Script,
  type TreeEntry,
} from "../../src/routes/session/sidebar-tools/helpers.js"

function packageScript(name: string, terminal: Script["terminal"] = "native"): Script {
  return {
    name,
    command: `npm run ${name}`,
    launcher: { executable: "pwsh", args: ["-NoLogo", "-NoExit", "-Command"] },
    terminal,
    weztermSize: { Percent: 50 },
  }
}

function fileScript(filePath: string, name: string): Script {
  return {
    name,
    command: `"${filePath}"`,
    filePath,
    launcher: { executable: "pwsh", args: ["-NoLogo", "-NoExit", "-File"] },
    terminal: "native",
    weztermSize: { Percent: 50 },
  }
}

function cloneScripts(scripts: Script[]): Script[] {
  return scripts.map((script) => ({
    ...script,
    launcher: { executable: script.launcher.executable, args: [...script.launcher.args] },
    weztermSize: { ...script.weztermSize },
  }))
}

function treeEntry(relativePath: string, fullPath: string, depth = 0, directory = false): TreeEntry {
  return { name: relativePath.split("/").pop() ?? relativePath, relativePath, fullPath, directory, depth }
}

function cloneTree(entries: TreeEntry[]): TreeEntry[] {
  return entries.map((entry) => ({ ...entry }))
}

test("equivalent fresh snapshots reuse row identity", () => {
  const prev = [packageScript("build"), fileScript("/proj/.scripts/deploy.ps1", ".scripts/deploy.ps1")]
  const reconciled = reconcileScripts(prev, cloneScripts(prev))
  expect(reconciled).toBe(prev)
  const treePrev = [treeEntry("a.ts", "/proj/a.ts"), treeEntry("b.ts", "/proj/b.ts")]
  expect(reconcileTree(treePrev, cloneTree(treePrev))).toBe(treePrev)
})

test("changed fields replace stale rows, same names do not collide", () => {
  const scriptCases: Array<{ name: string; mutate: (script: Script) => Script }> = [
    { name: "command", mutate: (script) => ({ ...script, command: "npm run other" }) },
    {
      name: "executable",
      mutate: (script) => ({ ...script, launcher: { ...script.launcher, executable: "bash" } }),
    },
    {
      name: "args",
      mutate: (script) => ({ ...script, launcher: { ...script.launcher, args: [...script.launcher.args, "--flag"] } }),
    },
    { name: "terminal", mutate: (script) => ({ ...script, terminal: "wezterm-tab" }) },
    { name: "percent", mutate: (script) => ({ ...script, weztermSize: { Percent: 30 } }) },
    { name: "cells", mutate: (script) => ({ ...script, weztermSize: { Cells: 20 } }) },
  ]
  for (const c of scriptCases) {
    const prev = [packageScript("build"), packageScript("lint")]
    const next = cloneScripts(prev)
    next[0] = c.mutate(next[0])
    const reconciled = reconcileScripts(prev, next)
    expect(reconciled[1]).toBe(prev[1])
    expect(reconciled[0]).not.toBe(prev[0])
    expect(reconciled[0]).toBe(next[0])
  }
  // Package and file scripts sharing a name coexist without colliding.
  const both = [packageScript("build"), fileScript("/proj/.scripts/build.ps1", "build")]
  const bothReconciled = reconcileScripts(both, cloneScripts(both))
  expect(bothReconciled[0]).toBe(both[0])
  expect(bothReconciled[1]).toBe(both[1])
  const swapPrev = [packageScript("build")]
  const swapNext = [fileScript("/proj/.scripts/build.ps1", "build")]
  const kindSwap = reconcileScripts(swapPrev, swapNext)
  expect(kindSwap[0]).toBe(swapNext[0])
  expect(kindSwap[0]).not.toBe(swapPrev[0])
  const treeCases: Array<{ name: string; mutate: (entry: TreeEntry) => TreeEntry }> = [
    { name: "name", mutate: (entry) => ({ ...entry, name: "renamed.ts" }) },
    { name: "relativePath", mutate: (entry) => ({ ...entry, relativePath: "moved/a.ts" }) },
    { name: "fullPath", mutate: (entry) => ({ ...entry, fullPath: "/other/a.ts" }) },
    { name: "depth", mutate: (entry) => ({ ...entry, depth: entry.depth + 1 }) },
    { name: "directory", mutate: (entry) => ({ ...entry, directory: !entry.directory }) },
  ]
  for (const c of treeCases) {
    const prev = [treeEntry("a.ts", "/proj/a.ts"), treeEntry("b.ts", "/proj/b.ts")]
    const next = cloneTree(prev)
    next[0] = c.mutate(next[0])
    const reconciled = reconcileTree(prev, next)
    expect(reconciled[1]).toBe(prev[1])
    expect(reconciled[0]).not.toBe(prev[0])
    expect(reconciled[0]).toBe(next[0])
  }
  // Same relative path under a different root does not reuse the stale row.
  const rootPrev = [treeEntry("src/a.ts", "/proj/src/a.ts")]
  const rootNext = [treeEntry("src/a.ts", "/other/src/a.ts")]
  expect(reconcileTree(rootPrev, rootNext)[0]).not.toBe(rootPrev[0])
})

test("add, delete, and reorder stay correct without assuming name uniqueness", () => {
  const prev = [packageScript("build"), fileScript("/proj/.scripts/build.ps1", "build")]
  const added = reconcileScripts(prev, [...cloneScripts(prev), packageScript("lint")])
  expect(added[0]).toBe(prev[0])
  expect(added[1]).toBe(prev[1])
  expect(added[2].name).toBe("lint")
  const deleted = reconcileScripts(prev, [cloneScripts(prev)[0]])
  expect(deleted.length).toBe(1)
  expect(deleted[0]).toBe(prev[0])
  const reordered = reconcileScripts(prev, [cloneScripts(prev)[1], cloneScripts(prev)[0]])
  expect(reordered[0]).toBe(prev[1])
  expect(reordered[1]).toBe(prev[0])
})

test("clipEnd fits narrow budgets", () => {
  expect(clipEnd("a-very-long-script-name-that-overflows", 0)).toBe("")
  expect(clipEnd("abcdefghij", 1)).toBe("a")
  expect(clipEnd("abcdefghij", 2)).toBe("ab")
  expect(clipEnd("abcdefghij", 3)).toBe("...")
  expect(clipEnd("short", 10)).toBe("short")
  expect(clipEnd("abcdefghij", 8)).toBe("abcde...")
})

test("repeated equivalent refreshes keep measured rows and frames; narrow width clips single-line", async () => {
  const initial = [
    packageScript("build"),
    fileScript("/proj/.scripts/a-very-long-deploy-script-name.ps1", ".scripts/a-very-long-deploy-script-name.ps1"),
  ]
  const [rows, setRows] = createSignal<Script[]>(initial)
  const [width, setWidth] = createSignal(30)
  let creations = 0
  const app = await testRender(
    () => (
      <box flexDirection="column" width={width()}>
        <For each={rows()}>
          {(script) => {
            creations++
            let row: BoxRenderable | undefined
            const [nameWidth, setNameWidth] = createSignal(0)
            return (
              <box
                ref={(el) => (row = el)}
                onSizeChange={() => setNameWidth((row?.width ?? 0) - 4)}
                paddingLeft={1}
                paddingRight={1}
              >
                <text wrapMode="none">
                  {"  "}
                  {clipEnd(script.name, nameWidth())}
                </text>
              </box>
            )
          }}
        </For>
      </box>
    ),
    { width: 40, height: 8 },
  )
  try {
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 25))
    await app.renderOnce()
    const settled = app.captureCharFrame()
    expect(creations).toBe(2)
    expect(settled).toContain("build")
    expect(settled).toContain("...")
    // Fresh objects with identical values (what readScripts produces on every refresh).
    for (let refresh = 0; refresh < 3; refresh++) {
      setRows((prev) => reconcileScripts(prev, cloneScripts(prev)))
      await app.renderOnce()
      await new Promise((resolve) => setTimeout(resolve, 25))
      await app.renderOnce()
      expect(creations).toBe(2)
      expect(app.captureCharFrame()).toBe(settled)
    }
    // Narrowing clips to one line per row instead of wrapping.
    setWidth(14)
    await app.renderOnce()
    await new Promise((resolve) => setTimeout(resolve, 25))
    await app.renderOnce()
    const narrow = app.captureCharFrame().split("\n").slice(0, 2)
    expect(narrow.every((row) => row.trimEnd().length <= 14)).toBe(true)
    expect(narrow[1]).toContain("...")
  } finally {
    app.renderer.destroy()
  }
})
