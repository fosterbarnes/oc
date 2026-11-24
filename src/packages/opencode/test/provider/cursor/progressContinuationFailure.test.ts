import { expect, test } from "bun:test"
import { CursorProviderError } from "../../../src/provider/cursor/errors.js"
import { CursorPump } from "../../../src/provider/cursor/pump.js"
import { type CursorSession } from "../../../src/provider/cursor/session.js"

test("failed progress continuation fails the turn instead of finishing as stop", async () => {
  const session = {
    sessionId: "continuation-fail",
    conversationId: "continuation-fail",
    stream: {
      write: () => {
        throw new Error("socket gone")
      },
      isClosed: () => false,
    },
    pending: new Map(),
    blobs: new Map(),
    allowTools: true,
    toolDescriptors: [{ name: "read" }],
    progressAssistantText: "Checking the workspace",
    requestContext: { workspace_paths: ["C:/project"] },
    usageEstimate: { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 },
  } as unknown as CursorSession
  const parts: { type: string }[] = []
  const controller = {
    enqueue: (part: { type: string }) => parts.push(part),
    error: () => {},
  } as unknown as ReadableStreamDefaultController
  const pump = new CursorPump(session, controller, { textId: "t", reasoningId: "r" })

  const result = pump["onTurnEnded"](new Uint8Array(), { turn_ended: {} })

  await expect(result).rejects.toBeInstanceOf(CursorProviderError)
  expect(parts.some((part) => part.type === "finish")).toBe(false)
  expect(session.closed).toBe(true)
  expect(session.closeError).toBeInstanceOf(CursorProviderError)
})
