import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Session as SessionNs } from "@/session/session"
import { SessionHandoff } from "@/session/handoff"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceStore } from "@/project/instance-store"
import { InstanceBootstrap } from "@/project/bootstrap"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { testEffect } from "../lib/effect"
import { MessageID } from "@/session/schema"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      SessionNs.node,
      SessionHandoff.node,
      EventV2Bridge.node,
      SessionProjector.node,
      CrossSpawnSpawner.node,
      InstanceStore.node,
    ]),
    [
      [RuntimeFlags.node, RuntimeFlags.layer({ experimentalWorkspaces: false })],
      [
        InstanceBootstrap.node,
        Layer.succeed(InstanceBootstrap.Service, InstanceBootstrap.Service.of({ run: Effect.void })),
      ],
    ],
  ),
)

describe("session handoff", () => {
  it.instance("enqueue writes a synthetic handoff user message", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const handoff = yield* SessionHandoff.Service
      const info = yield* session.create({ title: "root" })
      yield* handoff.enqueue({
        sessionID: info.id,
        agent: "build",
        model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
      })
      const messages = yield* session.messages({ sessionID: info.id })
      expect(messages).toHaveLength(1)
      expect(SessionHandoff.isHandoffMessage(messages[0]!)).toBe(true)
      expect(messages[0]!.info.role).toBe("user")
      // Deny-all: the summary turn must not mutate anything. It still reaches
      // the model because title detection keys on the agent and the turn keeps
      // the parent CLI conversation (see provider/claude-code/title.test.ts).
      expect(JSON.stringify((messages[0]!.info as SessionV1.User).permission)).toBe(
        JSON.stringify([{ permission: "*", pattern: "*", action: "deny" }]),
      )
      yield* session.remove(info.id)
    }),
  )

  it.instance("finish creates a linked child with the summary as first message", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const handoff = yield* SessionHandoff.Service
      const origin = yield* session.create({ title: "root work", agent: "build" })
      const lastUser = {
        id: MessageID.ascending(),
        role: "user" as const,
        sessionID: origin.id,
        time: { created: Date.now() },
        agent: "build",
        model: { providerID: "test", modelID: "test-model" },
      } as SessionV1.User
      const child = yield* handoff.finish({
        fromID: origin.id,
        summary: "Goal: ship it\nNext step: keep going",
        lastUser,
        origin,
      })
      expect(child).toBeTruthy()
      expect(child!.parentID).toBe(origin.id)
      expect(child!.metadata?.[SessionHandoff.HANDOFF_FROM]).toBe(origin.id)
      expect(child!.agent).toBe("build")
      const messages = yield* session.messages({ sessionID: child!.id })
      expect(messages[0]!.info.role).toBe("user")
      expect(JSON.stringify(messages[0]!.parts)).toContain("Goal: ship it")
      expect(JSON.stringify(messages[0]!.parts)).toContain("Resume the next step from this handoff")
      expect(SessionHandoff.canAutoHandoff({ session: child!, messages })).toBe(false)
      yield* session.remove(child!.id)
      yield* session.remove(origin.id)
    }),
  )

  it.instance("finish preserves the original turn permission on the child kickoff", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const handoff = yield* SessionHandoff.Service
      const origin = yield* session.create({ title: "root work", agent: "build" })
      const lastUser = {
        id: MessageID.ascending(),
        role: "user" as const,
        sessionID: origin.id,
        time: { created: Date.now() },
        agent: "build",
        model: { providerID: "test", modelID: "test-model" },
      } as SessionV1.User
      const permission = [{ permission: "*", pattern: "*", action: "allow" }] as unknown as SessionV1.User["permission"]
      const child = yield* handoff.finish({
        fromID: origin.id,
        summary: "Goal: ship it\nNext step: keep going",
        lastUser,
        origin,
        permission,
      })
      expect(child!.permission).toEqual(origin.permission)
      const messages = yield* session.messages({ sessionID: child!.id })
      expect(messages[0]!.info.role).toBe("user")
      expect((messages[0]!.info as SessionV1.User).permission).toEqual(permission)
      yield* session.remove(child!.id)
      yield* session.remove(origin.id)
    }),
  )

  it.instance("handoff child blocks auto-handoff until two non-summary assistant turns", () =>
    Effect.gen(function* () {
      const session = yield* SessionNs.Service
      const handoff = yield* SessionHandoff.Service
      const origin = yield* session.create({ title: "root work", agent: "build" })
      const lastUser = {
        id: MessageID.ascending(),
        role: "user" as const,
        sessionID: origin.id,
        time: { created: Date.now() },
        agent: "build",
        model: { providerID: "test", modelID: "test-model" },
      } as SessionV1.User
      const child = yield* handoff.finish({
        fromID: origin.id,
        summary: "Goal: ship it\nNext step: keep going",
        lastUser,
        origin,
      })
      const kickoff = (yield* session.messages({ sessionID: child!.id }))[0]!
      const assistant = (id: string, summary?: boolean) =>
        ({
          info: { id, role: "assistant", ...(summary ? { summary: true } : {}) },
          parts: [],
        }) as unknown as SessionV1.WithParts
      expect(SessionHandoff.canAutoHandoff({ session: child!, messages: [kickoff] })).toBe(false)
      expect(SessionHandoff.canAutoHandoff({ session: child!, messages: [kickoff, assistant("a1")] })).toBe(false)
      expect(
        SessionHandoff.canAutoHandoff({ session: child!, messages: [kickoff, assistant("a1"), assistant("a2")] }),
      ).toBe(true)
      expect(
        SessionHandoff.canAutoHandoff({
          session: child!,
          messages: [kickoff, assistant("a1"), assistant("a2", true)],
        }),
      ).toBe(false)
      expect(SessionHandoff.canAutoHandoff({ session: origin, messages: [] })).toBe(true)
      yield* session.remove(child!.id)
      yield* session.remove(origin.id)
    }),
  )
})
