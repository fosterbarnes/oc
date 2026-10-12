import { expect, test } from "bun:test"
import { Permission } from "../src/permission"

test("session marks stay hidden under wildcard allow but explicit and command rules enable them", () => {
  const tools = ["session_complete", "session_failed", "bash"]
  const rules = Permission.fromConfig({ session_complete: "deny", session_failed: "deny", "*": "allow" })
  expect([...Permission.disabled(tools, rules)]).toEqual(["session_complete", "session_failed"])
  expect([
    ...Permission.disabled(tools, Permission.merge(rules, Permission.fromConfig({ session_complete: "allow" }))),
  ]).toEqual(["session_failed"])
  expect([...Permission.disabled(tools, rules, Permission.fromConfig({ "*": "allow" }))]).toEqual([
    "session_complete",
    "session_failed",
  ])
  expect([...Permission.disabled(tools, rules, Permission.fromConfig({ session_failed: "allow" }))]).toEqual([
    "session_complete",
  ])
  expect([...Permission.disabled(tools, rules, Permission.fromConfig({ session_complete: "deny" }))]).toEqual([
    "session_complete",
    "session_failed",
  ])
})

test("turn-level wildcard allow does not unhide session marks", () => {
  const tools = ["session_complete", "bash"]
  const wildcard = Permission.fromConfig({ "*": "allow" })
  expect([...Permission.disabled(tools, [], wildcard)]).toEqual(["session_complete"])
  expect([...Permission.disabled(tools, wildcard, wildcard)]).toEqual(["session_complete"])
})

test("session marks appear only when a turn allows them by name", () => {
  const tools = ["session_complete", "session_failed"]
  const turn = Permission.merge(
    Permission.fromConfig({ "*": "allow" }),
    Permission.fromConfig({ session_complete: "allow" }),
  )
  expect([...Permission.disabled(tools, [], turn)]).toEqual(["session_failed"])
})
