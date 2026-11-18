/**
 * Synced Claude account info (warmup/synced.ts: oc.json `claudeAccounts`, keyed by email), the
 * folder -> email identity map, the legacy migration, and the loop's housekeeping. Scheduling
 * itself is in warmup.test.ts.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { OcConfig } from "@/config/oc"
import { _resetIdentities, dirOf, emailOf, forgetIdentity, noteProbe } from "@/provider/claude-code/warmup/identities"
import { createHousekeeping, migrateLegacy } from "@/provider/claude-code/warmup/migrate"
import { readStore, ScheduleValidationError } from "@/provider/claude-code/warmup/store"
import {
  _setClaudeAccounts,
  editClaudeAccounts,
  emailKey,
  parseClaudeAccounts,
  readClaudeAccounts,
  saveName,
  saveWarmup,
  type SyncedAccounts,
} from "@/provider/claude-code/warmup/synced"

let dir = ""

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "warmup-sync-"))
  _setClaudeAccounts({})
  _resetIdentities(null)
})

afterEach(() => {
  _setClaudeAccounts(undefined)
  _resetIdentities(undefined)
  rmSync(dir, { recursive: true, force: true })
})

const daily = (times: string[]) => ({ mode: "daily" as const, times })

describe("synced accounts", () => {
  test("parse: lowercases emails, trims names, drops bad entries and invalid schedules", () => {
    const parsed = parseClaudeAccounts({
      "Team@Example.Test": {
        name: "  Team1 ",
        warmup: { enabled: true, schedule: { mode: "daily", times: ["12:00", "07:00"] }, updatedAt: 42 },
      },
      "not-an-email": { name: "ignored" },
      "bad@example.test": { name: 7, warmup: { enabled: true, schedule: { mode: "daily", times: ["25:00"] } } },
      "empty@example.test": { warmup: { enabled: true, schedule: { mode: "daily", times: [] } } },
      "text@example.test": "nope",
    })
    expect(parsed["team@example.test"]).toEqual({
      name: "Team1",
      warmup: { enabled: true, schedule: daily(["07:00", "12:00"]), updatedAt: 42 },
    })
    expect(parsed["not-an-email"]).toBeUndefined()
    expect(parsed["text@example.test"]).toBeUndefined()
    // An invalid schedule is dropped, the entry stays; an empty schedule can never be enabled.
    expect(parsed["bad@example.test"]).toEqual({})
    expect(parsed["empty@example.test"]).toEqual({ warmup: { enabled: false, schedule: daily([]), updatedAt: 0 } })
    expect(parseClaudeAccounts(undefined)).toEqual({})
    expect(parseClaudeAccounts([])).toEqual({})
    expect(emailKey("  A@B.C ")).toBe("a@b.c")
  })

  test("saveWarmup: normalizes times, sets updatedAt, and keeps other accounts and the name", async () => {
    _setClaudeAccounts({ "b@example.test": { name: "Other" }, "a@example.test": { name: "Team1" } })
    const saved = await saveWarmup({
      email: "A@Example.test",
      enabled: true,
      schedule: daily(["12:00", "07:00", "07:00"]),
      now: 1000,
    })
    expect(saved).toEqual({
      name: "Team1",
      warmup: { enabled: true, schedule: daily(["07:00", "12:00"]), updatedAt: 1000 },
    })
    expect(readClaudeAccounts()["b@example.test"]).toEqual({ name: "Other" })
    expect(readClaudeAccounts()["a@example.test"]).toEqual(saved)
  })

  test("saveWarmup: a pause or resume with identical times keeps updatedAt; new times move it", async () => {
    await saveWarmup({ email: "a@example.test", enabled: true, schedule: daily(["07:00", "12:00"]), now: 1000 })
    const paused = await saveWarmup({
      email: "a@example.test",
      enabled: false,
      schedule: daily(["12:00", "07:00"]),
      now: 2000,
    })
    expect(paused.warmup).toEqual({ enabled: false, schedule: daily(["07:00", "12:00"]), updatedAt: 1000 })
    const resumed = await saveWarmup({
      email: "a@example.test",
      enabled: true,
      schedule: daily(["07:00", "12:00"]),
      now: 3000,
    })
    expect(resumed.warmup).toEqual({ enabled: true, schedule: daily(["07:00", "12:00"]), updatedAt: 1000 })
    const changed = await saveWarmup({ email: "a@example.test", enabled: true, schedule: daily(["07:00"]), now: 4000 })
    expect(changed.warmup?.updatedAt).toBe(4000)
  })

  test("saveWarmup: an empty schedule forces enabled off; a bad clock is rejected before any write", async () => {
    const cleared = await saveWarmup({ email: "a@example.test", enabled: true, schedule: daily([]), now: 1000 })
    expect(cleared.warmup).toEqual({ enabled: false, schedule: daily([]), updatedAt: 1000 })
    await expect(
      saveWarmup({ email: "z@example.test", enabled: true, schedule: daily(["25:00"]) }),
    ).rejects.toBeInstanceOf(ScheduleValidationError)
    await expect(saveWarmup({ email: "z@example.test", enabled: true, schedule: "daily" })).rejects.toBeInstanceOf(
      ScheduleValidationError,
    )
    expect(readClaudeAccounts()["z@example.test"]).toBeUndefined()
  })

  test("saveName: a blank name clears it, keeps the schedule, and keeps an empty entry as the cleared marker", async () => {
    await saveName("A@example.test", "  Team1 ")
    expect(readClaudeAccounts()["a@example.test"]).toEqual({ name: "Team1" })
    await saveWarmup({ email: "a@example.test", enabled: true, schedule: daily(["07:00"]), now: 5 })
    await saveName("a@example.test", "   ")
    expect(readClaudeAccounts()["a@example.test"]).toEqual({
      warmup: { enabled: true, schedule: daily(["07:00"]), updatedAt: 5 },
    })
    await saveName("b@example.test", "Gone")
    await saveName("b@example.test", undefined)
    // Kept, not deleted: an entry without a name makes every machine drop its local copy.
    expect(readClaudeAccounts()["b@example.test"]).toEqual({})
  })

  test("concurrent edits do not lose each other's account", async () => {
    await Promise.all([
      saveWarmup({ email: "a@example.test", enabled: true, schedule: daily(["07:00"]), now: 1 }),
      saveWarmup({ email: "b@example.test", enabled: true, schedule: daily(["08:00"]), now: 1 }),
      saveName("c@example.test", "C"),
    ])
    expect(Object.keys(readClaudeAccounts()).toSorted()).toEqual(["a@example.test", "b@example.test", "c@example.test"])
  })

  test("oc.json: edits write only claudeAccounts, keep comments and other keys, and drop the key when empty", async () => {
    _setClaudeAccounts(undefined)
    const file = OcConfig.filePath()
    // The preload isolates XDG paths; never touch a real config.
    expect(file).toContain("opencode-test-data-")
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, '{\n  // keep me\n  "claudeFailover": "ask"\n}\n', "utf8")
    try {
      await saveWarmup({ email: "A@Example.test", enabled: true, schedule: daily(["07:00"]), now: 77 })
      await saveName("a@example.test", "Team1")
      const text = readFileSync(file, "utf8")
      expect(text).toContain("// keep me")
      expect(text).toContain('"claudeFailover": "ask"')
      expect(readClaudeAccounts()["a@example.test"]).toEqual({
        name: "Team1",
        warmup: { enabled: true, schedule: daily(["07:00"]), updatedAt: 77 },
      })
      // Only the lowercased email, name and schedule are stored.
      expect(JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")).claudeAccounts).toEqual({
        "a@example.test": { name: "Team1", warmup: { enabled: true, schedule: daily(["07:00"]), updatedAt: 77 } },
      })
      await editClaudeAccounts(() => ({}))
      expect(readFileSync(file, "utf8")).not.toContain("claudeAccounts")
      expect(readFileSync(file, "utf8")).toContain("// keep me")
      expect(readClaudeAccounts()).toEqual({})
    } finally {
      rmSync(file, { force: true })
    }
  })
})

describe("identities", () => {
  test("probe -> email: connected sets it, unknown keeps it, signed-out and forget remove it", () => {
    expect(emailOf("/d/a")).toBeUndefined()
    noteProbe("/d/a", "connected", "A@Example.test")
    expect(emailOf("/d/a")).toBe("a@example.test")
    // A connected probe without an email, and an unknown probe, change nothing.
    noteProbe("/d/a", "connected")
    noteProbe("/d/a", "unknown")
    expect(emailOf("/d/a")).toBe("a@example.test")
    // A folder re-signed to another account follows the probe.
    noteProbe("/d/a", "connected", "b@example.test")
    expect(emailOf("/d/a")).toBe("b@example.test")
    noteProbe("/d/a", "signed-out")
    expect(emailOf("/d/a")).toBeUndefined()
    noteProbe("/d/b", "connected", "b@example.test")
    forgetIdentity("/d/b")
    expect(emailOf("/d/b")).toBeUndefined()
  })

  test("dirOf: the first folder signed in to the email, case-insensitively", () => {
    noteProbe("/d/a", "connected", "x@example.test")
    noteProbe("/d/b", "connected", "y@example.test")
    noteProbe("/d/c", "connected", "y@example.test")
    expect(dirOf("Y@Example.test", ["/d/a", "/d/b", "/d/c"])).toBe("/d/b")
    expect(dirOf("y@example.test", ["/d/c", "/d/b"])).toBe("/d/c")
    expect(dirOf("z@example.test", ["/d/a", "/d/b"])).toBeUndefined()
    expect(dirOf("x@example.test", [])).toBeUndefined()
  })

  test("the map is persisted and reloads before the first probe after a restart", () => {
    const file = path.join(dir, "identities.json")
    _resetIdentities(file)
    noteProbe("/d/a", "connected", "a@example.test")
    noteProbe("/d/b", "connected", "b@example.test")
    noteProbe("/d/b", "signed-out")
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "/d/a": "a@example.test" })
    _resetIdentities(file)
    expect(emailOf("/d/a")).toBe("a@example.test")
    expect(emailOf("/d/b")).toBeUndefined()
    writeFileSync(file, "garbage", "utf8")
    _resetIdentities(file)
    expect(emailOf("/d/a")).toBeUndefined()
  })
})

describe("migrateLegacy", () => {
  const legacyFile = () => path.join(dir, "warmup.json")
  const runtimeFile = () => path.join(dir, "warmup-state.json")
  const attempt = { scheduledAt: 100, attemptedAt: 110, outcome: "sent", host: "mac" } as const

  function writeLegacy() {
    writeFileSync(
      legacyFile(),
      JSON.stringify({
        accounts: {
          "/d/a": { enabled: true, schedule: daily(["07:00", "12:00"]), lastAttempt: attempt },
          "/d/b": { enabled: true, schedule: daily(["09:00"]) },
          "/d/c": { enabled: false, schedule: daily(["10:00"]) },
        },
      }),
      "utf8",
    )
  }

  const names: Record<string, string> = { "/d/a": "Team1", "/d/b": "Local B" }

  test("moves dir-keyed schedules and names to claudeAccounts by email, copies lastAttempt, second run is a no-op", async () => {
    writeLegacy()
    noteProbe("/d/a", "connected", "a@example.test")
    noteProbe("/d/b", "connected", "B@example.test")
    const input = {
      dirs: ["/d/a", "/d/b", "/d/c", "/d/unknown"],
      legacyFile: legacyFile(),
      runtimeFile: runtimeFile(),
      nameOf: (dirName: string) => names[dirName],
      now: 5000,
    }
    await migrateLegacy(input)
    const after = readClaudeAccounts()
    expect(after["a@example.test"]).toEqual({
      name: "Team1",
      warmup: { enabled: true, schedule: daily(["07:00", "12:00"]), updatedAt: 5000 },
    })
    expect(after["b@example.test"]).toEqual({
      name: "Local B",
      warmup: { enabled: true, schedule: daily(["09:00"]), updatedAt: 5000 },
    })
    // A folder with no known email has nothing to key by.
    expect(Object.keys(after)).not.toContain("/d/unknown")
    // The legacy lastAttempt lands in the runtime store under the email.
    expect(readStore(runtimeFile()).accounts["a@example.test"]?.lastAttempt).toEqual(attempt)
    // The legacy file is left in place.
    expect(readFileSync(legacyFile(), "utf8")).toContain("/d/a")

    const snapshot = structuredClone(readClaudeAccounts())
    await migrateLegacy({ ...input, now: 9999 })
    expect(readClaudeAccounts()).toEqual(snapshot)
  })

  test("an account that already has an entry is left alone; only unsynced accounts are created", async () => {
    writeLegacy()
    noteProbe("/d/a", "connected", "a@example.test")
    noteProbe("/d/b", "connected", "b@example.test")
    const peerSchedule = { enabled: true, schedule: daily(["20:00"]), updatedAt: 11 }
    _setClaudeAccounts({
      // Synced from a peer without a name (or with its name cleared since): no local name comes back.
      "a@example.test": { warmup: peerSchedule },
      // Synced with a name but no schedule: the peer's entry is the truth; nothing is added.
      "b@example.test": { name: "Peer B" },
    })
    await migrateLegacy({
      dirs: ["/d/a", "/d/b"],
      legacyFile: legacyFile(),
      runtimeFile: runtimeFile(),
      nameOf: (dirName) => names[dirName],
      now: 5000,
    })
    const after = readClaudeAccounts()
    expect(after["a@example.test"]).toEqual({ warmup: peerSchedule })
    expect(after["b@example.test"]).toEqual({ name: "Peer B" })
  })

  test("an upgraded machine with no schedules and no names writes nothing", async () => {
    noteProbe("/d/a", "connected", "a@example.test")
    const accounts: SyncedAccounts = {
      "a@example.test": { name: "Mac name", warmup: { enabled: true, schedule: daily(["07:00"]), updatedAt: 1 } },
    }
    _setClaudeAccounts(accounts)
    await migrateLegacy({
      dirs: ["/d/a"],
      legacyFile: legacyFile(),
      runtimeFile: runtimeFile(),
      nameOf: () => undefined,
      now: 5000,
    })
    expect(readClaudeAccounts()).toEqual({
      "a@example.test": { name: "Mac name", warmup: { enabled: true, schedule: daily(["07:00"]), updatedAt: 1 } },
    })
    expect(Object.keys(readStore(runtimeFile()).accounts)).toEqual([])
  })

  test("a legacy schedule with no times is not migrated", async () => {
    writeFileSync(
      legacyFile(),
      JSON.stringify({ accounts: { "/d/a": { enabled: false, schedule: daily([]) } } }),
      "utf8",
    )
    noteProbe("/d/a", "connected", "a@example.test")
    await migrateLegacy({
      dirs: ["/d/a"],
      legacyFile: legacyFile(),
      runtimeFile: runtimeFile(),
      nameOf: () => undefined,
    })
    expect(readClaudeAccounts()["a@example.test"]?.warmup).toBeUndefined()
  })
})

describe("housekeeping", () => {
  test("probes once, waits for ready, migrates each identified folder once, and projects synced names", async () => {
    const calls = { probe: 0, migrateNames: 0, projected: [] as Array<Array<string | null | undefined>> }
    let ready = false
    _setClaudeAccounts({})
    const legacy = path.join(dir, "warmup.json")
    writeFileSync(
      legacy,
      JSON.stringify({ accounts: { "/d/a": { enabled: true, schedule: daily(["07:00"]) } } }),
      "utf8",
    )
    const housekeeping = createHousekeeping({
      ready: () => ready,
      legacyFile: legacy,
      runtimeFile: path.join(dir, "warmup-state.json"),
      probe: async () => {
        calls.probe += 1
        noteProbe("/d/a", "connected", "a@example.test")
      },
      nameOf: (dirName) => {
        calls.migrateNames += 1
        return dirName === "/d/a" ? "Shared A" : undefined
      },
      project: async (dirs, syncedName) => {
        calls.projected.push(dirs.map(syncedName))
      },
      accounts: () => readClaudeAccounts(),
    })
    await housekeeping("claude", ["/d/a", "/d/b"])
    // Before the first sync pull: identities resolve, but nothing is migrated or projected.
    expect(calls.probe).toBe(1)
    expect(calls.projected).toEqual([])
    expect(readClaudeAccounts()["a@example.test"]?.warmup).toBeUndefined()

    ready = true
    await housekeeping("claude", ["/d/a", "/d/b"])
    expect(calls.probe).toBe(1)
    expect(readClaudeAccounts()["a@example.test"]).toMatchObject({
      name: "Shared A",
      warmup: { enabled: true, schedule: daily(["07:00"]) },
    })
    expect(calls.projected).toEqual([["Shared A", undefined]])
    const namesAsked = calls.migrateNames
    await housekeeping("claude", ["/d/a", "/d/b"])
    // Already migrated: not asked again; projection still runs (it writes only on change).
    expect(calls.migrateNames).toBe(namesAsked)
    expect(calls.projected).toHaveLength(2)
  })

  test("re-probes every 5 minutes while no folder has a known identity, and stops once one is learned", async () => {
    let clock = 1_000_000
    const dateNow = spyOn(Date, "now").mockImplementation(() => clock)
    try {
      let probes = 0
      const housekeeping = createHousekeeping({
        ready: () => false,
        legacyFile: null,
        runtimeFile: null,
        // The CLI is unavailable at boot and on the first retry; the second retry identifies the folder.
        probe: async () => {
          probes += 1
          if (probes === 3) noteProbe("/d/a", "connected", "a@example.test")
        },
        nameOf: () => undefined,
        project: async () => undefined,
        accounts: () => ({}),
      })
      const minutes = (count: number) => {
        clock += count * 60_000
      }
      await housekeeping("claude", ["/d/a"])
      expect(probes).toBe(1)
      minutes(4)
      await housekeeping("claude", ["/d/a"])
      expect(probes).toBe(1)
      minutes(2)
      await housekeeping("claude", ["/d/a"])
      expect(probes).toBe(2)
      minutes(6)
      await housekeeping("claude", ["/d/a"])
      expect(probes).toBe(3)
      expect(emailOf("/d/a")).toBe("a@example.test")
      // Identified: no more probes, however long it has been.
      minutes(60)
      await housekeeping("claude", ["/d/a"])
      expect(probes).toBe(3)
    } finally {
      dateNow.mockRestore()
    }
  })
})

describe("cleared names", () => {
  test("projection: a synced name sets, a synced account without one clears, an unknown account is left", async () => {
    noteProbe("/d/a", "connected", "a@example.test")
    noteProbe("/d/b", "connected", "b@example.test")
    _setClaudeAccounts({ "a@example.test": { name: "Team1" }, "b@example.test": {} })
    const seen: Array<Array<string | null | undefined>> = []
    const housekeeping = createHousekeeping({
      ready: () => true,
      legacyFile: null,
      runtimeFile: null,
      probe: async () => undefined,
      nameOf: () => "Local",
      project: async (dirs, syncedName) => {
        seen.push(dirs.map(syncedName))
      },
      accounts: () => readClaudeAccounts(),
    })
    await housekeeping("claude", ["/d/a", "/d/b", "/d/c"])
    expect(seen).toEqual([["Team1", null, undefined]])
  })

  test("a name cleared on another machine is not brought back by this machine's migration", async () => {
    noteProbe("/d/a", "connected", "a@example.test")
    _setClaudeAccounts({ "a@example.test": {} })
    await migrateLegacy({ dirs: ["/d/a"], legacyFile: null, runtimeFile: null, nameOf: () => "Old local name" })
    expect(readClaudeAccounts()["a@example.test"]).toEqual({})
  })
})
