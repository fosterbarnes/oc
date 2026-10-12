import path from "path"
import matter from "gray-matter"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect, Schema, Scope } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { Session } from "@/session/session"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { MessageID, PartID, SessionID } from "../session/schema"
import type { SessionPrompt } from "@/session/prompt"

export const Parameters = Schema.Struct({
  planPath: Schema.String,
})

const MODEL_OPTIONS = [
  { id: "inherit", label: "Same as planner", description: "Use the planner's exact model and variant" },
  { id: "luna", label: "OpenAI Luna", description: "Use OpenAI GPT-5.6 Luna" },
  { id: "muse", label: "Meta Muse Spark Contributor", description: "Use Meta Muse Spark Contributor" },
  { id: "grok", label: "Cursor Grok 4.6", description: "Use Cursor Grok 4.6" },
  { id: "composer", label: "Cursor Composer 2.5", description: "Use Cursor Composer 2.5" },
  { id: "auto", label: "Cursor Auto", description: "Let Cursor select the model" },
] as const

type ModelChoice = (typeof MODEL_OPTIONS)[number]["id"]

const MODEL_IDS: Record<Exclude<ModelChoice, "inherit">, string> = {
  luna: "openai/gpt-5.6-luna",
  muse: "meta/muse-spark-1.2-contributor",
  grok: "cursor/grok-4.6",
  composer: "cursor/composer-2.5",
  auto: "cursor/default",
}

export type ExecutionModel = {
  providerID: ProviderV2.ID
  modelID: ModelV2.ID
  variant?: string
}

// Location label -> kickoff suffix Go reads to pick its execution mode.
const LOCATIONS = {
  "New session": { mode: "new-session", kickoff: "" },
  "Phase sessions": { mode: "phase-sessions", kickoff: " mode=sessions phase=1" },
  "Conductor + sub-agents": { mode: "conductor", kickoff: " mode=conductor" },
} as const

const PLAN_EXECUTORS = "Plan's suggestions"

type ExecutionMetadata = {
  mode?: "this-session" | (typeof LOCATIONS)[keyof typeof LOCATIONS]["mode"]
  model?: ExecutionModel
  variant?: string
  executor?: string
  sessionID?: SessionID
}

export type PlanShape = { size: string; phases: number }

/** Reads the planner's `size` and `phases` frontmatter. Plans without it are one small phase. */
export function planShape(text: string): PlanShape {
  const data = matter(text).data
  const phases = Number(data.phases)
  return {
    size: typeof data.size === "string" ? data.size : "small",
    phases: Number.isInteger(phases) && phases > 1 ? phases : 1,
  }
}

export function locationOptions(shape: PlanShape) {
  const fit = (size: string) => (shape.size === size ? " Recommended for this plan." : "")
  return [
    { label: "This session", description: `Use this session's model and context.${fit("small")}` },
    { label: "New session", description: "Run the whole plan in one new session with a selected model" },
    ...(shape.phases > 1
      ? [
          {
            label: "Phase sessions",
            description: `Run each phase in its own new session; Go hands off between phases.${fit("medium")}`,
          },
          {
            label: "Conductor + sub-agents",
            description: `A new Go session sends each phase to a fresh sub-agent.${fit("large")}`,
          },
        ]
      : []),
  ]
}

export function requirePlanFile(planPath: string) {
  return Effect.gen(function* () {
    if (!path.isAbsolute(planPath)) return yield* Effect.die(new Error(`Plan path must be absolute: ${planPath}`))
    const file = Bun.file(planPath)
    if (!(yield* Effect.promise(() => file.exists()))) {
      return yield* Effect.die(new Error(`Plan file was not found: ${planPath}`))
    }
    return yield* Effect.promise(() => file.text())
  })
}

