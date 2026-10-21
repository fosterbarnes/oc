import { describe, expect, test } from "bun:test"
import { ProviderError } from "@/provider/error"

describe("provider stream errors", () => {
  test("retries provider stream errors without a code", () => {
    const messages = [
      "The model is currently at capacity due to high demand. Please try again in a few minutes, or use a higher service tier for priority processing: https://docs.x.ai/developers/advanced-api-usage/priority-processing",
      "The model is temporarily unavailable.",
    ]

    for (const message of messages)
      expect(
        ProviderError.parseStreamError({
          type: "error",
          error: { message },
        }),
      ).toEqual({
        type: "api_error",
        message,
        isRetryable: true,
        responseBody: JSON.stringify({ type: "error", error: { message } }),
      })
  })
})

describe("content filter message", () => {
  test("names the policy area and reason from Anthropic stop details", () => {
    const metadata = {
      anthropic: { stopDetails: { type: "refusal", category: "cyber", explanation: "Request asked for malware" } },
    }
    expect(ProviderError.contentFilterMessage(metadata)).toBe(
      "The response was blocked by the provider's content filter (cyber): Request asked for malware",
    )
  })

  test("falls back to the plain message without details", () => {
    expect(ProviderError.contentFilterMessage(undefined)).toBe(
      "The response was blocked by the provider's content filter",
    )
    expect(ProviderError.contentFilterMessage({ anthropic: { stopDetails: { type: "refusal" } } })).toBe(
      "The response was blocked by the provider's content filter",
    )
  })
})
