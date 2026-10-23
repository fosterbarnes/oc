import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  DEPENDENCIES,
  expandEnv,
  gitBash,
  lineEvent,
  parseRegPath,
  psString,
  runInstalls,
  scriptErrorRecord,
  versionOf,
  type Dependency,
  type InstallEvent,
} from "../src/dependencies"
import { removeRunDir } from "../src/desktopUpdate"

test("parseRegPath reads REG_EXPAND_SZ and REG_SZ values from reg query output", () => {
  const machine =
    "\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment\r\n" +
    "    Path    REG_EXPAND_SZ    %SystemRoot%\\system32;C:\\Program Files\\Git\\cmd\r\n\r\n"
  expect(parseRegPath(machine)).toBe("%SystemRoot%\\system32;C:\\Program Files\\Git\\cmd")
  expect(parseRegPath("\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_SZ    C:\\Tools\r\n")).toBe("C:\\Tools")
  expect(parseRegPath("ERROR: The system was unable to find the specified registry key or value.\r\n")).toBeUndefined()
})

test("scriptErrorRecord joins a vendor script's wrapped error up to its At line", () => {
  // Trimmed real output of claude.ai/install.ps1 on a VM.
  const output = [
    "C:\\Users\\a\\AppData\\Local\\Temp\\oc-deps-x\\claudeCli\\install.ps1 : Failed to download binary: This workload is",
    "drawing too much egress bandwidth from Cloud Storage.",
    "At C:\\Users\\a\\AppData\\Local\\Temp\\oc-deps-x\\claudeCli\\install.ps1:63 char:5",
    '+     Write-Error "Failed to download binary: $_"',
    "OCERR: Install script exited with code 1",
  ].join("\r\n")
  expect(scriptErrorRecord(output)).toBe(
    "Failed to download binary: This workload is drawing too much egress bandwidth from Cloud Storage.",
  )
  expect(scriptErrorRecord("OCERR: Install script exited with code 1")).toBeUndefined()
  expect(scriptErrorRecord(`x.ps1 : ${"a".repeat(300)}`)!.length).toBe(200)
})

test("expandEnv matches names case-insensitively and keeps unknown names", () => {
  const env = { SystemRoot: "C:\\Windows", USERPROFILE: "C:\\Users\\a" }
  expect(expandEnv("%systemroot%\\system32;%UserProfile%\\bin;%NOPE%\\x", env)).toBe(
    "C:\\Windows\\system32;C:\\Users\\a\\bin;%NOPE%\\x",
  )
})

test("table ids are unique and every need comes earlier in install order", () => {
  const ids = DEPENDENCIES.map((dep) => dep.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const [index, dep] of DEPENDENCIES.entries()) {
    for (const need of dep.needs) expect(ids.indexOf(need)).toBeGreaterThanOrEqual(0)
    for (const need of dep.needs) expect(ids.indexOf(need)).toBeLessThan(index)
  }
  expect(DEPENDENCIES.filter((dep) => dep.required).map((dep) => dep.id)).toEqual(["pwsh"])
})

test("each row installs one way and holds the locks for what its installer touches", () => {
  for (const dep of DEPENDENCIES) expect(!!dep.install !== !!dep.prepare).toBe(true)
  // A missing lock is a silent race (two UAC prompts, two MSIs, lost PATH entries): pin the table.
  expect(Object.fromEntries(DEPENDENCIES.map((dep) => [dep.id, dep.locks]))).toEqual({
    pwsh: ["admin"],
    git: ["admin"],
    node: ["admin", "userPath"],
    everything: ["admin"],
    wezterm: ["admin"],
    codexCli: ["npm"],
    claudeCli: ["npm"],
    cursorCli: ["userPath"],
    codexDesktop: ["admin"],
    claudeDesktop: ["admin"],
    cursorDesktop: ["userPath"],
  })
})

