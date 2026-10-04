import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global, resolveAppName } from "@opencode-ai/core/global"
import * as OcConfig from "@/config/oc"
import { tmpdir } from "../fixture/fixture"

const originalConfigPath = Global.Path.config
const originalLegacyConfig = process.env.OPENCODE_OC_CONFIG
const temporaryDirectories: string[] = []

afterEach(async () => {
  ;(Global.Path as { config: string }).config = originalConfigPath
  if (originalLegacyConfig === undefined) delete process.env.OPENCODE_OC_CONFIG
  else process.env.OPENCODE_OC_CONFIG = originalLegacyConfig
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

const idle = { restartingFresh: false }

for (const control of ["stopServer", "shutdownAll"] as const) {
  test(`${control} still stops its resident server when the injected process lister fails`, async () => {
    await using tmp = await tmpdir()
    const child = Bun.spawn([process.execPath, "-e", [
      "const server = Bun.serve({ port: 0, fetch(request) {",
      `if (request.method !== 'POST' || new URL(request.url).pathname !== '/global/shutdown' || request.headers.get('authorization') !== 'Basic ${Buffer.from("opencode:test-secret").toString("base64")}') return new Response('', { status: 403 });`,
      "setTimeout(() => process.exit(0), 20); return new Response('{}'); } });",
      "console.log(JSON.stringify({ pid: process.pid, hostname: '127.0.0.1', port: server.port }));",
    ].join(" ")], { stdout: "pipe", stderr: "pipe", windowsHide: true })
    try {
      const reader = child.stdout.getReader()
      let output = ""
      while (!output.includes("\n")) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error("Resident test process exited before readiness")
        output += new TextDecoder().decode(chunk.value)
      }
      reader.releaseLock()
      await Bun.write(OcConfig.serverStatePath(tmp.path), output.trim())
      await Bun.write(path.join(tmp.path, "oc-server.secret"), "test-secret")
      // A record must survive an unavailable snapshot rather than being mistaken for a dead TUI.
      await fs.mkdir(path.join(tmp.path, "oc-tuis"))
      await Bun.write(path.join(tmp.path, "oc-tuis", "99.json"), "{}")
      let listings = 0
      const listProcesses = () => {
        listings++
        throw new Error("Injected CIM failure")
      }
      const result = control === "stopServer"
        ? await OcConfig.stopServer(tmp.path, { listProcesses })
        : (await OcConfig.shutdownAll({ directory: tmp.path, listProcesses })).servers[0]
      expect(result.stopped).toBe(true)
      expect(listings).toBe(1)
      expect(await child.exited).toBe(0)
      expect(await Bun.file(OcConfig.serverStatePath(tmp.path)).exists()).toBe(false)
      expect(await Bun.file(path.join(tmp.path, "oc-tuis", "99.json")).exists()).toBe(true)
    } finally {
      if (child.exitCode === null) child.kill()
      await child.exited
    }
  }, 20_000)
}

describe("resident launch policy", () => {
  test("reuses a healthy server whose record matches a live pid", () => {
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: true, hasState: true, matches: true, alive: true })).toBe("reuse")
  })

  test("waits only while a restart mark is fresh", () => {
    const restarting = { restartingFresh: true }
    expect(OcConfig.residentLaunchAction({ ...restarting, healthy: false, hasState: true, matches: true, alive: false })).toBe("wait")
    expect(OcConfig.residentLaunchAction({ ...restarting, healthy: true, hasState: true, matches: true, alive: false })).toBe("wait")
  })

  test("starts immediately when a stale record's pid is dead and the port is down", () => {
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: false, hasState: true, matches: true, alive: false })).toBe("clear-spawn")
  })

  test("does not adopt a healthy server with a mismatched, dead, or missing record", () => {
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: true, hasState: true, matches: false, alive: true })).toBe("refuse-foreign")
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: true, hasState: true, matches: true, alive: false })).toBe("refuse-foreign")
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: true, hasState: false, matches: false, alive: false })).toBe("wait-unowned")
  })

  test("starts when nothing is recorded and the port is down", () => {
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: false, hasState: false, matches: false, alive: false })).toBe("spawn")
  })

  test("drops a record for a different host or port when the port is down", () => {
    expect(OcConfig.residentLaunchAction({ ...idle, healthy: false, hasState: true, matches: false, alive: false })).toBe("clear-spawn")
  })

  test("treats a restart mark as fresh for 30 seconds", () => {
    const now = Date.parse("2026-09-24T23:53:00.000Z")
    expect(OcConfig.residentRestartFresh(new Date(now - 1_000).toISOString(), now)).toBe(true)
    expect(OcConfig.residentRestartFresh(new Date(now - 31_000).toISOString(), now)).toBe(false)
    expect(OcConfig.residentRestartFresh(undefined, now)).toBe(false)
  })
})

