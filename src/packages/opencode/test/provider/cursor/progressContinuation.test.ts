import { describe, expect, test } from "bun:test"
import {
  isProgressOnlyAssistantText,
  shouldContinueProgressOnlyTurn,
  progressOnlyContinuationPrompt,
} from "../../../src/provider/cursor/protocol/progressContinuation.js"

describe("progress-only continuation", () => {
  test("predicate requires progress fragment, tools, no pending, no host tools, one attempt", () => {
    const base = {
      allowTools: true,
      advertisedToolCount: 1,
      assistantText: "Checking the workspace",
      emittedHostTools: 0,
      continuationAttempts: 0,
      pendingExecs: 0,
    }
    expect(shouldContinueProgressOnlyTurn(base)).toBe(true)
    expect(shouldContinueProgressOnlyTurn({ ...base, assistantText: "Hello world" })).toBe(false)
    expect(shouldContinueProgressOnlyTurn({ ...base, pendingExecs: 1 })).toBe(false)
    expect(shouldContinueProgressOnlyTurn({ ...base, emittedHostTools: 1 })).toBe(false)
    expect(shouldContinueProgressOnlyTurn({ ...base, continuationAttempts: 1 })).toBe(false)
    expect(shouldContinueProgressOnlyTurn({ ...base, allowTools: false })).toBe(false)
    expect(shouldContinueProgressOnlyTurn({ ...base, advertisedToolCount: 0 })).toBe(false)
  })

  test("progress fragment detection", () => {
    expect(isProgressOnlyAssistantText("Checking the workspace")).toBe(true)
    expect(isProgressOnlyAssistantText("Reviewing the codebase...")).toBe(true)
    expect(isProgressOnlyAssistantText("Checking is not needed")).toBe(false)
    expect(isProgressOnlyAssistantText("Looking at the code, the bug is fixed.")).toBe(false)
  })

  test("continuation prompt includes workspace grounding", () => {
    const p1 = progressOnlyContinuationPrompt("/work")
    expect(p1).toContain("/work")
    const p2 = progressOnlyContinuationPrompt()
    expect(p2.length).toBeGreaterThan(0)
  })

  test("exactly one attempt enforced", () => {
    const input = {
      allowTools: true,
      advertisedToolCount: 2,
      assistantText: "Inspecting the repo",
      emittedHostTools: 0,
      continuationAttempts: 0,
      pendingExecs: 0,
    }
    expect(shouldContinueProgressOnlyTurn(input)).toBe(true)
    expect(shouldContinueProgressOnlyTurn({ ...input, continuationAttempts: 1 })).toBe(false)
  })

  test("pending exec and tool-output suppression", () => {
    const withPending = {
      allowTools: true,
      advertisedToolCount: 1,
      assistantText: "Scanning the files",
      emittedHostTools: 0,
      continuationAttempts: 0,
      pendingExecs: 2,
    }
    expect(shouldContinueProgressOnlyTurn(withPending)).toBe(false)
    const withTool = {
      allowTools: true,
      advertisedToolCount: 1,
      assistantText: "Scanning the files",
      emittedHostTools: 1,
      continuationAttempts: 0,
      pendingExecs: 0,
    }
    expect(shouldContinueProgressOnlyTurn(withTool)).toBe(false)
  })
})
