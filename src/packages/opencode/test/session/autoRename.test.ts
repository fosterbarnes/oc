import { expect } from "bun:test"
import path from "path"
import { Effect, Fiber } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { EventV2Bridge } from "@/event-v2-bridge"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { awaitWithTimeout, pollWithTimeout, testEffect } from "../lib/effect"
import { httpError, reply, TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const llmNode = LayerNode.make({ service: TestLLMServer, layer: TestLLMServer.layer, deps: [] })
const it = testEffect(
  LayerNode.compile(
    LayerNode.group([SessionPrompt.node, Session.node, SessionProjector.node, EventV2Bridge.node, llmNode]),
    [[RuntimeFlags.node, RuntimeFlags.layer({ experimentalEventSystem: true })]],
  ),
)
const naming = (hit: { body: Record<string, unknown> }) => hit.body.model === "rename-model"
const conversation = (hit: { body: Record<string, unknown> }) => hit.body.model === "test-model"

const setup = Effect.fnUntraced(function* () {
  const instance = yield* TestInstance
  const llm = yield* TestLLMServer
  const config = testProviderConfig(llm.url)
  yield* Effect.promise(() =>
    Bun.write(
      path.join(instance.directory, "opencode.json"),
      JSON.stringify({
        ...config,
        enabled_providers: ["test"],
        model: "test/test-model",
        snapshot: false,
        shell: process.platform === "win32" ? "pwsh" : "/bin/sh",
        agent: { rename: { model: "test/rename-model" } },
        command: {
          check: { template: "Inspect $ARGUMENTS" },
          spit: { template: "Spitballing instructions. ".repeat(100) + "$ARGUMENTS" },
          think: { template: "Thinking instructions. ".repeat(100) },
        },
        provider: {
          test: {
            ...config.provider.test,
            models: {
              ...config.provider.test.models,
              "rename-model": { ...config.provider.test.models["test-model"], id: "rename-model", name: "Rename" },
            },
          },
        },
      }),
    ),
  )
  const sessions = yield* Session.Service
  const prompt = yield* SessionPrompt.Service
  return { llm, sessions, prompt, directory: instance.directory }
})

it.instance(
  "oc automatic rename overlaps the reply and runs once after initialization and shell input",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const session = yield* fixture.sessions.create({
        title: "project3",
        metadata: { keep: "value", ocAutoRename: { state: "pending", title: "project3" } },
      })
      yield* fixture.prompt.prompt({
        sessionID: session.id,
        model: ref,
        noReply: true,
        parts: [{ type: "text", synthetic: true, text: `Working directory initialized: ${fixture.directory}` }],
      })
      yield* fixture.prompt.shell({ sessionID: session.id, model: ref, agent: "build", command: "echo shell-only" })
      expect(yield* fixture.llm.calls).toBe(0)
      expect((yield* fixture.sessions.get(session.id)).metadata?.ocAutoRename.state).toBe("pending")

      const release = Promise.withResolvers<void>()
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      const generated = `${path.basename(fixture.directory)} - first task`
      yield* fixture.llm.pushMatch(naming, reply().wait(release.promise).text(generated).stop())
      yield* fixture.llm.textMatch(conversation, "first reply")
      const events = yield* EventV2Bridge.Service
      const renamed = Promise.withResolvers<void>()
      const off = yield* events.listen((event) => {
        if (
          event.type === Session.Event.Updated.type &&
          event.durable?.aggregateID === session.id &&
          JSON.stringify(event.data).includes(generated)
        )
          renamed.resolve()
        return Effect.void
      })
      yield* Effect.addFinalizer(() => off)
      const turn = yield* fixture.prompt
        .prompt({
          sessionID: session.id,
          model: ref,
          parts: [{ type: "text", text: "Fix the first task" }],
        })
        .pipe(Effect.forkChild)
      yield* awaitWithTimeout(fixture.llm.wait(2), "naming and conversation did not both start", "10 seconds")
      const first = yield* awaitWithTimeout(Fiber.join(turn), "reply waited for rename", "10 seconds")
      expect(first.parts).toContainEqual(expect.objectContaining({ type: "text", text: "first reply" }))
      expect((yield* fixture.sessions.get(session.id)).title).toBe("project3")
      expect((yield* fixture.sessions.get(session.id)).metadata).toEqual({
        keep: "value",
        ocAutoRename: { state: "attempted", title: "project3" },
      })

      yield* fixture.llm.textMatch(conversation, "second reply")
      yield* fixture.prompt.prompt({
        sessionID: session.id,
        model: ref,
        parts: [{ type: "text", text: "A different second task" }],
      })
      yield* fixture.prompt.loop({ sessionID: session.id })
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(1)
      const request = JSON.stringify((yield* fixture.llm.hits).find(naming)?.body.messages)
      expect(request).toContain(`folder name \\"${path.basename(fixture.directory)}\\"`)
      expect(request).toContain("Fix the first task")
      expect(request).not.toContain("Working directory initialized")
      expect(request).not.toContain("first reply")
      expect(request).not.toContain("second task")

      release.resolve()
      yield* awaitWithTimeout(
        Effect.promise(() => renamed.promise),
        "rename did not publish a session update",
        "10 seconds",
      )
      expect((yield* fixture.sessions.get(session.id)).title).toBe(generated)
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(1)
    }),
  { git: true },
  30_000,
)

