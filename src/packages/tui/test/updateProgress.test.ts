import { expect, test } from "bun:test"
import { applyUpdateLine, formatUpdateRow, type UpdateRow } from "../src/updateProgress"

const row = (change: Partial<UpdateRow> = {}): UpdateRow => ({
  label: "Claude Desktop",
  phase: "updating",
  detail: "",
  since: 0,
  received: 0,
  total: 0,
  ...change,
})

test("a step line starts a phase and keeps the rest as detail", () => {
  const next = applyUpdateLine(row({ received: 9, total: 9 }), "OCSTEP: installing needs admin approval", 5_000)
  expect(next).toEqual(row({ phase: "installing", detail: "needs admin approval", since: 5_000 }))
  expect(formatUpdateRow(next, 17_400)).toBe("Claude Desktop: installing 12s: needs admin approval")
})

test("ignores an unknown step", () => {
  const start = row()
  expect(applyUpdateLine(start, "OCSTEP: rebooting", 1)).toBe(start)
})

test("progress lines show percent and size", () => {
  const downloading = applyUpdateLine(row(), "OCSTEP: downloading", 0)
  const next = applyUpdateLine(downloading, `OCPROGRESS: ${62 * 1024 * 1024} ${138 * 1024 * 1024}`, 0)
  expect(formatUpdateRow(next, 0)).toBe("Claude Desktop: downloading 44% (62/138 MB)")
})

test("progress without a total shows bytes received", () => {
  const next = applyUpdateLine(row({ phase: "downloading" }), `OCPROGRESS: ${5 * 1024 * 1024} 0`, 0)
  expect(formatUpdateRow(next, 0)).toBe("Claude Desktop: downloading 5.0 MB")
})

test("other output becomes detail and an overflowing row continues on one indented line", () => {
  const next = applyUpdateLine(
    row({ label: "Claude Code" }),
    "Downloading Claude Code 2.1.40 from the release server now",
    0,
  )
  expect(formatUpdateRow(next, 3_000)).toBe(
    "Claude Code: updating 3s: Downloading Claude Code\n  2.1.40 from the release server now",
  )
})

test("text past the second line is cut", () => {
  const next = row({ label: "Codex CLI", detail: "x".repeat(80) })
  const lines = formatUpdateRow(next, 0).split("\n")
  expect(lines).toEqual(["Codex CLI: updating 0s:", `  ${"x".repeat(47)}...`])
})

test("finished phases show no elapsed time", () => {
  expect(formatUpdateRow(row({ phase: "done" }), 99_000)).toBe("Claude Desktop: done")
  expect(formatUpdateRow(row({ phase: "awaiting confirm", detail: "1.0 -> 1.1" }), 99_000)).toBe(
    "Claude Desktop: awaiting confirm: 1.0 -> 1.1",
  )
})