test("every row but Node.js offers a desktop shortcut; Appx rows use their pinned app ids", () => {
  expect(DEPENDENCIES.filter((dep) => !dep.shortcut).map((dep) => dep.id)).toEqual(["node"])
  const appId = (id: string) => DEPENDENCIES.find((dep) => dep.id === id)!.shortcut!.find({}, { status: "found" }).appId
  expect(appId("codexDesktop")).toBe("OpenAI.Codex_2p2nqsd0c76g0!App")
  expect(appId("claudeDesktop")).toBe("Claude_pzs8sxrjxfjjc!Claude")
})

test("finds Git Bash from git's cmd folder only", () => {
  expect(gitBash("C:\\Program Files\\Git\\cmd\\git.exe")).toBe("C:\\Program Files\\Git\\git-bash.exe")
  expect(gitBash("C:\\tools\\git.exe")).toBeUndefined()
  expect(gitBash(undefined)).toBeUndefined()
})

test("maps script step and progress lines to events", () => {
  expect(lineEvent("git", "OCSTEP: downloading")).toEqual({ id: "git", phase: "downloading" })
  expect(lineEvent("git", "OCSTEP: installing needs admin approval")).toEqual({
    id: "git",
    phase: "installing",
    message: "needs admin approval",
  })
  expect(lineEvent("git", "OCPROGRESS: 1024 4096")).toEqual({
    id: "git",
    phase: "downloading",
    received: 1024,
    total: 4096,
  })
  expect(lineEvent("git", "OCSTEP: launching")).toBeUndefined()
  expect(lineEvent("git", "OCPROGRESS: x 4096")).toBeUndefined()
  expect(lineEvent("git", "Installed Git for Windows")).toBeUndefined()
})

test("reads versions from real --version output", () => {
  expect(versionOf("git version 2.47.1.windows.1\n")).toBe("2.47.1")
  expect(versionOf("v24.14.0\r\n")).toBe("24.14.0")
  expect(versionOf("2.1.3 (Claude Code)\n")).toBe("2.1.3")
  expect(versionOf("wezterm 20240203-110809-5046fc22\n")).toBe("20240203-110809-5046fc22")
  expect(versionOf("\n")).toBeUndefined()
})

test("quotes PowerShell literals including curly quotes", () => {
  expect(psString("C:\\Users\\O'Neil\\oc")).toBe("'C:\\Users\\O''Neil\\oc'")
  expect(psString("a\u2019b")).toBe("'a\u2019\u2019b'")
})

function fakeDep(
  id: string,
  needs: string[],
  lines: string[],
  result: { ok: boolean; message: string },
): Extract<Dependency, { prepare?: never }> {
  return {
    id,
    label: id.toUpperCase(),
    defaultSelected: true,
    needs,
    locks: ["admin"],
    detect: async () => ({ status: "missing" }),
    install: async (_env, onLine) => {
      for (const line of lines) onLine(line)
      return result
    },
  }
}

test("rows sharing a lock install in table order; a failed need skips its dependent at once", async () => {
  const deps = [
    fakeDep("node", [], ["OCSTEP: downloading", "OCPROGRESS: 10 20", "OCERR: Install cancelled"], {
      ok: false,
      message: "Install cancelled",
    }),
    fakeDep("git", [], ["OCSTEP: installing"], { ok: true, message: "Installed Git" }),
    fakeDep("codexCli", ["node"], [], { ok: true, message: "Installed Codex CLI" }),
  ]
  const events: InstallEvent[] = []
  let refreshes = 0
  const ok = await runInstalls(
    deps,
    ["codexCli", "git", "node"],
    (event) => events.push(event),
    async () => {
      refreshes++
      return {}
    },
  )
  expect(ok).toBe(false)
  expect(events).toEqual([
    { id: "node", phase: "queued" },
    { id: "git", phase: "queued" },
    { id: "codexCli", phase: "queued" },
    { id: "node", phase: "start" },
    { id: "node", phase: "downloading" },
    { id: "node", phase: "downloading", received: 10, total: 20 },
    { id: "node", phase: "failed", message: "Install cancelled" },
    { id: "git", phase: "start" },
    { id: "codexCli", phase: "skipped", message: "Needs NODE, which did not install" },
    { id: "git", phase: "installing" },
    { id: "git", phase: "done", message: "Installed Git" },
  ])
  // One PATH read per started install; the skipped row starts nothing.
  expect(refreshes).toBe(2)
})

