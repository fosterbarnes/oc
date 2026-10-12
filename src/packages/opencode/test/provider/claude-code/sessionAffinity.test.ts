import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { LLMRequestPrep } from "@/session/llm/request"
import { ProviderTransform } from "@/provider/transform"
import {
  resolveOpencodeAgent,
  resolveOpencodeAgentPrompt,
  resolveSessionAffinity,
} from "@/provider/claude-code/callOptions"

// Host -> provider round trip: what request.ts writes is what the language model reads.
function prepare(input: { providerID: string; agent: string; prompt?: string; compactionBoundary?: string }) {
  const model = {
    id: `${input.providerID}/claude-opus-5-5`,
    providerID: input.providerID,
    api: { id: "claude-opus-5-5", url: "", npm: "@opencode-ai/claude-code" },
    capabilities: { reasoning: false },
    limit: { context: 200_000, output: 32_000 },
    options: {},
    headers: {},
  }
  return Effect.runPromise(
    LLMRequestPrep.prepare({
      user: {
        id: "msg_user",
        sessionID: "ses_host",
        role: "user",
        time: { created: 0 },
        agent: input.agent,
        model: { providerID: input.providerID, modelID: "claude-opus-5-5" },
      } as never,
      sessionID: "ses_host",
      model: model as never,
      agent: { name: input.agent, mode: "primary", options: {}, permission: [], prompt: input.prompt } as never,
      system: [],
      messages: [{ role: "user", content: "Hello" }],
      tools: {},
      provider: { id: input.providerID, options: {} } as never,
      auth: undefined,
      plugin: {
        trigger: (_name: string, _input: unknown, output: unknown) => Effect.succeed(output),
        list: () => Effect.succeed([]),
        init: () => Effect.void,
      } as never,
      flags: { outputTokenMax: 32_000, client: "test" } as never,
      isWorkflow: false,
      compactionBoundary: input.compactionBoundary,
    }),
  ).then((prepared) => ProviderTransform.providerOptions(model as never, prepared.params.options))
}

describe("claude-code host call options", () => {
  test("session and agent reach the provider", async () => {
    const options = await prepare({ providerID: "claude-code", agent: "build" })
    expect(resolveSessionAffinity(options, "claude-code")).toBe("ses_host")
    expect(resolveOpencodeAgent(options, "claude-code")).toBe("build")
  })

  test("account providers read under their own key", async () => {
    const options = await prepare({ providerID: "claude-code-work", agent: "compaction" })
    expect(resolveSessionAffinity(options, "claude-code-work")).toBe("ses_host")
    expect(resolveOpencodeAgent(options, "claude-code-work")).toBe("compaction")
  })

  test("the agent's own prompt reaches the provider, and only when it has one", async () => {
    const options = await prepare({ providerID: "claude-code", agent: "build", prompt: "AGENT PROMPT" })
    expect(resolveOpencodeAgentPrompt(options, "claude-code")).toBe("AGENT PROMPT")
    const plain = await prepare({ providerID: "claude-code", agent: "build" })
    expect(resolveOpencodeAgentPrompt(plain, "claude-code")).toBeUndefined()
  })

  test("other providers get no claude-code options", async () => {
    const options = await prepare({
      providerID: "openai-compatible",
      agent: "build",
      prompt: "AGENT PROMPT",
      compactionBoundary: "msg_summary",
    })
    expect(JSON.stringify(options)).not.toContain("opencode")
  })

  test('"default" affinity outside oc', () => {
    expect(resolveSessionAffinity(undefined, "claude-code")).toBe("default")
    expect(resolveOpencodeAgent(undefined, "claude-code")).toBeUndefined()
  })
})
