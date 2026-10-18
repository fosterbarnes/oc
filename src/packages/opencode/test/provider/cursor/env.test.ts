import { afterEach, expect, test } from "bun:test"
import { Shell } from "@opencode-ai/core/shell"
import { buildEnv } from "../../../src/provider/cursor/context/env.js"
import { setCursorShellPath } from "../../../src/provider/cursor/shellTimeout.js"

afterEach(() => setCursorShellPath(undefined))

// The plugin's config hook passes oc's `shell` setting; Cursor must be told the shell the `bash` tool runs.
test("RequestContext env reports the shell oc's bash tool runs", () => {
  setCursorShellPath("pwsh")
  const shell = buildEnv(process.cwd()).shell
  expect(shell).toBe(Shell.acceptable("pwsh"))
  if (process.platform === "win32") expect(Shell.name(String(shell))).toBe("pwsh")
})
