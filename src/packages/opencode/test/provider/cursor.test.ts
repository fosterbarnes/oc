import { describe, expect, test } from "bun:test"
import { createCursor } from "@/provider/cursor"
import { resolveAgentOrigin } from "@/provider/cursor/transport/connect"
import { mapCursorArgsToOpencode } from "@/provider/cursor/protocol/execParse"
import { PLAN_ENTER_DISABLED_REASON, resolveSwitchModeBridge } from "@/provider/cursor/protocol/switchMode"
import { pumpWithRecovery } from "@/provider/cursor/languageModel"
import { buildOpenCodeInteractionGuidance } from "@/provider/cursor/prompt"
import { connectFrameError } from "@/provider/cursor/retry"
import {
  isCursorCompactionTurn,
  resetTurnStateForTests,
  resolveTurnConversationReset,
} from "@/provider/cursor/turnState"
import { CURSOR_COMPACTION_OPTION } from "@/provider/cursor/shared"
import { applyCursorCompactionOption } from "@/session/llm/request"
import { resolveCreatePlanBridge } from "@/provider/cursor/protocol/createPlan"
import { parseDisplayToolCall, resolveBridgedOpenCodeToolCall } from "@/provider/cursor/protocol/toolCallBridge"
import { sessionManager, type CursorSession, type Frame } from "@/provider/cursor/session"

test("aborting a continuation stops its waiting frame pump and closes the Run once", async () => {
  const abort = new AbortController()
  const ready = Promise.withResolvers<void>()
  const frames = new ReadableStream<Frame>()
  const reader = frames.getReader()
  let destroyed = 0
  let recovered = 0
  const session: CursorSession = {
    sessionId: crypto.randomUUID(),
    conversationId: crypto.randomUUID(),
    stream: {
      write() {},
      end() {},
      async *frames() {},
      destroy() {
        destroyed++
        void reader.cancel()
      },
      isClosed: () => destroyed > 0,
      onTerminal: () => () => {},
    },
    frames: {
      async next() {
        ready.resolve()
        const result = await reader.read()
        return result.done ? { done: true, value: undefined } : { done: false, value: result.value }
      },
    },
    pending: new Map(),
    displayToolCalls: new Map(),
    nextBridgedExecId: 900_000,
    blobs: new Map(),
    toolDescriptors: [],
    requestContext: {},
    allowTools: true,
    usageEstimate: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, reasoningTokens: 0 },
    pumpActive: false,
    pumpOwner: null,
    heartbeat: null,
    heartbeatCancel: null,
    hardDeadlineTimer: null,
    semanticDeadlineCancel: null,
    terminalUnsubscribe: null,
    deferredTerminalReason: null,
    policy: { semanticIdleMs: 120_000, hardCapMs: 600_000, heartbeatMs: 5_000 },
    createdAt: Date.now(),
    lastInboundAt: Date.now(),
    lastHeartbeatWriteAt: Date.now(),
    semanticDeadlineAt: Date.now() + 120_000,
    closeError: null,
    closed: false,
  }
  sessionManager.registerPending(1, session, "read_result", "read")
  const claim = sessionManager.claim(session.sessionId, 1)
  if ("kind" in claim) throw new Error("expected a pending continuation")
  expect(sessionManager.deliverClaim(claim, [new Uint8Array([1])]).kind).toBe("delivered")
  const output = new ReadableStream({
    async start(controller) {
      await pumpWithRecovery({
        initialSession: session,
        controller,
        abortSignal: abort.signal,
        recover: async () => {
          recovered++
          throw new Error("aborted continuations must not recover")
        },
      })
      controller.close()
    },
  })
  try {
    await ready.promise
    abort.abort()
    expect(await output.getReader().read()).toEqual({ done: true, value: undefined })
    expect(session.closed).toBe(true)
    expect(session.semanticDeadlineCancel).toBeNull()
    expect(destroyed).toBe(1)
    expect(recovered).toBe(0)
  } finally {
    sessionManager.close(session)
  }
})