describe("debug instance identity", () => {
  test("treats oc-debug executable and OPENCODE_INSTANCE as the debug app", () => {
    expect(resolveAppName({ execPath: "C:\\Apps\\opencode\\opencode.exe" })).toBe("opencode")
    expect(resolveAppName({ execPath: "C:\\Apps\\opencode\\ocdebug.exe" })).toBe("opencode-debug")
    expect(resolveAppName({ execPath: "C:\\Apps\\opencode\\oc-debug.exe" })).toBe("opencode-debug")
    expect(resolveAppName({ instance: "debug", execPath: "C:\\Apps\\opencode\\opencode.exe" })).toBe("opencode-debug")
    expect(OcConfig.defaultServerPort()).toBe(Global.Path.debug ? 4097 : 4096)
  })
})

describe("canonical child executable", () => {
  test("maps oc and occ to sibling opencode", () => {
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\oc.exe")).toBe("C:\\Apps\\opencode\\opencode.exe")
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\occ.exe")).toBe("C:\\Apps\\opencode\\opencode.exe")
    expect(OcConfig.executablePath("/usr/local/bin/oc")).toBe("/usr/local/bin/opencode")
    expect(OcConfig.executablePath("/usr/local/bin/occ")).toBe("/usr/local/bin/opencode")
  })

  test("leaves bun, opencode, and ocdebug unchanged", () => {
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\opencode.exe")).toBe("C:\\Apps\\opencode\\opencode.exe")
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\ocdebug.exe")).toBe("C:\\Apps\\opencode\\ocdebug.exe")
    expect(OcConfig.executablePath("/usr/local/bin/bun")).toBe("/usr/local/bin/bun")
    expect(OcConfig.executablePath("C:\\Program Files\\bun\\bun.exe")).toBe("C:\\Program Files\\bun\\bun.exe")
  })

  test("preserves bun entrypoint detection", () => {
    expect(OcConfig.executablePath("/usr/local/bin/bun").toLowerCase()).toContain("bun")
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\oc.exe").toLowerCase()).not.toContain("bun")
  })
})

describe("OC config", () => {
  test("reads launcher settings only from the native config", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    ;(Global.Path as { config: string }).config = directory
    const legacy = path.join(directory, "legacy.json")
    await fs.writeFile(legacy, JSON.stringify({ homeDir: "standalone-oc" }))
    process.env.OPENCODE_OC_CONFIG = legacy

    expect(await OcConfig.read()).toEqual({})
    expect(await fs.stat(path.join(directory, "oc.json")).catch(() => undefined)).toBeUndefined()
  })

  test("writes and reads launcher settings without a PowerShell bridge", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    ;(Global.Path as { config: string }).config = directory

    await OcConfig.update("homeDirSort", "modified")
    await fs.writeFile(
      path.join(directory, "oc.json"),
      `${JSON.stringify({ homeDirSort: "modified", server: { hostname: "127.0.0.1", port: 4096 } }, null, 2)}\n`,
    )
    await OcConfig.update("serverStartOnWindowsUserStart", "true")
    await OcConfig.update("ocDir", "C:/Users/user")

    expect(await OcConfig.read()).toEqual({
      ocDir: "C:/Users/user",
      homeDirSort: "modified",
      server: { hostname: "127.0.0.1", port: 4096, startOnWindowsUserStart: true },
    })
  })
})
