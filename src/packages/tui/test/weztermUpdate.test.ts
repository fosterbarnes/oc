import { expect, test } from "bun:test"
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