test("a thrown install becomes a failed event and unknown ids are refused", async () => {
  const broken: Dependency = {
    ...fakeDep("wezterm", [], [], { ok: true, message: "" }),
    install: async () => {
      throw new Error("Release lookup failed for wezterm/wezterm: HTTP 403")
    },
  }
  const events: InstallEvent[] = []
  expect(
    await runInstalls(
      [broken],
      ["wezterm"],
      (event) => events.push(event),
      async () => ({}),
    ),
  ).toBe(false)
  expect(events.at(-1)).toEqual({
    id: "wezterm",
    phase: "failed",
    message: "Release lookup failed for wezterm/wezterm: HTTP 403",
  })
  expect(
    runInstalls(
      [broken],
      ["nope"],
      () => {},
      async () => ({}),
    ),
  ).rejects.toThrow("Unknown dependency: nope")
})

// Shared shape of the scheduler fakes: a slow install that logs when it runs.
function timedDep(id: string, log: string[], extra: Partial<Dependency> = {}): Dependency {
  return {
    ...fakeDep(id, [], [], { ok: true, message: `Installed ${id}` }),
    install: async () => {
      log.push(`${id}+`)
      await Bun.sleep(20)
      log.push(`${id}-`)
      return { ok: true, message: `Installed ${id}` }
    },
    ...extra,
  } as Dependency
}

test("rows sharing a lock never overlap; disjoint locks overlap; needs cross locks", async () => {
  const log: string[] = []
  const deps = [
    timedDep("pwsh", log),
    timedDep("cursorCli", log, { locks: ["userPath"] }),
    timedDep("node", log, { locks: ["admin", "userPath"] }),
    timedDep("codexCli", log, { locks: [], needs: ["node"] }),
  ]
  expect(
    await runInstalls(
      deps,
      ["pwsh", "cursorCli", "node", "codexCli"],
      () => {},
      async () => ({}),
    ),
  ).toBe(true)
  expect(log.indexOf("pwsh-")).toBeLessThan(log.indexOf("node+"))
  expect(log.indexOf("cursorCli+")).toBeLessThan(log.indexOf("pwsh-"))
  expect(log.indexOf("cursorCli-")).toBeLessThan(log.indexOf("node+"))
  expect(log.indexOf("codexCli+")).toBeGreaterThan(log.indexOf("node-"))
})

// node is waiting and earlier in the table, so cursorCli cannot take userPath (free) ahead of it
// and starve node, which also needs admin.
test("a free lock goes to the earliest waiting row that wants it", async () => {
  const log: string[] = []
  const deps = [
    timedDep("pwsh", log),
    timedDep("node", log, { locks: ["admin", "userPath"] }),
    timedDep("cursorCli", log, { locks: ["userPath"] }),
  ]
  expect(
    await runInstalls(
      deps,
      ["pwsh", "node", "cursorCli"],
      () => {},
      async () => ({}),
    ),
  ).toBe(true)
  expect(log).toEqual(["pwsh+", "pwsh-", "node+", "node-", "cursorCli+", "cursorCli-"])
})

// On a VM, node sat downloaded for 49 s behind pwsh, which was still downloading.
test("a row still downloading does not hold up a later ready row", async () => {
  const log: string[] = []
  const deps = [
    {
      ...timedDep("pwsh", log),
      install: undefined,
      prepare: async () => {
        await Bun.sleep(60)
        return async () => {
          log.push("pwsh+")
          return { ok: true, message: "Installed pwsh" }
        }
      },
    } as Dependency,
    timedDep("node", log, { locks: ["admin", "userPath"] }),
  ]
  expect(
    await runInstalls(
      deps,
      ["pwsh", "node"],
      () => {},
      async () => ({}),
    ),
  ).toBe(true)
  expect(log).toEqual(["node+", "node-", "pwsh+"])
})

