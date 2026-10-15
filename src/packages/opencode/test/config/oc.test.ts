import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { OcConfig } from "@/config/oc"
import { Resident } from "@/config/resident"
import { Startup } from "@/config/startup"
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
    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        [
          "const server = Bun.serve({ port: 0, fetch(request) {",
          `if (request.method !== 'POST' || new URL(request.url).pathname !== '/global/shutdown' || request.headers.get('authorization') !== 'Basic ${Buffer.from("opencode:test-secret").toString("base64")}') return new Response('', { status: 403 });`,
          "setTimeout(() => process.exit(0), 20); return new Response('{}'); } });",
          "console.log(JSON.stringify({ pid: process.pid, hostname: '127.0.0.1', port: server.port }));",
        ].join(" "),
      ],
      { stdout: "pipe", stderr: "pipe", windowsHide: true },
    )
    try {
      const reader = child.stdout.getReader()
      let output = ""
      while (!output.includes("\n")) {
        const chunk = await reader.read()
        if (chunk.done) throw new Error("Resident test process exited before readiness")
        output += new TextDecoder().decode(chunk.value)
      }
      reader.releaseLock()
      await Bun.write(Resident.serverStatePath(tmp.path), output.trim())
      await Bun.write(path.join(tmp.path, "oc-server.secret"), "test-secret")
      // A record must survive an unavailable snapshot rather than being mistaken for a dead TUI.
      await fs.mkdir(path.join(tmp.path, "oc-tuis"))
      await Bun.write(path.join(tmp.path, "oc-tuis", "99.json"), "{}")
      let listings = 0
      const listProcesses = () => {
        listings++
        throw new Error("Injected CIM failure")
      }
      const result =
        control === "stopServer"
          ? await Resident.stopServer(tmp.path, { listProcesses })
          : (await Resident.shutdownAll({ directory: tmp.path, listProcesses })).servers[0]
      expect(result.stopped).toBe(true)
      expect(listings).toBe(1)
      expect(await child.exited).toBe(0)
      expect(await Bun.file(Resident.serverStatePath(tmp.path)).exists()).toBe(false)
      expect(await Bun.file(path.join(tmp.path, "oc-tuis", "99.json")).exists()).toBe(true)
    } finally {
      if (child.exitCode === null) child.kill()
      await child.exited
    }
  }, 20_000)
}

describe("resident launch policy", () => {
  test("reuses a healthy server whose record matches a live pid", () => {
    expect(Resident.residentLaunchAction({ ...idle, healthy: true, hasState: true, matches: true, alive: true })).toBe(
      "reuse",
    )
  })

  test("waits only while a restart mark is fresh", () => {
    const restarting = { restartingFresh: true }
    expect(
      Resident.residentLaunchAction({ ...restarting, healthy: false, hasState: true, matches: true, alive: false }),
    ).toBe("wait")
    expect(
      Resident.residentLaunchAction({ ...restarting, healthy: true, hasState: true, matches: true, alive: false }),
    ).toBe("wait")
  })

  test("waits for a live matching server while health is down", () => {
    expect(Resident.residentLaunchAction({ ...idle, healthy: false, hasState: true, matches: true, alive: true })).toBe(
      "wait",
    )
  })

  test("starts immediately when a stale record's pid is dead and the port is down", () => {
    expect(
      Resident.residentLaunchAction({ ...idle, healthy: false, hasState: true, matches: true, alive: false }),
    ).toBe("clear-spawn")
  })

  test("does not adopt a healthy server with a mismatched, dead, or missing record", () => {
    expect(Resident.residentLaunchAction({ ...idle, healthy: true, hasState: true, matches: false, alive: true })).toBe(
      "refuse-foreign",
    )
    expect(Resident.residentLaunchAction({ ...idle, healthy: true, hasState: true, matches: true, alive: false })).toBe(
      "refuse-foreign",
    )
    expect(
      Resident.residentLaunchAction({ ...idle, healthy: true, hasState: false, matches: false, alive: false }),
    ).toBe("wait-unowned")
  })

  test("starts when nothing is recorded and the port is down", () => {
    expect(
      Resident.residentLaunchAction({ ...idle, healthy: false, hasState: false, matches: false, alive: false }),
    ).toBe("spawn")
  })

  test("drops a record for a different host or port when the port is down", () => {
    expect(
      Resident.residentLaunchAction({ ...idle, healthy: false, hasState: true, matches: false, alive: false }),
    ).toBe("clear-spawn")
  })

  // Covers a graceful stop (up to 35s) plus forced stop and respawn.
  test("treats a restart mark as fresh for 120 seconds", () => {
    const now = Date.parse("2026-09-24T23:53:00.000Z")
    expect(Resident.residentRestartFresh(new Date(now - 1_000).toISOString(), now)).toBe(true)
    expect(Resident.residentRestartFresh(new Date(now - 119_000).toISOString(), now)).toBe(true)
    expect(Resident.residentRestartFresh(new Date(now - 121_000).toISOString(), now)).toBe(false)
    expect(Resident.residentRestartFresh(undefined, now)).toBe(false)
  })
})

