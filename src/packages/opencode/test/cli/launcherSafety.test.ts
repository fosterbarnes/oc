import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { OcConfig } from "../../src/config/oc"
import { Resident } from "../../src/config/resident"
import { TuiLedger } from "../../src/config/tuiLedger"
import { Revive } from "../../src/config/revive"
import { ServerLifecycle } from "../../src/server/lifecycle"
import { Global } from "@opencode-ai/core/global"
import { clearResidentStateForRestart } from "../../src/cli/cmd/serve"
import { detachedCommand, windowsArguments } from "@opencode-ai/core/util/launchDetached"

const identity = {
  pid: 123,
  parentPid: 10,
  executable: OcConfig.executablePath(),
  startedAt: 1000,
  created: "134100000000000001",
}

test("CIM identity requires the exact creation stamp and executable, not an uptime estimate", () => {
  expect(TuiLedger.sameIdentity(identity, { ...identity, startedAt: 5000 })).toBe(true)
  expect(TuiLedger.sameIdentity(identity, { ...identity, created: "134100000000000002" })).toBe(false)
  expect(TuiLedger.sameIdentity(identity, { ...identity, executable: "C:\\other\\oc.exe" })).toBe(false)
  expect(TuiLedger.sameIdentity({ pid: identity.pid, executable: identity.executable }, identity)).toBe(false)
  expect(TuiLedger.sameIdentity({ ...identity, created: "" }, identity)).toBe(false)
})

test("resident liveness uses injected CIM identities and propagates unavailable proof", () => {
  expect(Resident.isPidAlive(identity.pid, identity, () => [identity])).toBe(true)
  expect(Resident.isPidAlive(identity.pid, identity, () => [{ ...identity, created: "2" }])).toBe(false)
  expect(Resident.isPidAlive(identity.pid, identity, () => [])).toBe(false)
  expect(() =>
    Resident.isPidAlive(identity.pid, identity, () => {
      throw new Error("CIM unavailable")
    }),
  ).toThrow("CIM unavailable")
})

test("startup lock cannot expire under a live launcher, including beyond the old ten-second cutoff", () => {
  expect(Resident.startupLockExpired(identity, [identity], 10_001)).toBe(false)
  expect(Resident.startupLockExpired(identity, [identity], 300_000)).toBe(false)
  expect(Resident.startupLockExpired(identity, [{ ...identity, created: "2" }], 100)).toBe(true)
  expect(Resident.startupLockExpired(identity, [], 100)).toBe(true)
  expect(Resident.startupLockExpired({ pid: identity.pid }, [identity], 300_000)).toBe(false)
  expect(Resident.startupLockExpired(identity, [{ ...identity, executable: "" }], 300_000)).toBe(false)
  expect(Resident.startupLockExpired(undefined, [], 10_001)).toBe(false)
})

test("resident URLs bracket IPv6 loopback and keep IPv4 and localhost", () => {
  expect(Resident.residentUrl("::1", 4096)).toBe("http://[::1]:4096")
  expect(new URL(`${Resident.residentUrl("::1", 4096)}/global/health`).host).toBe("[::1]:4096")
  expect(Resident.residentUrl("127.0.0.1", 4096)).toBe("http://127.0.0.1:4096")
  expect(Resident.residentUrl("localhost", 4097)).toBe("http://localhost:4097")
})

