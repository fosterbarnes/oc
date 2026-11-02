// Drives oc's Claude Agent provider (upstream OpenCode 2's port) through `opencode serve`: the real Claude Code
// CLI, started by the Agent SDK, talks to TestLLMServer's Anthropic endpoint. Skipped when no `claude` is installed.
import { describe, expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { cliIt, type CliFixture } from "../../lib/cli-process"
import { testProviderConfig } from "../../lib/test-provider"
import { claudeEnv, expectIsolated, initRepo } from "../claude-code/chatFixture"

const cliPath = Bun.which("claude")
const MODEL = { providerID: "claude-agent", modelID: "haiku" }

// A saved model list, as `/connect` leaves it, so the chat does not wait for a login check.
const seedCatalog = (fixture: CliFixture) =>
  Effect.promise(async () => {
    const dir = path.join(fixture.home, ".local", "share", "opencode", "claude-agent")
    await mkdir(dir, { recursive: true })
    await Bun.write(
      path.join(dir, "models.json"),
      JSON.stringify({ models: [{ id: "haiku", name: "Haiku", efforts: ["low", "medium", "high"] }] }),
    )
  })

const openChat = Effect.fnUntraced(function* (fixture: CliFixture) {
  const project = path.join(fixture.home, "work")
  yield* initRepo(project)
  yield* seedCatalog(fixture)
  const config = testProviderConfig(fixture.llm.url)
  const server = yield* fixture.opencode.serve({
    env: {
      ...claudeEnv(fixture.home, fixture.llm.url),
      OPENCODE_DB: path.join(fixture.home, "opencode.db"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...config,
        provider: {
          ...config.provider,
          "claude-agent": {
            options: { baseURL: fixture.llm.url.replace(/\/v1$/, ""), apiKey: "sk-ant-test" },
          },
        },
      }),
    },
  })
  const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
  const sessionID = (yield* Effect.promise(() => sdk.session.create({ title: "claudeAgent" }))).data!.id
  return {
    project,
    sdk,
    sessionID,
    prompt: (text: string, model = MODEL) =>
      Effect.promise(() => sdk.session.prompt({ sessionID, model, parts: [{ type: "text", text }] })),
  }
})

// Chat turns carry oc's tools. Claude Code also names its own session with a tool-less Haiku request.
const claudeTurn = (hit: { url: URL; body: Record<string, unknown> }) =>
  hit.url.pathname === "/v1/messages" && Array.isArray(hit.body.tools) && hit.body.tools.length > 0

const claudeRequests = (fixture: CliFixture) =>
  fixture.llm.hits.pipe(Effect.map((hits) => hits.filter(claudeTurn).map((hit) => hit.body)))

