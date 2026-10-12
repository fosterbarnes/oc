import { beforeEach, afterEach, describe, expect, test } from "bun:test"
import { invalidateAgentUrl, resetAgentUrlCache, resolveAgentUrl } from "@/provider/cursor/agentUrl.js"

describe("agentUrl: invalidateAgentUrl", () => {
  let fetchCalls = 0
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    resetAgentUrlCache()
    fetchCalls = 0
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetchCalls++
      const url = typeof input === "string" ? input : String(input)
      if (url.includes("GetServerConfig") || url.includes("ServerConfig")) {
        return new Response(JSON.stringify({ agentUrlConfig: { agentnUrl: "https://agentn.us.test.cursor.sh" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }) as Response
      }
      return originalFetch(input as RequestInfo)
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetAgentUrlCache()
  })

  test("memoized resolve is reused until invalidated", async () => {
    const token = "test-token-aaa"
    const first = await resolveAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    expect(first).toBe("https://agentn.us.test.cursor.sh")
    expect(fetchCalls).toBe(1)
    const second = await resolveAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    expect(second).toBe(first)
    expect(fetchCalls).toBe(1)
    invalidateAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    const third = await resolveAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    expect(third).toBe(first)
    expect(fetchCalls).toBe(2)
  })

  test("invalidation is keyed by token, baseURL and telemetry", async () => {
    const tokenA = "token-a"
    const tokenB = "token-b"
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(1)
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(1)
    await resolveAgentUrl(tokenB, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(2)
    // invalidate A only
    invalidateAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(3)
    // B still cached
    await resolveAgentUrl(tokenB, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(3)

    // telemetry key isolation
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: true })
    expect(fetchCalls).toBe(4)
    invalidateAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    // telemetry true still cached
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: true })
    expect(fetchCalls).toBe(4)
    // baseURL isolation
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api2.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(5)
    invalidateAgentUrl(tokenA, { apiBaseURL: "https://api.test.cursor.sh", telemetryEnabled: false })
    await resolveAgentUrl(tokenA, { apiBaseURL: "https://api2.test.cursor.sh", telemetryEnabled: false })
    expect(fetchCalls).toBe(5)
  })

  test("invalidate on missing key is no-op and idempotent", async () => {
    invalidateAgentUrl("nope", { apiBaseURL: "https://api.test.cursor.sh" })
    invalidateAgentUrl("nope", { apiBaseURL: "https://api.test.cursor.sh" })
    expect(fetchCalls).toBe(0)
    const token = "idempotent-token"
    await resolveAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    expect(fetchCalls).toBe(1)
    invalidateAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    invalidateAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    await resolveAgentUrl(token, { apiBaseURL: "https://api.test.cursor.sh" })
    expect(fetchCalls).toBe(2)
  })
})
