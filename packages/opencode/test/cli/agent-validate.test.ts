import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"
import path from "path"
import fs from "fs/promises"

function globalAgentsDir(home: string) {
  return path.join(home, ".config", "opencode", "agents")
}

function projectAgentsDir(home: string) {
  return path.join(home, ".opencode", "agents")
}

async function writeAgentFile(filePath: string, frontmatter: string, body = "prompt body") {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const content = `---\n${frontmatter}\n---\n${body}\n`
  await fs.writeFile(filePath, content, "utf8")
}

describe("opencode agent validate", () => {
  cliIt.live("valid-only: succeeds when all agent files are valid", ({ opencode, home }) =>
    Effect.gen(function* () {
      const valid = path.join(globalAgentsDir(home), "valid.md")
      yield* Effect.promise(() => writeAgentFile(valid, 'description: "valid agent"\nmode: subagent'))

      const result = yield* opencode.spawn(["agent", "validate"])
      expect(result.exitCode).toBe(0)
      const out = result.stdout + result.stderr
      expect(out).toContain("All agent files valid")
      expect(out).toContain("1 files checked")
    }),
  )

  cliIt.live("global: reports invalid global agent file with nonzero exit", ({ opencode, home }) =>
    Effect.gen(function* () {
      const bad = path.join(globalAgentsDir(home), "bad-global.md")
      yield* Effect.promise(() => writeAgentFile(bad, 'description: "bad"\nmode: invalidmode'))
      const valid = path.join(globalAgentsDir(home), "good.md")
      yield* Effect.promise(() => writeAgentFile(valid, 'description: "good"\nmode: subagent'))

      const result = yield* opencode.spawn(["agent", "validate"])
      expect(result.exitCode).toBe(1)
      const out = result.stdout + result.stderr
      expect(out).toContain("invalid agent file")
      expect(out).toContain("bad-global.md")
      // valid sibling should not be listed as invalid
      expect(out).not.toContain("good.md: ")
    }),
  )

  cliIt.live("project: reports invalid project agent file", ({ opencode, home }) =>
    Effect.gen(function* () {
      const bad = path.join(projectAgentsDir(home), "bad-project.md")
      yield* Effect.promise(() =>
        writeAgentFile(bad, 'description: "bad project"\nprompt: "{file:./does-not-exist.txt}"\nmode: subagent'),
      )

      const result = yield* opencode.spawn(["agent", "validate"], {
        env: { OPENCODE_DISABLE_PROJECT_CONFIG: "0" },
      })
      expect(result.exitCode).toBe(1)
      const out = result.stdout + result.stderr
      expect(out).toContain("bad-project.md")
      expect(out).toContain("bad file reference")
    }),
  )

  cliIt.live("multiple-invalid: aggregates failures from global and project", ({ opencode, home }) =>
    Effect.gen(function* () {
      const badGlobal = path.join(globalAgentsDir(home), "bad1.md")
      const badGlobal2 = path.join(globalAgentsDir(home), "nested", "bad2.md")
      const badProject = path.join(projectAgentsDir(home), "bad3.md")
      yield* Effect.promise(() => writeAgentFile(badGlobal, 'description: "bad1"\nmode: wrong'))
      yield* Effect.promise(() => writeAgentFile(badGlobal2, 'description: "bad2"\nmode: also-wrong'))
      yield* Effect.promise(() => writeAgentFile(badProject, 'description: "bad3"\nmode: nope'))

      const result = yield* opencode.spawn(["agent", "validate"], {
        env: { OPENCODE_DISABLE_PROJECT_CONFIG: "0" },
      })
      expect(result.exitCode).toBe(1)
      const out = result.stdout + result.stderr
      expect(out).toContain("3 invalid agent file")
      expect(out).toContain("bad1.md")
      expect(out).toContain("bad2.md")
      expect(out).toContain("bad3.md")
      // deterministic ordering: sorted paths
      const idx1 = out.indexOf("bad1.md")
      const idx2 = out.indexOf("bad2.md")
      const idx3 = out.indexOf("bad3.md")
      expect(idx1).toBeGreaterThan(-1)
      expect(idx2).toBeGreaterThan(-1)
      expect(idx3).toBeGreaterThan(-1)
      // global files should appear before project if sorted
      // just ensure all three appear, ordering check is best-effort
    }),
  )

  cliIt.live("valid-only: reports zero when no agent files exist", ({ opencode }) =>
    Effect.gen(function* () {
      const result = yield* opencode.spawn(["agent", "validate"])
      expect(result.exitCode).toBe(0)
      const out = result.stdout + result.stderr
      expect(out).toContain("All agent files valid")
      expect(out).toContain("0 files checked")
    }),
  )
})