describe.skipIf(!cliPath)("Claude Agent provider against TestLLMServer", () => {
  cliIt.live(
    "/connect lists Claude Agent before any login, then saves Claude Code's models and loads the provider",
    (fixture) =>
      Effect.gen(function* () {
        const project = path.join(fixture.home, "work")
        yield* initRepo(project)
        const server = yield* fixture.opencode.serve({
          env: {
            ...claudeEnv(fixture.home, fixture.llm.url),
            OPENCODE_DB: path.join(fixture.home, "opencode.db"),
            OPENCODE_CONFIG_CONTENT: JSON.stringify(testProviderConfig(fixture.llm.url)),
            // The fixture pins credentials to `{}`; connecting must save to and read from auth.json.
            OPENCODE_AUTH_CONTENT: "",
          },
        })
        const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
        const before = (yield* Effect.promise(() => sdk.provider.list())).data!
        expect(before.all.find((provider) => provider.id === "claude-agent")?.models).toEqual({})
        expect(before.connected).not.toContain("claude-agent")

        yield* Effect.promise(() => sdk.provider.oauth.authorize({ providerID: "claude-agent", method: 0 }))
        yield* Effect.promise(() => sdk.provider.oauth.callback({ providerID: "claude-agent", method: 0 }))
        yield* Effect.promise(() => sdk.instance.dispose())

        const after = (yield* Effect.promise(() => sdk.provider.list())).data!
        expect(after.connected).toContain("claude-agent")
        const haiku = after.all.find((provider) => provider.id === "claude-agent")?.models.haiku
        expect(haiku?.api.npm).toBe("@opencode-ai/claude-agent")
        expect(Object.keys(haiku?.variants ?? {})).toContain("low")
        // The login check starts `claude` without sending a prompt.
        expect(yield* fixture.llm.calls).toBe(0)
      }),
    120_000,
  )

  cliIt.live(
    "Claude gets only oc's tools, oc runs the call, and Claude's turn continues with the result",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture)
        yield* Effect.promise(() => Bun.write(path.join(chat.project, "marker.txt"), "AGENT-MARKER-71"))
        yield* fixture.llm.toolMatch(claudeTurn, "mcp__opencode__read", {
          filePath: path.join(chat.project, "marker.txt"),
        })
        yield* fixture.llm.textMatch(claudeTurn, "AGENT-DONE")
        const result = yield* chat.prompt("Read marker.txt and reply with its content.")
        expect(JSON.stringify(result.data!.parts)).toContain("AGENT-DONE")

        const parts = (yield* Effect.promise(() =>
          chat.sdk.session.messages({ sessionID: chat.sessionID }),
        )).data!.flatMap((message) => message.parts)
        const read = parts.find((part) => part.type === "tool" && part.tool === "read")
        expect(read?.type === "tool" && read.state.status).toBe("completed")

        const requests = yield* claudeRequests(fixture)
        expect(requests).toHaveLength(2)
        const tools = (requests[0].tools as { name: string }[]).map((tool) => tool.name)
        expect(tools).toContain("mcp__opencode__read")
        expect(tools.filter((name) => !name.startsWith("mcp__opencode__"))).toEqual([])
        const system = JSON.stringify(requests[0].system)
        expect(system).toContain("You are running in OpenCode through the Claude Code harness")
        // oc's own environment block stays out; Claude Code writes its own.
        expect(system).not.toContain("<env>")
        expect(JSON.stringify(requests[1].messages)).toContain("AGENT-MARKER-71")
        expectIsolated(requests)
      }),
    120_000,
  )

  cliIt.live(
    "switching back to Claude sends what another model said as a conversation checkpoint",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture)
        yield* fixture.llm.textMatch(claudeTurn, "CLAUDE-FIRST")
        yield* chat.prompt("First question.")
        yield* fixture.llm.textMatch((hit) => hit.url.pathname !== "/v1/messages", "OTHER-MODEL-REPLY-42")
        yield* chat.prompt("Second question.", { providerID: "test", modelID: "test-model" })
        yield* fixture.llm.textMatch(claudeTurn, "CLAUDE-AGAIN")
        const result = yield* chat.prompt("Third question.")
        expect(JSON.stringify(result.data!.parts)).toContain("CLAUDE-AGAIN")

        const requests = yield* claudeRequests(fixture)
        expect(requests).toHaveLength(2)
        const resumed = JSON.stringify(requests[1].messages)
        expect(resumed).toContain("CLAUDE-FIRST")
        expect(resumed).toContain("<conversation-checkpoint>")
        expect(resumed).toContain("OTHER-MODEL-REPLY-42")
        expect(resumed).toContain("Third question.")
      }),
    120_000,
  )

  cliIt.live(
    "a forked chat continues from a copy of the source's Claude transcript, not a checkpoint",
    (fixture) =>
      Effect.gen(function* () {
        const chat = yield* openChat(fixture)
        yield* fixture.llm.textMatch(claudeTurn, "SOURCE-REPLY")
        yield* chat.prompt("Source question.")
        const fork = (yield* Effect.promise(() => chat.sdk.session.fork({ sessionID: chat.sessionID }))).data!
        yield* fixture.llm.textMatch(claudeTurn, "FORK-REPLY")
        const result = yield* Effect.promise(() =>
          chat.sdk.session.prompt({
            sessionID: fork.id,
            model: MODEL,
            parts: [{ type: "text", text: "Fork question." }],
          }),
        )
        expect(JSON.stringify(result.data!.parts)).toContain("FORK-REPLY")

        const requests = yield* claudeRequests(fixture)
        expect(requests).toHaveLength(2)
        const forked = JSON.stringify(requests[1].messages)
        expect(forked).toContain("SOURCE-REPLY")
        expect(forked).toContain("Fork question.")
        expect(forked).not.toContain("<conversation-checkpoint>")
      }),
    120_000,
  )
})
