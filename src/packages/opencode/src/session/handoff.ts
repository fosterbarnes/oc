import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { serviceUse } from "@opencode-ai/core/effect/service-use"
import { Global } from "@opencode-ai/core/global"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TuiEvent } from "@/server/tui-event"
import { Session } from "./session"
import { MessageID, PartID, SessionID } from "./schema"
import { Context, Effect, Layer } from "effect"
import path from "path"

export const HANDOFF_PROMPT = `Write a handoff for a new session continuing this work.
Cover, in plain text:
- Goal
- Decisions made
- Files touched
- Open work
- Next step
Do not call tools. Do not ask questions.`

export const HANDOFF_FROM = "ocHandoffFrom"
const HANDOFF_MARK = "ocHandoff"

export function isHandoffMessage(message: SessionV1.WithParts) {
  return message.parts.some((part) => part.type === "text" && part.metadata?.[HANDOFF_MARK] === true)
}

export function assistantText(message: SessionV1.WithParts) {
  const text = message.parts
    .filter((part): part is SessionV1.TextPart => part.type === "text" && !part.ignored)
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n")
  return text || undefined
}

export function canAutoHandoff(input: { session: Session.Info; messages: SessionV1.WithParts[] }) {
  // Subagents never hand off; ordinary sessions always may.
  if (!input.session.metadata?.[HANDOFF_FROM]) return !input.session.parentID
  // Handoff session: require real progress beyond the kickoff exchange, so a summary
  // alone near the limit cannot loop. Exclude synthetic/handoff prompts and summary
  // assistants; autonomous chains (no human follow-up) qualify once the session has
  // done real work: at least two non-summary assistant turns past the kickoff.
  const assistants = input.messages.filter(
    (message) =>
      message.info.role === "assistant" &&
      (message.info as SessionV1.Assistant).summary !== true &&
      !(message.info as SessionV1.Assistant).error,
  )
  return assistants.length >= 2
}

export interface Interface {
  readonly enqueue: (input: {
    sessionID: SessionID
    agent: string
    model: { providerID: ProviderV2.ID; modelID: ModelV2.ID; variant?: string }
  }) => Effect.Effect<void>
  readonly finish: (input: {
    fromID: SessionID
    summary: string
    lastUser: SessionV1.User
    origin: Session.Info
    permission?: PermissionV1.Ruleset
  }) => Effect.Effect<Session.Info | undefined>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionHandoff") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const session = yield* Session.Service
    const events = yield* EventV2Bridge.Service

    const enqueue = Effect.fn("SessionHandoff.enqueue")(function* (input: {
      sessionID: SessionID
      agent: string
      model: { providerID: ProviderV2.ID; modelID: ModelV2.ID; variant?: string }
    }) {
      const msg = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        permission: [{ permission: "*", pattern: "*", action: "deny" }],
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "text",
        synthetic: true,
        text: HANDOFF_PROMPT,
        metadata: { [HANDOFF_MARK]: true },
        time: { start: Date.now(), end: Date.now() },
      })
    })

    const finish = Effect.fn("SessionHandoff.finish")(function* (input: {
      fromID: SessionID
      summary: string
      lastUser: SessionV1.User
      origin: Session.Info
      permission?: PermissionV1.Ruleset
    }) {
      const text = input.summary.trim()
      if (!text) return
      // Top-level, not a child: a parentID would make the TUI treat it as a subagent (no prompt
      // input, hidden from the session list). The link back lives in HANDOFF_FROM metadata.
      const child = yield* session.create({
        title: handoffTitle(input.origin.title),
        agent: input.lastUser.agent,
        model: {
          id: input.lastUser.model.modelID,
          providerID: input.lastUser.model.providerID,
          ...(input.lastUser.model.variant ? { variant: input.lastUser.model.variant } : {}),
        },
        permission: input.origin.permission,
        metadata: { [HANDOFF_FROM]: input.fromID },
      })
      // The in-progress mark moves with the work.
      yield* session.setSessionInProgress({ sessionID: input.fromID, sessionInProgress: false })
      yield* session.setSessionInProgress({ sessionID: child.id, sessionInProgress: true })
      const body = `${text}\n\nResume the next step from this handoff.`
      // Preserve the original command-turn permission for the child kickoff. The
      // summary turn itself runs deny-all, so lastUser here carries deny-all, not
      // the turn restrictions the user started with.
      const childPermission = input.permission ?? input.origin.permission
      const msg = yield* session.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: child.id,
        agent: input.lastUser.agent,
        model: input.lastUser.model,
        permission: childPermission ? childPermission.map((rule) => ({ ...rule })) : undefined,
        time: { created: Date.now() },
      })
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: msg.id,
        sessionID: child.id,
        type: "text",
        text: body,
        time: { start: Date.now(), end: Date.now() },
      })
      const file = path.join(Global.Path.data, "handoff", `${input.fromID}-${child.id}.md`)
      yield* Effect.promise(async () => {
        await Bun.write(file, `# Handoff\n\nFrom: ${input.fromID}\nTo: ${child.id}\n\n${text}\n`)
      })
      // The caller kicks off the child loop: importing SessionPrompt here would
      // cycle the layers (prompt already depends on this service).
      yield* events.publish(TuiEvent.SessionSelect, { sessionID: child.id })
      return child
    })

    return Service.of({ enqueue, finish })
  }),
)

function handoffTitle(title: string) {
  const prefix = "Handoff: "
  const base = title.startsWith(prefix) ? title.slice(prefix.length) : title
  const body = base.length > 80 ? `${base.slice(0, 77)}...` : base
  return prefix + body
}

export const node = LayerNode.make({
  service: Service,
  layer,
  deps: [Session.node, EventV2Bridge.node],
})

export * as SessionHandoff from "./handoff"
