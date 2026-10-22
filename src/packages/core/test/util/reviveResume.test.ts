import { afterEach, beforeEach, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { ReviveResume } from "@opencode-ai/core/util/reviveResume"

let dir = ""
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-revive-resume-"))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const body = (at: number, writerPid = 1): ReviveResume.Body => ({
  sessionID: "ses_a",
  writerPid,
  at,
  steps: [{ type: "send", names: ["agent-push"] }],
  done: ["/pass", "/revive"],
  request: "push",
  agent: "build",
  model: { providerID: "anthropic", modelID: "claude" },
})

test("only a settled chain is claimed, once, and settling twice keeps the first state", async () => {
  const now = Date.now()
  const id = await ReviveResume.write(body(now), dir)
  expect(await ReviveResume.claim("ses_a", 2, now, dir)).toBeUndefined()
  await ReviveResume.settle(id, "ready", dir)
  await ReviveResume.settle(id, "failed", dir)
  expect(await ReviveResume.status(id, dir)).toBe("ready")
  expect(await ReviveResume.claim("ses_b", 2, now, dir)).toBeUndefined()
  const [first, second] = await Promise.all([
    ReviveResume.claim("ses_a", 2, now, dir),
    ReviveResume.claim("ses_a", 3, now, dir),
  ])
  expect([first, second].filter(Boolean)).toEqual([{ body: body(now), send: true }])
  expect(await ReviveResume.status(id, dir)).toBeUndefined()
})

test("the writer skips its own ready chain but claims its failed one", async () => {
  const now = Date.now()
  const ready = await ReviveResume.write(body(now), dir)
  await ReviveResume.settle(ready, "ready", dir)
  expect(await ReviveResume.claim("ses_a", 1, now, dir)).toBeUndefined()
  await fs.rm(path.join(dir, `${ready}.ready.json`))
  const failed = await ReviveResume.write(body(now + 1), dir)
  await ReviveResume.settle(failed, "failed", dir)
  expect(await ReviveResume.claim("ses_a", 1, now, dir)).toEqual({ body: body(now + 1), send: false })
})

test("an expired ready chain is restored instead of sent, and stale pending files are removed", async () => {
  const at = Date.now() - ReviveResume.READY_TTL_MS - 1
  const id = await ReviveResume.write(body(at), dir)
  await ReviveResume.settle(id, "ready", dir)
  expect(await ReviveResume.claim("ses_a", 2, Date.now(), dir)).toEqual({ body: body(at), send: false })
  const stale = await ReviveResume.write(body(Date.now() - 2 * 24 * 60 * 60_000), dir)
  await ReviveResume.claim("ses_a", 2, Date.now(), dir)
  expect(await ReviveResume.status(stale, dir)).toBeUndefined()
})
