// Subprocess integration tests for `opencode serve`. Spawns the real CLI in
// headless mode and exercises it over HTTP — this is the only test tier that
// catches bugs spanning argv → server boot → routing → instance loading.
//
// `serve` is long-lived: the harness returns a handle (url/port/kill/exited)
// and kills the process when the test scope closes. The OS-assigned port is
// parsed off the "listening on http://..." line.
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { HttpClient } from "effect/unstable/http"
import fs from "node:fs/promises"
import { cliIt } from "../../lib/cli-process"
import { serveArguments, clearResidentStateForRestart, shouldClearResidentState, writeResidentState, markResidentRestart } from "../../../src/cli/cmd/serve"
import { tmpdir } from "../../fixture/fixture"

describe("opencode serve (subprocess)", () => {
  // Basic check: server starts, binds a port, and /global/health responds.
  // If this fails, all other serve tests likely will too — debug here first.
  cliIt.live(
    "starts, binds a port, and serves /global/health",
    ({ opencode }) =>
      Effect.gen(function* () {
        const server = yield* opencode.serve()
        expect(server.port).toBeGreaterThan(0)
        expect(server.url).toMatch(/^http:\/\//)

        const client = yield* HttpClient.HttpClient
        const res = yield* client.get(`${server.url}/global/health`)
        expect(res.status).toBe(200)
        // GlobalHealth schema is { success: true, ... } | { success: false, error }.
        // We don't lock in further shape here — any 200 with parseable JSON is
        // enough proof the routing + auth-bypass + instance loading is alive.
        const body = yield* res.json
        expect(body).toBeDefined()
      }),
    60_000,
  )

  // The scope-close finalizer must actually terminate the child. Without this
  // test a regression in the kill path (e.g. a future refactor that forgets
  // to wire the finalizer) would leak processes on every test run.
  cliIt.live(
    "kills the subprocess on scope close",
    ({ opencode }) =>
      Effect.gen(function* () {
        // Inner scope so we can observe `.exited` resolving after it closes.
        const exitedPromise = yield* Effect.scoped(
          Effect.gen(function* () {
            const server = yield* opencode.serve()
            // Capture the Promise, not the resolved value - scope closes after
            // this gen returns, at which point the finalizer kills the child.
            return server.exited
          }),
        )
        // After scope close: finalizer fired, process must have exited.
        const code = yield* Effect.promise(() => exitedPromise)
        // Bun reports the exit code; SIGTERM-killed processes return non-null
        // (typically 143 on POSIX). We just require resolution within a sane
        // window - anything else means the kill didn't take.
        expect(typeof code === "number" || code === null).toBe(true)
      }),
    60_000,
  )
})

describe("opencode serve restart helpers (unit)", () => {
  test("serveArguments preserves explicit serve argv without launching app", () => {
    const original = process.argv.slice()
    try {
      process.argv = ["bun", "src/index.ts", "serve", "--hostname", "127.0.0.1", "--port", "0"]
      expect(serveArguments()).toEqual(["serve", "--hostname", "127.0.0.1", "--port", "0"])
      process.argv = ["opencode.exe", "serve", "--port", "4096"]
      expect(serveArguments()).toEqual(["serve", "--port", "4096"])
      process.argv = ["bun", "other"]
      expect(serveArguments()).toEqual(["serve"])
    } finally {
      process.argv = original
    }
  })

  test("clearResidentStateForRestart invalidates stale state coherently and is idempotent", async () => {
    await using tmp = await tmpdir()
    const file = `${tmp.path}/oc-server.json`
    await fs.writeFile(file, JSON.stringify({ pid: 999999, hostname: "127.0.0.1", port: 4096 }, null, 2), "utf8")
    await clearResidentStateForRestart(tmp.path)
    await expect(fs.stat(file)).rejects.toBeDefined()
    // Second clear is safe (bounded, no throw)
    await clearResidentStateForRestart(tmp.path)
    await expect(fs.stat(file)).rejects.toBeDefined()
  })

  test("restart leaves the resident record for the replacement to rewrite", () => {
    expect(shouldClearResidentState(true)).toBe(false)
    expect(shouldClearResidentState(false)).toBe(true)
  })

  test("markResidentRestart stamps a fresh restart without dropping the pid", async () => {
    await using tmp = await tmpdir()
    await writeResidentState({ pid: 42, hostname: "127.0.0.1", port: 4096, directory: tmp.path })
    await markResidentRestart({ hostname: "127.0.0.1", port: 4096, directory: tmp.path })
    const written = JSON.parse(await fs.readFile(`${tmp.path}/oc-server.json`, "utf8"))
    expect(written.pid).toBe(42)
    expect(Date.now() - Date.parse(written.restarting)).toBeLessThan(5_000)
  })

  test("writeResidentState replaces the recorded pid atomically", async () => {
    await using tmp = await tmpdir()
    const file = `${tmp.path}/oc-server.json`
    await writeResidentState({ pid: 10, hostname: "127.0.0.1", port: 4096, directory: tmp.path })
    await writeResidentState({ pid: 11, hostname: "127.0.0.1", port: 4096, executable: "oc", directory: tmp.path })
    const written = JSON.parse(await fs.readFile(file, "utf8"))
    expect(written.pid).toBe(11)
    expect(written.hostname).toBe("127.0.0.1")
    expect(written.port).toBe(4096)
    expect(written.executable).toBe("oc")
    const temps = (await fs.readdir(tmp.path)).filter((name) => name.includes(".tmp-"))
    expect(temps).toEqual([])
  })
})