describe("native Cursor provider", () => {
  test("todo display updates require an advertised todo capability", () => {
    for (const variant of ["update_todos_tool_call", "create_plan_tool_call"]) {
      const display = parseDisplayToolCall("call_todo", {
        [variant]: { args: { todos: [{ id: "1", content: "Check gating", status: "pending" }] } },
      })
      expect(display).toBeDefined()
      if (!display) throw new Error("todo display call did not parse")
      expect(resolveBridgedOpenCodeToolCall(display, ["read", "task"])).toBeUndefined()
      expect(resolveBridgedOpenCodeToolCall(display, ["todowrite"])).toMatchObject({
        toolName: "todowrite",
        args: { todos: [expect.objectContaining({ content: "Check gating" })] },
      })
    }
  })

  test("includes the server reason in Connect errors", () => {
    expect(
      connectFrameError('{"error":{"code":"resource_exhausted","message":"Account limit reached"}}').message,
    ).toContain("Cursor API error (code=resource_exhausted): Account limit reached")
  })

  test("creates a language model without starting the proxy", () => {
    const sdk = createCursor({ name: "cursor", accessToken: "token" })
    expect(sdk.languageModel("gpt-4o").provider).toBe("cursor")
  })

  test("accepts only Cursor agent origins", () => {
    expect(resolveAgentOrigin("https://agentn.us.api5.cursor.sh")).toBe("https://agentn.us.api5.cursor.sh")
    expect(() => resolveAgentOrigin("https://example.com")).toThrow()
  })

  test("maps native delete to the host shell", () => {
    const mapped = mapCursorArgsToOpencode("bash", { path: "C:\\temp\\file.txt" }, "delete_args")
    expect(mapped.toolName).toBe("bash")
    expect(mapped.args.command).toContain(process.platform === "win32" ? "Remove-Item -LiteralPath" : "rm -f --")
  })
})

describe("Cursor SwitchMode plan enter is disabled", () => {
  const advertised = ["bash", "read", "plan_enter", "plan_exit", "question"]

  test("rejects plan and spec even when plan_enter is advertised", () => {
    for (const target of ["plan", "spec", "PLAN"]) {
      const bridge = resolveSwitchModeBridge(target, { allowTools: true, advertised })
      expect(bridge).toEqual({ kind: "reject", reason: PLAN_ENTER_DISABLED_REASON })
    }
  })

  test("rejects plan enter on lifecycle turns instead of soft-acking", () => {
    const bridge = resolveSwitchModeBridge("plan", { allowTools: false, advertised: [] })
    expect(bridge).toEqual({ kind: "reject", reason: PLAN_ENTER_DISABLED_REASON })
  })

  test("still leaves plan via plan_exit or question", () => {
    expect(resolveSwitchModeBridge("agent", { allowTools: true, advertised: ["plan_exit"] })).toEqual({
      kind: "native",
      toolName: "plan_exit",
    })
    expect(resolveSwitchModeBridge("build", { allowTools: true, advertised: ["question"] }).kind).toBe("question")
  })

  test("rejects plan enter even when the session is already in plan", () => {
    expect(resolveSwitchModeBridge("plan", { allowTools: true, advertised, activeModeId: "plan" })).toEqual({
      kind: "reject",
      reason: PLAN_ENTER_DISABLED_REASON,
    })
  })
})

describe("Cursor CreatePlan is disabled", () => {
  test("acknowledges plan requests without staging or approval", () => {
    expect(
      resolveCreatePlanBridge({
        allowTools: true,
        canStage: true,
        planModeActive: true,
        advertised: ["cursor_plan_stage", "question"],
      }),
    ).toEqual({ kind: "ack" })
  })
})

