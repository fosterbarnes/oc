import { afterAll, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { recoverCorrelatedEditRead } from "@/provider/cursor/execRecovery.js"
import {
  buildCompleteEditReadMessages,
  remapCorrelatedEditWriteForCatalog,
} from "@/provider/cursor/protocol/editRemap.js"
import type { ParsedExecRequest } from "@/provider/cursor/protocol/execParse.js"
import { decodeMessage } from "@/provider/cursor/protocol/messages.js"
import type { CursorPump } from "@/provider/cursor/pump.js"

const root = mkdtempSync(path.join(tmpdir(), "cursorEditSafety-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

test("an edit read of ~/file resolves to the home file, not an empty workspace file", () => {
  const home = path.join(root, "home")
  const workspace = path.join(root, "workspace")
  for (const dir of [home, workspace]) mkdirSync(dir)
  writeFileSync(path.join(home, "notes.txt"), "keep me\n")
  const saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
  process.env.HOME = home
  process.env.USERPROFILE = home
  try {
    const writes: Uint8Array[] = []
    const pump = {
      session: {
        requestContext: { env: { workspace_paths: [workspace] }, workspace_paths: [workspace] },
        displayToolCalls: new Map([
          ["call1", { edit_tool_call: { args: { path: "~/notes.txt", stream_content: "" } } }],
        ]),
        stream: { write: (frame: Uint8Array) => writes.push(frame) },
      },
      advertisedToolNameSet: new Set(["write"]),
      safeError: () => {},
    } as unknown as CursorPump
    const parsed = {
      id: 7,
      resultField: "read_result",
      toolName: "read",
      args: { filePath: "~/notes.txt" },
      resultMetadata: {},
    } as unknown as ParsedExecRequest
    // The home file is outside the workspace, so it must take the permission path, never an empty-file reply.
    expect(recoverCorrelatedEditRead(pump, parsed, "call1")).toBe(false)
    expect(writes).toHaveLength(0)
    expect(parsed.resultMetadata?.correlatedEditCallId).toBe("call1")
  } finally {
    process.env.HOME = saved.HOME
    process.env.USERPROFILE = saved.USERPROFILE
  }
})

test("a non-UTF-8 file is refused instead of handed to Cursor with U+FFFD", () => {
  const file = path.join(root, "latin1.txt")
  writeFileSync(file, Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]))
  const frames = buildCompleteEditReadMessages(3, file, "latin1.txt")
  const message = decodeMessage<Record<string, unknown>>("AgentClientMessage", frames![0]!)
  const read = (message.exec_client_message as Record<string, Record<string, unknown>>).read_result!
  expect(read.success).toBeUndefined()
  expect(read.invalid_file).toBeDefined()

  const parsed = {
    id: 4,
    resultField: "write_result",
    toolName: "write",
    args: { filePath: "latin1.txt", content: "café\n" },
    resultMetadata: {},
  } as unknown as ParsedExecRequest
  expect(remapCorrelatedEditWriteForCatalog(parsed, ["edit"], "latin1.txt", root)).toBe(false)
  expect(readFileSync(file)).toEqual(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]))
})
