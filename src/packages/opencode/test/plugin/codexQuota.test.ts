import { expect, test } from "bun:test"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"
import { _resetUsageObservations, getUsageSnapshot } from "../../src/provider/usage-observations"

test("Codex OAuth HTTP transport observes quota headers without consuming the response", async () => {
  _resetUsageObservations()
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response('data: {"type":"response.completed"}\n\n', { headers: {
      "content-type": "text/event-stream",
      "x-codex-primary-used-percent": "12.5",
      "x-codex-primary-window-minutes": "300",
      "x-codex-primary-reset-at": "1800000000",
      "x-codex-secondary-used-percent": "8.25",
    } }),
  })
  const hooks = await CodexAuthPlugin({} as never, { codexApiEndpoint: server.url.toString() })
  try {
    if (!hooks.auth?.loader) throw new Error("Codex OAuth loader missing")
    const loaded = await hooks.auth.loader(async () => ({
      type: "oauth", access: "test-token", refresh: "test-refresh", accountId: "quota-account",
      expires: Date.now() + 60_000,
    }), { id: "openai", options: {}, models: {} } as never)
    const transport = loaded.fetch as typeof fetch
    const response = await transport("https://api.openai.com/v1/responses", {
      method: "POST", body: JSON.stringify({ stream: true, input: "test" }),
    })
    expect(response.bodyUsed).toBe(false)
    expect(getUsageSnapshot()).toHaveLength(1)
    expect(getUsageSnapshot()[0]?.accountID).toBe("quota-account")
    expect(getUsageSnapshot()[0]?.windows).toMatchObject([
      { id: "primary", usedPercent: 12.5, resetMs: 1_800_000_000_000, minutes: 300 },
      { id: "secondary", usedPercent: 8.25 },
    ])
    expect(await response.text()).toContain("response.completed")
  } finally {
    await hooks.dispose?.()
    _resetUsageObservations()
  }
})
