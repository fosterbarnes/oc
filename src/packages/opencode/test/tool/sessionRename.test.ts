import { describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Cause, Effect, Exit } from "effect"
import { Session } from "@/session/session"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { MessageID, SessionID } from "../../src/session/schema"
import { SessionRenameTool } from "../../src/tool/sessionRename"
import { testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(LayerNode.group([Session.node, SessionProjector.node, Database.node, Truncate.node, Agent.node])),
)

const context = (sessionID: SessionID) => ({
  sessionID,
  messageID: MessageID.ascending(),
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
})

describe("tool.session_rename", () => {
  it.instance("renames the current session through setTitle", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({})
      const def = yield* (yield* SessionRenameTool).init()

      const result = yield* def.execute({ title: "  oc - rename tool  " }, context(chat.id))

      expect(result.output).toBe(`Renamed session ${chat.id} to oc - rename tool.`)
      expect((yield* sessions.get(chat.id)).title).toBe("oc - rename tool")
    }),
  )

  it.instance("renames another session by id and rejects empty titles", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({})
      const other = yield* sessions.create({})
      const def = yield* (yield* SessionRenameTool).init()

      yield* def.execute({ sessionID: other.id, title: "other" }, context(chat.id))
      expect((yield* sessions.get(other.id)).title).toBe("other")

      const exit = yield* def.execute({ title: "   " }, context(chat.id)).pipe(Effect.exit)
      expect(Exit.isFailure(exit) && String(Cause.squash(exit.cause))).toContain("must not be empty")
    }),
  )
})