describe("adopt resident server", () => {
  test("adopts a listener owned by our executable and records it", async () => {
    let written: { pid: number; hostname: string; port: number; executable?: string } | undefined
    const result = await Resident.adoptResidentServer("127.0.0.1", 4096, {
      findListenerPid: () => 1234,
      listProcesses: () => [{ pid: 1234, parentPid: 1, executable: OcConfig.executablePath(), startedAt: Date.now() }],
      writeState: async (input) => {
        written = input
      },
      readState: async () => undefined,
    })
    expect(result).toEqual({ ok: true, pid: 1234 })
    expect(written).toMatchObject({ pid: 1234, hostname: "127.0.0.1", port: 4096 })
  })

  test("refuses when the listener is missing or foreign", async () => {
    expect(
      await Resident.adoptResidentServer("127.0.0.1", 4096, {
        findListenerPid: () => undefined,
        readState: async () => undefined,
      }),
    ).toEqual({ ok: false })
    expect(
      await Resident.adoptResidentServer("127.0.0.1", 4096, {
        findListenerPid: () => 1234,
        listProcesses: () => [{ pid: 1234, parentPid: 1, executable: "/elsewhere/other.exe", startedAt: Date.now() }],
        writeState: async () => {
          throw new Error("must not write state for a foreign server")
        },
        readState: async () => undefined,
      }),
    ).toEqual({ ok: false, pid: 1234, executable: "/elsewhere/other.exe" })
  })

  test("reuses matching state that appears before a write and does not overwrite it", async () => {
    let writes = 0
    const reads = [undefined, { pid: 99, hostname: "127.0.0.1", port: 4096 }]
    const result = await Resident.adoptResidentServer("127.0.0.1", 4096, {
      findListenerPid: () => 1234,
      listProcesses: () => [{ pid: 1234, parentPid: 1, executable: OcConfig.executablePath(), startedAt: Date.now() }],
      writeState: async () => {
        writes++
      },
      readState: async () => reads.shift(),
      pidAlive: (pid) => pid === 99,
    })
    expect(result).toEqual({ ok: true, pid: 99 })
    expect(writes).toBe(0)
  })

  test("refuses when state appears for a different owner during adoption", async () => {
    let writes = 0
    const reads = [undefined, { pid: 50, hostname: "127.0.0.1", port: 4096 }]
    const result = await Resident.adoptResidentServer("127.0.0.1", 4096, {
      findListenerPid: () => 1234,
      listProcesses: () => [{ pid: 1234, parentPid: 1, executable: OcConfig.executablePath(), startedAt: Date.now() }],
      writeState: async () => {
        writes++
      },
      readState: async () => reads.shift(),
      pidAlive: () => false,
    })
    expect(result).toEqual({ ok: false, pid: 50 })
    expect(writes).toBe(0)
  })

  test("propagates resident state write failures", async () => {
    await expect(
      Resident.adoptResidentServer("127.0.0.1", 4096, {
        findListenerPid: () => 1234,
        listProcesses: () => [
          { pid: 1234, parentPid: 1, executable: OcConfig.executablePath(), startedAt: Date.now() },
        ],
        writeState: async () => {
          throw new Error("disk full")
        },
        readState: async () => undefined,
      }),
    ).rejects.toThrow("disk full")
  })

  test("keeps a matching live record without rewriting it", async () => {
    let writes = 0
    const result = await Resident.adoptResidentServer("127.0.0.1", 4096, {
      findListenerPid: () => {
        throw new Error("must not scan listeners when state exists")
      },
      writeState: async () => {
        writes++
      },
      readState: async () => ({ pid: 77, hostname: "127.0.0.1", port: 4096 }),
      pidAlive: () => true,
    })
    expect(result).toEqual({ ok: true, pid: 77 })
    expect(writes).toBe(0)
  })
})

