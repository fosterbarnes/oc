import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { redactConfig } from "@/cli/cmd/debug/redact"
import { cliIt } from "../lib/cli-process"

const config = {
  provider: {
    example: {
      options: {
        apiKey: "sk-example",
        timeout: 1200,
        headers: { Authorization: "Bearer example", "X-API-Key": "key" },
      },
      models: { demo: { variants: { fast: { api_key: "variant-secret" } } } },
    },
  },
  mcp: {
    remote: { oauth: { clientSecret: "oauth-secret", clientId: "public" }, headers: { "x-custom": "opaque" } },
    local: { environment: { SERVICE_TOKEN: "env-secret", PATH: "/usr/bin" } },
  },
  url: "https://user:pass@example.com/path",
  queryUrl: "https://example.com/path?api_key=query-secret",
  normal: { context_tokens: 200000, name: "example" },
}

describe("debug config redaction", () => {
  test("masks credentials while preserving unrelated settings without mutating the input", () => {
    const before = structuredClone(config)

    expect(redactConfig(config)).toEqual({
      provider: {
        example: {
          options: { apiKey: "***", timeout: 1200, headers: { Authorization: "***", "X-API-Key": "***" } },
          models: { demo: { variants: { fast: { api_key: "***" } } } },
        },
      },
      mcp: {
        remote: { oauth: { clientSecret: "***", clientId: "public" }, headers: { "x-custom": "***" } },
        local: { environment: { SERVICE_TOKEN: "***", PATH: "/usr/bin" } },
      },
      url: "***",
      queryUrl: "***",
      normal: config.normal,
    })
    expect(config).toEqual(before)
  })

  cliIt.live("redacts resolved credentials in debug config output", ({ opencode }) =>
    Effect.gen(function* () {
      const content = JSON.stringify({ provider: config.provider })
      const result = yield* opencode.spawn(["debug", "config"], { env: { OPENCODE_CONFIG_CONTENT: content } })
      opencode.expectExit(result, 0, "debug config")
      expect(JSON.parse(result.stdout).provider.example.options).toMatchObject({
        apiKey: "***",
        timeout: 1200,
        headers: { Authorization: "***", "X-API-Key": "***" },
      })
      expect(result.stdout).not.toContain("sk-example")
      expect(result.stdout).not.toContain("Bearer example")
    }),
  )
})
