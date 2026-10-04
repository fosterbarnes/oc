import { describe, expect, test } from "bun:test"
import { mapAvailableModelsResponse } from "@/provider/cursor/models"
import { modelsToConfig } from "@/provider/cursor/model-config"
import { getCursorModelCost } from "@/provider/cursor/pricing"

const model = mapAvailableModelsResponse({
  models: [
    {
      name: "grok-4.7",
      clientDisplayName: "Grok 4.7",
      supportsThinking: true,
      supportsAgent: true,
      supportsMaxMode: true,
      variants: [
        { isDefaultNonMaxConfig: true, parameterValues: [{ id: "context", value: "256k" }] },
        { isDefaultMaxConfig: true, parameterValues: [{ id: "context", value: "500k" }] },
        {
          parameterValues: [
            { id: "context", value: "256k" },
            { id: "fast", value: "true" },
          ],
        },
        {
          parameterValues: [
            { id: "context", value: "500k" },
            { id: "fast", value: "true" },
          ],
        },
      ],
    },
  ],
})[0]!

describe("Cursor model catalog", () => {
  test("materializes each context and speed tier with wire options", () => {
    const config = modelsToConfig([model])
    expect(Object.keys(config)).toEqual(["grok-4.7", "grok-4.7-fast", "grok-4.7-500k", "grok-4.7-500k-fast"])
    expect(config["grok-4.7"].limit.context).toBe(256_000)
    expect(config["grok-4.7-500k"].limit.context).toBe(500_000)
    expect(config["grok-4.7-500k"].options).toEqual({
      cursorModelId: "grok-4.7",
      cursorVariantParameters: [{ id: "context", value: "500k" }],
      cursorMaxMode: true,
    })
    expect(config["grok-4.7"].options.cursorMaxMode).toBe(false)
    expect(config["grok-4.7-fast"].options.cursorMaxMode).toBe(false)
    expect(config["grok-4.7"].name).not.toContain("(Max)")
    expect(config["grok-4.7-500k"].name).toEndWith("500k (Max)")
    expect(config["grok-4.7-500k"].cost).toEqual(getCursorModelCost("grok-4.7-500k"))
    expect(config["grok-4.7-500k-fast"].cost).toEqual(getCursorModelCost("grok-4.7-500k-fast"))
  })
})