describe("resident listener selection", () => {
  test("selects the listener on the requested hostname, not another socket on the same port", () => {
    const rows = [
      { address: "::1", port: 4096, pid: 11 },
      { address: "127.0.0.1", port: 4096, pid: 22 },
      { address: "0.0.0.0", port: 4096, pid: 33 },
    ]
    expect(Resident.uniqueListenerPid("127.0.0.1", 4096, rows)).toBe(22)
    expect(Resident.uniqueListenerPid("::1", 4096, rows)).toBe(11)
    expect(
      Resident.uniqueListenerPid("127.0.0.1", 4096, [
        { address: "127.0.0.1", port: 4096, pid: 22 },
        { address: "::ffff:127.0.0.1", port: 4096, pid: 22 },
      ]),
    ).toBe(22)
    expect(
      Resident.uniqueListenerPid("127.0.0.1", 4096, [
        { address: "127.0.0.1", port: 4096, pid: 22 },
        { address: "127.0.0.1", port: 4096, pid: 44 },
      ]),
    ).toBeUndefined()
    expect(Resident.uniqueListenerPid("localhost", 4096, rows)).toBeUndefined()
    expect(
      Resident.uniqueListenerPid("localhost", 4096, [
        { address: "127.0.0.1", port: 4096, pid: 22 },
        { address: "::1", port: 4096, pid: 22 },
      ]),
    ).toBe(22)
  })
})

describe("resident state write", () => {
  test("replaces an existing record by rename without leaving a temp file", async () => {
    await using tmp = await tmpdir()
    await Resident.writeResidentState({ pid: 10, hostname: "127.0.0.1", port: 4096, directory: tmp.path })
    await Resident.writeResidentState({
      pid: 11,
      hostname: "127.0.0.1",
      port: 4096,
      executable: "oc",
      directory: tmp.path,
    })
    const written = JSON.parse(await fs.readFile(Resident.serverStatePath(tmp.path), "utf8"))
    expect(written.pid).toBe(11)
    expect(written.executable).toBe("oc")
    expect((await fs.readdir(tmp.path)).filter((name) => name.includes(".tmp-"))).toEqual([])
  })
})

describe("canonical child executable", () => {
  // The resident server runs as oc, never native opencode, so only the occ hard link is remapped.
  test("maps occ to sibling oc and keeps oc", () => {
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\oc.exe")).toBe("C:\\Apps\\opencode\\oc.exe")
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\occ.exe")).toBe("C:\\Apps\\opencode\\oc.exe")
    expect(OcConfig.executablePath("/usr/local/bin/oc")).toBe("/usr/local/bin/oc")
    expect(OcConfig.executablePath("/usr/local/bin/occ")).toBe("/usr/local/bin/oc")
  })

  test("leaves bun and opencode unchanged", () => {
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\opencode.exe")).toBe("C:\\Apps\\opencode\\opencode.exe")
    expect(OcConfig.executablePath("/usr/local/bin/bun")).toBe("/usr/local/bin/bun")
    expect(OcConfig.executablePath("C:\\Program Files\\bun\\bun.exe")).toBe("C:\\Program Files\\bun\\bun.exe")
  })

  test("preserves bun entrypoint detection", () => {
    expect(OcConfig.executablePath("/usr/local/bin/bun").toLowerCase()).toContain("bun")
    expect(OcConfig.executablePath("C:\\Apps\\opencode\\oc.exe").toLowerCase()).not.toContain("bun")
  })
})

