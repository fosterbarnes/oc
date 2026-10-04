import { describe, expect, test } from "bun:test"
import { analyzeReplayFrame } from "@/provider/cursor/replay-safety.js"

// Helpers to build protobuf wire bytes without protobufjs, matching strict parser.

function varintBytes(value: number): number[] {
  let v = value >>> 0
  const out: number[] = []
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  out.push(v)
  return out
}

function tagBytes(field: number, wire: number): number[] {
  return varintBytes((field << 3) | wire)
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function encodeLengthDelimitedField(field: number, payload: Uint8Array): Uint8Array {
  const tag = tagBytes(field, 2)
  const len = varintBytes(payload.length)
  return concatBytes(new Uint8Array(tag), new Uint8Array(len), payload)
}

function encodeVarintField(field: number, value: number): Uint8Array {
  const tag = tagBytes(field, 0)
  const v = varintBytes(value)
  return concatBytes(new Uint8Array(tag), new Uint8Array(v))
}

function encodeFixed64Field(field: number, bytes8: Uint8Array): Uint8Array {
  const tag = tagBytes(field, 1)
  return concatBytes(new Uint8Array(tag), bytes8)
}

function execPayloadWithVariant(field: number, wire: number, payload: Uint8Array): Uint8Array {
  // Build ExecServerMessage bytes containing single variant, then wrap as top-level field 2
  let variant: Uint8Array
  if (wire === 2) variant = encodeLengthDelimitedField(field, payload)
  else if (wire === 0) variant = encodeVarintField(field, payload[0] ?? 1)
  else if (wire === 1) variant = encodeFixed64Field(field, payload)
  else throw new Error(`unsupported wire ${wire}`)
  return encodeLengthDelimitedField(2, variant)
}

function execPayloadWithVariants(variants: Uint8Array[]): Uint8Array {
  const inner = concatBytes(...variants)
  return encodeLengthDelimitedField(2, inner)
}

function emptyGitDiffInner(): Uint8Array {
  return new Uint8Array([])
}

function simpleGitDiffInner(): Uint8Array {
  // minimal submessage with one varint field 1 = 1
  return encodeVarintField(1, 1)
}

describe("replay-safety: control vs non-control and malformed wire cases", () => {
  test("exact field 44 length-delimited git_diff_request is replay-safe control exemption", () => {
    const payload = execPayloadWithVariant(44, 2, emptyGitDiffInner())
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBeUndefined()
  })

  test("exact field 44 with non-empty inner bytes is still control", () => {
    const payload = execPayloadWithVariant(44, 2, simpleGitDiffInner())
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: { path: "foo" } } })
    expect(result.barrier).toBeUndefined()
  })

  test("exact field 44 with ignored id fields still control", () => {
    const variants = [
      encodeVarintField(1, 7), // id filtered
      encodeLengthDelimitedField(44, simpleGitDiffInner()),
      encodeVarintField(15, 9), // exec_id filtered
      encodeVarintField(19, 2), // filtered
    ]
    const payload = execPayloadWithVariants(variants)
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBeUndefined()
  })

  test("exact request_context field 10 remains control exemption", () => {
    const payload = execPayloadWithVariant(10, 2, new Uint8Array([]))
    const result = analyzeReplayFrame(payload, { exec: { request_context: {} } })
    expect(result.barrier).toBeUndefined()
  })

  test("exact mcp_state field 36 remains control exemption", () => {
    const payload = execPayloadWithVariant(36, 2, new Uint8Array([]))
    const result = analyzeReplayFrame(payload, { exec: { mcp_state: {} } })
    expect(result.barrier).toBeUndefined()
  })

  test("shell_args field 2 produces non-control-exec barrier", () => {
    const payload = execPayloadWithVariant(2, 2, new Uint8Array([]))
    const result = analyzeReplayFrame(payload, { exec: { shell_args: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("shell_args with ignored fields still non-control", () => {
    const variants = [encodeVarintField(1, 1), encodeLengthDelimitedField(2, new Uint8Array([]))]
    const payload = execPayloadWithVariants(variants)
    const result = analyzeReplayFrame(payload, { exec: { shell_args: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("multi-variant with git_diff_request plus another variant fails closed", () => {
    const variants = [
      encodeLengthDelimitedField(44, new Uint8Array([])),
      encodeLengthDelimitedField(10, new Uint8Array([])),
    ]
    const payload = execPayloadWithVariants(variants)
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {}, request_context: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("multi-variant duplicate git_diff_request fails closed", () => {
    const variants = [
      encodeLengthDelimitedField(44, new Uint8Array([])),
      encodeLengthDelimitedField(44, new Uint8Array([])),
    ]
    const payload = execPayloadWithVariants(variants)
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("wrong wire type for field 44 produces barrier", () => {
    // field 44 as varint wt 0
    const innerVarint = encodeVarintField(44, 1)
    const payload = encodeLengthDelimitedField(2, innerVarint)
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("wrong wire type fixed64 for field 44 produces barrier", () => {
    const payload = execPayloadWithVariant(44, 1, new Uint8Array(8))
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("malformed top-level truncated varint fails closed as unknown-or-malformed", () => {
    const payload = new Uint8Array([0x80]) // incomplete varint
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("malformed top-level truncated length-delimited payload fails closed", () => {
    // tag for field 2 wt 2 = 0x12, length 5 but only 2 bytes follow
    const payload = new Uint8Array([0x12, 0x05, 0x0a, 0x00])
    const result = analyzeReplayFrame(payload, { exec: {} })
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("malformed inner exec bytes truncated produces barrier", () => {
    // valid top-level field 2 length says 10 but inner missing
    // Build manually: outer tag 0x12 len 10, then only 2 bytes inner
    const payload = concatBytes(new Uint8Array([0x12, 0x0a]), new Uint8Array([0xe2, 0x02]))
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("decoded/wire mismatch for #44 fails closed", () => {
    const payload = execPayloadWithVariant(44, 2, new Uint8Array([]))
    // wire says exec (top-level 2) but decoded missing exec
    const result = analyzeReplayFrame(payload, {})
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("decoded/wire mismatch opposite: exec present without wire top-level fails closed", () => {
    // wire has no exec (top-level 1), but decoded has exec
    const payload = encodeLengthDelimitedField(1, encodeLengthDelimitedField(1, new Uint8Array([])))
    const result = analyzeReplayFrame(payload, { exec: { git_diff_request: {} } })
    // topLevel.fn=1, decoded.exec present, but check decodedMatchesWire only checks for fn==1 needing interactionUpdate, fn==2 needing exec, etc.
    // Here topLevel 1 expects interactionUpdate, not exec, so mismatch? Actually decodedMatchesWire: topLevel 1 and !decoded.interactionUpdate => false => malformed true
    // But we supplied no interactionUpdate, so malformed.
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("wrong top-level wire type for exec fails closed", () => {
    // field 2 with wt 0 instead of 2
    const payload = encodeVarintField(2, 1)
    const result = analyzeReplayFrame(payload, { exec: {} })
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("multiple top-level fields fails closed", () => {
    const part = execPayloadWithVariant(44, 2, new Uint8Array([]))
    const payload = concatBytes(part, part)
    const result = analyzeReplayFrame(payload, { exec: {} })
    expect(result.barrier).toBe("unknown-or-malformed-frame")
  })

  test("unsupported exec variant field 99 fails closed as non-control", () => {
    const payload = execPayloadWithVariant(99, 2, new Uint8Array([]))
    const result = analyzeReplayFrame(payload, { exec: { unknown: {} } })
    expect(result.barrier).toBe("non-control-exec")
  })

  test("empty exec variant list fails closed as non-control", () => {
    const payload = encodeLengthDelimitedField(2, new Uint8Array([]))
    const result = analyzeReplayFrame(payload, { exec: {} })
    // No variant, not exact anything => barrier
    expect(result.barrier).toBe("non-control-exec")
  })
})
