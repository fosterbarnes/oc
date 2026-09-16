import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import os from "node:os"
import path from "node:path"
import { cliIt } from "../lib/cli-process"
import { resolveTargetDirectory } from "../../src/cli/cmd/oc"

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

describe("OC launcher settings CLI", () => {
  cliIt.live("writes and reads every command-palette setting", ({ opencode }) =>
    Effect.gen(function* () {
      const settings = [
        ["ocDir", "C:/Users/user"],
        ["homeDir", "C:/workspace"],
        ["homeDirSort", "modified"],
        ["sessionModel", "openai/gpt-5.6-luna"],
        ["sessionAgent", "build"],
        ["defaultSubagent", "general"],
        ["defaultSubagentModel", "cursor/composer-2.5"],
        ["reasoningEffort", "high"],
        ["serverStartOnWindowsUserStart", "true"],
      ] as const
      for (const [key, value] of settings) {
        const result = yield* opencode.spawn(["oc", "config", "set", key, value])
        opencode.expectExit(result, 0, `oc config set ${key}`)
      }

      const result = yield* opencode.spawn(["oc", "config", "get"])
      opencode.expectExit(result, 0, "oc config get")
      expect(JSON.parse(result.stdout)).toMatchObject({
        ocDir: "C:/Users/user",
        homeDir: "C:/workspace",
        homeDirSort: "modified",
        sessionModel: "openai/gpt-5.6-luna",
        sessionAgent: "build",
        defaultSubagent: "general",
        defaultSubagentModel: "cursor/composer-2.5",
        reasoningEffort: "high",
        server: { startOnWindowsUserStart: true },
      })
    }),
  )
})
