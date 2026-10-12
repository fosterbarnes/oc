import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { OcConfig } from "../../src/config/oc"
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
  expect(OcConfig.isPidAlive(identity.pid, identity, () => [identity])).toBe(true)
  expect(OcConfig.isPidAlive(identity.pid, identity, () => [{ ...identity, created: "2" }])).toBe(false)
  expect(OcConfig.isPidAlive(identity.pid, identity, () => [])).toBe(false)
  expect(() =>
    OcConfig.isPidAlive(identity.pid, identity, () => {
      throw new Error("CIM unavailable")
    }),
  ).toThrow("CIM unavailable")
})

test("startup lock cannot expire under a live launcher, including beyond the old ten-second cutoff", () => {
  expect(OcConfig.startupLockExpired(identity, [identity], 10_001)).toBe(false)
  expect(OcConfig.startupLockExpired(identity, [identity], 300_000)).toBe(false)
  expect(OcConfig.startupLockExpired(identity, [{ ...identity, created: "2" }], 100)).toBe(true)
  expect(OcConfig.startupLockExpired(identity, [], 100)).toBe(true)
  expect(OcConfig.startupLockExpired({ pid: identity.pid }, [identity], 300_000)).toBe(false)
  expect(OcConfig.startupLockExpired(identity, [{ ...identity, executable: "" }], 300_000)).toBe(false)
  expect(OcConfig.startupLockExpired(undefined, [], 10_001)).toBe(false)
})

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
  expect(OcConfig.residentRestartFresh(new Date(now - 35_000).toISOString(), now)).toBe(true)
  expect(
    OcConfig.residentLaunchAction({ healthy: true, hasState: true, matches: true, alive: true, restartingFresh: true }),
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
  const written: Array<Parameters<typeof OcConfig.writeResidentState>[0]> = []
  expect(
    await OcConfig.adoptResidentServer("127.0.0.1", 4096, {
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
    await OcConfig.adoptResidentServer("127.0.0.1", 4096, {
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
    await OcConfig.writeResidentState({ ...identity, hostname: "127.0.0.1", port: 4096, directory })
    expect(await Bun.file(OcConfig.serverStatePath(directory)).json()).toMatchObject({ created: identity.created })
    await OcConfig.writeResidentState({
      ...identity,
      hostname: "127.0.0.1",
      port: 4096,
      directory,
      restarting: new Date().toISOString(),
    })
    await clearResidentStateForRestart(directory)
    expect(await Bun.file(OcConfig.serverStatePath(directory)).json()).toMatchObject({ created: identity.created })
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
    await expect(TuiLedger.read(directory, [{ ...identity, created: "2" }])).rejects.toThrow(
      "identity unavailable or changed",
    )
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
