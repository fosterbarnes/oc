import { describe, expect, test } from "bun:test"
import { deliverContinuationResults } from "../../../src/provider/cursor/continuation.js"
import { CURSOR_IMAGE_SAVE_TOOL } from "../../../src/provider/cursor/protocol/generateImage.js"
import { IMAGE_PERMISSION_DENIED_PREFIX } from "../../../src/provider/cursor/imageSave.js"
import { decodeMessage } from "../../../src/provider/cursor/protocol/messages.js"
import { sessionManager, type CursorSession } from "../../../src/provider/cursor/session.js"

function makeSession(id: string) {
  const writes: Uint8Array[] = []
  const session = {
    sessionId: id,
    conversationId: id,
    stream: { write: (frame: Uint8Array) => writes.push(frame), isClosed: () => false },
    pending: new Map(),
    blobs: new Map(),
    requestContext: { workspace_paths: ["C:/project"] },
    usageEstimate: { inputTokens: 0 },
  } as unknown as CursorSession
  return { session, writes }
}

describe("Cursor exec reply closure", () => {
  test("image success and denied replies close the stream, ordinary replies close once", () => {
    const cases = [
      { id: "image-success", error: undefined },
      { id: "image-denied", error: `${IMAGE_PERMISSION_DENIED_PREFIX} no permission` },
      { id: "ordinary", error: undefined, toolName: "write", resultField: "write_result" },
    ]
    for (const [index, item] of cases.entries()) {
      const { session, writes } = makeSession(item.id)
      const execId = index + 1
      const toolName = item.toolName ?? CURSOR_IMAGE_SAVE_TOOL
      const resultField = item.resultField ?? "write_result"
      sessionManager.registerPending(execId, session, resultField, toolName, false, {
        path: "image.png",
        imageByteLength: 42,
      })
      expect(
        deliverContinuationResults(session, [
          {
            sessionId: item.id,
            execId,
            toolCallId: `cursor_${item.id}_${execId}`,
            toolName,
            output: "saved",
            ...(item.error ? { error: item.error } : {}),
          },
        ]),
      ).toBe(session)
      expect(writes).toHaveLength(2)
      const close = decodeMessage<Record<string, unknown>>("AgentClientMessage", writes[1]!)
      expect((close.exec_client_control_message as Record<string, unknown>).stream_close).toEqual({ id: execId })
      expect(
        writes.filter((frame) => {
          const message = decodeMessage<Record<string, unknown>>("AgentClientMessage", frame)
          return Boolean((message.exec_client_control_message as Record<string, unknown> | undefined)?.stream_close)
        }),
      ).toHaveLength(1)
      sessionManager.close(session)
    }
  })
})
