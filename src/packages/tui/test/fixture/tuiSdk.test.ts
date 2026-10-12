import { expect, test } from "bun:test"
import { json } from "./tui-sdk"

test("JSON responses accept all header shapes and preserve explicit content types", async () => {
  const inputs: HeadersInit[] = [{ "X-Test": "value" }, new Headers({ "X-Test": "value" }), [["X-Test", "value"]]]
  for (const headers of inputs) {
    const response = json({ ok: true }, { headers, status: 201 })
    expect(response.headers.get("x-test")).toBe("value")
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ ok: true })
    expect(new Headers(headers).has("content-type")).toBe(false)
  }
  expect(json({}).headers.get("content-type")).toBe("application/json")
  expect(json({}, { headers: { "Content-Type": "application/problem+json" } }).headers.get("content-type")).toBe(
    "application/problem+json",
  )
})
