import { describe, expect, test } from "bun:test"
import { validateServer } from "../../../src/cli/tui/validate-session"

describe("attach server preflight", () => {
  const serve = (status: number) =>
    Bun.serve({
      port: 0,
      fetch: (req) =>
        new URL(req.url).pathname === "/api/health"
          ? Response.json({ healthy: true }, { status })
          : new Response(null, { status: 404 }),
    })

  test("passes when the server answers health", async () => {
    using server = serve(200)
    await validateServer({ url: server.url.href })
  })

  test("fails fast when nothing listens on the URL", async () => {
    const port = (() => {
      using probe = serve(200)
      return probe.port
    })()
    await expect(validateServer({ url: `http://127.0.0.1:${port}` })).rejects.toThrow(
      `Could not reach server at http://127.0.0.1:${port}`,
    )
  })

  test("names the auth problem on 401", async () => {
    using server = serve(401)
    await expect(validateServer({ url: server.url.href })).rejects.toThrow("requires a password")
    await expect(validateServer({ url: server.url.href, headers: { Authorization: "Basic eDp5" } })).rejects.toThrow(
      "rejected the password",
    )
  })

  test("reports other failing statuses", async () => {
    using server = serve(503)
    await expect(validateServer({ url: server.url.href })).rejects.toThrow("responded with status 503")
  })
})
