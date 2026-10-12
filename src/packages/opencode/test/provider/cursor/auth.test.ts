import { describe, expect, test } from "bun:test"
import { AuthTimeoutError, pollForTokens } from "@/provider/cursor/auth.js"

describe("pollForTokens", () => {
  test("honors abort during the poll delay", async () => {
    const controller = new AbortController()
    const pending = pollForTokens("uuid", "verifier", "http://127.0.0.1:9", controller.signal, 5)
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(AuthTimeoutError)
  })
})
