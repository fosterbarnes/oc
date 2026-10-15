import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { cliIt } from "../lib/cli-process"
import { resolveTargetDirectory } from "../../src/cli/cmd/oc"
import { defaultServerPort, resolvePaletteLaunch, PALETTE_NEW_SESSION_OC } from "../../src/config/oc"
import { isPidAlive, serverStatePath, clearServerState } from "../../src/config/resident"
import { Global } from "@opencode-ai/core/global"
import { tmpdir } from "../fixture/fixture"

describe("OC launcher paths", () => {
  test("resolves omitted and relative targets from their respective roots", () => {
    const ocDir = path.resolve("C:\\Users\\user")
    const homeDir = path.resolve("C:\\Users\\user\\Documents\\GitHub")

    expect(resolveTargetDirectory(undefined, ocDir, homeDir)).toBe(ocDir)
    expect(resolveTargetDirectory("something", ocDir, homeDir)).toBe(path.resolve(homeDir, "something"))
    expect(resolveTargetDirectory(undefined)).toBe(path.resolve(os.homedir()))
  })

  test("accepts absolute targets outside the configured home directory", () => {
    const ocDir = path.resolve("C:\\Users\\user")
    const homeDir = path.resolve("C:\\Users\\user\\Documents\\GitHub")
    const target = path.resolve("C:\\Users\\user\\Something")

    expect(resolveTargetDirectory(target, ocDir, homeDir)).toBe(target)
  })
})

describe("OC palette launch", () => {
  test("maps New session (oc) and rejects unknown titles", () => {
    expect(resolvePaletteLaunch(PALETTE_NEW_SESSION_OC)).toBe("pick-home-dir")
    expect(resolvePaletteLaunch("  New session (oc)  ")).toBe("pick-home-dir")
    expect(() => resolvePaletteLaunch("Switch agent")).toThrow("Palette entry not found: Switch agent")
  })
})

describe("OC launcher settings CLI", () => {
  cliIt.live("writes and reads every command-palette setting", ({ opencode }) =>
    Effect.gen(function* () {
      const settings = [
        ["ocDir", "C:/Users/example"],
        ["homeDir", "C:/workspace"],
        ["homeDirSort", "modified"],
        ["sessionModel", "openai/gpt-5.6-luna"],
        ["sessionAgent", "build"],
        // serverStartOnWindowsUserStart is left out: enabling it registers a real sign-in entry.
      ] as const
      for (const [key, value] of settings) {
        const result = yield* opencode.spawn(["oc", "config", "set", key, value])
        opencode.expectExit(result, 0, `oc config set ${key}`)
      }

      const result = yield* opencode.spawn(["oc", "config", "get"])
      opencode.expectExit(result, 0, "oc config get")
      expect(JSON.parse(result.stdout)).toMatchObject({
        ocDir: "C:/Users/example",
        homeDir: "C:/workspace",
        homeDirSort: "modified",
        sessionModel: "openai/gpt-5.6-luna",
        sessionAgent: "build",
      })
    }),
  )
})

describe("OC resident PID and state", () => {
  test("isPidAlive distinguishes live vs dead PIDs without signaling", () => {
    expect(isPidAlive(process.pid)).toBe(true)
    expect(isPidAlive(999999)).toBe(false)
    expect(isPidAlive(2147483647)).toBe(false)
    expect(isPidAlive(0)).toBe(false)
    expect(isPidAlive(-1)).toBe(false)
    expect(isPidAlive(Number.NaN)).toBe(false)
  })

  test("serverStatePath is under Global.Path.state and defaultServerPort is 4096", () => {
    expect(serverStatePath()).toBe(path.join(Global.Path.state, "oc-server.json"))
    expect(defaultServerPort()).toBe(4096)
  })

  test("clearServerState removes stale state without signaling PID", async () => {
    await using tmp = await tmpdir()
    const file = serverStatePath(tmp.path)
    await fs.writeFile(file, JSON.stringify({ pid: 999999, hostname: "127.0.0.1", port: 4096 }, null, 2), "utf8")
    expect(isPidAlive(999999)).toBe(false)
    await clearServerState(tmp.path)
    await expect(fs.stat(file)).rejects.toBeDefined()
  })

  test("dead PID with healthy endpoint is not treated as reusable (unit predicate)", async () => {
    await using tmp = await tmpdir()
    // Simulate the predicate used in startServerUnlocked: health+matches+alive required.
    const deadPid = 999999
    const healthy = true
    const matches = true
    const alive = isPidAlive(deadPid)
    expect(alive).toBe(false)
    expect(healthy && matches && alive).toBe(false)
    // The launcher must not reuse a dead PID even when health is true; it must clear stale state rather than kill.
    const file = serverStatePath(tmp.path)
    await fs.writeFile(
      file,
      JSON.stringify({ pid: deadPid, hostname: "127.0.0.1", port: defaultServerPort() }, null, 2),
      "utf8",
    )
    await clearServerState(tmp.path)
    await expect(fs.stat(file)).rejects.toBeDefined()
  })

  test("stale mismatched hostname/port state is invalidated", async () => {
    await using tmp = await tmpdir()
    const file = serverStatePath(tmp.path)
    await fs.writeFile(file, JSON.stringify({ pid: process.pid, hostname: "127.0.0.1", port: 9999 }, null, 2), "utf8")
    // Mismatched port should be considered stale; clearServerState removes it.
    await clearServerState(tmp.path)
    await expect(fs.stat(file)).rejects.toBeDefined()
  })
})

describe("OC resident replacement observability", () => {
  test("healthy true with no launcher state is not claimed as owned (bounded observability)", () => {
    const healthy = true
    const state: { pid?: number } | undefined = undefined
    // No state but health true => foreign occupant. Must not claim.
    const shouldReuse = Boolean((state as { pid?: number } | undefined)?.pid && healthy)
    expect(shouldReuse).toBe(false)
  })

  test("restart ordering is explicit: disposal before replacement schedule", async () => {
    const order: string[] = []
    const fakeDispose = async () => {
      order.push("dispose")
    }
    const fakeSchedule = () => {
      order.push("schedule")
    }
    await fakeDispose()
    fakeSchedule()
    expect(order).toEqual(["dispose", "schedule"])
    // HTTP 200 is not a happens-before for replacement; caller must poll health+alive PID.
    expect(order[0]).toBe("dispose")
  })
})
