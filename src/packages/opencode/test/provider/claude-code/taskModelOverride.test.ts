// A `task` call's explicit model reaches the Claude child turn through TestLLMServer, and the
// agent's registry rewrites do not replace it. Fake model only: no tokens, no real Claude usage.
import { afterEach, describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../../lib/cli-process"
import { reply } from "../../lib/llm-server"
import { expectIsolated, openChat } from "./chatFixture"
import {
  _resetAgentRegistryForTests,
  resolveAgentModel,
  setAgentRegistry,
  setDefaultSubagentModel,
} from "../../../src/provider/claude-code/agentModels"
import { resolveTurnContext } from "../../../src/provider/claude-code/turnContext"
import type { ClaudeCodeConfig } from "../../../src/provider/claude-code/types"
import { seedClaudeCodeModels } from "./catalogFixture"

seedClaudeCodeModels()

const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")

// The child's request ends with a system block, so match the token anywhere in the request.
const child = (token: string) => (hit: { body: Record<string, unknown> }) =>
  JSON.stringify(hit.body.messages).includes(token)

describe.skipIf(!cliPath)("Claude task model override through oc", () => {
  cliIt.live(
    "an explicit task model runs the child turn on that model, not the parent's",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.pushMatch(child("OVERRIDE-CHILD"), reply().text("child answered"))
        yield* llm.tool("mcp__opencode_proxy__task", {
          description: "Answer on haiku",
          prompt: "Answer briefly. OVERRIDE-CHILD",
          subagent_type: "general",
          model: "claude-code/claude-haiku-5-5",
        })
        yield* llm.text("task finished")

        yield* chat.prompt("Ask a general subagent to answer on haiku.")

        const inputs = yield* llm.inputs
        expectIsolated(inputs)
        // The parent's first request predates the task call, so the first match is the child's request.
        const childInput = inputs.find((body) => child("OVERRIDE-CHILD")({ body }))
        expect(childInput?.model).toContain("claude-haiku-5-5")
        expect(inputs[0]?.model).toContain("claude-sonnet-4-5")
        const parts = yield* chat.parts
        const task = parts.find((part) => part.type === "tool" && part.tool === "task")
        expect(task?.type === "tool" && task.state.status === "completed" && task.state.metadata?.model).toEqual({
          providerID: "claude-code",
          modelID: "claude-haiku-5-5",
        })
      }),
    120_000,
  )

  cliIt.live(
    "an unknown task model fails the call and starts no child turn",
    (fixture) =>
      Effect.gen(function* () {
        const llm = fixture.llm
        const chat = yield* openChat(fixture)
        yield* llm.tool("mcp__opencode_proxy__task", {
          description: "Answer on a missing model",
          prompt: "Answer briefly. NO-CHILD",
          subagent_type: "general",
          model: "claude-code/claude-not-a-model",
        })
        yield* llm.text("task failed")

        yield* chat.prompt("Ask a general subagent to use a model that does not exist.")

        const parts = yield* chat.parts
        const task = parts.find((part) => part.type === "tool" && part.tool === "task")
        expect(task?.type === "tool" && task.state.status).toBe("error")
        const children = yield* Effect.promise(() => chat.sdk.session.children({ sessionID: chat.sessionID }))
        expect(children.data).toHaveLength(0)
        expect(yield* llm.inputs).toHaveLength(2)
      }),
    120_000,
  )
})

describe("Claude agent model precedence with an explicit task model", () => {
  const records = { general: { mode: "subagent", forceModel: "claude-opus-5" } }

  // The call options request.ts sets for a child turn of session `ses_child`.
  const turn = (explicit: boolean) =>
    resolveTurnContext({ provider: "claude-code" } as ClaudeCodeConfig, "claude-haiku-5-5", {
      prompt: [],
      providerOptions: {
        "claude-code": {
          opencodeSessionID: "ses_child",
          opencodeAgent: "general",
          ...(explicit ? { opencodeExplicitModel: "true" } : {}),
        },
      },
    })

  afterEach(() => _resetAgentRegistryForTests())

  test("the agent's forceModel and defaultSubagentModel apply when no explicit model is set", () => {
    expect(resolveAgentModel("general", "claude-haiku-5-5", { records })).toBe("claude-opus-5")
    expect(
      resolveAgentModel("general", "claude-haiku-5-5", {
        records: { general: { mode: "subagent" } },
        defaultSubagentModel: "claude-opus-5",
      }),
    ).toBe("claude-opus-5")
  })

  // The registry is module state that another file's instance may rebuild mid-run, so these only
  // assert the explicit path, which ignores the registry.
  test("an explicit model is kept over forceModel and defaultSubagentModel", async () => {
    setAgentRegistry(records)
    setDefaultSubagentModel("claude-opus-5")
    expect((await turn(true)).effectiveModelId).toBe("claude-haiku-5-5")
  })

  test("overlapping turns of one child session each keep their own explicit mark", async () => {
    setAgentRegistry(records)
    // The mark travels with each request, so one turn ending cannot change another still resolving.
    const [first, second] = await Promise.all([turn(true), turn(true)])
    expect(first.effectiveModelId).toBe("claude-haiku-5-5")
    expect(second.effectiveModelId).toBe("claude-haiku-5-5")
  })
})