it.instance(
  "oc automatic rename keeps a title edited while the model is running; manual rename still works",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const session = yield* fixture.sessions.create({ metadata: { ocAutoRename: { state: "pending" } } })
      const release = Promise.withResolvers<void>()
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      yield* fixture.llm.pushMatch(naming, reply().wait(release.promise).text("project - generated").stop())
      yield* fixture.llm.textMatch(conversation, "reply")
      yield* fixture.prompt.prompt({ sessionID: session.id, model: ref, parts: [{ type: "text", text: "first task" }] })
      yield* awaitWithTimeout(fixture.llm.wait(2), "rename request did not start", "10 seconds")
      yield* fixture.sessions.setTitle({ sessionID: session.id, title: "My title" })
      release.resolve()
      // A manual request is unconditional even after the automatic attempt was consumed.
      yield* fixture.llm.textMatch(naming, "project - explicit rename")
      const result = yield* fixture.prompt.rename(session.id)
      expect(result.model).toBe("test/rename-model")
      expect(result.session.title).toBe("project - explicit rename")
      yield* fixture.llm.textMatch(conversation, "another reply")
      yield* fixture.prompt.prompt({
        sessionID: session.id,
        model: ref,
        parts: [{ type: "text", text: "another task" }],
      })
      expect((yield* fixture.sessions.get(session.id)).title).toBe("project - explicit rename")
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(2)
    }),
  { git: true },
  30_000,
)

for (const scenario of ["manual title", "child", "invalid marker", "unmarked"] as const) {
  it.instance(
    `oc automatic rename skips ${scenario}`,
    () =>
      Effect.gen(function* () {
        const fixture = yield* setup()
        const parent = scenario === "child" ? yield* fixture.sessions.create({ title: "parent" }) : undefined
        const session = yield* fixture.sessions.create({
          parentID: parent?.id,
          title: scenario === "manual title" ? "My title" : "project1",
          metadata:
            scenario === "unmarked"
              ? undefined
              : {
                  ocAutoRename:
                    scenario === "invalid marker"
                      ? { state: "pending", title: 123 }
                      : { state: "pending", title: "project1" },
                },
        })
        yield* fixture.llm.textMatch(conversation, "reply")
        yield* fixture.prompt.prompt({
          sessionID: session.id,
          model: ref,
          parts: [{ type: "text", text: "first task" }],
        })
        expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(0)
        expect((yield* fixture.sessions.get(session.id)).title).toBe(session.title)
        if (scenario === "manual title")
          expect((yield* fixture.sessions.get(session.id)).metadata?.ocAutoRename.state).toBe("attempted")
      }),
    { git: true },
    30_000,
  )
}

it.instance(
  "oc automatic rename names a Home session's first command and drops the marker on forks",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const session = yield* fixture.sessions.create({
        metadata: { keep: "value", ocAutoRename: { state: "pending" }, ocAutoDelete: true },
      })
      const fork = yield* fixture.sessions.fork({ sessionID: session.id })
      expect(fork.metadata).toEqual({ keep: "value" })
      expect((yield* fixture.sessions.get(session.id)).metadata?.ocAutoRename.state).toBe("pending")
      yield* fixture.llm.textMatch(naming, "project - command task")
      yield* fixture.llm.textMatch(conversation, "command reply")
      yield* fixture.prompt.command({
        sessionID: session.id,
        model: "test/test-model",
        command: "check",
        arguments: "the cache",
      })
      yield* pollWithTimeout(
        fixture.sessions
          .get(session.id)
          .pipe(Effect.map((current) => (current.title === "project - command task" ? current : undefined))),
        "Home session was not renamed",
      )
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(1)
      const request = JSON.stringify((yield* fixture.llm.hits).find(naming)?.body.messages)
      expect(request).toContain("user: the cache")
      expect(request).not.toContain("Inspect the cache")
      const saved = (yield* fixture.sessions.messages({ sessionID: session.id })).find(
        (message) => message.info.role === "user",
      )
      expect(saved?.parts).toContainEqual(
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Inspect the cache"),
          metadata: { ocCommandArguments: "the cache" },
        }),
      )
      yield* fixture.llm.textMatch(conversation, "fork reply")
      yield* fixture.prompt.prompt({ sessionID: fork.id, model: ref, parts: [{ type: "text", text: "fork task" }] })
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(1)
    }),
  { git: true },
  30_000,
)

