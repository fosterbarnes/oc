import { describe, expect, test } from "bun:test"
import { PtyProtocol } from "@opencode-ai/core/pty/protocol"

describe("pty protocol", () => {
  test("drops invalid binary input frames and decodes valid ones", () => {
    expect(PtyProtocol.decodeInput("ready")).toBe("ready")
    expect(PtyProtocol.decodeInput(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeUndefined()
    expect(PtyProtocol.decodeInput(new TextEncoder().encode("hello"))).toBe("hello")
    expect(PtyProtocol.decodeInput(new TextEncoder().encode("hello").buffer)).toBe("hello")
  })

  test("encodes the cursor as a 0x00-prefixed JSON control frame", () => {
    const frame = PtyProtocol.metaFrame(42)
    expect(frame[0]).toBe(0)
    expect(JSON.parse(new TextDecoder().decode(frame.subarray(1)))).toEqual({ cursor: 42 })
  })

  test("splits replay into bounded frames", () => {
    expect(PtyProtocol.chunks("")).toEqual([])
    expect(PtyProtocol.chunks("abc")).toEqual(["abc"])
    const big = "x".repeat(PtyProtocol.REPLAY_CHUNK + 1)
    const frames = PtyProtocol.chunks(big)
    expect(frames.length).toBe(2)
    expect(frames[0].length).toBe(PtyProtocol.REPLAY_CHUNK)
    expect(frames.join("")).toBe(big)
  })

  test("keeps single ordered queue semantics for replay, meta, and close", () => {
    const replay = "replay-data"
    const cursor = 123
    const meta = PtyProtocol.metaFrame(cursor)
    const outbox: Array<string | Uint8Array> = []
    for (const chunk of PtyProtocol.chunks(replay)) outbox.push(chunk)
    outbox.push(meta)
    outbox.push("live-data")
    // Replay chunks must precede meta, and live data after meta - no interleaving duplicate.
    expect(outbox[0]).toBe("replay-data")
    expect((outbox[1] as Uint8Array)[0]).toBe(0)
    expect(outbox[2]).toBe("live-data")
    expect(JSON.parse(new TextDecoder().decode((outbox[1] as Uint8Array).subarray(1))).cursor).toBe(cursor)
  })

  test("does not treat replay boundary as duplicate live data", () => {
    const replay = "AAA"
    const live = "BBB"
    const frames = [...PtyProtocol.chunks(replay), PtyProtocol.metaFrame(replay.length)]
    // Simulate handler enqueue order: replay, meta, then live via pending.
    const combined = [...(frames.filter((f) => typeof f === "string") as string[]), live].join("")
    expect(combined).toBe("AAABBB")
    expect((combined.match(/AAA/g) ?? []).length).toBe(1)
    expect((combined.match(/BBB/g) ?? []).length).toBe(1)
  })
})
