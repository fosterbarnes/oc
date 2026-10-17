import { afterEach, describe, expect, test } from "bun:test"
import { CursorPump } from "../../../src/provider/cursor/pump.js"
import {
  conversationBlobCount,
  resetConversationBlobsForTests,
} from "../../../src/provider/cursor/protocol/blobStore.js"
import { getCheckpoint, resetCheckpointsForTests } from "../../../src/provider/cursor/protocol/checkpoint.js"
import { handleKvServerMessage } from "../../../src/provider/cursor/protocol/kv.js"
import { sessionManager, type CursorSession } from "../../../src/provider/cursor/session.js"

// Same fake shape as execReplies.test.ts; `openCodeSessionId` marks a Run bound to an oc session.
function makeSession(id: string, openCodeSessionId?: string) {
  return {
    sessionId: id,
    conversationId: id,
    openCodeSessionId,
    stream: { write: () => {}, isClosed: () => false },
    pending: new Map(),
    blobs: new Map(),
    toolDescriptors: [],
    requestContext: { workspace_paths: ["C:/project"] },
    usageEstimate: { inputTokens: 0 },
  } as unknown as CursorSession
}

const blobId = Uint8Array.from({ length: 32 }, (_, index) => (index === 0 ? 0xff : index))
const blobData = new TextEncoder().encode("blob")

afterEach(() => {
  resetConversationBlobsForTests()
  resetCheckpointsForTests()
})

describe("Cursor no-tool Runs store nothing process-wide", () => {
  test("blobs stay per Run unless the Run is bound to an oc session", () => {
    const unbound = makeSession("unbound")
    expect(
      handleKvServerMessage({ id: 1, set_blob_args: { blob_id: blobId, blob_data: blobData } }, unbound)?.kind,
    ).toBe("set")
    expect(unbound.blobs.size).toBe(1)
    expect(conversationBlobCount("unbound")).toBe(0)
    expect(handleKvServerMessage({ id: 2, get_blob_args: { blob_id: blobId } }, unbound)?.found).toBe(true)

    const bound = makeSession("bound", "ses_bound")
    handleKvServerMessage({ id: 1, set_blob_args: { blob_id: blobId, blob_data: blobData } }, bound)
    expect(conversationBlobCount("bound")).toBe(1)
  })

  test("checkpoints stay per Run unless the Run is bound to an oc session", () => {
    const checkpoint = Uint8Array.from([0x0a, 0x01, 0x61])
    const store = (session: CursorSession) => {
      const pump = new CursorPump(session, {} as ReadableStreamDefaultController, { textId: "t", reasoningId: "r" })
      pump["storeCheckpoint"](checkpoint)
      sessionManager.close(session)
    }

    const unbound = makeSession("unbound-checkpoint")
    store(unbound)
    expect(getCheckpoint("unbound-checkpoint")).toBeUndefined()
    expect(unbound.resumeCheckpoint).toEqual(checkpoint)

    const bound = makeSession("bound-checkpoint", "ses_bound_checkpoint")
    store(bound)
    expect(getCheckpoint("bound-checkpoint")).toEqual(checkpoint)
  })
})
