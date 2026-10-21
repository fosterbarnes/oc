import { expect, test } from "bun:test"
import { collapseShellOutput, collapseToolOutput } from "../../../src/util/collapse-tool-output"

test("limits command input and output to the same line budget", () => {
  const command = Array.from({ length: 8 }, (_, index) => `command ${index + 1}`).join("\n")
  const output = Array.from({ length: 4 }, (_, index) => `output ${index + 1}`).join("\n")
  const collapsed = collapseToolOutput(`$ ${command}\n\n${output}`, 10, 1_000)

  expect(collapsed.overflow).toBe(true)
  expect(collapsed.output.split("\n")).toHaveLength(10)
  expect(collapsed.output).toContain("$ command 1")
  expect(collapsed.output).toContain("command 8\n\noutput 1…")
  expect(collapsed.output).not.toContain("output 2")
})

test("shell output keeps the newest lines under an earlier-lines label", () => {
  const output = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n")
  const collapsed = collapseShellOutput("$ cmd", output, 10, 1_000)

  expect(collapsed.overflow).toBe(true)
  expect(collapsed.input).toBe("$ cmd")
  expect(collapsed.output.split("\n")).toEqual([
    "(13 earlier lines)",
    ...Array.from({ length: 7 }, (_, index) => `line ${index + 14}`),
  ])
  expect(collapseShellOutput("$ cmd", "done", 10, 1_000)).toEqual({ input: "$ cmd", output: "done", overflow: false })
})

test("shell commands are cut to two rows", () => {
  const collapsed = collapseShellOutput(`$ ${"x".repeat(250)}`, "", 10, 500)

  expect(collapsed.overflow).toBe(true)
  expect(collapsed.input).toBe(`$ ${"x".repeat(97)}…`)
})
