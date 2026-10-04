import { describe, expect, test } from "bun:test"
import { mapAvailableModelsResponse, resolveVariantMaxMode } from "@/provider/cursor/models"

const grokResponse = {
  models: [
    {
      name: "grok-4.7",
      clientDisplayName: "Grok 4.7",
      supportsThinking: true,
      supportsAgent: true,
      supportsMaxMode: true,
      variants: [
        {
          displayName: "Medium",
          isDefaultNonMaxConfig: true,
          parameterValues: [
            { id: "context", value: "256k" },
            { id: "effort", value: "medium" },
          ],
        },
        {
          displayName: "500k",
          isDefaultMaxConfig: true,
          parameterValues: [
            { id: "context", value: "500k" },
            { id: "effort", value: "medium" },
          ],
        },
        {
          displayName: "Fast",
          parameterValues: [
            { id: "context", value: "256k" },
            { id: "fast", value: "true" },
          ],
        },
        {
          displayName: "500k Fast",
          parameterValues: [
            { id: "context", value: "500k" },
            { id: "fast", value: "true" },
          ],
        },
      ],
    },
  ],
}

describe("Cursor AvailableModels mapping", () => {
  test("preserves Grok context and speed tuples", () => {
    const model = mapAvailableModelsResponse(grokResponse)[0]!
    expect(model.maxContext).toBe(256_000)
    expect(model.maxContextForMaxMode).toBe(500_000)
    expect(model.variants.map((variant) => variant.parameterValues)).toEqual([
      [
        { id: "context", value: "256k" },
        { id: "effort", value: "medium" },
      ],
      [
        { id: "context", value: "500k" },
        { id: "effort", value: "medium" },
      ],
      [
        { id: "context", value: "256k" },
        { id: "fast", value: "true" },
      ],
      [
        { id: "context", value: "500k" },
        { id: "fast", value: "true" },
      ],
    ])
    expect(resolveVariantMaxMode(model.variants[1]!.parameterValues, { model })).toBe(true)
    expect(resolveVariantMaxMode(model.variants[0]!.parameterValues, { model })).toBe(false)
  })
})
