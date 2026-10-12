import { describe, expect, test } from "bun:test"
import { createMessageTypes, decodeMessage, encodeMessage } from "@/provider/cursor/protocol/messages.js"
import { buildListMcpResourcesFallback, buildReadMcpResourceFallback } from "@/provider/cursor/protocol/tools.js"

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function freshRoot() {
  return createMessageTypes()
}

describe("Cursor protocol wire: deferred variants", () => {
  test("encodes and decodes shell_args at ExecServerMessage field 2", () => {
    const root = freshRoot()
    const ExecServerMessage = root.lookupType("ExecServerMessage")
    const msg = {
      id: 7,
      exec_id: "exec-1",
      shell_args: { command: "echo hi", working_directory: "/tmp", timeout: 10, tool_call_id: "tc1" },
    }
    const bytes = ExecServerMessage.encode(ExecServerMessage.fromObject(msg)).finish()
    const decoded = ExecServerMessage.toObject(ExecServerMessage.decode(bytes), { defaults: true }) as Record<
      string,
      unknown
    >
    expect(decoded.id).toBe(7)
    expect((decoded.shell_args as Record<string, unknown>).command).toBe("echo hi")
    expect((decoded.shell_args as Record<string, unknown>).working_directory).toBe("/tmp")
    // field 2 is length-delimited shell_args; hex should contain tag 0x12 (field 2, wire 2)
    expect(hex(bytes).includes("12")).toBe(true)
    // round-trip through shared singleton helpers
    const viaHelper = encodeMessage("ExecServerMessage", msg)
    const back = decodeMessage<Record<string, unknown>>("ExecServerMessage", viaHelper)
    expect((back.shell_args as Record<string, unknown>).command).toBe("echo hi")
  })

  test("encodes and decodes every ShellResult oneof branch at ExecClientMessage field 2", () => {
    const cases: Array<{ branch: string; payload: Record<string, unknown> }> = [
      {
        branch: "success",
        payload: {
          success: {
            command: "echo hi",
            working_directory: "/tmp",
            exit_code: 0,
            signal: "",
            stdout: "hi",
            stderr: "",
            execution_time: 12,
            shell_id: 1,
            interleaved_output: "hi",
            pid: 123,
            ms_to_wait: 0,
            local_execution_time_ms: 11,
            background_reason: 0,
            output_head: "hi",
            output_tail: "hi",
            elided_chars: 0,
          },
        },
      },
      {
        branch: "failure",
        payload: {
          failure: {
            command: "false",
            working_directory: "/tmp",
            exit_code: 1,
            signal: "",
            stdout: "",
            stderr: "err",
            execution_time: 5,
            interleaved_output: "err",
            abort_reason: 0,
            aborted: false,
            local_execution_time_ms: 5,
            output_head: "",
            output_tail: "err",
            elided_chars: 0,
          },
        },
      },
      { branch: "timeout", payload: { timeout: { command: "sleep 10", working_directory: "/tmp", timeout_ms: 1000 } } },
      {
        branch: "rejected",
        payload: { rejected: { command: "rm -rf /", working_directory: "/tmp", reason: "blocked", is_readonly: true } },
      },
      {
        branch: "spawn_error",
        payload: { spawn_error: { command: "nope", working_directory: "/tmp", error: "ENOENT" } },
      },
      {
        branch: "permission_denied",
        payload: {
          permission_denied: { command: "echo hi", working_directory: "/tmp", error: "denied", is_readonly: true },
        },
      },
    ]
    for (const { branch, payload } of cases) {
      const wrapper = {
        id: 9,
        exec_id: "exec-2",
        shell_result: payload,
      }
      const bytes = encodeMessage("ExecClientMessage", wrapper)
      const decoded = decodeMessage<Record<string, Record<string, unknown>>>("ExecClientMessage", bytes)
      expect(decoded.shell_result).toBeDefined()
      const inner = decoded.shell_result as Record<string, unknown>
      expect(inner[branch]).toBeDefined()
      // tag for field 2 (shell_result) is 0x12
      expect(hex(bytes).slice(0, 4).includes("12") || hex(bytes).includes("12")).toBe(true)
    }
  })

  test("encodes and decodes git_diff_request at ExecServerMessage field 44", () => {
    const payload = {
      id: 11,
      exec_id: "exec-3",
      git_diff_request: {
        cwd: "/repo",
        ref: "HEAD",
        base_ref: "main",
        merge_base: false,
        target_paths: ["src/a.ts"],
        unified_context_lines: 3,
        max_untracked_files: 10,
        output_format: 3,
        submodule_recurse_depth: 1,
        include_space_changes: false,
        committed_only: false,
        compute_patch_id: false,
        return_head_sha: true,
        max_response_bytes: 1024,
      },
    }
    const bytes = encodeMessage("ExecServerMessage", payload)
    const decoded = decodeMessage<Record<string, Record<string, unknown>>>("ExecServerMessage", bytes)
    const req = decoded.git_diff_request as Record<string, unknown>
    expect(req.cwd).toBe("/repo")
    expect(req.ref).toBe("HEAD")
    expect(req.base_ref).toBe("main")
    expect(req.output_format).toBe(3)
    expect(req.return_head_sha).toBe(true)
    // field 44 tag is (44<<3|2)=0xE2 0x02 varint: bytes  e2 02
    expect(hex(bytes).includes("e202")).toBe(true)
  })

  test("encodes and decodes git_diff_response at ExecClientMessage field 44 with nested chunks", () => {
    const payload = {
      id: 12,
      exec_id: "exec-4",
      git_diff_response: {
        diff: {
          diffs: [
            {
              from: "a.txt",
              to: "b.txt",
              chunks: [{ content: "@@ -1 +1 @@", old_start: 1, old_lines: 1, new_start: 1, new_lines: 1 }],
              added: 1,
              removed: 1,
              before_file_contents: "old",
              after_file_contents: "new",
              is_generated: false,
            },
          ],
          diff_type: 1,
        },
        submodule_diffs: [{ relative_path: "sub", diff: { diffs: [], diff_type: 0 }, errored: false }],
        patch_id: "abc",
        head_sha: "deadbeef",
        has_uncommitted_changes: true,
      },
    }
    const bytes = encodeMessage("ExecClientMessage", payload)
    const decoded = decodeMessage<Record<string, Record<string, unknown>>>("ExecClientMessage", bytes)
    const resp = decoded.git_diff_response as Record<string, unknown>
    expect(resp.patch_id).toBe("abc")
    expect(resp.head_sha).toBe("deadbeef")
    expect(resp.has_uncommitted_changes).toBe(true)
    const diff = resp.diff as Record<string, unknown>
    const fileDiffs = diff.diffs as Array<Record<string, unknown>>
    expect(fileDiffs.length).toBe(1)
    expect(fileDiffs[0].from).toBe("a.txt")
    expect(diff.diff_type).toBe(1)
    expect(hex(bytes).includes("e202")).toBe(true)
  })

  test("nests git_diff_response inside AgentClientMessage.exec_client_message field 2, not top-level 44", () => {
    const execClient = {
      id: 42,
      exec_id: "exec-nested",
      git_diff_response: {
        diff: { diffs: [], diff_type: 0 },
        submodule_diffs: [],
        patch_id: "p1",
        head_sha: "h1",
        has_uncommitted_changes: false,
      },
    }
    const outer = {
      exec_client_message: execClient,
    }
    const bytes = encodeMessage("AgentClientMessage", outer)
    const decoded = decodeMessage<Record<string, Record<string, unknown>>>("AgentClientMessage", bytes)
    expect(decoded.exec_client_message).toBeDefined()
    const inner = decoded.exec_client_message as Record<string, unknown>
    expect((inner.git_diff_response as Record<string, unknown>).patch_id).toBe("p1")
    // top-level field 44 must not appear on AgentClientMessage; its field 2 is exec_client_message (tag 0x12)
    const h = hex(bytes)
    // AgentClientMessage field 2 tag is 0x12; field 44 tag e2 02 should only appear inside the nested bytes
    expect(h.startsWith("12")).toBe(true)
    // decode ensures the git diff was not stored as a separate top-level field
    expect((decoded as Record<string, unknown>).git_diff_response).toBeUndefined()

    // Deterministic round-trip: decode inner again and compare structure
    const rebytes = encodeMessage("AgentClientMessage", { exec_client_message: inner as Record<string, unknown> })
    const redecoded = decodeMessage<Record<string, Record<string, unknown>>>("AgentClientMessage", rebytes)
    expect(
      ((redecoded.exec_client_message as Record<string, unknown>).git_diff_response as Record<string, unknown>)
        .patch_id,
    ).toBe("p1")
  })

  test("preserves existing ExecServerMessage fields after adding deferred variants", () => {
    const msg = {
      id: 1,
      exec_id: "e",
      write_args: { path: "p", file_text: "hi", tool_call_id: "t" },
    }
    const bytes = encodeMessage("ExecServerMessage", msg)
    const decoded = decodeMessage<Record<string, unknown>>("ExecServerMessage", bytes)
    expect((decoded.write_args as Record<string, unknown>).path).toBe("p")
    // existing field 3 tag is 0x1a
    expect(hex(bytes).includes("1a")).toBe(true)
  })

  test("preserves existing ExecClientMessage shell_stream field 14 alongside new shell_result field 2", () => {
    const msg = {
      id: 2,
      exec_id: "e2",
      shell_stream: { stdout: { data: "hi" } },
    }
    const bytes = encodeMessage("ExecClientMessage", msg)
    const decoded = decodeMessage<Record<string, unknown>>("ExecClientMessage", bytes)
    expect(decoded.shell_stream).toBeDefined()
    // field 14 tag is 0x72 (14<<3|2 = 114 -> 0x72)
    expect(hex(bytes).includes("72")).toBe(true)
  })

  test("MCP-resource exec fallbacks answer unsupported errors, never empty success", () => {
    const list = decodeMessage<Record<string, Record<string, unknown>>>(
      "AgentClientMessage",
      buildListMcpResourcesFallback(9),
    )
    const listResult = list.exec_client_message.list_mcp_resources_exec_result as Record<string, unknown>
    expect(listResult.success).toBeUndefined()
    expect((listResult.error as Record<string, unknown>).error).toMatch(/not supported/)
    const read = decodeMessage<Record<string, Record<string, unknown>>>(
      "AgentClientMessage",
      buildReadMcpResourceFallback(10, "srv", "uri://x"),
    )
    const readResult = read.exec_client_message.read_mcp_resource_exec_result as Record<string, unknown>
    expect((readResult.error as Record<string, unknown>).uri).toBe("uri://x")
    expect((readResult.error as Record<string, unknown>).error).toMatch(/not supported/)
  })
})
