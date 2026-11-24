import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseNightlyRun, parseWeztermVersion, sameBuild } from "../src/weztermUpdate"

test("reads the date and commit from wezterm --version", () => {
  expect(parseWeztermVersion("wezterm 20261108-035604-458a100c\n")).toBe("20261108-458a100c")
  expect(parseWeztermVersion("wezterm 20240203-110809-5046fc22")).toBe("20240203-5046fc22")
  expect(parseWeztermVersion("wezterm 0.0.0")).toBeUndefined()
})

// Trimmed `actions/workflows/gen_macos_continuous.yml/runs?branch=main&status=success&per_page=1`.
test("reads the newest nightly run", () => {
  const runs = {
    workflow_runs: [
      { head_sha: "458a100c1f2e3d4c5b6a", head_commit: { timestamp: "2026-11-08T02:56:04Z" } },
      { head_sha: "1111111111", head_commit: { timestamp: "2026-11-01T00:00:00Z" } },
    ],
  }
  expect(parseNightlyRun(runs)).toBe("20261108-458a100c")
  expect(() => parseNightlyRun({ workflow_runs: [] })).toThrow("no nightly build")
})

test("compares builds by commit, not date", () => {
  // The installed date is the committer's local time; CI's is UTC, so they can differ by a day.
  expect(sameBuild("20261108-458a100c", "20261107-458a100c")).toBe(true)
  expect(sameBuild("20261108-458a100c", "20261108-1a2b3c4d")).toBe(false)
})

test.skipIf(process.platform !== "darwin" && process.platform !== "win32")(
  "reports an install that finds WezTerm already current",
  async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "oc-wezterm-update-"))
    try {
      const bin = path.join(dir, "bin")
      await mkdir(bin)
      const cli = path.join(bin, process.platform === "win32" ? "wezterm.cmd" : "wezterm")
      await Bun.write(
        cli,
        process.platform === "win32"
          ? "@echo wezterm 20261108-035604-458a100c\r\n"
          : "#!/bin/sh\nprintf 'wezterm 20261108-035604-458a100c\\n'\n",
      )
      if (process.platform !== "win32") {
        await chmod(cli, 0o755)
        const brew = path.join(bin, "brew")
        await Bun.write(brew, "#!/bin/sh\nexit 1\n")
        await chmod(brew, 0o755)
      }
      const script = `
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
process.env.ProgramFiles = ${JSON.stringify(path.join(dir, "Program Files"))}
const app = "/Applications/WezTerm.app/Contents/MacOS/wezterm"
const cli = process.platform === "darwin" && existsSync(app) ? app : process.env.OC_TEST_WEZTERM_CLI
if (!cli) throw new Error("missing fixture CLI")
const printed = spawnSync(cli, ["--version"], { encoding: "utf8" })
if (printed.status !== 0) throw new Error(printed.stderr)
const match = printed.stdout.match(/(\\d{8})-\\d{6}-([0-9a-f]{8})/)
if (!match) throw new Error("unreadable fixture version: " + printed.stdout)
const date = match[1]
const commit = match[2]
const timestamp = date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6, 8) + "T00:00:00Z"
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/repos/wezterm/wezterm/actions/workflows/")) throw new Error("unexpected fetch: " + url)
  return Response.json({ workflow_runs: [{ head_sha: commit + "0".repeat(32), head_commit: { timestamp } }] })
}
const { installWezterm } = await import(${JSON.stringify(new URL("../src/weztermUpdate.ts", import.meta.url).href)})
console.log(JSON.stringify(await installWezterm(date + "-" + commit)))
`
      const result = Bun.spawnSync({
        cmd: [process.execPath, "-e", script],
        env: {
          ...process.env,
          PATH: `${bin}${path.delimiter}${process.env.PATH ?? process.env.Path ?? ""}`,
          OC_TEST_WEZTERM_CLI: cli,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      })
      if (result.exitCode !== 0) throw new Error(result.stderr.toString())
      const output: unknown = JSON.parse(result.stdout.toString())
      expect(output).toMatchObject({ ok: true, alreadyRunning: false, upToDate: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
