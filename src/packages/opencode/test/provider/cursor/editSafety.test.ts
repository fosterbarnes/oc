import { afterAll, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  buildCompleteEditReadMessages,
  remapCorrelatedEditWriteForCatalog,
} from "@/provider/cursor/protocol/editRemap.js"
import type { ParsedExecRequest } from "@/provider/cursor/protocol/execParse.js"
import { decodeMessage } from "@/provider/cursor/protocol/messages.js"

const root = mkdtempSync(path.join(tmpdir(), "cursorEditSafety-"))
afterAll(() => rmSync(root, { recursive: true, force: true }))

// Bun's os.homedir() reads HOME once at startup and ignores later changes to process.env, so the home
// directory is set where the real process gets it: in the environment of a fresh Bun process.
test("an edit read of ~/file resolves to the home file, not an empty workspace file", () => {
  const home = path.join(root, "home")
  const workspace = path.join(root, "workspace")
  for (const dir of [home, workspace]) mkdirSync(dir)
  // A name no real home has, so a HOME override that is ignored cannot pass by finding the user's own file.
  const name = `notes-${randomUUID()}.txt`
  writeFileSync(path.join(home, name), "keep me\n")
  const script = `
    const { recoverCorrelatedEditRead } = await import(${JSON.stringify(path.resolve(import.meta.dir, "../../../src/provider/cursor/execRecovery.ts"))})
    const workspace = ${JSON.stringify(workspace)}
    const writes = []
    const pump = {
      session: {
        requestContext: { env: { workspace_paths: [workspace] }, workspace_paths: [workspace] },
        displayToolCalls: new Map([["call1", { edit_tool_call: { args: { path: "~/${name}", stream_content: "" } } }]]),
        stream: { write: (frame) => writes.push(frame) },
      },
      advertisedToolNameSet: new Set(["write"]),
      safeError: () => {},
    }
    const parsed = { id: 7, resultField: "read_result", toolName: "read", args: { filePath: "~/${name}" }, resultMetadata: {} }
    const recovered = recoverCorrelatedEditRead(pump, parsed, "call1")
    console.log(JSON.stringify({ recovered, writes: writes.length, callId: parsed.resultMetadata?.correlatedEditCallId }))
  `
  const child = Bun.spawnSync([process.execPath, "-e", script], {
    cwd: path.resolve(import.meta.dir, "../../.."),
    env: { ...process.env, HOME: home, USERPROFILE: home },
  })
  expect(child.exitCode, child.stderr.toString()).toBe(0)
  // The home file is outside the workspace, so it must take the permission path, never an empty-file reply.
  expect(JSON.parse(child.stdout.toString().trim().split("\n").at(-1)!)).toEqual({
    recovered: false,
    writes: 0,
    callId: "call1",
  })
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
