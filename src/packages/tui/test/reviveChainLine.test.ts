import { expect, test } from "bun:test"
import { chainLine, reviveDivider } from "../src/util/revive"

test("chain steps show their position and what runs before or after them", () => {
  const note = (step: number, total: number, done: string[], later: string[]) => ({
    kind: "chain",
    step,
    total,
    done,
    later,
  })
  expect(chainLine(note(1, 3, [], ["/revive", "/agent-push"]))).toBe("step 1 of 3 . next /revive, /agent-push")
  expect(chainLine(note(3, 3, ["/pass", "/revive"], []))).toBe("step 3 of 3 . after /pass, /revive")
  expect(chainLine(note(1, 1, [], []))).toBe("step 1 of 1")
  // Notes written before progress was stored, and other synthetic parts, show nothing.
  expect(chainLine({ kind: "chain" })).toBeUndefined()
  expect(chainLine({ kind: "editor_context", step: 1, total: 1, done: [], later: [] })).toBeUndefined()
  expect(chainLine(undefined)).toBeUndefined()
})

test("the revive divider names the chain steps sent after it", () => {
  const at = new Date(2026, 9, 21, 21, 10).getTime()
  const divider = reviveDivider({ kind: "revive", at, versions: "oc v1", next: ["/agent-push"] })
  expect(divider).toEndWith(" . oc v1 . next /agent-push ")
  expect(reviveDivider({ kind: "revive", at, versions: "oc v1" })).toEndWith(" . oc v1 ")
})
