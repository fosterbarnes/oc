import { describe, expect } from "bun:test"
import fs from "fs"
import path from "path"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Database } from "@opencode-ai/core/database/database"
import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { EventV2Bridge } from "@/event-v2-bridge"
import { MessageID, SessionID } from "@/session/schema"
import { SessionStatus } from "@/session/status"
import { RunAfterTurnTool } from "@/tool/run-after-turn"
import { Truncate } from "@/tool/truncate"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Agent.node, Config.node, Database.node, EventV2Bridge.node, SessionStatus.node, Truncate.node]),
  ),
)

describe("run_after_turn", () => {
  it.instance("asks permission, then spawns only after its own session goes idle", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const status = yield* SessionStatus.Service
      const tool = yield* RunAfterTurnTool
      const def = yield* tool.init()
      const marker = path.join(test.directory, "ran.txt")
      const sessionID = SessionID.descending("ses_run_after_turn")
      const asked: string[] = []

      yield* def.execute(
        // Bun, not pwsh: a detached pwsh has no console on Windows and exits without running
        { exe: process.execPath, args: ["-e", `require("fs").writeFileSync(${JSON.stringify(marker)}, "ok")`] },
        {
          sessionID,
          messageID: MessageID.ascending(),
          agent: "build",
          abort: new AbortController().signal,
          messages: [],
          metadata: () => Effect.void,
          ask: (input) => Effect.sync(() => void asked.push(input.permission)),
        },
      )
      expect(asked).toEqual(["run_after_turn"])

      yield* status.set(SessionID.descending("ses_other"), { type: "idle" })
      yield* status.set(sessionID, { type: "busy" })
      expect(fs.existsSync(marker)).toBe(false)

      yield* status.set(sessionID, { type: "idle" })
      yield* pollWithTimeout(
        Effect.sync(() => (fs.existsSync(marker) ? true : undefined)),
        "queued exe never ran",
        "15 seconds",
      )
    }),
    30_000,
  )

  it.instance("a missing exe does not crash the process", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const status = yield* SessionStatus.Service
      const tool = yield* RunAfterTurnTool
      const def = yield* tool.init()
      const sessionID = SessionID.descending("ses_run_after_turn_missing")

      yield* def.execute(
        { exe: path.join(test.directory, "missing.exe") },
        {
          sessionID,
          messageID: MessageID.ascending(),
          agent: "build",
          abort: new AbortController().signal,
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )
      yield* status.set(sessionID, { type: "idle" })
      // Give the async spawn error a chance to surface as an unhandled event
      yield* Effect.promise(() => Bun.sleep(500))
    }),
  )
})
