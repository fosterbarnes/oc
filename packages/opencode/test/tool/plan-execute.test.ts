import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Deferred, Effect, Layer } from "effect"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { Question } from "@/question"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { MessageID, SessionID } from "@/session/schema"
import {
  PlanExecuteTool,
  executionModel,
  locationOptions,
  modelOptions,
  needsVariantChoice,
  planShape,
  variantOptions,
} from "@/tool/plan-execute"
import { PlanCloseoutTool } from "@/tool/plan-closeout"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { it } from "../lib/effect"
import { TestInstance } from "../fixture/fixture"

test("plan execution preserves the approved Go model choices", () => {
  expect(modelOptions().map((option) => option.label)).toEqual([
    "Same as planner",
    "OpenAI Luna",
    "Meta Muse Spark Contributor",
    "Cursor Grok 4.6",
    "Cursor Composer 2.5",
    "Cursor Auto",
  ])
})

test("only reasoning-capable Go choices request a variant", () => {
  expect(needsVariantChoice("inherit")).toBe(false)
  expect(needsVariantChoice("luna")).toBe(true)
  expect(needsVariantChoice("muse")).toBe(true)
  expect(needsVariantChoice("grok")).toBe(true)
  expect(needsVariantChoice("composer")).toBe(false)
  expect(needsVariantChoice("auto")).toBe(false)
})

test("fixed model choices map to provider models", () => {
  expect(executionModel("composer")).toMatchObject({ providerID: "cursor", modelID: "composer-2.5" })
})

test("variant choices preserve provider model keys and labels", () => {
  const model = {
    name: "Example model",
    variants: {
      medium: { reasoningEffort: "medium" },
      high: { reasoningEffort: "high" },
    },
  } as unknown as Provider.Model

  expect(variantOptions(model)).toEqual([
    { label: "medium", description: "Use the medium variant reported by Example model" },
    { label: "high", description: "Use the high variant reported by Example model" },
  ])
})

test("plan frontmatter decides which execution locations are offered", () => {
  const large = planShape(PHASED_PLAN)
  expect(large).toEqual({ size: "large", phases: 3 })
  expect(locationOptions(large).map((option) => option.label)).toEqual([
    "This session",
    "New session",
    "Phase sessions",
    "Conductor + sub-agents",
  ])
  expect(locationOptions(large)[3]?.description).toContain("Recommended")

  const plain = planShape("# Plan without frontmatter\n")
  expect(plain).toEqual({ size: "small", phases: 1 })
  expect(locationOptions(plain).map((option) => option.label)).toEqual(["This session", "New session"])
})