describe("Cursor host-identity guidance", () => {
  test("states OpenCode host vs Cursor provider before the tool list", () => {
    const text = buildOpenCodeInteractionGuidance([{ name: "bash" }, { name: "read" }], false, "C:\\work")
    expect(text).toContain("You are in OpenCode. You are not in Cursor IDE.")
    expect(text).toContain("Cursor is only the model provider for this turn.")
    expect(text).toContain("A child task is a new OpenCode session, never a Cursor IDE session.")
    expect(text).toContain("never raises those Cursor interactions")
    expect(text).toContain("Do not decide it from the model name or from tool-namespace labels.")
    expect(text!.indexOf("You are in OpenCode.")).toBeLessThan(
      text!.indexOf("OpenCode exposes exactly these executable tools"),
    )
  })

  test("keeps the host preamble when the catalog is empty", () => {
    const text = buildOpenCodeInteractionGuidance([], false, "C:\\work")
    expect(text).toContain("You are in OpenCode. You are not in Cursor IDE.")
    expect(text).not.toContain("OpenCode exposes exactly these executable tools")
    expect(text).not.toContain("Cursor-native CreatePlan")
  })

  test("omits host guidance on compaction turns", () => {
    expect(buildOpenCodeInteractionGuidance([{ name: "bash" }], true, "C:\\work")).toBeUndefined()
    expect(buildOpenCodeInteractionGuidance([], true, "C:\\work")).toBeUndefined()
  })

  test("bans Cursor plan SwitchMode and does not invite plan_enter", () => {
    const text = buildOpenCodeInteractionGuidance(
      [{ name: "bash" }, { name: "read" }, { name: "plan_enter" }, { name: "plan_exit" }],
      false,
      "C:\\work",
    )
    expect(text).toContain("Do not SwitchMode to Cursor plan or spec")
    expect(text).not.toContain("SwitchMode requests for plan/spec are also accepted")
    expect(text).toContain("GetDynamicTools")
  })

  test("does not tell ordinary turns they may be stuck in Cursor plan mode", () => {
    const text = buildOpenCodeInteractionGuidance([{ name: "bash" }, { name: "read" }], false, "C:\\work")
    expect(text).toContain("Do not SwitchMode to Cursor plan or spec")
    expect(text).not.toContain("already stuck in Cursor plan mode")
    expect(text).not.toContain("To leave Cursor plan mode")
  })
})

describe("Cursor compaction reset and rebase", () => {
  test("isCursorCompactionTurn reads nested or flat flags only", () => {
    expect(isCursorCompactionTurn({ cursor: { [CURSOR_COMPACTION_OPTION]: true } })).toBe(true)
    expect(isCursorCompactionTurn({ [CURSOR_COMPACTION_OPTION]: true })).toBe(true)
    expect(isCursorCompactionTurn({})).toBe(false)
    expect(isCursorCompactionTurn(undefined)).toBe(false)
    expect(isCursorCompactionTurn({ cursor: { [CURSOR_COMPACTION_OPTION]: false } })).toBe(false)
  })

  test("applyCursorCompactionOption is cursor compaction only", () => {
    expect(applyCursorCompactionOption({}, { providerID: "cursor", agentName: "compaction" })).toEqual({
      [CURSOR_COMPACTION_OPTION]: true,
    })
    expect(applyCursorCompactionOption({}, { providerID: "cursor", agentName: "title" })).toEqual({})
    expect(applyCursorCompactionOption({}, { providerID: "cursor", agentName: "build" })).toEqual({})
    expect(applyCursorCompactionOption({}, { providerID: "openai", agentName: "compaction" })).toEqual({})
  })

  test("compaction remints then rebases once", () => {
    resetTurnStateForTests()
    const sessionKey = "ses_compaction_reset"
    expect(resolveTurnConversationReset({ sessionKey, isCompaction: true, allowTools: false })).toEqual({
      reset: true,
      reason: "compaction",
    })
    expect(resolveTurnConversationReset({ sessionKey, isCompaction: false, allowTools: true })).toEqual({
      reset: true,
      reason: "post-compaction-rebase",
    })
    expect(resolveTurnConversationReset({ sessionKey, isCompaction: false, allowTools: true })).toEqual({
      reset: false,
    })
  })

  test("no-tool turns after compaction do not spend the rebase token", () => {
    resetTurnStateForTests()
    const sessionKey = "ses_compaction_lifecycle"
    expect(resolveTurnConversationReset({ sessionKey, isCompaction: true, allowTools: false })).toEqual({
      reset: true,
      reason: "compaction",
    })
    expect(resolveTurnConversationReset({ sessionKey, isCompaction: false, allowTools: false })).toEqual({
      reset: false,
    })
    expect(resolveTurnConversationReset({ sessionKey, isCompaction: false, allowTools: true })).toEqual({
      reset: true,
      reason: "post-compaction-rebase",
    })
  })

  test("a new host compaction boundary rebases once when another model compacted", () => {
    resetTurnStateForTests()
    const sessionKey = "ses_compaction_boundary"
    const turn = (boundary?: string) =>
      resolveTurnConversationReset({ sessionKey, isCompaction: false, allowTools: true, boundary })
    expect(turn()).toEqual({ reset: false })
    expect(turn("msg_a")).toEqual({ reset: true, reason: "post-compaction-rebase" })
    expect(turn("msg_a")).toEqual({ reset: false })
    expect(turn("msg_b")).toEqual({ reset: true, reason: "post-compaction-rebase" })
  })
})
