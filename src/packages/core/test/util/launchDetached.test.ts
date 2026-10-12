import { describe, expect, test } from "bun:test"
import { detachedCommand, windowsArguments } from "@opencode-ai/core/util/launchDetached"

describe("detachedCommand ps1", () => {
  test("routes every start token through windowsArguments", () => {
    const file = "C:\\tools\\revive test.ps1"
    const args = ['a"b', "c&d", "trailing\\"]
    const command = detachedCommand(file, args)
    expect(command.file).toBe("cmd.exe")
    expect(command.args[2]).toBe(`start "revive test" pwsh -NoProfile -File ${windowsArguments([file, ...args])}`)
    expect(command.args[2]).toContain('"a\\"b"')
  })
})
