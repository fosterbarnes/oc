import { expect } from "bun:test"
import { Cause, Effect, Exit, Layer, Stream } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { LLMEvent } from "@opencode-ai/llm"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { LLM } from "@/session/llm"
import { SessionPrompt } from "@/session/prompt"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { testEffect } from "../lib/effect"

const primary = "meta/muse-spark-1.3-contributor"
const free = "opencode/mimo-v2.6-flash-free"
const luna = "openai/gpt-6-luna"
type Outcome = "success" | "failure" | "partial" | "empty" | "lookup" | "init" | "interrupt" | "defect"

function model(ref: ReturnType<typeof Provider.parseModel>): Provider.Model {
  return {
    id: ref.modelID,
    providerID: ref.providerID,
    name: ref.modelID,
    api: { id: ref.modelID, url: "http://localhost:1", npm: "@ai-sdk/openai-compatible" },
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: false,
      toolcall: false,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200000, output: 32000 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-09-22",
    variants: { medium: { reasoningEffort: "medium" }, high: { reasoningEffort: "high" } },
  }
}

function check(input: {
  outcomes: Outcome[]
  expected: string[]
  pinned?: string
  variant?: string
  unpinned?: boolean
  small?: string
}) {
  const lookups: string[] = []
  const requests: LLM.StreamInput[] = []
  const agent: Agent.Info = {
    name: "rename",
    mode: "primary",
    permission: [],
    options: {},
    prompt: "Generate a title",
    model: input.unpinned ? undefined : Provider.parseModel(input.pinned ?? primary),
    variant: input.variant ?? "low",
  }
  const provider = Layer.mock(Provider.Service, {
    getModel: (providerID, modelID) =>
      Effect.suspend(() => {
        lookups.push(`${providerID}/${modelID}`)
        if (input.outcomes[lookups.length - 1] === "lookup")
          return Effect.fail(new Provider.ModelNotFoundError({ providerID, modelID }))
        return Effect.succeed(model({ providerID, modelID }))
      }),
    getSmallModel: () => Effect.sync(() => {
      if (!input.small) return undefined
      lookups.push(input.small)
      return model(Provider.parseModel(input.small))
    }),
  })
  const llm = Layer.mock(LLM.Service, {
    stream: (request) =>
      Stream.unwrap(Effect.sync(() => {
        requests.push(request)
        const outcome = input.outcomes[lookups.length - 1]
        if (outcome === "failure") return Stream.fail(new Error("Provider unavailable"))
        if (outcome === "interrupt") return Stream.fromEffect(Effect.interrupt)
        if (outcome === "defect") return Stream.fromEffect(Effect.die(new Error("Unexpected defect")))
        if (outcome === "init")
          return Stream.fromEffect(Effect.die(new Provider.InitError({ providerID: request.model.providerID })))
        if (outcome === "partial")
          return Stream.concat(
            Stream.succeed(LLMEvent.textDelta({ id: "title", text: "Do not save this" })),
            Stream.fail(new Error("Connection lost")),
          )
        return Stream.succeed(LLMEvent.textDelta({
          id: "title",
          text: outcome === "empty" ? "<think>reasoning</think>\n " : "project - recovered title",
        }))
      })),
  })
  return {
    layer: LayerNode.compile(LayerNode.group([SessionPrompt.node, Session.node, SessionProjector.node]), [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })],
      [Provider.node, provider],
      [LLM.node, llm],
      [Agent.node, Layer.mock(Agent.Service, { get: () => Effect.succeed(agent) })],
    ]),
    body: Effect.gen(function* () {
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const session = yield* sessions.create({ title: "Original title" })
      const user = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: session.id,
        agent: "build",
        model: { ...Provider.parseModel("test/conversation"), variant: "high" },
        time: { created: Date.now() },
      })
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: user.id,
        sessionID: session.id,
        type: "text",
        text: "Fix rename failures",
      })
      const result = yield* prompt.rename(session.id).pipe(Effect.exit)
      expect(lookups).toEqual(input.expected)
      const success = input.outcomes.includes("success")
      expect(Exit.isSuccess(result)).toBe(success)
      expect((yield* sessions.get(session.id)).title).toBe(success ? "project - recovered title" : "Original title")
      for (const request of requests) {
        const key = `${request.model.providerID}/${request.model.id}`
        const variant =
          key === (input.unpinned ? input.small ?? "test/conversation" : input.pinned ?? primary)
            ? agent.variant
            : key === luna ? "medium" : undefined
        expect(request.agent.variant).toBe(variant)
        expect(request.user.model.variant).toBe(variant)
        expect(request.agent.model).toEqual({ providerID: request.model.providerID, modelID: request.model.id })
        expect(request.retries).toBe(2)
        expect(request.tools).toEqual({})
        expect(JSON.stringify(request.messages)).toContain("Fix rename failures")
      }
      if (input.outcomes.includes("interrupt") && Exit.isFailure(result))
        expect(Cause.hasInterrupts(result.cause)).toBe(true)
      if (input.outcomes.includes("defect") && Exit.isFailure(result))
        expect(Cause.hasDies(result.cause)).toBe(true)
    }),
  }
}

const cases = [
  { name: "primary success stops the chain", outcomes: ["success"], expected: [primary] },
  { name: "Muse failure reaches MiMo without inheriting effort", outcomes: ["failure", "success"], expected: [primary, free] },
  { name: "two failures reach Luna medium", outcomes: ["failure", "failure", "success"], expected: [primary, free, luna] },
  { name: "lookup failure reaches MiMo", outcomes: ["lookup", "success"], expected: [primary, free] },
  { name: "known SDK initialization failure reaches MiMo", outcomes: ["init", "success"], expected: [primary, free] },
  { name: "failed partial text is discarded", outcomes: ["partial", "success"], expected: [primary, free] },
  { name: "empty cleaned title reaches MiMo", outcomes: ["empty", "success"], expected: [primary, free] },
  { name: "all failures preserve the title", outcomes: ["failure", "partial", "empty"], expected: [primary, free, luna] },
  { name: "interruption stops the chain", outcomes: ["interrupt"], expected: [primary] },
  { name: "defects do not trigger fallback", outcomes: ["defect"], expected: [primary] },
  { name: "configured primary keeps its variant", outcomes: ["success"], expected: ["test/custom"], pinned: "test/custom", variant: "high" },
  { name: "duplicate fallback models are skipped", outcomes: ["failure", "success"], expected: [free, luna], pinned: free },
  { name: "unpinned primary uses conversation model", outcomes: ["failure", "success"], expected: ["test/conversation", free], unpinned: true },
  { name: "unpinned small model is not retried as fallback", outcomes: ["failure", "success"], expected: [free, luna], unpinned: true, small: free },
] satisfies Array<Parameters<typeof check>[0] & { name: string }>

for (const entry of cases) {
  const scenario = check(entry)
  testEffect(scenario.layer).instance(entry.name, scenario.body, { git: true })
}
