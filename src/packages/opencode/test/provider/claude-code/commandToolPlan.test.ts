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
const ALL_NATIVE = ["bash", "edit", "write", "read", "glob", "grep", "webfetch", "todowrite", "skill", "websearch"]

test("ordinary turns carry no plan", () => {
  expect(commandToolPlan(user())).toBeUndefined()
})

test("an unrestricted active command forwards mode_switch through oc", () => {
  const plan = commandToolPlan(user({}))
  expect(plan).toBeDefined()
  if (!plan) throw new Error("expected an active-command tool plan")
  const split = splitCommandTools(plan, [{ name: "read" }, { name: "mode_switch" }])
  expect(split.forwarded).toContain("mode_switch")
  expect(split.kept).toContain("Read")
})

test("auto keeps Claude's own tools unless the command limits them", () => {
  expect(commandToolPlan(user(imp))).toEqual({ native: ALL_NATIVE, closed: false })
  expect(commandToolPlan(user(spit))).toEqual({
    native: ["bash", "read", "glob", "grep", "webfetch", "todowrite", "skill", "websearch"],
    closed: true,
  })
  expect(commandToolPlan(user({ bash: { "*": "allow", "git push *": "ask" } }))!.native).not.toContain("bash")
  expect(commandToolPlan(user({ "*": "ask" }))).toEqual({ native: ["websearch"], closed: false })
  // A limited external_directory is enforced by oc's file tools only.
  expect(commandToolPlan(user({ external_directory: "ask" }))!.native).toEqual([
    "bash",
    "webfetch",
    "todowrite",
    "skill",
    "websearch",
  ])
})

// The real imp command (2026-11-17): one carved-out deny proxied Edit and Write on every imp turn,
// so Claude hunted for an edit tool and fell back to editing through Python in Bash.
test("edit denials Claude can enforce keep its Edit and Write and reach it as deny rules", () => {
  const carved = { ...imp, edit: { "*": "allow", "/home/u/plans/mockups/**": "deny", "/home/u/x.md": "deny" } } as const
  expect(commandToolPlan(user(carved))).toEqual({
    native: ALL_NATIVE,
    closed: false,
    deny: ["Edit(//home/u/plans/mockups/**)", "Edit(//home/u/x.md)"],
  })
  // oc's `*` crosses `/`, so a trailing `/*` denies the whole tree.
  expect(commandToolPlan(user({ edit: { "*": "allow", "/a/*": "deny" } }))!.deny).toEqual(["Edit(//a/**)"])
  // Claude matches Windows paths in POSIX form; `~` expands to a backslash home on Windows.
  expect(
    commandToolPlan(user({ edit: { "*": "allow", "C:/a/**": "deny", "D:\\Users\\u/.config/x.md": "deny" } }))!.deny,
  ).toEqual(["Edit(//c/a/**)", "Edit(//d/Users/u/.config/x.md)"])

  // Only oc can enforce these: a later allow overrides the deny, relative or mid-path wildcards,
  // and `ask`.
  const cases: Record<string, "allow" | "ask" | "deny">[] = [
    { "*": "allow", "/a/**": "deny", "/a/b/**": "allow" },
    { "*": "allow", "plans/**": "deny" },
    { "*": "allow", "/a/*.md": "deny" },
    { "*": "allow", "/a/b c/**": "deny" },
    { "*": "allow", "/a/**": "ask" },
  ]
  for (const edit of cases) {
    const plan = commandToolPlan(user({ ...imp, edit }))!
    expect(plan.native).not.toContain("edit")
    expect(plan.native).not.toContain("write")
    expect(plan.deny).toBeUndefined()
  }
  // A limited external_directory still sends file tools through oc.
  expect(commandToolPlan(user({ ...carved, external_directory: "ask" }))!.native).not.toContain("edit")
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
  expect(split.kept).toEqual(["Bash", "PowerShell", "Monitor", "TaskStop", "Read"])
  expect(split.off).toContain("Glob")
  expect(split.off).toContain("Edit")
  expect(split.off).not.toContain("Bash")

  const ocShell = splitCommandTools({ native: [], closed: false }, offered)
  expect(ocShell.forwarded).toContain("bgStatus")
  expect(ocShell.kept).toEqual([])
  expect(ocShell.off).toContain("Monitor")
})

test("a closed command turn that allows skill keeps Claude's Skill", () => {
  const offered = ["read", "skill"].map((name) => ({ name }))
  const allowed = splitCommandTools(commandToolPlan(user({ ...spit, skill: "allow" }))!, offered)
  expect(allowed.kept).toContain("Skill")
  expect(allowed.forwarded).not.toContain("skill")

  // A skill pattern only oc can enforce: Skill off, oc's skill tool through the proxy.
  const limited = commandToolPlan(user({ ...spit, skill: { "*": "deny", "tui-mockup": "allow" } }))!
  expect(limited.native).not.toContain("skill")
  const proxied = splitCommandTools(limited, offered)
  expect(proxied.off).toContain("Skill")
  expect(proxied.forwarded).toContain("skill")

  // Denied: oc offers no skill tool, so Skill stays off.
  expect(splitCommandTools(commandToolPlan(user(spit))!, [{ name: "read" }]).off).toContain("Skill")
})

test("agent rules denying websearch turn Claude's WebSearch off", () => {
  const agent = (rules: Parameters<typeof Permission.fromConfig>[0]) =>
    ({ agent: { permission: Permission.fromConfig(rules) }, user: user() }) as Parameters<typeof harnessToolsDenied>[0]
  expect(harnessToolsDenied(agent({ websearch: "deny" }))).toEqual(["WebSearch"])
  expect(harnessToolsDenied(agent({ websearch: "allow" }))).toEqual([])
})
