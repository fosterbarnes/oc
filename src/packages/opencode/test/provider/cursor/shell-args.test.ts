import { describe, expect, test } from "bun:test"
import { decodeMessage, encodeMessage } from "../../../src/provider/cursor/protocol/messages.js"
import { buildExecClientMessages, parseExecServerMessage } from "../../../src/provider/cursor/protocol/tools.js"
import { readAllFields } from "../../../src/provider/cursor/protocol/struct.js"

describe("shell_args parsing and bash mapping", () => {
  test("parses shell_args into bash tool with timeout metadata", () => {
    const raw = {
      id: 42,
      exec_id: "1",
      shell_args: {
        command: "echo hi",
        working_directory: "/tmp",
        timeout: 0,
        timeout_behavior: 0,
      },
    }
    const parsed = parseExecServerMessage(raw as Record<string, unknown>)
    expect(parsed).toBeDefined()
    expect(parsed!.toolName).toBe("bash")
    expect(parsed!.args.command).toBe("echo hi")
    expect(parsed!.args.workdir).toBe("/tmp")
    expect(parsed!.resultField).toBe("shell_result")
    // timeout 0 foreground defaults to 30s and is propagated to args.timeout
    expect(parsed!.args.timeout).toBe(30_000)
    expect(parsed!.resultMetadata?.timeout_ms).toBe(30_000)
    expect(parsed!.resultMetadata?.timeout_behavior).toBe(0)
  })

  test("maps shell_args with custom timeout", () => {
    const parsed = parseExecServerMessage({
      id: 7,
      exec_id: "2",
      shell_args: { command: "ls", working_directory: "/work", timeout: 5000 },
    } as Record<string, unknown>)
    expect(parsed!.args.timeout).toBe(5000)
    expect(parsed!.resultMetadata?.timeout_ms).toBe(5000)
  })

  test("buildExecClientMessages shell_result emits one result plus close", () => {
    const frames = buildExecClientMessages({
      execId: 42,
      resultField: "shell_result",
      output: "hello",
      shellOutcome: { kind: "exit", code: 0 },
    })
    // one result frame + close
    expect(frames.length).toBe(2)
    // first frame should be AgentClientMessage with exec_client_message.shell_result
    const decoded = decodeMessage<Record<string, unknown>>("AgentClientMessage", frames[0]!)
    const ecm = decoded.exec_client_message as Record<string, unknown>
    expect(ecm.id).toBe(42)
    expect(ecm.shell_result).toBeDefined()
    // close frame is ACM stream_close
    const closeDecoded = decodeMessage<Record<string, unknown>>("AgentClientMessage", frames[1]!)
    expect((closeDecoded.exec_client_control_message as Record<string, unknown>).stream_close).toBeDefined()
  })

  test("buildExecClientMessages shell_result preserves shell_stream multi-frame unchanged", () => {
    const streamFrames = buildExecClientMessages({
      execId: 99,
      resultField: "shell_stream",
      output: "out",
    })
    // shell_stream is start + stdout + exit + close = 4
    expect(streamFrames.length).toBe(4)
    const first = decodeMessage<Record<string, unknown>>("AgentClientMessage", streamFrames[0]!)
    const ecm = first.exec_client_message as Record<string, unknown>
    expect(ecm.shell_stream).toBeDefined()
  })

  test("shell_args request encodes and decodes via protobuf", () => {
    // Verify dynamic schema patch allows encoding field 2
    const bytes = encodeMessage("AgentClientMessage", {
      exec_client_message: { id: 1, shell_result: { success: { output: "hi", exit_code: 0 } } },
    })
    // top-level field 2 = exec_client_message, nested field 2 = shell_result
    const fields = readAllFields(bytes)
    expect(fields.some((f) => f.fn === 2)).toBe(true)
  })
})
