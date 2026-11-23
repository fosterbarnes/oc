// oc's rules on Claude Code's own tools: the real CLI against TestLLMServer, with its permission
// prompts bypassed as oc runs it. Skipped when no `claude` CLI is installed.
import { describe, expect } from "bun:test"
import { existsSync } from "node:fs"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { cliIt } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { openChat } from "./chatFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")
const shell = process.platform === "win32" ? "PowerShell" : "Bash"
const env = { CLAUDE_CODE_USE_POWERSHELL_TOOL: "1" }

type ToolResult = { type: string; content?: unknown; is_error?: boolean }

function toolResults(input: Record<string, unknown>) {
  return (input.messages as { content: unknown }[])
    .flatMap((message) => (Array.isArray(message.content) ? (message.content as ToolResult[]) : []))
    .filter((part) => part.type === "tool_result")
    .map((part) => ({ text: JSON.stringify(part.content), error: part.is_error === true }))
}

describe.skipIf(!cliPath)("Claude tool guard", () => {
  cliIt.live(
    "pattern rules stop Claude's shell and file tools and leave allowed calls alone",
    (fixture) =>
      Effect.gen(function* () {
        const denied = path.join(fixture.home, "work", "denied.txt")
        yield* fixture.llm.tool(shell, { command: "echo blockedMarker", description: "Blocked" })
        yield* fixture.llm.tool(shell, { command: "echo allowedMarker", description: "Allowed" })
        yield* fixture.llm.tool("Write", { file_path: denied, content: "must not exist" })
        yield* fixture.llm.text("GUARD-DONE")
        const chat = yield* openChat(fixture, {
          env,
          config: {
            permission: {
              bash: { "*": "allow", "*blockedMarker*": "deny" },
              edit: { "*": "allow", "denied.txt": "deny" },
            },
          },
        })
        yield* chat.prompt("Run them.")
        const results = toolResults((yield* fixture.llm.inputs).at(-1)!)
        expect(results).toHaveLength(3)
        expect(results[0].error).toBe(true)
        expect(results[1]).toEqual({ text: expect.stringContaining("allowedMarker"), error: false })
        expect(results[2].error).toBe(true)
        expect(existsSync(denied)).toBe(false)
      }),
    90_000,
  )

  cliIt.live(
    "an ask rule waits for oc's permission prompt",
    (fixture) =>
      Effect.gen(function* () {
        yield* fixture.llm.tool(shell, { command: "echo askMarker", description: "Needs approval" })
        yield* fixture.llm.text("ASK-DONE")
        const chat = yield* openChat(fixture, {
          env,
          config: { permission: { bash: { "*": "allow", "*askMarker*": "ask" } } },
        })
        const turn = yield* chat.prompt("Run it.").pipe(Effect.forkChild)
        const request = yield* pollWithTimeout(
          Effect.promise(() => chat.sdk.permission.list()).pipe(
            Effect.map((result) => result.data?.find((item) => item.sessionID === chat.sessionID)),
          ),
          "Claude's shell call never opened an oc permission prompt",
          "30 seconds",
        )
        expect(toolResults((yield* fixture.llm.inputs).at(-1)!)).toHaveLength(0)
        yield* Effect.promise(() => chat.sdk.permission.reply({ requestID: request.id, reply: "once" }))
        yield* Fiber.join(turn)
        expect(toolResults((yield* fixture.llm.inputs).at(-1)!)).toEqual([
          { text: expect.stringContaining("askMarker"), error: false },
        ])
      }),
    90_000,
  )
})
