import { describe, expect, test } from "bun:test"
import { buildPricingTable } from "../../../script/generateCursorPricing"
import { getCursorModelCost } from "@/provider/cursor/pricing"

describe("Cursor pricing metadata", () => {
  test("keeps explicit 500k prices separate from the base cost", () => {
    const source = Bun.file("test/fixtures/cursor-pricing.md")
    return source.text().then((markdown) => {
      const table = buildPricingTable(markdown)
      expect(table["grok-4.7-500k"]).toEqual({ input: 4, output: 12, cache_read: 1 })
      expect(table["grok-4.7-500k-fast"]).toEqual({ input: 6, output: 18, cache_read: 1.5 })
      expect(table["grok-4.7-1m"]).toEqual({ input: 8, output: 24, cache_read: 2 })
      expect(table["grok-4.7"]).toEqual({ input: 2, output: 6, cache_read: 0.5 })
    })
  })

  test("includes generated Opus 5.5 and Grok costs", () => {
    expect(getCursorModelCost("claude-opus-5-5")?.input).toBe(4)
    expect(getCursorModelCost("grok-4.7-500k-fast")?.output).toBe(18)
  })

  test("1M catalog ids use long-context rates when the table has no -1m key", () => {
    const base = getCursorModelCost("claude-sonnet-4")
    const long = getCursorModelCost("claude-sonnet-4-1m")
    expect(base?.context_over_200k?.input).toBe(6)
    expect(long?.input).toBe(6)
    expect(long?.output).toBe(22.5)
  })

  test("fails closed for an unmapped docs row", () => {
    expect(() =>
      buildPricingTable(
        "| Model | Provider | Input | Cache write | Cache read | Output |\n| --- | --- | --- | --- | --- | --- |\n| Unknown Model | X | $1 | - | - | $1 |",
      ),
    ).toThrow("Unmapped pricing display name")
  })
})
