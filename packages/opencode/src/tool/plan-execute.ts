import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect, Schema } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import { Session } from "@/session/session"
import { Agent } from "@/agent/agent"
import { Provider } from "@/provider/provider"
import { InstanceState } from "@/effect/instance-state"
import { MessageID, PartID } from "../session/schema"

export const Parameters = Schema.Struct({})

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

type ExecutionMetadata = {
  executionMode?: "automatic"
  model?: ExecutionModel
  variant?: string
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

function currentModel(messages: SessionV1.WithParts[], fallback: ExecutionModel): ExecutionModel {
  const lastUser = messages.findLast((item) => item.info.role === "user" && item.info.model)
  if (lastUser?.info.role !== "user" || !lastUser.info.model) return fallback
  return {
    providerID: lastUser.info.model.providerID,
    modelID: lastUser.info.model.modelID,
    ...(lastUser.info.model.variant ? { variant: lastUser.info.model.variant } : {}),
  }
}

export const PlanExecuteTool = Tool.define<
  typeof Parameters,
  ExecutionMetadata,
  Session.Service | Question.Service | Provider.Service | Agent.Service
>(
  "plan_execute",
  Effect.gen(function* () {
    const session = yield* Session.Service
    const question = yield* Question.Service
    const provider = yield* Provider.Service
    const agents = yield* Agent.Service

    return {
      description:
        "Ask whether to automatically execute the completed plan with Go, select and validate its model, then start Go.",
      parameters: Parameters,
      execute: (_params: {}, ctx: Tool.Context) =>
        Effect.gen(function* () {
          if (ctx.agent !== "superPlan++") {
            return yield* Effect.die(new Error("plan_execute is available only to superPlan++"))
          }

          const approval = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: [
              {
                question: "Should this completed plan be executed automatically by Go?",
                header: "Automatic Go",
                custom: false,
                options: [
                  { label: "Yes", description: "Select a model and start Go automatically" },
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

          const instance = yield* InstanceState.context
          const info = yield* session.get(ctx.sessionID)
          const plan = path.relative(instance.worktree, Session.plan(info, instance))
          const plannerModel = currentModel(yield* session.messages({ sessionID: ctx.sessionID }), yield* provider.defaultModel())
          const plannerFull = yield* provider.getModel(plannerModel.providerID, plannerModel.modelID)
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
          const model = choice === "inherit" ? plannerFull : yield* provider.getModel(selected.providerID, selected.modelID)
          const variant = choice === "inherit"
            ? plannerModel.variant
            : needsVariantChoice(choice)
              ? yield* selectVariant(question, ctx, model)
              : undefined
          if (variant && !model.variants?.[variant]) {
            return yield* Effect.die(new Error(`Unsupported execution variant: ${variant}`))
          }

          const go = yield* agents.get("Go")
          if (!go) return yield* Effect.die(new Error('The "Go" agent is not configured'))

          const msg: SessionV1.User = {
            id: MessageID.ascending(),
            sessionID: ctx.sessionID,
            role: "user",
            time: { created: Date.now() },
            agent: "Go",
            model: {
              providerID: selected.providerID,
              modelID: selected.modelID,
              ...(variant ? { variant } : {}),
            },
          }
          yield* session.updateMessage(msg)
          yield* session.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID: ctx.sessionID,
            type: "text",
            text: `The plan at ${plan} has been approved, you can now edit files. Execute the plan`,
            synthetic: true,
          } satisfies SessionV1.TextPart)

          return {
            title: "Starting Go",
            output: `Approved automatic Go execution with ${model.name}${variant ? ` (${variant})` : ""}.`,
            metadata: { executionMode: "automatic" as const, model: selected, ...(variant ? { variant } : {}) },
          }
        }).pipe(Effect.orDie),
    }
  }),
)

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