describe("plan_execute questionnaire", () => {
  it.instance("executes in This session with the planner model and context", () =>
    Effect.gen(function* () {
      const result = yield* runQuestionnaire(["Yes", "This session"])

      expect(result.asked.map((questions) => questions[0]?.header)).toEqual(["Automatic Go", "Execution Location"])
      expect(result.value).toMatchObject({
        title: "Starting Go in this session",
        metadata: { mode: "this-session", model: { modelID: "gpt-5.6-luna", variant: "high" } },
      })
      expect(result.messages[0]).toMatchObject({ agent: "Go", model: result.plannerModel })
      expect(result.parts[0]).toMatchObject({ type: "text", text: `go ${TEST_PLAN_PATH}` })
    }),
  )

  it.instance("dispatches New session with the selected model and variant", () =>
    Effect.gen(function* () {
      const result = yield* runQuestionnaire(["Yes", "New session", "OpenAI Luna", "high"])
      yield* Deferred.await(result.started)

      expect(result.asked.map((questions) => questions[0]?.header)).toEqual([
        "Automatic Go",
        "Execution Location",
        "Go Model",
        "Go Reasoning",
      ])
      expect(result.value).toMatchObject({
        title: "Starting Go: New session",
        metadata: { mode: "new-session", model: { providerID: "openai", modelID: "gpt-5.6-luna" }, variant: "high" },
      })
      expect(result.prompts[0]).toMatchObject({
        agent: "Go",
        model: { providerID: "openai", modelID: "gpt-5.6-luna" },
        variant: "high",
        parts: [{ type: "text", text: `go ${TEST_PLAN_PATH}` }],
      })
    }),
  )

  it.instance("starts a conductor with the selected phase executor", () =>
    Effect.gen(function* () {
      const dir = (yield* TestInstance).directory
      const planPath = path.join(dir, "phased.md")
      yield* Effect.promise(() => Bun.write(planPath, PHASED_PLAN))
      const result = yield* runQuestionnaire(
        ["Yes", "Conductor + sub-agents", "Cursor Composer 2.5", "general-luna-high"],
        planPath,
      )
      yield* Deferred.await(result.started)

      expect(result.asked.map((questions) => questions[0]?.header)).toEqual([
        "Automatic Go",
        "Execution Location",
        "Go Model",
        "Phase Executors",
      ])
      expect(result.asked[3]?.[0]?.options.map((option) => option.label)).toEqual([
        "Plan's suggestions",
        "general-luna-high",
      ])
      expect(result.value.metadata).toMatchObject({ mode: "conductor", executor: "general-luna-high" })
      expect(result.prompts[0]?.parts).toEqual([
        { type: "text", text: `go ${planPath} mode=conductor executor=general-luna-high` },
      ])
    }),
  )

  it.instance("rejects a missing plan before asking execution questions", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(runQuestionnaire(["Yes", "This session"], "C:\\missing-plan.md"))

      expect(result._tag).toBe("Failure")
    }),
  )
})

const PHASED_PLAN = "---\nsize: large\nphases: 3\n---\n# Plan\n"
const plannerID = SessionID.make("ses_questionnaire")
const TEST_PLAN_PATH = path.resolve(import.meta.dir, "../../../../buildNotes.md")
const plannerModel = {
  providerID: ProviderV2.ID.make("openai"),
  modelID: ModelV2.ID.make("gpt-5.6-luna"),
  variant: "high",
}

