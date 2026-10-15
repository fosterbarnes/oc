// Fork /btw side question, lifted out of upstream's prompt.ts so it keeps only the call. Built inside
// SessionPrompt's layer from its services; the httpapi session group imports the schemas from here.
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { LLMEvent } from "@opencode-ai/llm"
import { Effect, Schema } from "effect"
import * as Stream from "effect/Stream"
import { isClaudeCodeProvider } from "@/provider/claude-code/shared"
import { CURSOR_PROVIDER_ID } from "@/provider/cursor/shared"
import { Provider } from "@/provider/provider"
import { Agent } from "../agent/agent"
import { Instruction } from "./instruction"
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { MessageID, SessionID } from "./schema"
import { Session } from "./session"
import { SystemPrompt } from "./system"

const GENERATE_TIMEOUT = "120 seconds"
const SIDE_QUESTION_INSTRUCTION = [
  "The user is asking a quick side question about the conversation so far.",
  "Answer directly and concisely in markdown from what you already know.",
  "Do not call any tools and do not take any actions.",
  "This answer is not added to the conversation.",
].join(" ")

export function makeSideQuestion({ sessions, agents, provider, instruction, sys, llm, currentModel }: {
  sessions: Session.Interface
  agents: Agent.Interface
  provider: Provider.Interface
  instruction: Instruction.Interface
  sys: SystemPrompt.Interface
  llm: LLM.Interface
  currentModel: (sessionID: SessionID) => Effect.Effect<{ providerID: ProviderV2.ID; modelID: ModelV2.ID }>
}) {
  // /btw side question: one tool-less model call over a snapshot of the history. Nothing is
  // written back, so messages, marks, and resume state stay as they were.
  return Effect.fn("SessionPrompt.generate")(function* (input: GenerateInput) {
    const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    const agentName = input.agent ?? session.agent ?? (yield* agents.defaultInfo()).name
    const agent = yield* agents.get(agentName)
    if (!agent) {
      return yield* new GenerateAgentNotFoundError({ agent: agentName, message: `Agent not found: "${agentName}".` })
    }

    const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))
    const unsupported = isClaudeCodeProvider(model.providerID)
      ? "Claude Code"
      : model.providerID === CURSOR_PROVIDER_ID
        ? "Cursor"
        : undefined
    if (unsupported) {
      return yield* new GenerateUnsupportedError({
        providerID: model.providerID,
        message: `/btw is not available on ${unsupported} yet`,
      })
    }
    const resolved = yield* provider.getModel(model.providerID, model.modelID)

    const history = yield* sessions.messages({ sessionID: input.sessionID }).pipe(Effect.orDie)
    // filterCompacted takes newest-first and returns oldest-first.
    const context = MessageV2.filterCompacted(revertedHistory(history, session.revert).toReversed())
    const messages = yield* MessageV2.toModelMessagesEffect(
      context.filter(
        (msg) => msg.parts.length > 0 && (msg.info.role !== "assistant" || msg.info.time.completed !== undefined),
      ),
      resolved,
    )

    const modelKey = `${resolved.providerID}/${resolved.id}`
    const [env, instructions, base] = yield* Effect.all([
      sys.environment(resolved),
      instruction.system(modelKey).pipe(Effect.orDie),
      agent.prompt ? Effect.succeed(undefined) : instruction.base(modelKey).pipe(Effect.orDie),
    ])
    const user: SessionV1.User = {
      id: MessageID.ascending(),
      role: "user",
      sessionID: input.sessionID,
      time: { created: Date.now() },
      agent: agent.name,
      model: { providerID: resolved.providerID, modelID: resolved.id, variant: input.variant },
    }

    const events = yield* llm
      .stream({
        user,
        sessionID: input.sessionID,
        model: resolved,
        agent: base ? { ...agent, prompt: base } : agent,
        system: [...env, ...instructions, SIDE_QUESTION_INSTRUCTION],
        messages: [...messages, { role: "user", content: input.prompt }],
        tools: {},
        toolChoice: "none",
      })
      .pipe(
        Stream.runCollect,
        Effect.catchDefect((error) => (Provider.InitError.isInstance(error) ? Effect.fail(error) : Effect.die(error))),
        Effect.mapError(
          (error) => new GenerateFailedError({ message: error instanceof Error ? error.message : String(error) }),
        ),
        Effect.timeoutOrElse({
          duration: GENERATE_TIMEOUT,
          orElse: () =>
            Effect.fail(
              new GenerateTimeoutError({ message: `The side question timed out after ${GENERATE_TIMEOUT}.` }),
            ),
        }),
      )

    const providerError = events.find(LLMEvent.is.providerError)
    if (providerError) return yield* new GenerateFailedError({ message: providerError.message })
    if (events.some(LLMEvent.is.toolCall)) {
      return yield* new GenerateFailedError({ message: "The model tried to call a tool, which /btw cannot run." })
    }
    const finish = events.findLast(LLMEvent.is.finish)
    if (finish && finish.reason !== "stop" && finish.reason !== "unknown") {
      return yield* new GenerateFailedError({
        message: `The model stopped before finishing its answer (${finish.reason}).`,
      })
    }
    const text = events
      .filter(LLMEvent.is.textDelta)
      .map((event) => event.text)
      .join("")
      .trim()
    if (!text) return yield* new GenerateFailedError({ message: "The model returned an empty answer." })
    return { text, providerID: resolved.providerID, modelID: resolved.id }
  })
}

// Same boundary as SessionRevert.cleanup, applied to a copy: the reverted message and later ones
// go, or only the parts before the reverted part remain.
function revertedHistory(msgs: SessionV1.WithParts[], revert: Session.Info["revert"]) {
  if (!revert) return msgs
  const index = msgs.findIndex((msg) => msg.info.id === revert.messageID)
  if (index < 0) return msgs
  if (!revert.partID) return msgs.slice(0, index)
  const target = msgs[index]
  const partIndex = target.parts.findIndex((part) => part.id === revert.partID)
  if (partIndex < 0) return msgs.slice(0, index + 1)
  return [...msgs.slice(0, index), { ...target, parts: target.parts.slice(0, partIndex) }]
}

export const GenerateInput = Schema.Struct({
  sessionID: SessionID,
  prompt: Schema.String.check(Schema.isPattern(/\S/)),
  model: Schema.optional(Schema.Struct({ providerID: ProviderV2.ID, modelID: ModelV2.ID })),
  agent: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
})
export type GenerateInput = Schema.Schema.Type<typeof GenerateInput>

export const GenerateResult = Schema.Struct({
  text: Schema.String,
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID,
})
export type GenerateResult = Schema.Schema.Type<typeof GenerateResult>

export class GenerateUnsupportedError extends Schema.TaggedErrorClass<GenerateUnsupportedError>()(
  "GenerateUnsupportedError",
  { providerID: ProviderV2.ID, message: Schema.String },
) {}
export class GenerateAgentNotFoundError extends Schema.TaggedErrorClass<GenerateAgentNotFoundError>()(
  "GenerateAgentNotFoundError",
  { agent: Schema.String, message: Schema.String },
) {}
export class GenerateFailedError extends Schema.TaggedErrorClass<GenerateFailedError>()("GenerateFailedError", {
  message: Schema.String,
}) {}
export class GenerateTimeoutError extends Schema.TaggedErrorClass<GenerateTimeoutError>()("GenerateTimeoutError", {
  message: Schema.String,
}) {}
export type GenerateError =
  | GenerateUnsupportedError
  | GenerateAgentNotFoundError
  | GenerateFailedError
  | GenerateTimeoutError
  | Provider.ModelNotFoundError
