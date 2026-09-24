import path from "path"
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

type ExecutionMetadata = {
  mode?: "this-session" | "new-session"
  model?: ExecutionModel
  variant?: string
  sessionID?: SessionID
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

function sessionPrompt() {
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
          if (!path.isAbsolute(params.planPath)) {
            return yield* Effect.die(new Error(`Plan path must be absolute: ${params.planPath}`))
          }
          if (!(yield* Effect.promise(() => Bun.file(params.planPath).exists()))) {
            return yield* Effect.die(new Error(`Plan file was not found: ${params.planPath}`))
          }

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
                options: [
                  { label: "This session", description: "Use this session's model and context" },
                  { label: "New session", description: "Use a new session with a selected model" },
                ],
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
          if (locationChoice !== "New session") {
            return yield* Effect.die(new Error("Execution requires an explicit This session or New session answer"))
          }

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

          const prompt = yield* sessionPrompt()
          const modelRef = { providerID: selected.providerID, modelID: selected.modelID }
          const goSession = yield* session.create({
            agent: "Go",
            title: `Go: ${path.basename(params.planPath)}`,
            model: {
              id: modelRef.modelID,
              providerID: modelRef.providerID,
              ...(variant ? { variant } : {}),
            },
          })
          yield* prompt
            .prompt({
              sessionID: goSession.id,
              agent: "Go",
              model: modelRef,
              ...(variant ? { variant } : {}),
              parts: [{ type: "text", text: `go ${params.planPath}` }],
            })
            .pipe(
              Effect.catchCause((cause) =>
                Effect.logError("plan_execute prompt failed", { sessionID: goSession.id, cause }),
              ),
              Effect.forkIn(scope, { startImmediately: true }),
            )

          return {
            title: "Starting Go in new session",
            output: `Go is starting in session ${goSession.id} with the plan at ${params.planPath}.`,
            metadata: {
              mode: "new-session" as const,
              model: selected,
              sessionID: goSession.id,
              ...(variant ? { variant } : {}),
            },
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
