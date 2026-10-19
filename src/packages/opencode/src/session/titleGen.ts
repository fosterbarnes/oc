// Fork title paths, lifted out of upstream's prompt.ts so it keeps only the calls. Built inside
// SessionPrompt's layer from its services. Modes are described on `title` below.
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionWork } from "@opencode-ai/core/session/work"
import { LLMEvent } from "@opencode-ai/llm"
import { Cause, Effect, Option, Schema, Scope } from "effect"
import * as Stream from "effect/Stream"
import { InstanceState } from "@/effect/instance-state"
import { Provider } from "@/provider/provider"
import { Agent } from "../agent/agent"
import { Command } from "../command"
import { LLM } from "./llm"
import { MessageV2 } from "./message-v2"
import { SessionID } from "./schema"
import { Session } from "./session"

const decodeAutoRename = Schema.decodeUnknownOption(
  Schema.Struct({
    state: Schema.Literals(["pending", "attempted"]),
    title: Schema.optional(Schema.String),
  }),
)
// Tried in order after the rename agent's own model fails or returns an empty title.
const RENAME_FALLBACKS = [
  { model: Provider.parseModel("opencode/mimo-v2.6-flash-free"), variant: undefined },
  { model: Provider.parseModel("openai/gpt-6-luna"), variant: "medium" },
]
// Stock titles use the loop model as fallback; marked and manual titles use the last user's model.
type TitleInput = { session: Session.Info; history: SessionV1.WithParts[] } & (
  | { mode: "stock"; providerID: ProviderV2.ID; modelID: ModelV2.ID }
  | { mode: "marked" | "manual" }
)

export function makeTitles({
  sessions,
  agents,
  provider,
  llm,
  work,
  scope,
}: {
  sessions: Session.Interface
  agents: Agent.Interface
  provider: Provider.Interface
  llm: LLM.Interface
  work: SessionWork.Interface
  scope: Scope.Scope
}) {
  // One title path for every generated title. Modes:
  // - stock: first request of an unmarked session. Title agent and whole request, one attempt.
  // - marked: first request of an oc auto-rename session. Rename agent, its variant, then RENAME_FALLBACKS.
  // - manual: /rename. Same rename attempts as marked, written unconditionally.
  // Automatic modes skip the write when the title changed while the model was running.
  const title = Effect.fn("SessionPrompt.title")(function* (input: TitleInput) {
    const automatic = input.mode !== "manual"
    if (automatic && (yield* sessions.get(input.session.id)).title !== input.session.title) return

    const last = input.history.findLast((m) => m.info.role === "user")
    if (!last || last.info.role !== "user") return
    const user = last.info
    const ag = yield* agents.get(input.mode === "stock" ? "title" : "rename")
    if (!ag) return
    const fallback = input.mode === "stock" ? { providerID: input.providerID, modelID: input.modelID } : user.model
    const small = ag.model ? undefined : yield* provider.getSmallModel(fallback.providerID)
    const primary = {
      model: ag.model ?? (small ? { providerID: small.providerID, modelID: small.id } : fallback),
      variant: ag.variant,
    }
    const attempts = [primary, ...(input.mode === "stock" ? [] : RENAME_FALLBACKS)].filter(
      (attempt, index, all) =>
        all.findIndex(
          (other) =>
            other.model.providerID === attempt.model.providerID && other.model.modelID === attempt.model.modelID,
        ) === index,
    )
    const generate = (attempt: (typeof attempts)[number]) =>
      Effect.gen(function* () {
        const mdl =
          small && small.providerID === attempt.model.providerID && small.id === attempt.model.modelID
            ? small
            : yield* provider.getModel(attempt.model.providerID, attempt.model.modelID)
        const request =
          input.mode === "stock"
            ? {
                agent: ag,
                user,
                messages: [
                  { role: "user" as const, content: "Generate a title for this conversation:\n" },
                  ...(yield* titleConversation(last, input.history, mdl)),
                ],
              }
            : {
                agent: { ...ag, model: { providerID: mdl.providerID, modelID: mdl.id }, variant: attempt.variant },
                // Request preparation otherwise inherits the conversation's effort for unvaried agents.
                user: { ...user, model: { ...user.model, variant: attempt.variant } },
                messages: [
                  {
                    role: "user" as const,
                    content: `Generate a concise title for this conversation. Start it with the folder name "${path.basename(input.session.directory)}", followed by " - " and a short description, for example "oc - description".\n\n${renameDigest(input.history)}`,
                  },
                ],
              }
        const text = yield* llm
          .stream({
            ...request,
            system: [],
            small: true,
            tools: {},
            model: mdl,
            sessionID: input.session.id,
            retries: 2,
          })
          .pipe(
            Stream.filter(LLMEvent.is.textDelta),
            Stream.map((e) => e.text),
            Stream.mkString,
          )
        const result = cleanTitle(text)
        if (!result) return yield* Effect.fail(new Error("Title model returned an empty title"))
        return { title: result, model: `${mdl.providerID}/${mdl.id}` }
      }).pipe(
        // SDK initialization surfaces its known provider error as a defect.
        Effect.catchDefect((error) => (Provider.InitError.isInstance(error) ? Effect.fail(error) : Effect.die(error))),
        Effect.tapError((error) =>
          Effect.logWarning("title model failed", { sessionID: input.session.id, model: attempt.model, error }),
        ),
      )
    const result = yield* Effect.firstSuccessOf(attempts.map(generate))
    if (automatic && (yield* sessions.get(input.session.id)).title !== input.session.title) return
    yield* sessions.setTitle({ sessionID: input.session.id, title: result.title })
    return result
  })

  // Re-titles a session from a digest of its history, for the /rename command.
  const rename = Effect.fn("SessionPrompt.rename")(function* (sessionID: SessionID) {
    const session = yield* sessions.get(sessionID)
    const history = yield* sessions.messages({ sessionID })
    const named = yield* title({ mode: "manual", session, history })
    return { session: yield* sessions.get(sessionID), model: named?.model }
  }, Effect.orDie)

  const startTitle = Effect.fn("SessionPrompt.startTitle")(function* (input: {
    sessionID: SessionID
    history: SessionV1.WithParts[]
    providerID: ProviderV2.ID
    modelID: ModelV2.ID
  }) {
    const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
    if (session.parentID) return
    const users = input.history.filter(isRealUserMessage)
    const marker = session.metadata?.ocAutoRename
    if (marker === undefined) {
      if (users.length !== 1 || !Session.isDefaultTitle(session.title)) return
    } else {
      const automatic = decodeAutoRename(marker)
      if (Option.isNone(automatic) || automatic.value.state !== "pending") return
      if (users.length === 0) return

      // Claim inside the owning loop, before forking, so reconnects cannot repeat naming.
      yield* sessions.setMetadata({
        sessionID: session.id,
        metadata: { ...session.metadata, ocAutoRename: { ...automatic.value, state: "attempted" } },
      })
      if (users.length !== 1) return
      if (
        automatic.value.title === undefined
          ? !Session.isDefaultTitle(session.title)
          : session.title !== automatic.value.title
      )
        return
    }

    const history = structuredClone(input.history.slice(0, input.history.indexOf(users[0]) + 1))
    const titled =
      marker === undefined
        ? title({ mode: "stock", session, history, providerID: input.providerID, modelID: input.modelID })
        : title({ mode: "marked", session, history })
    // Same project gate as SessionPrompt's `gated`.
    yield* InstanceState.context.pipe(
      Effect.flatMap((ctx) => work.run(ctx.directory, titled)),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("automatic title failed", { sessionID: session.id, error: Cause.squash(cause) }),
      ),
      Effect.forkIn(scope),
    )
  })

  return { rename, startTitle }
}

