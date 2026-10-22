import { expect, test } from "bun:test"
import {
  DEPENDENCIES,
  lineEvent,
  psString,
  runInstalls,
  versionOf,
  type Dependency,
  type InstallEvent,
} from "../src/dependencies"

test("table ids are unique and every need comes earlier in install order", () => {
  const ids = DEPENDENCIES.map((dep) => dep.id)
  expect(new Set(ids).size).toBe(ids.length)
  for (const [index, dep] of DEPENDENCIES.entries()) {
    for (const need of dep.needs) expect(ids.indexOf(need)).toBeGreaterThanOrEqual(0)
    for (const need of dep.needs) expect(ids.indexOf(need)).toBeLessThan(index)
  }
  expect(DEPENDENCIES.filter((dep) => dep.required).map((dep) => dep.id)).toEqual(["pwsh"])
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

function fakeDep(id: string, needs: string[], lines: string[], result: { ok: boolean; message: string }): Dependency {
  return {
    id,
    label: id.toUpperCase(),
    defaultSelected: true,
    needs,
    detect: async () => ({ status: "missing" }),
    install: async (_env, onLine) => {
      for (const line of lines) onLine(line)
      return result
    },
  }
}

test("installs in table order and skips items whose need failed", async () => {
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
    { id: "node", phase: "start" },
    { id: "node", phase: "downloading" },
    { id: "node", phase: "downloading", received: 10, total: 20 },
    { id: "node", phase: "failed", message: "Install cancelled" },
    { id: "git", phase: "start" },
    { id: "git", phase: "installing" },
    { id: "git", phase: "done", message: "Installed Git" },
    { id: "codexCli", phase: "skipped", message: "Needs NODE, which did not install" },
  ])
  expect(refreshes).toBe(3)
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
