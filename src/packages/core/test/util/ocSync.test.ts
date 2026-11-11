import { describe, expect, test } from "bun:test"
import { OcSync } from "../../src/util/ocSync"

// Every machine must pick the same winner, and an unsynced local edit that loses must be reported.
describe("decide", () => {
  const remote = (at: number, hash = "r", deleted = false): OcSync.ManifestEntry => ({
    id: "skill:config:a",
    hash,
    at,
    tags: [],
    ...(deleted ? { deleted: true as const } : {}),
  })
  const local = (at: number, hash = "l", base?: string) => ({ hash, at, tags: [], base })

  test("newer remote wins, older is ignored, equal hash is the same", () => {
    expect(OcSync.decide(local(1, "l", "l"), remote(2), [])).toBe("take")
    expect(OcSync.decide(local(3, "l", "l"), remote(2), [])).toBe("skip")
    expect(OcSync.decide(local(1, "r"), remote(2, "r"), [])).toBe("same")
  })

  test("equal times break the same way on both machines", () => {
    expect(OcSync.decide(local(5, "a", "a"), remote(5, "b"), [])).toBe("take")
    expect(OcSync.decide(local(5, "b", "b"), remote(5, "a"), [])).toBe("skip")
  })

  test("a newer remote over an unsynced local edit is a conflict", () => {
    expect(OcSync.decide(local(1, "l", "old"), remote(2), [])).toBe("conflict")
  })

  test("missing locally: take an item, ignore a tombstone", () => {
    expect(OcSync.decide(undefined, remote(1), [])).toBe("take")
    expect(OcSync.decide(undefined, remote(1, "", true), [])).toBe("skip")
  })

  test("excluded by prefix or by a tag on either side", () => {
    expect(OcSync.decide(undefined, remote(1), ["skill:"])).toBe("skip")
    expect(OcSync.decide({ ...local(1), tags: ["windows"] }, remote(2), ["tag:windows"])).toBe("skip")
  })
})
