import assert from "node:assert/strict"
import { test } from "node:test"
import { cliCommand } from "@/provider/claude-code/cliExecutable.js"
import { tmpdir } from "../../fixture/fixture"
import path from "node:path"
import { mkdir } from "node:fs/promises"

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

test("Windows owns the native process behind the stock npm shim and preserves custom wrappers", async () => {
  if (process.platform !== "win32") return
  await using tmp = await tmpdir()
  const native = path.join(tmp.path, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
  await mkdir(path.dirname(native), { recursive: true })
  await Bun.write(native, "test executable")
  const shim = path.join(tmp.path, "claude.cmd")
  await Bun.write(shim, ["@ECHO off", "GOTO start", ":find_dp0", "SET dp0=%~dp0", "EXIT /b",
    ":start", "SETLOCAL", "CALL :find_dp0",
    '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*', ""].join("\r\n"))
  assert.deepEqual(cliCommand(shim, ["--print"]), { command: native, args: ["--print"], shell: false })
  await Bun.write(shim, '@echo off\r\necho custom setup\r\n"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe" %*\r\n')
  assert.deepEqual(cliCommand(shim, ["--print"]), { command: shim, args: ["--print"], shell: true })
})