// New sessions start with a synthetic "Working directory initialized" message; it is not a request.
export function isRealUserMessage(message: SessionV1.WithParts) {
  return message.info.role === "user" && !message.parts.every((part) => "synthetic" in part && part.synthetic)
}

// Stock titles model the whole first request. A subtask-only request sends its prompts instead.
const titleConversation = Effect.fnUntraced(function* (
  first: SessionV1.WithParts,
  context: SessionV1.WithParts[],
  model: Provider.Model,
) {
  const subtasks = first.parts.filter((p): p is SessionV1.SubtaskPart => p.type === "subtask")
  if (subtasks.length > 0 && first.parts.every((p) => p.type === "subtask")) {
    return [{ role: "user" as const, content: subtasks.map((p) => withoutCommandHeader(p.prompt)).join("\n") }]
  }
  return yield* MessageV2.toModelMessagesEffect(
    context.map((message) => ({
      ...message,
      parts: message.parts.map((part) =>
        message.info.role === "user" && part.type === "text" ? { ...part, text: namingText(part) } : part,
      ),
    })),
    model,
  )
})

function cleanTitle(text: string) {
  const line = text
    .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!line) return
  return line.length > 100 ? line.substring(0, 97) + "..." : line
}

// First user message plus the latest exchanges, text only, so the model sees where the session started and where it is now.
export function renameDigest(history: SessionV1.WithParts[]) {
  const lines = history.flatMap((m) => {
    const text = m.parts
      .filter((p): p is SessionV1.TextPart => p.type === "text" && !p.synthetic)
      .map((p) => (m.info.role === "user" ? namingText(p) : p.text).trim())
      .join("\n")
      .slice(0, 1500)
    return text ? [`${m.info.role}: ${text}`] : []
  })
  const first = lines.find((l) => l.startsWith("user: "))
  const recent = lines.slice(-6)
  return (first && !recent.includes(first) ? [first, "...", ...recent] : recent).join("\n\n")
}

function namingText(part: SessionV1.TextPart | SessionV1.TextPartInput) {
  // Argument-free commands can themselves describe a concrete task, such as reviewing a diff.
  const request = part.metadata?.ocCommandArguments
  if (typeof request === "string" && request.trim()) return request
  return withoutCommandHeader(part.text)
}

// `SessionPrompt.command` prepends an active-command header (one command) or `Command.COMPOSED_PREAMBLE`
// (several), each followed by a blank line; titles use the text after it.
function withoutCommandHeader(text: string) {
  const preamble = `${Command.COMPOSED_PREAMBLE}\n\n`
  if (text.startsWith(preamble)) return text.slice(preamble.length)
  return text.replace(/^\[[^\n]* is active:[^\n]*\]\n\n/, "")
}