function runQuestionnaire(answers: string[], planPath = TEST_PLAN_PATH) {
  return Effect.gen(function* () {
    const asked: Question.Info[][] = []
    const messages: SessionV1.Info[] = []
    const parts: SessionV1.Part[] = []
    const prompts: SessionPrompt.PromptInput[] = []
    const started = yield* Deferred.make<void>()
    const planner = {
      id: plannerID,
      slug: "planner",
      title: "Planner",
      directory: "/unused",
      projectID: "proj_test",
      version: "0",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } as Session.Info
    const created = {
      id: SessionID.make("ses_go"),
      slug: "go-plan",
      title: "Go",
      directory: "/unused",
      projectID: "proj_test",
      version: "0",
      time: { created: 1_700_000_000_000, updated: 1_700_000_000_000 },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    } as Session.Info
    const layer = Layer.mergeAll(
      Layer.mock(Truncate.Service, {
        output: (text: string) => Effect.succeed({ content: text, truncated: false as const }),
      }),
      Layer.mock(Agent.Service, {
        get: (name: string) => Effect.succeed({ name, permission: [] } as unknown as Agent.Info),
        list: () =>
          Effect.succeed([
            { name: "Go", mode: "primary" },
            { name: "general-luna-high", mode: "subagent", description: "Luna high" },
            { name: "explore", mode: "subagent" },
          ] as unknown as Agent.Info[]),
      }),
      Layer.mock(Provider.Service, {
        defaultModel: () => Effect.succeed(plannerModel),
        getModel: (providerID: ProviderV2.ID, modelID: ModelV2.ID) =>
          Effect.succeed({
            id: modelID,
            providerID,
            name: `${providerID}/${modelID}`,
            variants: { medium: {}, high: {} },
          } as unknown as Provider.Model),
      }),
      Layer.mock(Session.Service, {
        get: (id: SessionID) => Effect.succeed(id === plannerID ? planner : created),
        messages: () =>
          Effect.succeed([
            {
              info: {
                id: MessageID.make("msg_planner"),
                sessionID: plannerID,
                role: "user" as const,
                time: { created: Date.now() },
                agent: "superPlan++",
                model: plannerModel,
              },
              parts: [],
            },
          ] as SessionV1.WithParts[]),
        updateMessage: ((message: SessionV1.Info) =>
          Effect.sync(() => {
            messages.push(message)
            return message
          })) as Session.Interface["updateMessage"],
        updatePart: ((part: SessionV1.Part) =>
          Effect.sync(() => {
            parts.push(part)
            return part
          })) as Session.Interface["updatePart"],
        create: () => Effect.succeed(created),
      }),
      Layer.mock(SessionPrompt.Service, {
        prompt: ((input: SessionPrompt.PromptInput) =>
          Effect.gen(function* () {
            prompts.push(input)
            yield* Deferred.succeed(started, undefined)
            return { info: { id: MessageID.make("msg_go"), role: "assistant", sessionID: input.sessionID }, parts: [] }
          })) as unknown as SessionPrompt.Interface["prompt"],
      }),
      Layer.mock(Question.Service, {
        ask: (input: { questions: ReadonlyArray<Question.Info> }) =>
          Effect.sync(() => {
            asked.push([...input.questions])
            return [[answers.shift()!]] as Question.Answer[]
          }),
      }),
    )

    const value = yield* PlanExecuteTool.pipe(
      Effect.flatMap(Tool.init),
      Effect.flatMap((tool) =>
        tool.execute(
          { planPath },
          {
            sessionID: plannerID,
            messageID: MessageID.make("msg_questionnaire"),
            agent: "superPlan++",
            abort: new AbortController().signal,
            callID: "call_questionnaire",
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        ),
      ),
      Effect.provide(layer),
    )

    return { asked, value, messages, parts, prompts, started, plannerModel }
  })
}

describe("plan_closeout", () => {
  it.instance("moves a plan into plans/archive and refuses to overwrite an archive", () =>
    Effect.gen(function* () {
      const plans = path.join((yield* TestInstance).directory, "plans")
      const planPath = path.join(plans, "done.md")
      const archivePath = path.join(plans, "archive", "done.md")
      yield* Effect.promise(() => Bun.write(planPath, "# Done\n"))

      const value = yield* closeout(planPath)
      expect(value.metadata).toMatchObject({ archivePath })
      expect(yield* Effect.promise(() => Bun.file(planPath).exists())).toBe(false)
      expect(yield* Effect.promise(() => Bun.file(archivePath).text())).toBe("# Done\n")

      yield* Effect.promise(() => Bun.write(planPath, "# Again\n"))
      expect((yield* Effect.exit(closeout(planPath)))._tag).toBe("Failure")
      expect(yield* Effect.promise(() => Bun.file(planPath).text())).toBe("# Again\n")
    }),
  )

  it.instance("rejects plans outside a plans directory", () =>
    Effect.gen(function* () {
      const planPath = path.join((yield* TestInstance).directory, "loose.md")
      yield* Effect.promise(() => fs.writeFile(planPath, "# Loose\n"))
      expect((yield* Effect.exit(closeout(planPath)))._tag).toBe("Failure")
    }),
  )
})

function closeout(planPath: string) {
  return PlanCloseoutTool.pipe(
    Effect.flatMap(Tool.init),
    Effect.flatMap((tool) =>
      tool.execute(
        { planPath },
        {
          sessionID: plannerID,
          messageID: MessageID.make("msg_closeout"),
          agent: "Go",
          abort: new AbortController().signal,
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      ),
    ),
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(Truncate.Service, {
          output: (text: string) => Effect.succeed({ content: text, truncated: false as const }),
        }),
        Layer.mock(Agent.Service, {
          get: (name: string) => Effect.succeed({ name, permission: [] } as unknown as Agent.Info),
        }),
      ),
    ),
  )
}
