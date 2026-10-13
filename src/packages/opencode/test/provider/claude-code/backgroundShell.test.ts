// Background shell through the Claude Code CLI: the CLI calls oc's bash tool through the dynamic
// proxy (`proxyOpencodeTools`), the job runs, and its exit notice wakes the chat for one more turn.
import { describe, expect } from "bun:test"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { cliIt } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { chatConfig, claudeEnv, expectIsolated, initRepo } from "./chatFixture"

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

describe.skipIf(!cliPath)("Claude background shell through oc", () => {
  cliIt.live(
    "background-shell: proxied bash starts a job and its exit notice wakes the chat",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        const exe = process.execPath.replaceAll("\\", "/")
        yield* fixture.llm.tool("mcp__opencode_proxy__bash", {
          command: `& "${exe}" -e "console.log('BG-PROXY-DONE')"`,
          background: true,
        })
        yield* fixture.llm.text("STARTED")
        yield* fixture.llm.text("NOTICE-SEEN")
        const config = chatConfig(fixture.llm.url)
        const env = {
          ...claudeEnv(fixture.home, fixture.llm.url),
          OPENCODE_DB: path.join(fixture.home, "opencode.db"),
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            ...config,
            provider: {
              ...config.provider,
              "claude-code": {
                options: {
                  ...config.provider["claude-code"].options,
                  proxyOpencodeTools: ["bash", "bgStatus", "bgKill"],
                },
              },
            },
          }),
        }
        // A served instance stays up after the first turn, so the notice can wake the chat.
        const server = yield* fixture.opencode.serve({ env })
        const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
        const session = yield* Effect.promise(() => sdk.session.create({ title: "background" }, { throwOnError: true }))
        const sessionID = session.data.id
        yield* Effect.promise(() =>
          sdk.session.prompt({
            sessionID,
            model: { providerID: "claude-code", modelID: "claude-sonnet-4-5" },
            parts: [{ type: "text", text: "Start the background job." }],
          }),
        )
        const texts = pollWithTimeout(
          Effect.promise(async () => JSON.stringify((await sdk.session.messages({ sessionID })).data)).pipe(
            Effect.map((text) => (text.includes("NOTICE-SEEN") ? text : undefined)),
          ),
          "the background notice did not wake the chat",
          "60 seconds",
        )
        const seen = yield* texts
        expect(seen).toContain("BG-PROXY-DONE")
        const inputs = yield* fixture.llm.inputs
        expect(JSON.stringify(inputs.at(-1))).toContain("background_shell id=")
        expectIsolated(inputs)
      }),
    120_000,
  )
})
