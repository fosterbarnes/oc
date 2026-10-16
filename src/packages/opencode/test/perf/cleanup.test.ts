// Focused check for processTree.ps1: identity-anchored cleanup waits for the process to exit before
// its CIM readback. Opt-in with the probes (OC_PERF_PROBE=1, Windows).
import { describe, expect, test } from "bun:test"
import path from "node:path"
import { hostEnv } from "../lib/cli-process"

describe.skipIf(process.env.OC_PERF_PROBE !== "1" || process.platform !== "win32")("perf probe process cleanup", () => {
  test("CIM-owned cleanup awaits process termination", async () => {
    const child = Bun.spawn(["pwsh", "-NoProfile", "-NonInteractive", "-Command", "[Console]::ReadLine()"], {
      env: hostEnv(),
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    })
    const call = async (extra: string[]) => {
      const proc = Bun.spawn(
        [
          "pwsh",
          "-NoProfile",
          "-File",
          path.join(import.meta.dir, "processTree.ps1"),
          "-RootId",
          String(child.pid),
          ...extra,
        ],
        { env: hostEnv(), stdout: "pipe", stderr: "pipe" },
      )
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      expect(code, stderr).toBe(0)
      return stdout.trim()
    }
    const rows = JSON.parse(await call([]))
    const root = (Array.isArray(rows) ? rows : [rows]).find((row) => row.pid === child.pid)
    expect(root.created).toBeTruthy()
    expect(await call(["-Created", root.created, "-Cleanup"])).toBe("cleanup verified")
    await child.exited
  }, 30000)
})
