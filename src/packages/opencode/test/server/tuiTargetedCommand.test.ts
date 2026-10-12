import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Layer } from "effect"
import { Session } from "@/session/session"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { httpApiLayer, requestInDirectory } from "./httpapi-layer"

const it = testEffect(Layer.mergeAll(LayerNode.compile(Session.node), httpApiLayer))

const crowHandle = "11111111-1111-4111-8111-111111111111"

function targetedBody(input: { command: string; crowSessionHandle?: string; expectedOpenCodeSessionID?: string }) {
  return JSON.stringify({
    command: input.command,
    crowSessionHandle: input.crowSessionHandle ?? crowHandle,
    expectedOpenCodeSessionID: input.expectedOpenCodeSessionID,
  })
}

describe("tui.executeTargetedCommand endpoint", () => {
  it.instance(
    "accepts a remotely allowed command for an existing session",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const session = yield* Session.use.create({})

        const response = yield* requestInDirectory("/tui/execute-targeted-command", tmp.directory, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: targetedBody({ command: "session.list", expectedOpenCodeSessionID: session.id }),
        })

        expect(response.status).toBe(200)
        expect(yield* response.json).toBe(true)
      }),
    { git: true },
  )

  it.instance(
    "rejects unknown commands",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const session = yield* Session.use.create({})

        const response = yield* requestInDirectory("/tui/execute-targeted-command", tmp.directory, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: targetedBody({ command: "prompt.submit", expectedOpenCodeSessionID: session.id }),
        })

        expect(response.status).toBe(400)
      }),
    { git: true },
  )

  it.instance(
    "rejects malformed Crow session handles",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance
        const session = yield* Session.use.create({})

        const response = yield* requestInDirectory("/tui/execute-targeted-command", tmp.directory, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: targetedBody({
            command: "session.list",
            crowSessionHandle: "not-a-crow-handle",
            expectedOpenCodeSessionID: session.id,
          }),
        })

        expect(response.status).toBe(400)
      }),
    { git: true },
  )

  it.instance(
    "rejects malformed OpenCode session IDs",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance

        const response = yield* requestInDirectory("/tui/execute-targeted-command", tmp.directory, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: targetedBody({
            command: "session.list",
            expectedOpenCodeSessionID: "invalid_session_id",
          }),
        })

        expect(response.status).toBe(400)
      }),
    { git: true },
  )

  it.instance(
    "returns 404 when the expected OpenCode session does not exist",
    () =>
      Effect.gen(function* () {
        const tmp = yield* TestInstance

        const response = yield* requestInDirectory("/tui/execute-targeted-command", tmp.directory, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: targetedBody({
            command: "agent.cycle",
            expectedOpenCodeSessionID: "ses_nonexistent123",
          }),
        })

        expect(response.status).toBe(404)
      }),
    { git: true },
  )
})
