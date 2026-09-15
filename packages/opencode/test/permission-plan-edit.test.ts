import { expect, test } from "bun:test"
import os from "os"
import path from "path"
import { Permission } from "../src/permission"

test("home-config plan globs match worktree-relative and absolute Windows writes", () => {
  const ruleset = Permission.fromConfig({
    edit: {
      "*": "deny",
      "*.config/opencode/plans/*.md": "allow",
      "~/.config/opencode/plans/*.md": "allow",
    },
  })

  const abs = path.join(os.homedir(), ".config", "opencode", "plans", "2026-09-14-example.md")
  const archive = path.join(os.homedir(), ".config", "opencode", "plans", "archive", "2026-09-14-example.md")
  const worktree = path.join(os.homedir(), "Documents", "GitHub", "oc")
  const relative = path.relative(worktree, abs)

  expect(Permission.evaluate("edit", abs, ruleset).action).toBe("allow")
  expect(Permission.evaluate("edit", archive, ruleset).action).toBe("allow")
  expect(Permission.evaluate("edit", relative.replaceAll("\\", "/"), ruleset).action).toBe("allow")
  expect(Permission.evaluate("edit", "src/index.ts", ruleset).action).toBe("deny")
})

test("old SuperPlan glob requiring ../ denies absolute plan paths", () => {
  const ruleset = Permission.fromConfig({
    edit: {
      "*": "deny",
      "*../.config/opencode/plans/*.md": "allow",
    },
  })

  const abs = path.join(os.homedir(), ".config", "opencode", "plans", "foo.md")
  expect(Permission.evaluate("edit", abs, ruleset).action).toBe("deny")
})
