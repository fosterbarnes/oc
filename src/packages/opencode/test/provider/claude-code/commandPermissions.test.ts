import { describe, expect } from "bun:test"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { cliIt } from "../../lib/cli-process"
import { chatConfig, claudeEnv, expectIsolated, initRepo } from "./chatFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

describe.skipIf(!cliPath)("Claude command-turn permission enforcement", () => {
  cliIt.live(
    "command turns proxy files, reject native and execution bypasses, then restore native tools",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        const plans = path.join(fixture.home, "plans")
        yield* initRepo(project)
        const server = yield* fixture.opencode.serve({
          env: {
            ...claudeEnv(fixture.home, fixture.llm.url),
            OPENCODE_DB: path.join(fixture.home, "opencode.db"),
            OPENCODE_CONFIG_CONTENT: JSON.stringify({
              ...chatConfig(fixture.llm.url),
              command: {
                spit: {
                  template: "Discuss plans",
                  permission: {
                    "*": "deny",
                    read: "allow",
                    external_directory: "allow",
                    time: "allow",
                    edit: { "*": "deny", [`${plans.replaceAll("\\", "/")}/**/*.md`]: "allow" },
                  },
                },
              },
            }),
          },
        })
        const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
        const sessionID = (yield* Effect.promise(() => sdk.session.create({ title: "Claude command permissions" })))
          .data!.id
        const allowed = path.join(plans, "nested", "note.md")
        const forbidden = path.join(project, "outside.md")
        const nonMarkdown = path.join(plans, "note.txt")
        yield* fixture.llm.tool("mcp__opencode_proxy__write", { filePath: allowed, content: "plan" })
        yield* fixture.llm.tool("mcp__opencode_proxy__edit", {
          filePath: allowed,
          oldString: "plan",
          newString: "updated",
        })
        yield* fixture.llm.tool("mcp__opencode_proxy__write", { filePath: forbidden, content: "forbidden" })
        yield* fixture.llm.tool("mcp__opencode_proxy__write", { filePath: nonMarkdown, content: "forbidden" })
        yield* fixture.llm.tool("Write", { file_path: forbidden, content: "native bypass" })
        yield* fixture.llm.text("command done")
        yield* Effect.promise(() =>
          sdk.session.command({ sessionID, command: "spit", arguments: "", model: "claude-code/claude-sonnet-4-5" }),
        )
        expect(yield* Effect.promise(() => Bun.file(allowed).text())).toBe("updated")
        expect(yield* Effect.promise(() => Bun.file(forbidden).exists())).toBe(false)
        expect(yield* Effect.promise(() => Bun.file(nonMarkdown).exists())).toBe(false)
        const inputs = yield* fixture.llm.inputs
        expectIsolated(inputs)
        const names = (inputs[0].tools as { name: string }[]).map((tool) => tool.name)
        expect(names).toContain("mcp__opencode_proxy__write")
        expect(names).toContain("mcp__opencode_proxy__read")
        for (const tool of [
          "Write",
          "Edit",
          "NotebookEdit",
          "Bash",
          "PowerShell",
          "REPL",
          "JavaScript",
          "Agent",
          "Task",
          "mcp__opencode_proxy__task",
          "mcp__opencode_proxy__run_after_turn",
        ])
          expect(names).not.toContain(tool)
        yield* fixture.llm.tool("Write", { file_path: forbidden, content: "next turn" })
        yield* fixture.llm.text("next done")
        yield* Effect.promise(() =>
          sdk.session.prompt({
            sessionID,
            model: { providerID: "claude-code", modelID: "claude-sonnet-4-5" },
            parts: [{ type: "text", text: "Implement now" }],
          }),
        )
        expect(yield* Effect.promise(() => Bun.file(forbidden).text())).toBe("next turn")
        const nextInputs = yield* fixture.llm.inputs
        expectIsolated(nextInputs)
        expect((nextInputs.at(-2)!.tools as { name: string }[]).map((tool) => tool.name)).toContain("Write")
        expect((yield* Effect.promise(() => sdk.session.get({ sessionID }))).data!.permission ?? []).toEqual([])
      }),
    120_000,
  )
})