test("a failed need under one lock skips its dependent under another", async () => {
  const log: string[] = []
  const deps = [
    { ...timedDep("node", log), install: async () => ({ ok: false, message: "Install cancelled" }) } as Dependency,
    timedDep("codexCli", log, { locks: [], needs: ["node"] }),
  ]
  const events: InstallEvent[] = []
  expect(
    await runInstalls(
      deps,
      ["node", "codexCli"],
      (event) => events.push(event),
      async () => ({}),
    ),
  ).toBe(false)
  expect(log).toEqual([])
  expect(events.at(-1)).toEqual({ id: "codexCli", phase: "skipped", message: "Needs NODE, which did not install" })
})

test("prefetches up to 4 in table order and reports a failed download at once", async () => {
  const started: string[] = []
  const dirs: string[] = []
  let active = 0
  let maxActive = 0
  const prepDep = (id: string, extra: Partial<Dependency> = {}, fail = false): Dependency =>
    ({
      ...fakeDep(id, [], [], { ok: true, message: "" }),
      install: undefined,
      prepare: async (dir: string, onLine: (line: string) => void) => {
        started.push(id)
        dirs.push(dir)
        expect(existsSync(dir)).toBe(true)
        maxActive = Math.max(maxActive, ++active)
        onLine("OCSTEP: downloading")
        await Bun.sleep(20)
        active--
        if (fail) throw new Error("Checksum mismatch")
        return async () => {
          await Bun.sleep(30)
          if (id === "e") throw new Error("Installer crashed")
          return { ok: true, message: `Installed from ${path.basename(dir)}` }
        }
      },
      ...extra,
    }) as Dependency
  const deps = [prepDep("a"), prepDep("b", {}, true), prepDep("c", { needs: ["b"] }), prepDep("d"), prepDep("e")]
  const events: InstallEvent[] = []
  const ok = await runInstalls(
    deps,
    ["a", "b", "c", "d", "e"],
    (event) => events.push(event),
    async () => ({}),
  )

  expect(ok).toBe(false)
  expect(started).toEqual(["a", "b", "c", "d", "e"])
  expect(maxActive).toBe(4)
  const phases = events.map((event) => `${event.id}:${event.phase}`)
  expect(phases.slice(0, 5)).toEqual(["a:queued", "b:queued", "c:queued", "d:queued", "e:queued"])
  // Reported when the download fails, not when the serial lane reaches b.
  expect(phases.indexOf("b:failed")).toBeLessThan(phases.indexOf("a:done"))
  expect(phases).toContain("a:ready")
  expect(phases).not.toContain("b:start")
  expect(events).toContainEqual({ id: "a", phase: "done", message: "Installed from a" })
  expect(events).toContainEqual({ id: "c", phase: "skipped", message: "Needs B, which did not install" })
  expect(events).toContainEqual({ id: "e", phase: "failed", message: "Installer crashed" })
  // The run's temp folder is removed even though an install threw.
  expect(existsSync(path.dirname(dirs[0]!))).toBe(false)
})

test("removeRunDir hands a stuck or failed folder off instead of waiting", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "oc-deps-test-"))
  await mkdir(path.join(dir, "codexDesktop"))
  try {
    const handed: string[] = []
    // A remover that never returns, like Bun's rm of the held ChatGPT MSIX on the VM.
    const started = performance.now()
    await removeRunDir(
      dir,
      () => new Promise(() => {}),
      async (target) => void handed.push(target),
    )
    expect(performance.now() - started).toBeLessThan(3_000)
    // A remover that throws (EBUSY) hands off at once.
    await removeRunDir(
      dir,
      () => Promise.reject(new Error("EBUSY")),
      async (target) => void handed.push(target),
    )
    expect(handed).toEqual([dir, dir])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
