import { expect, test } from "bun:test"
import { cleanupTargets } from "../../src/component/dialog-session-cleanup"

test("cleanup skips open, busy, pinned, and unreachable-workspace sessions", () => {
  const sessions = [
    { id: "keep" },
    { id: "open" },
    { id: "busy" },
    { id: "pinned" },
    { id: "remote", workspaceID: "ws-down" },
    { id: "remoteOk", workspaceID: "ws-up" },
  ]
  const result = cleanupTargets({
    sessions,
    openID: "open",
    isBusy: (id) => id === "busy",
    isPinned: (id) => id === "pinned",
    isUnreachable: (id) => id === "ws-down",
  })
  expect(result.map((session) => session.id)).toEqual(["keep", "remoteOk"])
})
