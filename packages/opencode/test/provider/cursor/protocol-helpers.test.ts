import { describe, expect, test } from "bun:test"
import {
  isProgressOnlyAssistantText,
  shouldContinueProgressOnlyTurn,
} from "@/provider/cursor/protocol/progress-continuation.js"
import { resolveVariantMaxMode } from "@/provider/cursor/models.js"

describe("Cursor protocol helpers", () => {
  test("keeps an explicit non-max variant ahead of a max-mode hint", () => {
    expect(
      resolveVariantMaxMode([{ id: "context", value: "200k" }], {
        picked: [{ id: "context", value: "200k" }],
        maxMode: true,
      }),
    ).toBe(false)
    expect(
      resolveVariantMaxMode([{ id: "context", value: "1m" }], {
        picked: [{ id: "context", value: "1m" }],
        maxMode: false,
      }),
    ).toBe(true)
  })

  test("recognizes only short progress fragments", () => {
    expect(isProgressOnlyAssistantText("Checking the workspace")).toBe(true)
    expect(isProgressOnlyAssistantText("Checking the workspace.")).toBe(false)
    expect(isProgressOnlyAssistantText("Checking the workspace, then I will answer")).toBe(false)
    expect(isProgressOnlyAssistantText("The answer is in the workspace")).toBe(false)
  })

  test("allows one continuation only when no tool work was emitted", () => {
    const base = {
      allowTools: true,
      advertisedToolCount: 1,
      assistantText: "Inspecting the repository",
      emittedHostTools: 0,
      continuationAttempts: 0,
      pendingExecs: 0,
    }
    expect(shouldContinueProgressOnlyTurn({ ...base, continuationAttempts: 0 })).toBe(true)
    expect(shouldContinueProgressOnlyTurn({ ...base, continuationAttempts: 1 })).toBe(false)
    expect(shouldContinueProgressOnlyTurn({ ...base, pendingExecs: 1 })).toBe(false)
  })
})
