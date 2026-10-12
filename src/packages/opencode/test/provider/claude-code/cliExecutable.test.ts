import assert from "node:assert/strict"
import { test } from "node:test"
import { cliCommand } from "@/provider/claude-code/cliExecutable.js"

test("Windows runs CommonJS CLI scripts through Node", () => {
  const command = cliCommand("C:\\temp\\fake-claude.cjs", ["--version"])
  if (process.platform === "win32") {
    assert.equal(command.command, process.execPath)
    assert.deepEqual(command.args, ["C:\\temp\\fake-claude.cjs", "--version"])
    assert.equal(command.shell, false)
    return
  }
  assert.equal(command.command, "C:\\temp\\fake-claude.cjs")
  assert.deepEqual(command.args, ["--version"])
})
