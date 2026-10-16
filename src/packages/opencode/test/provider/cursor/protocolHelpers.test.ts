import { describe, expect, test } from "bun:test"
import {
  isProgressOnlyAssistantText,
  shouldContinueProgressOnlyTurn,
} from "@/provider/cursor/protocol/progressContinuation.js"
import { resolveVariantMaxMode } from "@/provider/cursor/models.js"
import { decodeMessage } from "@/provider/cursor/protocol/messages.js"
import { handleInteractionQuery } from "@/provider/cursor/protocol/interactions.js"
import { parseExecServerMessage } from "@/provider/cursor/protocol/execParse.js"

describe("Cursor protocol helpers", () => {
  test("keeps an explicit non-max variant ahead of a max-mode hint", () => {
    expect(
      resolveVariantMaxMode([{ id: "context", value: "200k" }], {
        picked: [{ id: "context", value: "200k" }],
        maxMode: true,
      }),
    ).toBe(false)
  })

  test("without a catalog match, the menu entry's flag decides max mode", () => {
    const base = [{ id: "context", value: "200k" }]
    const long = [{ id: "context", value: "1m" }]
    expect(resolveVariantMaxMode(base, { picked: base, entryMaxMode: false, maxMode: true })).toBe(false)
    expect(resolveVariantMaxMode(long, { picked: long, entryMaxMode: true, maxMode: false })).toBe(true)
    // Parameters alone never imply max mode.
    expect(resolveVariantMaxMode(long, { picked: long })).toBe(false)
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

  test("rejects an unknown interaction without throwing or failing the Run", () => {
    const handled = handleInteractionQuery({}, Uint8Array.of(0x3a, 0x05, 0x08, 0x09, 0xa2, 0x01, 0x00))
    expect(handled.outcome).toBe("rejected")
    expect(handled.id).toBe(9)
    expect(decodeMessage<Record<string, unknown>>("AgentClientMessage", handled.reply!).interaction_response).toEqual({
      id: 9,
    })
  })

  test("failed MCP argument decode is rejected before host tool execution", () => {
    const parsed = parseExecServerMessage({
      id: 3,
      exec_id: "4",
      mcp_args: { tool_name: "opencode-read", args: ["%%%"] },
    })
    expect(parsed).toMatchObject({
      resultField: "mcp_result",
      toolName: "opencode-read",
      localError: "Cursor MCP request arguments could not be decoded.",
    })
  })
})
