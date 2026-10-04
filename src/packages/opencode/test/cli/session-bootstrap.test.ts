import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

describe("session bootstrap", () => {
  cliIt.live("creates a session without model execution", ({ home, opencode }) =>
    Effect.gen(function* () {
      const directory = path.join(home, "project")
      const sidebarPath = path.join(directory, ".config", "openSidebar.json")
      const env = { OPENCODE_DB: path.join(home, "opencode.db") }
      yield* Effect.promise(() => fs.mkdir(path.dirname(sidebarPath), { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(sidebarPath, '{"favorite":true}\n', "utf8"))

      const result = yield* opencode.spawn(["session", "bootstrap", directory, "--title", "Project"], { env })
      opencode.expectExit(result, 0, "session bootstrap")
      const output = JSON.parse(result.stdout.trim()) as { sessionID: string; directory: string }

      expect(output.directory).toBe(directory)
      expect(output.sessionID).toMatch(/^ses_/)
      const sidebar = yield* Effect.promise(() => Bun.file(sidebarPath).json())
      expect(sidebar).toEqual({ favorite: true, projectDirectory: directory })

      const query = `SELECT s.directory, s.title, s.cost, s.tokens_input, s.tokens_output, (SELECT COUNT(*) FROM message m WHERE m.session_id = s.id AND json_extract(m.data, '$.role') = 'assistant') AS assistants FROM session s WHERE s.id = '${output.sessionID}'`
      const inspection = yield* opencode.spawn(["db", "--format", "json", query], { env })
      opencode.expectExit(inspection, 0, "session bootstrap inspection")
      expect(JSON.parse(inspection.stdout)).toEqual([
        {
          directory: directory.replaceAll("\\", "/"),
          title: "Project",
          cost: 0,
          tokens_input: 0,
          tokens_output: 0,
          assistants: 0,
        },
      ])
    }),
  )

  cliIt.live("rejects a missing directory", ({ home, opencode }) =>
    Effect.gen(function* () {
      const directory = path.join(home, "missing")
      const result = yield* opencode.spawn(["session", "bootstrap", directory])

      expect(result.exitCode).not.toBe(0)
      const sidebarExists = yield* Effect.promise(() =>
        Bun.file(path.join(directory, ".config", "openSidebar.json")).exists(),
      )
      expect(sidebarExists).toBe(false)
    }),
  )
})
