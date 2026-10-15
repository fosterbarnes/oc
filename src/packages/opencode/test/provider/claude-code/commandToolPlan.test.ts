import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import type { ConfigCommandV1 } from "@opencode-ai/core/v1/config/command"
import { Permission } from "@/permission"
import { commandToolPlan, harnessToolsDenied } from "@/session/llm/request"
import { splitCommandTools } from "@/provider/claude-code/proxyToolSelection"

// Rules as `command()` builds them from command frontmatter.
const user = (permission?: Parameters<typeof Permission.fromConfig>[0], toolHost?: ConfigCommandV1.ToolHost) =>
  ({
    id: "msg_1",
    sessionID: "ses_1",
    role: "user",
    time: { created: 0 },
    agent: "build",
    model: { providerID: "claude-code", modelID: "claude-opus-5-5" },
    ...(permission ? { permission: Permission.fromConfig(permission) } : {}),
    ...(toolHost ? { toolHost } : {}),
  }) as SessionV1.User

const spit = {
  "*": "deny",
  read: "allow",
  glob: "allow",
  grep: "allow",
  edit: { "*": "deny", "C:/plans/**/*.md": "allow" },
  external_directory: "allow",
  bash: "allow",
  webfetch: "allow",
  websearch: "allow",
} as const
const imp = { read: "allow", edit: "allow", bash: "allow", task: "allow" } as const
const ALL_NATIVE = ["bash", "edit", "write", "read", "glob", "grep", "webfetch", "todowrite", "websearch"]

test("ordinary turns carry no plan", () => {
  expect(commandToolPlan(user())).toBeUndefined()
})

test("auto keeps Claude's own tools unless the command limits them", () => {
  expect(commandToolPlan(user(imp))).toEqual({ native: ALL_NATIVE, closed: false })
  expect(commandToolPlan(user(spit))).toEqual({
    native: ["bash", "read", "glob", "grep", "webfetch", "todowrite", "websearch"],
    closed: true,
  })
  expect(commandToolPlan(user({ bash: { "*": "allow", "git push *": "ask" } }))!.native).not.toContain("bash")
  expect(commandToolPlan(user({ "*": "ask" }))).toEqual({ native: ["websearch"], closed: false })
  // A limited external_directory is enforced by oc's file tools only.
  expect(commandToolPlan(user({ external_directory: "ask" }))!.native).toEqual([
    "bash",
    "webfetch",
    "todowrite",
    "websearch",
  ])
})

test("WebSearch has no oc version, so the command's rules alone decide it", () => {
  const { websearch: _, ...noSearch } = spit
  expect(commandToolPlan(user(noSearch))!.native).not.toContain("websearch")
  expect(commandToolPlan(user({ websearch: "deny" }))!.native).not.toContain("websearch")
  expect(commandToolPlan(user(spit, { websearch: "oc" }))!.native).not.toContain("websearch")

  // Kept although oc offers no websearch tool; turned off when the plan drops it.
  const kept = splitCommandTools({ native: ["websearch"], closed: true }, [{ name: "read" }])
  expect(kept.kept).toEqual(["WebSearch"])
  expect(kept.off).not.toContain("WebSearch")
  expect(splitCommandTools({ native: [], closed: false }, [{ name: "read" }]).off).toContain("WebSearch")
})

test("toolHost forces oc or the harness per tool, with * as the default", () => {
  expect(commandToolPlan(user(spit, { edit: "harness", write: "harness" }))!.native).toContain("edit")
  expect(commandToolPlan(user(imp, { bash: "oc" }))!.native).not.toContain("bash")
  expect(commandToolPlan(user(undefined, { "*": "oc" }))).toEqual({ native: [], closed: true })
  expect(commandToolPlan(user(undefined, { "*": "oc", read: "harness" }))).toEqual({ native: ["read"], closed: true })
  expect(commandToolPlan(user(spit, { "*": "harness" }))!.native).toEqual(ALL_NATIVE)
})

test("the split never offers a tool both ways, and denied tools stay off", () => {
  const offered = ["bash", "bgStatus", "bgKill", "read", "edit", "write", "task", "session_read"].map((name) => ({
    name,
  }))
  const split = splitCommandTools({ native: ["bash", "read", "glob"], closed: true }, offered)
  expect(split.forwarded.toSorted()).toEqual(["edit", "session_read", "task", "write"])
  // glob is not offered (denied), so Claude's Glob stays off too.
  expect(split.kept).toEqual(["Bash", "PowerShell", "Read"])
  expect(split.off).toContain("Glob")
  expect(split.off).toContain("Edit")
  expect(split.off).not.toContain("Bash")

  const ocShell = splitCommandTools({ native: [], closed: false }, offered)
  expect(ocShell.forwarded).toContain("bgStatus")
  expect(ocShell.kept).toEqual([])
})

test("agent rules denying websearch turn Claude's WebSearch off", () => {
  const agent = (rules: Parameters<typeof Permission.fromConfig>[0]) =>
    ({ agent: { permission: Permission.fromConfig(rules) }, user: user() }) as Parameters<typeof harnessToolsDenied>[0]
  expect(harnessToolsDenied(agent({ websearch: "deny" }))).toEqual(["WebSearch"])
  expect(harnessToolsDenied(agent({ websearch: "allow" }))).toEqual([])
})
