import { describe, expect, test } from "bun:test"
import { OcImport } from "../../src/util/ocImport"

// Inline credentials must never leave the serving machine, and the importer must keep its own.
describe("secrets", () => {
  test("redact hides inline keys and keeps references", () => {
    const value = {
      options: { apiKey: "sk-live", baseURL: "https://x" },
      headers: { Authorization: "Bearer abc" },
      env: { apiKey: "{env:KEY}", token: "{file:~/.key}" },
    }
    expect(OcImport.redact(value)).toEqual({
      options: { apiKey: OcImport.REDACTED, baseURL: "https://x" },
      headers: { Authorization: OcImport.REDACTED },
      env: { apiKey: "{env:KEY}", token: "{file:~/.key}" },
    })
  })

  test("restoreRedacted keeps the local value or drops the key", () => {
    const peer = { options: { apiKey: OcImport.REDACTED, baseURL: "u" }, other: { token: OcImport.REDACTED } }
    expect(OcImport.restoreRedacted(peer, { options: { apiKey: "sk-local" } })).toEqual({
      options: { apiKey: "sk-local", baseURL: "u" },
      other: {},
    })
  })
})

describe("rewriteHome", () => {
  test("maps every Windows form to forward slashes", () => {
    const from = "C:\\Users\\Foster"
    expect(OcImport.rewriteHome('"C:\\\\Users\\\\Foster\\\\a\\\\b.md"', from, "/Users/foster")).toBe(
      '"/Users/foster/a/b.md"',
    )
    expect(OcImport.rewriteHome("see c:/users/foster/x y", from, "/Users/foster")).toBe("see /Users/foster/x y")
    expect(OcImport.rewriteHome("/home/fb/.config", "/home/fb", from)).toBe("C:/Users/Foster/.config")
  })

  test("leaves a longer folder name with the same prefix alone", () => {
    expect(OcImport.rewriteHome("C:\\Users\\FosterX\\a", "C:\\Users\\Foster", "/Users/foster")).toBe(
      "C:\\Users\\FosterX\\a",
    )
  })
})
