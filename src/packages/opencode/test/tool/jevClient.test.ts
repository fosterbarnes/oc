import { afterEach, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { apiKey } from "../../src/tool/jevClient"

// Global.Path.data is the preload's temp dir, so this never touches the real auth.json.
const file = path.join(Global.Path.data, "auth.json")
afterEach(() => fs.rmSync(file, { force: true }))

// The cache keys on mtime, so each write gets a distinct one.
function writeAuth(data: unknown, at: number) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data))
  fs.utimesSync(file, at, at)
}

test("the env key wins over the palette key, which is the fallback", () => {
  expect(apiKey({})).toBeUndefined()
  writeAuth({ typesafe: { type: "api", key: " ts_saved " } }, 1_000)
  expect(apiKey({})).toBe("ts_saved")
  expect(apiKey({ TYPESAFE_API_KEY: "ts_env" })).toBe("ts_env")
  writeAuth({ typesafe: { type: "api", key: "ts_new" } }, 2_000)
  expect(apiKey({})).toBe("ts_new")
})

test("a malformed auth.json or another entry type means no key", () => {
  writeAuth("{not json", 3_000)
  expect(apiKey({})).toBeUndefined()
  writeAuth({ typesafe: { type: "oauth", key: "x" }, anthropic: { type: "api", key: "sk" } }, 4_000)
  expect(apiKey({})).toBeUndefined()
})