/** Creates a Go session and starts its first prompt in the background. */
export function startGoSession(input: {
  session: Session.Interface
  scope: Scope.Scope
  model: ExecutionModel
  title: string
  text: string
}): Effect.Effect<Session.Info> {
  return Effect.gen(function* () {
    const prompt = yield* sessionPrompt()
    const modelRef = { providerID: input.model.providerID, modelID: input.model.modelID }
    const variant = input.model.variant
    const goSession = yield* input.session.create({
      agent: "Go",
      title: input.title,
      model: { id: modelRef.modelID, providerID: modelRef.providerID, ...(variant ? { variant } : {}) },
    })
    yield* prompt
      .prompt({
        sessionID: goSession.id,
        agent: "Go",
        model: modelRef,
        ...(variant ? { variant } : {}),
        parts: [{ type: "text", text: input.text }],
      })
      .pipe(
        Effect.catchCause((cause) => Effect.logError("Go prompt failed", { sessionID: goSession.id, cause })),
        Effect.forkIn(input.scope, { startImmediately: true }),
      )
    return goSession
  })
}

export function modelOptions() {
  return MODEL_OPTIONS
}

export function executionModel(choice: Exclude<ModelChoice, "inherit">) {
  return Provider.parseModel(MODEL_IDS[choice])
}

export function needsVariantChoice(choice: ModelChoice) {
  return choice === "luna" || choice === "muse" || choice === "grok"
}

export function variantOptions(model: Provider.Model) {
  return Object.keys(model.variants ?? {}).map((variant) => ({
    label: variant,
    description: `Use the ${variant} variant reported by ${model.name}`,
  }))
}

function requireAnswer(answers: ReadonlyArray<Question.Answer>, label: string): string {
  const answer = answers[0]?.[0]
  if (!answer) throw new Error(`No answer received for ${label}`)
  return answer
}

function modelChoice(label: string): ModelChoice {
  const choice = MODEL_OPTIONS.find((item) => item.label === label)?.id
  if (!choice) throw new Error(`Unknown execution model: ${label}`)
  return choice
}

export function currentModel(messages: SessionV1.WithParts[], fallback: ExecutionModel): ExecutionModel {
  const lastUser = messages.findLast((item) => item.info.role === "user" && item.info.model)
  if (lastUser?.info.role !== "user" || !lastUser.info.model) return fallback
  return {
    providerID: lastUser.info.model.providerID,
    modelID: lastUser.info.model.modelID,
    ...(lastUser.info.model.variant ? { variant: lastUser.info.model.variant } : {}),
  }
}

function sessionPrompt(): Effect.Effect<SessionPrompt.Interface> {
  return Effect.gen(function* () {
    const loaded = yield* Effect.promise(() => import("@/session/prompt"))
    return yield* loaded.SessionPrompt.Service
  }) as unknown as Effect.Effect<SessionPrompt.Interface>
}

export const PlanExecuteTool = Tool.define<
  typeof Parameters,
  ExecutionMetadata,
  Session.Service | Question.Service | Provider.Service | Agent.Service | Scope.Scope
