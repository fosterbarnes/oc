import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

describe("OC launcher settings CLI", () => {
  cliIt.live("writes and reads every command-palette setting", ({ opencode }) =>
    Effect.gen(function* () {
      const settings = [
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