it.instance(
  "oc automatic rename failure keeps the placeholder and never retries on later prompts",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const session = yield* fixture.sessions.create({
        title: "project2",
        metadata: {
          ocAutoRename: { state: "pending", title: "project2" },
        },
      })
      yield* fixture.llm.pushMatch(naming, httpError(400, { error: { message: "Rename unavailable" } }))
      yield* fixture.llm.textMatch(conversation, "reply despite naming failure")
      const first = yield* fixture.prompt.prompt({
        sessionID: session.id,
        model: ref,
        parts: [{ type: "text", text: "first" }],
      })
      expect(first.info.role === "assistant" && first.info.error).toBeFalsy()
      yield* awaitWithTimeout(fixture.llm.wait(2), "rename failure request did not start", "10 seconds")
      yield* fixture.llm.textMatch(conversation, "second reply")
      yield* fixture.prompt.prompt({ sessionID: session.id, model: ref, parts: [{ type: "text", text: "second" }] })
      const current = yield* fixture.sessions.get(session.id)
      expect(current.title).toBe("project2")
      expect(current.metadata?.ocAutoRename.state).toBe("attempted")
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(1)
    }),
  { git: true },
  30_000,
)

it.instance(
  "native titles and manual rename use the request behind long composed commands",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const session = yield* fixture.sessions.create()
      yield* fixture.llm.textMatch(conversation, "Require approval at the plan execution boundary.")
      yield* fixture.prompt.command({
        sessionID: session.id,
        model: "test/test-model",
        command: "spit",
        additionalCommands: ["think"],
        arguments: "Require approval before plan execution",
      })
      yield* pollWithTimeout(
        fixture.sessions
          .get(session.id)
          .pipe(Effect.map((current) => (current.title === "E2E Title" ? current : undefined))),
        "native title was not generated",
      )
      const native = (yield* fixture.llm.hits).find((hit) =>
        JSON.stringify(hit.body.messages).includes("Generate a title for this conversation"),
      )
      expect(native).toBeDefined()
      expect(JSON.stringify(native?.body.messages)).toContain("Require approval before plan execution")
      expect(JSON.stringify(native?.body.messages)).not.toContain("Spitballing instructions.")
      expect(JSON.stringify(native?.body.messages)).not.toContain("Thinking instructions.")

      yield* fixture.llm.textMatch(naming, "project - Approval before plan execution")
      const renamed = yield* fixture.prompt.rename(session.id)
      expect(renamed.session.title).toBe("project - Approval before plan execution")
      const request = JSON.stringify((yield* fixture.llm.hits).find(naming)?.body.messages)
      expect(request).toContain("user: Require approval before plan execution")
      expect(request).toContain("Require approval at the plan execution boundary.")
      expect(request).toContain("Name the concrete feature, problem, or decision")
      expect(request).not.toContain("Spitballing instructions.")
      expect(request).not.toContain("Thinking instructions.")
    }),
  { git: true },
  30_000,
)

it.instance(
  "unmarked default sessions keep native title generation",
  () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const session = yield* fixture.sessions.create()
      yield* fixture.llm.textMatch(conversation, "reply")
      yield* fixture.prompt.prompt({ sessionID: session.id, model: ref, parts: [{ type: "text", text: "first task" }] })
      yield* pollWithTimeout(
        fixture.sessions
          .get(session.id)
          .pipe(Effect.map((current) => (current.title === "E2E Title" ? current : undefined))),
        "native title was not generated",
      )
      expect((yield* fixture.llm.hits).filter(naming)).toHaveLength(0)
      const titles = (yield* fixture.llm.hits).filter((hit) =>
        JSON.stringify(hit.body.messages).includes("Generate a title for this conversation"),
      )
      expect(titles).toHaveLength(1)
    }),
  { git: true },
  30_000,
)