>(
  "plan_execute",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const question = yield* Question.Service
    const provider = yield* Provider.Service
    const agents = yield* Agent.Service
    const scope = yield* Scope.Scope

    return {
      description: "Ask how to execute the completed plan, then execute it using the selected path.",
      parameters: Parameters,
      execute: (params, ctx: Tool.Context): Effect.Effect<Tool.ExecuteResult<ExecutionMetadata>> =>
        Effect.gen(function* () {
          yield* ctx.ask({ permission: "plan_execute", patterns: [params.planPath], always: ["*"], metadata: params })
          const shape = planShape(yield* requirePlanFile(params.planPath))

          const approval = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: "Should this completed plan be executed automatically by Go?",
                header: "Automatic Go",
                custom: false,
                options: [
                  { label: "Yes", description: "Choose how Go should execute the plan" },
                  { label: "No", description: "Leave the plan ready for manual execution" },
                ],
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })
          const approvalChoice = requireAnswer(approval, "automatic execution")
          if (approvalChoice === "No") {
            return {
              title: "Plan remains ready",
              output: "Automatic execution was declined. The plan remains ready for manual Go execution.",
              metadata: {},
            }
          }
          if (approvalChoice !== "Yes") {
            return yield* Effect.die(new Error("Automatic execution requires an explicit Yes or No answer"))
          }

          const location = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: "Where should Go execute this plan?",
                header: "Execution Location",
                custom: false,
                options: locationOptions(shape),
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })
          const locationChoice = requireAnswer(location, "execution location")
          const plannerModel = currentModel(
            yield* session.messages({ sessionID: ctx.sessionID }),
            yield* provider.defaultModel(),
          )
          const go = yield* agents.get("Go")
          if (!go) return yield* Effect.die(new Error('The "Go" agent is not configured'))

          if (locationChoice === "This session") {
            const messageID = MessageID.ascending()
            yield* session.updateMessage({
              id: messageID,
              sessionID: ctx.sessionID,
              role: "user",
              time: { created: Date.now() },
              agent: "Go",
              model: plannerModel,
            } satisfies SessionV1.User)
            yield* session.updatePart({
              id: PartID.ascending(),
              messageID,
              sessionID: ctx.sessionID,
              type: "text",
              text: `go ${params.planPath}`,
              synthetic: true,
            } satisfies SessionV1.TextPart)
            return {
              title: "Starting Go in this session",
              output: `Go is continuing in this session with the plan at ${params.planPath}.`,
              metadata: { mode: "this-session" as const, model: plannerModel },
            }
          }
          if (!(locationChoice in LOCATIONS)) {
            return yield* Effect.die(new Error(`Unknown execution location: ${locationChoice}`))
          }
          const target = LOCATIONS[locationChoice as keyof typeof LOCATIONS]

          const selectedModel = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: "Which model should execute this plan with Go?",
                header: "Go Model",
                custom: false,
                options: MODEL_OPTIONS.map(({ label, description }) => ({ label, description })),
              },
            ],
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })
          const choice = modelChoice(requireAnswer(selectedModel, "Go model"))
          const selected = choice === "inherit" ? plannerModel : executionModel(choice)
          const model = yield* provider.getModel(selected.providerID, selected.modelID)
          const variant =
            choice === "inherit"
              ? plannerModel.variant
              : needsVariantChoice(choice)
                ? yield* selectVariant(question, ctx, model)
                : undefined
          if (variant && !model.variants?.[variant]) {
            return yield* Effect.die(new Error(`Unsupported execution variant: ${variant}`))
          }

          const executor = target.mode === "conductor" ? yield* selectExecutor(question, ctx, agents) : undefined

          const goSession = yield* startGoSession({
            session,
            scope,
            model: { providerID: selected.providerID, modelID: selected.modelID, ...(variant ? { variant } : {}) },
            title: `Go: ${path.basename(params.planPath)}`,
            text: `go ${params.planPath}${target.kickoff}${executor ? ` executor=${executor}` : ""}`,
          })

          return {
            title: `Starting Go: ${locationChoice}`,
            output: `Go is starting in session ${goSession.id} with the plan at ${params.planPath}.`,
            metadata: {
              mode: target.mode,
              model: selected,
              sessionID: goSession.id,
              ...(variant ? { variant } : {}),
              ...(executor ? { executor } : {}),
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)

/** Conductor mode: one general-* sub-agent for every phase, or each phase's `executor` from the plan. */
function selectExecutor(question: Question.Interface, ctx: Tool.Context, agents: Agent.Interface) {
  return Effect.gen(function* () {
    const executors = (yield* agents.list()).filter(
      (agent) => agent.mode !== "primary" && agent.name.startsWith("general-"),
    )
    const answers = yield* question.ask({
      sessionID: ctx.sessionID,
      questions: [
        {
          question: "Which sub-agent should execute each phase?",
          header: "Phase Executors",
          custom: false,
          options: [
            { label: PLAN_EXECUTORS, description: "Use each phase's executor from the plan" },
            ...executors.map((agent) => ({ label: agent.name, description: agent.description ?? agent.name })),
          ],
        },
      ],
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })
    const answer = requireAnswer(answers, "phase executors")
    return answer === PLAN_EXECUTORS ? undefined : answer
  })
}

function selectVariant(
  question: Question.Interface,
  ctx: Tool.Context,
  model: Provider.Model,
): Effect.Effect<string, Question.RejectedError> {
  const options = variantOptions(model)
  if (options.length === 0) return Effect.die(new Error(`No variants are available for ${model.name}`))
  return question
    .ask({
      sessionID: ctx.sessionID,
      questions: [
        {
          question: `Which reasoning variant should Go use for ${model.name}?`,
          header: "Go Reasoning",
          custom: false,
          options,
        },
      ],
      tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
    })
    .pipe(Effect.map((answers) => requireAnswer(answers, "Go reasoning")))
}