describe("OC config", () => {
  test("retires unsupported CLI keys while preserving saved fields", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    ;(Global.Path as { config: string }).config = directory
    const retired = {
      initModel: "old",
      initAgent: "old",
      initReasoningEffort: "high",
      reasoningEffort: "high",
      defaultSubagent: "old",
      defaultSubagentModel: "old",
    }
    await Bun.write(path.join(directory, "oc.json"), JSON.stringify(retired))
    for (const key of Object.keys(retired)) expect(OcConfig.keys).not.toContain(key)
    await OcConfig.update("sessionAgent", "build")
    expect(await OcConfig.read()).toEqual({ ...retired, sessionAgent: "build" })
  })

  test("malformed oc.json names the file and keeps the parse error as the cause", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    ;(Global.Path as { config: string }).config = directory
    await Bun.write(path.join(directory, "oc.json"), "{ not json")
    const error = await OcConfig.read().catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toStartWith(`Failed to read ${path.join(directory, "oc.json")}: `)
    expect((error as Error).cause).toBeInstanceOf(SyntaxError)
  })

  test("a port held by an unrelated program fails with a clear error instead of spawning", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-oc-"))
    temporaryDirectories.push(directory)
    const originalState = Global.Path.state
    ;(Global.Path as { config: string }).config = directory
    ;(Global.Path as { state: string }).state = directory
    // Answers every request with 404, so our authenticated health check is false.
    const foreign = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("nope", { status: 404 }) })
    try {
      for (const hostname of ["127.0.0.1", "localhost"]) {
        await Bun.write(path.join(directory, "oc.json"), JSON.stringify({ server: { hostname, port: foreign.port } }))
        const error = await Resident.startServer().catch((cause: unknown) => cause)
        expect((error as Error).message).toContain(`Resident port ${hostname}:${foreign.port} is in use by another program`)
      }
      expect(await fs.stat(Resident.serverStatePath(directory)).catch(() => undefined)).toBeUndefined()
      expect((await fetch(`http://127.0.0.1:${foreign.port}/`)).status).toBe(404)
    } finally {
      foreign.stop(true)
      ;(Global.Path as { state: string }).state = originalState
    }
  }, 60_000)

  test("rejects nonboolean startup settings before registration or persistence", async () => {
    await expect(OcConfig.update("serverStartOnWindowsUserStart", "yes")).rejects.toThrow("must be true or false")
  })

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
    let registration: string | undefined
    const startup = {
      context: { ...Startup.context(), platform: "win32" as const, powershell: "C:\\pwsh.exe", state: directory },
      registry: {
        read: async () => registration,
        write: async (_name: string, value: string | undefined) => {
          registration = value
        },
      },
    }
    await OcConfig.update("serverStartOnWindowsUserStart", "true", startup)
    expect(registration).toContain("-WindowStyle Hidden")
    await OcConfig.update("ocDir", "C:/Users/example")

    expect(await OcConfig.read()).toEqual({
      ocDir: "C:/Users/example",
      homeDirSort: "modified",
      server: { hostname: "127.0.0.1", port: 4096, startOnWindowsUserStart: true },
    })
    await OcConfig.update("serverStartOnWindowsUserStart", "false", startup)
    expect(registration).toBeUndefined()
    expect((await OcConfig.read()).server?.startOnWindowsUserStart).toBe(false)
  })
})