test("an unreadable startup lock is recovered by age, never while recent or owned by a live process", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ocStartupLock-"))
  const lock = path.join(directory, "oc-server.json.lock")
  const age = async (contents: string, seconds: number) => {
    await fs.writeFile(lock, contents)
    const time = new Date(Date.now() - seconds * 1000)
    await fs.utimes(lock, time, time)
  }
  try {
    for (const partial of ["", '{"pid":12', "null", '{"pid":"x"}']) {
      await age(partial, 180)
      expect(await Resident.withResidentLock(async () => "ran", { lock, attempts: 3 })).toBe("ran")
      expect(await fs.stat(lock).catch(() => undefined)).toBeUndefined()
    }
    // A lock still being written is not stolen.
    await age("", 5)
    await expect(Resident.withResidentLock(async () => "ran", { lock, attempts: 3 })).rejects.toThrow("Timed out")
    expect(await fs.readFile(lock, "utf8")).toBe("")
    // An old lock whose owner is this live process stays, however old.
    const owner = (await TuiLedger.listProcessesAsync()).find((item) => item.pid === process.pid) ?? { pid: process.pid }
    await age(JSON.stringify(owner), 600)
    await expect(Resident.withResidentLock(async () => "ran", { lock, attempts: 3 })).rejects.toThrow("Timed out")
    expect(JSON.parse(await fs.readFile(lock, "utf8")).pid).toBe(process.pid)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 60_000)

test("a second revive install fails fast with the busy message while the first holds the lock", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ocInstallLock-"))
  const lock = path.join(directory, ".revive.lock")
  const busy = "Another revive is already installing oc"
  let release = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  try {
    let entered = () => {}
    const inside = new Promise<void>((resolve) => (entered = resolve))
    const first = Resident.withResidentLock(
      async () => {
        entered()
        await held
        return "first"
      },
      { lock, attempts: 3, busy },
    )
    await inside
    await expect(Resident.withResidentLock(async () => "second", { lock, attempts: 3, busy })).rejects.toThrow(busy)
    release()
    expect(await first).toBe("first")
    expect(await Resident.withResidentLock(async () => "third", { lock, attempts: 3, busy })).toBe("third")
  } finally {
    release()
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 60_000)

test("ledger parent ownership compares exact CIM times even within the same millisecond", () => {
  const record = { ...identity, instance: Global.Path.app }
  const parent = { ...identity, pid: identity.parentPid, parentPid: 1, created: "134100000000000002" }
  expect(TuiLedger.select([record], [identity, parent], Global.Path.app, identity.executable, 999)).toEqual([
    identity.pid,
  ])
  expect(
    TuiLedger.select(
      [record],
      [identity, { ...parent, created: "134100000000000000" }],
      Global.Path.app,
      identity.executable,
      999,
    ),
  ).toEqual([identity.pid, parent.pid])
})

test("Start-Process argv quoting handles empty strings, embedded quotes and trailing backslashes", () => {
  expect(windowsArguments([""])).toBe('""')
  expect(windowsArguments(["two words"])).toBe('"two words"')
  expect(windowsArguments(['say "hi"'])).toBe('"say \\"hi\\""')
  expect(windowsArguments(['a\\"b'])).toBe('"a\\\\\\"b"')
  expect(windowsArguments(["C:\\two words\\"])).toBe('"C:\\two words\\\\"')
  expect(windowsArguments(["$HOME; & %literal%"])).toBe('"$HOME; & %literal%"')
  expect(
    detachedCommand(identity.executable, ['say "hi"', "C:\\two words\\"], {}, "win32").options.env.OC_LAUNCH_ARGS,
  ).toBe('"say \\"hi\\"" "C:\\two words\\\\"')
})

test("fresh restarting state wins over healthy reuse throughout the thirty-second drain", () => {
  const now = Date.parse("2026-10-12T00:00:00Z")
  expect(Resident.residentRestartFresh(new Date(now - 35_000).toISOString(), now)).toBe(true)
  expect(
    Resident.residentLaunchAction({ healthy: true, hasState: true, matches: true, alive: true, restartingFresh: true }),
  ).toBe("wait")
})

test("HTTP restart disables health before awaiting its restart mark or starting the drain", async () => {
  const order: string[] = []
  const clear = ServerLifecycle.setController({
    shutdown() {},
    restart() {},
    markRestart: async () => {
      expect(ServerLifecycle.isHealthy()).toBe(false)
      order.push("marked")
    },
  })
  try {
    expect(ServerLifecycle.isHealthy()).toBe(true)
    await ServerLifecycle.beginShutdown(true)
    order.push("drain")
    expect(order).toEqual(["marked", "drain"])
    expect(ServerLifecycle.isHealthy()).toBe(false)
  } finally {
    clear()
    ServerLifecycle.setController({ shutdown() {}, restart() {} })()
  }
})

test("adoption records the listener's CIM creation identity and rejects PID reuse", async () => {
  const written: Array<Parameters<typeof Resident.writeResidentState>[0]> = []
  expect(
    await Resident.adoptResidentServer("127.0.0.1", 4096, {
      findListenerPid: () => identity.pid,
      listProcesses: () => [identity],
      readState: async () => undefined,
      writeState: async (input) => {
        written.push(input)
      },
    }),
  ).toEqual({ ok: true, pid: identity.pid })
  expect(written[0]).toMatchObject({ created: identity.created, executable: identity.executable })
  expect(
    await Resident.adoptResidentServer("127.0.0.1", 4096, {
      listProcesses: () => [{ ...identity, created: "2" }],
      readState: async () => ({ ...identity, hostname: "127.0.0.1", port: 4096 }),
      writeState: async () => {
        throw new Error("must not overwrite the old identity")
      },
    }),
  ).toEqual({ ok: false, pid: identity.pid })
})

test("resident state and CLI ledger preserve exact identities without querying or stopping processes", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ocLauncherSafety-"))
  try {
    await Resident.writeResidentState({ ...identity, hostname: "127.0.0.1", port: 4096, directory })
    expect(await Bun.file(Resident.serverStatePath(directory)).json()).toMatchObject({ created: identity.created })
    await Resident.writeResidentState({
      ...identity,
      hostname: "127.0.0.1",
      port: 4096,
      directory,
      restarting: new Date().toISOString(),
    })
    await clearResidentStateForRestart(directory, identity.pid)
    expect(await Bun.file(Resident.serverStatePath(directory)).json()).toMatchObject({ created: identity.created })
    await TuiLedger.register(directory, identity.pid, [identity])
    await fs.writeFile(
      path.join(directory, "oc-tuis", `${identity.pid}.json`),
      JSON.stringify({
        ...identity,
        created: undefined,
        instance: Global.Path.app,
        startedAt: 9000,
      }),
    )
    const records = await TuiLedger.read(directory, [identity])
    expect(records[0]?.created).toBe(identity.created)
    expect(TuiLedger.select(records, [identity], Global.Path.app, identity.executable, 999)).toEqual([identity.pid])
    expect(await TuiLedger.read(directory, [{ ...identity, created: "2" }])).toEqual([])
    await TuiLedger.remove(directory, identity.pid)
    expect(await fs.readdir(path.join(directory, "oc-tuis"))).toEqual([])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test("revive carries its captured shell identity and rejects a different shell PID", () => {
  const context = {
    terminal: "generic",
    launcher: "occ",
    executable: identity.executable,
    shellPid: identity.pid,
    shellIdentity: identity,
  }
  expect(Revive.decodeRestart(Revive.encode(context)).shellIdentity).toEqual(identity)
  expect(() => Revive.decodeRestart(Revive.encode({ ...context, shellPid: 456 }))).toThrow("Invalid revive restart")
})
