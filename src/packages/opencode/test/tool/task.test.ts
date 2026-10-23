import { afterEach, describe, expect } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Cause, Deferred, Effect, Exit, Fiber, Layer } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Git } from "@/git"
import { Session } from "@/session/session"
import type { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Skill } from "@/skill"

import { TaskTool, type TaskPromptOps } from "../../src/tool/task"
import { TaskCancelTool } from "../../src/tool/taskCancel"
import { Truncate } from "@/tool/truncate"
import { ToolRegistry } from "@/tool/registry"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { disposeAllInstances } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Permission } from "../../src/permission"
import { Provider } from "../../src/provider/provider"
import { agentPushTitle, AUTO_DELETE_KEY, PUSH_SESSION_KEY, SessionCompleteTool } from "../../src/tool/sessionComplete"
import { SessionFailedTool } from "../../src/tool/sessionFailed"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

// A `test` provider with one enabled variant, one disabled variant, and a model ID containing a slash.
const modelConfig = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100_000, output: 10_000 },
          cost: { input: 0, output: 0 },
          variants: { high: {}, low: { disabled: true } },
        },
        "vendor/model": {
          id: "vendor/model",
          name: "Vendor Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100_000, output: 10_000 },
          cost: { input: 0, output: 0 },
        },
      },
      options: { apiKey: "test-key", baseURL: "http://127.0.0.1:9" },
    },
  },
}

const layer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([
      Agent.node,
      BackgroundJob.node,
      EventV2Bridge.node,
      Config.node,
      CrossSpawnSpawner.node,
      Git.node,
      Permission.node,
      Provider.node,
      Session.node,
      SessionProjector.node,
      SessionRunState.node,
      SessionStatus.node,
      Skill.node,
      Truncate.node,
      ToolRegistry.node,
      Database.node,
      RuntimeFlags.node,
      Ripgrep.node,
    ]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(layer())

function defer<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const seed = Effect.fn("TaskToolTest.seed")(function* (title = "Pinned") {
  const session = yield* Session.Service
  const chat = yield* session.create({ title })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    variant: "xhigh",
    time: { created: Date.now() },
  }
  yield* session.updateMessage(assistant)
  return { chat, assistant }
})

// Notice and live-output ops. reply() echoes the prompt's messageID, so a notice never reaches loop here.
const unusedNoticeOps = {
  loop: () => Effect.die("loop not stubbed"),
  available: () => Effect.void,
  cancellation: () => Effect.succeed(0),
  partMetadata: () => Effect.void,
}

function stubOps(opts?: {
  onPrompt?: (input: SessionPrompt.TurnInput) => void
  text?: string
  error?: NonNullable<SessionV1.Assistant["error"]>
  toolError?: string
}): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        opts?.onPrompt?.(input)
        return reply(input, opts?.text ?? "done", opts?.error, opts?.toolError)
      }),
    ...unusedNoticeOps,
  }
}

function reply(
  input: SessionPrompt.PromptInput,
  text: string,
  error?: NonNullable<SessionV1.Assistant["error"]>,
  toolError?: string,
): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "assistant",
      parentID: input.messageID ?? MessageID.ascending(),
      sessionID: input.sessionID,
      mode: input.agent ?? "general",
      agent: input.agent ?? "general",
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: input.model?.modelID ?? ref.modelID,
      providerID: input.model?.providerID ?? ref.providerID,
      time: { created: Date.now() },
      finish: "stop",
      error,
    },
    parts: [
      {
        id: PartID.ascending(),
        messageID: id,
        sessionID: input.sessionID,
        type: "text",
        text,
      },
      ...(toolError
        ? [
            {
              id: PartID.ascending(),
              messageID: id,
              sessionID: input.sessionID,
              type: "tool" as const,
              tool: "read",
              callID: "call-1",
              state: {
                status: "error" as const,
                input: { filePath: "/external" },
                error: toolError,
                time: { start: Date.now(), end: Date.now() },
              },
            },
          ]
        : []),
    ],
  }
}

describe("tool.task", () => {
  for (const action of ["approve", "reject", "already complete"] as const) {
    it.instance(
      `session marking: completion ${action}`,
      () =>
        Effect.gen(function* () {
          const sessions = yield* Session.Service
          const { chat, assistant } = yield* seed()
          yield* sessions.setSessionInProgress({ sessionID: chat.id, sessionInProgress: true })
          if (action === "already complete") {
            yield* sessions.setSessionComplete({ sessionID: chat.id, sessionComplete: true })
          }
          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const permission = yield* Permission.Service
          const tool = yield* SessionCompleteTool
          const def = yield* tool.init()
          const fiber = yield* def
            .execute(
              {},
              {
                sessionID: chat.id,
                messageID: assistant.id,
                agent: "build",
                abort: new AbortController().signal,
                messages: [],
                metadata: () => Effect.void,
                ask: (input) =>
                  permission.ask({ ...input, sessionID: chat.id, ruleset: build.permission }).pipe(Effect.orDie),
              },
            )
            .pipe(Effect.exit, Effect.forkChild)
          if (action !== "already complete") {
            const request = yield* pollWithTimeout(
              permission.list().pipe(Effect.map((items) => items.find((item) => item.sessionID === chat.id))),
              "completion never requested permission",
            )
            expect(request.permission).toBe("session_complete")
            expect((yield* sessions.get(chat.id)).sessionComplete).toBe(false)
            yield* permission.reply({ requestID: request.id, reply: action === "approve" ? "once" : "reject" })
          }
          expect(yield* Fiber.join(fiber)).toMatchObject({ _tag: action === "reject" ? "Failure" : "Success" })
          expect(yield* sessions.get(chat.id)).toMatchObject({
            sessionInProgress: action === "reject",
            sessionComplete: action !== "reject",
            sessionFailed: false,
          })
          expect(yield* permission.list()).toEqual([])
        }),
      { config: { agent: { build: { permission: { session_complete: "ask" } } } } },
    )
  }

  it.instance(
    "marks the current session complete when the agent has permission",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const agent = yield* Agent.Service
        const build = yield* agent.get("build")
        const permission = yield* Permission.Service
        const tool = yield* SessionCompleteTool
        const def = yield* tool.init()

        const before = yield* sessions.get(chat.id)
        expect(before.sessionComplete).toBe(false)
        expect(Permission.evaluate("session_complete", "*", build.permission).action).toBe("allow")

        const result = yield* def.execute(
          {},
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: (input) =>
              permission.ask({ ...input, sessionID: chat.id, ruleset: build.permission }).pipe(Effect.orDie),
          },
        )

        expect(result.output).toBe("Marked the current session complete.")
        const after = yield* sessions.get(chat.id)
        expect(after.sessionComplete).toBe(true)
        expect(after.time.updated).toBe(before.time.updated)
      }),
    { config: { agent: { build: { permission: { session_complete: "allow" } } } } },
  )

  it.instance(
    "completion appends the pushed commit to an agent-push title",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const title = agentPushTitle(chat.directory)
        const def = yield* (yield* SessionCompleteTool).init()
        const git = (...args: string[]) => {
          const out = Bun.spawnSync(["git", ...args], { cwd: chat.directory })
          if (out.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${out.stderr.toString()}`)
          return out.stdout.toString().trim()
        }
        const complete = Effect.gen(function* () {
          yield* sessions.setTitle({ sessionID: chat.id, title })
          yield* sessions.setSessionComplete({ sessionID: chat.id, sessionComplete: false })
          yield* def.execute(
            {},
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              messages: [],
              metadata: () => Effect.void,
              ask: () => Effect.void,
            },
          )
          return (yield* sessions.get(chat.id)).title
        })

        // No upstream yet: the push did not land, so the bare title stays.
        expect(yield* complete).toBe(title)
        git("init", "--bare", "-q", "remote.git")
        git("remote", "add", "origin", "remote.git")
        git("push", "-q", "-u", "origin", "HEAD")
        expect(yield* complete).toBe(`${title}#${git("rev-parse", "--short=7", "HEAD")}`)
      }),
    { git: true },
  )

  it.instance(
    "autoDelete flags a session opened by agent-push only after a verified push",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        yield* sessions.setMetadata({ sessionID: chat.id, metadata: { [PUSH_SESSION_KEY]: true } })
        const def = yield* (yield* SessionCompleteTool).init()
        const git = (...args: string[]) => {
          const out = Bun.spawnSync(["git", ...args], { cwd: chat.directory })
          if (out.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${out.stderr.toString()}`)
        }
        const complete = Effect.gen(function* () {
          yield* sessions.setSessionComplete({ sessionID: chat.id, sessionComplete: false })
          const result = yield* def.execute(
            { autoDelete: true },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              messages: [],
              metadata: () => Effect.void,
              ask: () => Effect.void,
            },
          )
          return { output: result.output, flag: (yield* sessions.get(chat.id)).metadata?.[AUTO_DELETE_KEY] }
        })

        // No upstream: not pushed, so no flag, and the agent is told why.
        expect(yield* complete).toEqual({
          output: "Marked the current session complete. Not marked for auto-delete: HEAD does not match its upstream.",
          flag: undefined,
        })
        git("init", "--bare", "-q", "remote.git")
        git("remote", "add", "origin", "remote.git")
        git("push", "-q", "-u", "origin", "HEAD")
        expect(yield* complete).toEqual({ output: "Marked the current session complete.", flag: true })
        expect((yield* sessions.get(chat.id)).title).toBe(chat.title)
        // Pushed, but agent-push ran mid-session: the session and its history stay.
        yield* sessions.setMetadata({ sessionID: chat.id, metadata: {} })
        expect(yield* complete).toEqual({
          output:
            "Marked the current session complete. Not marked for auto-delete: the session did not start with /agent-push.",
          flag: undefined,
        })
      }),
    { git: true },
  )

  it.instance(
    "marks the current session failed and clears completion when the agent has permission",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        yield* sessions.setSessionComplete({ sessionID: chat.id, sessionComplete: true })
        const before = yield* sessions.get(chat.id)
        const agent = yield* Agent.Service
        const build = yield* agent.get("build")
        const permission = yield* Permission.Service
        const tool = yield* SessionFailedTool
        const def = yield* tool.init()

        expect(before.sessionComplete).toBe(true)
        expect(before.sessionFailed).toBe(false)
        expect(Permission.evaluate("session_failed", "*", build.permission).action).toBe("allow")

        const result = yield* def.execute(
          {},
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            messages: [],
            metadata: () => Effect.void,
            ask: (input) =>
              permission.ask({ ...input, sessionID: chat.id, ruleset: build.permission }).pipe(Effect.orDie),
          },
        )

        expect(result.output).toBe("Marked the current session failed.")
        const after = yield* sessions.get(chat.id)
        expect(after.sessionComplete).toBe(false)
        expect(after.sessionFailed).toBe(true)
        expect(after.time.updated).toBe(before.time.updated)
      }),
    { config: { agent: { build: { permission: { session_failed: "allow" } } } } },
  )

  it.instance("hides session completion by default", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const build = yield* agent.get("build")
      expect(Permission.evaluate("session_complete", "*", build.permission).action).toBe("deny")
    }),
  )

  it.instance("denies session failure by default", () =>
    Effect.gen(function* () {
      const agent = yield* Agent.Service
      const build = yield* agent.get("build")
      const permission = yield* Permission.Service

      expect(Permission.evaluate("session_failed", "*", build.permission).action).toBe("deny")
      expect(
        yield* permission
          .ask({
            sessionID: SessionID.make("ses_permission_test_failed"),
            permission: "session_failed",
            patterns: ["*"],
            always: ["*"],
            metadata: {},
            ruleset: build.permission,
          })
          .pipe(Effect.exit),
      ).toMatchObject({ _tag: "Failure" })
    }),
  )

  it.instance(
    "description sorts subagents by name and is stable across calls",
    () =>
      Effect.gen(function* () {
        const agent = yield* Agent.Service
        const build = yield* agent.get("build")
        const registry = yield* ToolRegistry.Service
        const get = Effect.fnUntraced(function* () {
          const tools = yield* registry.tools({ ...ref, agent: build })
          return tools.find((tool) => tool.id === TaskTool.id)?.description ?? ""
        })
        const first = yield* get()
        const second = yield* get()

        expect(first).toBe(second)

        const alpha = first.indexOf("- alpha: Alpha agent")
        const explore = first.indexOf("- explore:")
        const general = first.indexOf("- general:")
        const zebra = first.indexOf("- zebra: Zebra agent")

        expect(alpha).toBeGreaterThan(-1)
        expect(explore).toBeGreaterThan(alpha)
        expect(general).toBeGreaterThan(explore)
        expect(zebra).toBeGreaterThan(general)
      }),
    {
      config: {
        agent: {
          zebra: {
            description: "Zebra agent",
            mode: "subagent",
          },
          alpha: {
            description: "Alpha agent",
            mode: "subagent",
          },
        },
      },
    },
  )

  it.instance(
    "description hides denied subagents for the caller",
    () =>
      Effect.gen(function* () {
        const agent = yield* Agent.Service
        const build = yield* agent.get("build")
        const registry = yield* ToolRegistry.Service
        const description =
          (yield* registry.tools({ ...ref, agent: build })).find((tool) => tool.id === TaskTool.id)?.description ?? ""

        expect(description).toContain("- alpha: Alpha agent")
        expect(description).not.toContain("- zebra: Zebra agent")
      }),
    {
      config: {
        permission: {
          task: {
            "*": "allow",
            zebra: "deny",
          },
        },
        agent: {
          zebra: {
            description: "Zebra agent",
            mode: "subagent",
          },
          alpha: {
            description: "Alpha agent",
            mode: "subagent",
          },
        },
      },
    },
  )

  it.instance(
    "uses default_subagent when subagent_type is omitted",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect((yield* sessions.get(result.metadata.sessionId)).agent).toBe("general")
      }),
    { config: { default_subagent: "general" } },
  )

  it.instance(
    "uses the default subagent model when subagent_type is omitted",
    () =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        let seen: SessionPrompt.TurnInput | undefined
        const tool = yield* TaskTool
        const def = yield* tool.init()

        yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps({ onPrompt: (input) => (seen = input) }) },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect(seen?.model).toEqual({
          providerID: ProviderV2.ID.make("test"),
          modelID: ModelV2.ID.make("agent-model"),
        })
        expect(seen?.explicitModel).toBe(false)
      }),
    { config: { default_subagent: "general", agent: { general: { model: "test/agent-model" } } } },
  )

  it.instance(
    "explicit subagent_type overrides default_subagent",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()

        const result = yield* def.execute(
          {
            description: "explore bug",
            prompt: "look into the cache key path",
            subagent_type: "explore",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect((yield* sessions.get(result.metadata.sessionId)).agent).toBe("explore")
      }),
    { config: { default_subagent: "general" } },
  )

  it.instance("requires a subagent_type when no default_subagent is configured", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const exit = yield* def
        .execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      expect(yield* sessions.children(chat.id)).toHaveLength(0)
    }),
  )

  it.instance(
    "rejects a primary default_subagent without creating a child session",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()

        const exit = yield* def
          .execute(
            {
              description: "inspect bug",
              prompt: "look into the cache key path",
            },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              extra: { promptOps: stubOps() },
              messages: [],
              metadata: () => Effect.void,
              ask: () => Effect.void,
            },
          )
          .pipe(Effect.exit)

        expect(Exit.isFailure(exit)).toBe(true)
        expect(yield* sessions.children(chat.id)).toHaveLength(0)
      }),
    { config: { default_subagent: "build" } },
  )

  it.instance("execute resumes an existing task session from task_id", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const child = yield* sessions.create({ parentID: chat.id, title: "Existing child", agent: "general" })
      const tool = yield* TaskTool
      const def = yield* tool.init()
      let seen: SessionPrompt.PromptInput | undefined
      const promptOps = stubOps({ text: "resumed", onPrompt: (input) => (seen = input) })

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          task_id: child.id,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: { promptOps },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      const kids = yield* sessions.children(chat.id)
      expect(kids).toHaveLength(1)
      expect(kids[0]?.id).toBe(child.id)
      expect(result.metadata.sessionId).toBe(child.id)
      expect(result.output).toContain(`<task id="${child.id}" state="completed">`)
      expect(seen?.sessionID).toBe(child.id)
      expect(seen?.variant).toBe("xhigh")
    }),
  )

  it.instance(
    "an explicit model replaces the agent model and drops the parent effort",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        let seen: SessionPrompt.TurnInput | undefined
        const metadata: Record<string, unknown>[] = []
        const def = yield* (yield* TaskTool).init()

        const result = yield* def.execute(
          { description: "inspect bug", prompt: "look", subagent_type: "general", model: "test/vendor/model" },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps({ onPrompt: (input) => (seen = input) }) },
            messages: [],
            metadata: (input) => Effect.sync(() => metadata.push(input.metadata ?? {})),
            ask: () => Effect.void,
          },
        )

        expect(seen?.model).toEqual({
          providerID: ProviderV2.ID.make("test"),
          modelID: ModelV2.ID.make("vendor/model"),
        })
        expect(seen?.variant).toBeUndefined()
        expect(seen?.agent).toBe("general")
        expect(seen?.explicitModel).toBe(true)
        expect(result.metadata.model).toEqual({
          providerID: ProviderV2.ID.make("test"),
          modelID: ModelV2.ID.make("vendor/model"),
        })
        expect(result.metadata.variant).toBeUndefined()
        expect(metadata[0]?.model).toEqual({ providerID: "test", modelID: "vendor/model" })
        expect((yield* sessions.get(result.metadata.sessionId)).agent).toBe("general")
      }),
    { config: modelConfig },
  )

  it.instance(
    "an explicit #variant is passed to the child turn",
    () =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        let seen: SessionPrompt.PromptInput | undefined
        const def = yield* (yield* TaskTool).init()

        const result = yield* def.execute(
          { description: "inspect bug", prompt: "look", subagent_type: "general", model: "test/test-model#high" },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps({ onPrompt: (input) => (seen = input) }) },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect(seen?.model?.modelID).toBe(ModelV2.ID.make("test-model"))
        expect(seen?.variant).toBe("high")
        expect(result.metadata.variant).toBe("high")
      }),
    { config: modelConfig },
  )

  it.instance(
    "blank model and task_id options are ignored",
    () =>
      Effect.gen(function* () {
        const { chat, assistant } = yield* seed()
        let seen: SessionPrompt.TurnInput | undefined
        const def = yield* (yield* TaskTool).init()

        const result = yield* def.execute(
          { description: "inspect bug", prompt: "look", subagent_type: "general", model: "", task_id: "" },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps({ onPrompt: (input) => (seen = input) }) },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect(seen).toBeDefined()
        expect(seen?.explicitModel).toBeFalsy()
        expect(result.metadata.sessionId).toBeDefined()
      }),
    { config: modelConfig },
  )

  it.instance(
    "invalid, disabled, or unknown models fail before any child session is created",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const def = yield* (yield* TaskTool).init()
        const promptOps = stubOps()

        for (const model of [
          "test/missing",
          "test-model",
          "test/",
          "/test-model",
          "test/test-model#",
          "test/test-model#high#extra",
          "test/test-model#turbo",
          "test/test-model#low",
        ]) {
          const exit = yield* Effect.exit(
            def.execute(
              { description: "inspect bug", prompt: "look", subagent_type: "general", model },
              {
                sessionID: chat.id,
                messageID: assistant.id,
                agent: "build",
                abort: new AbortController().signal,
                extra: { promptOps },
                messages: [],
                metadata: () => Effect.void,
                ask: () => Effect.void,
              },
            ),
          )
          expect(Exit.isFailure(exit), model).toBe(true)
        }

        expect(yield* sessions.children(chat.id)).toHaveLength(0)
      }),
    { config: modelConfig },
  )

  it.instance(
    "a denied task with an explicit model creates no child and keeps the agent as the permission subject",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const def = yield* (yield* TaskTool).init()
        const asked: unknown[] = []
        let prompted = false

        const exit = yield* Effect.exit(
          def.execute(
            { description: "inspect bug", prompt: "look", subagent_type: "general", model: "test/vendor/model" },
            {
              sessionID: chat.id,
              messageID: assistant.id,
              agent: "build",
              abort: new AbortController().signal,
              extra: { promptOps: stubOps({ onPrompt: () => (prompted = true) }) },
              messages: [],
              metadata: () => Effect.void,
              ask: (input) =>
                Effect.gen(function* () {
                  asked.push(input)
                  return yield* Effect.die(new Error("denied"))
                }),
            },
          ),
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(asked).toEqual([expect.objectContaining({ permission: "task", patterns: ["general"] })])
        expect(prompted).toBe(false)
        expect(yield* sessions.children(chat.id)).toHaveLength(0)
      }),
    { config: modelConfig },
  )

  it.instance(
    "resume rejects a task_id that is not a same-agent child of this chat",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const other = yield* seed("Other")
        const foreign = yield* sessions.create({ parentID: other.chat.id, title: "Foreign", agent: "general" })
        const wrongAgent = yield* sessions.create({ parentID: chat.id, title: "Explore", agent: "explore" })
        const def = yield* (yield* TaskTool).init()

        for (const task_id of [foreign.id, wrongAgent.id]) {
          const exit = yield* Effect.exit(
            def.execute(
              { description: "inspect bug", prompt: "look", subagent_type: "general", task_id },
              {
                sessionID: chat.id,
                messageID: assistant.id,
                agent: "build",
                abort: new AbortController().signal,
                extra: { promptOps: stubOps() },
                messages: [],
                metadata: () => Effect.void,
                ask: () => Effect.void,
              },
            ),
          )
          expect(Exit.isFailure(exit), task_id).toBe(true)
        }
      }),
    { config: modelConfig },
  )

  it.instance("execute surfaces child errors with a resumable task_id", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const exit = yield* def
        .execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: {
              promptOps: stubOps({
                text: "",
                error: new SessionV1.APIError({ message: "Network connection lost", isRetryable: false }).toObject(),
              }),
            },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isSuccess(exit)) throw new Error("expected task failure")
      const child = (yield* sessions.children(chat.id))[0]
      expect(child).toBeDefined()
      const failure = Cause.squash(exit.cause)
      expect(failure).toBeInstanceOf(Error)
      if (!(failure instanceof Error)) throw new Error("expected Error defect")
      expect(failure.message).toBe(`Subagent failed (task_id: ${child?.id}): Network connection lost`)
    }),
  )

  it.instance("execute surfaces terminal child tool errors with a resumable task_id", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const exit = yield* def
        .execute(
          {
            description: "inspect external directory",
            prompt: "read the external directory",
            subagent_type: "general",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: {
              promptOps: stubOps({
                text: "I will inspect the directory.",
                toolError: "The user rejected permission to use this specific tool call.",
              }),
            },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isSuccess(exit)) throw new Error("expected task failure")
      const child = (yield* sessions.children(chat.id))[0]
      const failure = Cause.squash(exit.cause)
      expect(failure).toBeInstanceOf(Error)
      if (!(failure instanceof Error)) throw new Error("expected Error defect")
      expect(failure.message).toBe(
        `Subagent failed (task_id: ${child?.id}): The user rejected permission to use this specific tool call.`,
      )
    }),
  )

  it.instance("execute succeeds when the child answers after a failed tool call", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect directory",
          prompt: "list the directory",
          subagent_type: "general",
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: {
            promptOps: {
              ...stubOps(),
              // One turn holding a failed tool call and then the final reply, as Claude Code reports it.
              prompt: (input) =>
                Effect.sync(() => {
                  const message = reply(input, "Report written.", undefined, "ls: cannot access 'x'")
                  return { ...message, parts: message.parts.toReversed() }
                }),
            },
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      expect(result.output).toContain("Report written.")
    }),
  )

  it.instance("execute asks by default and skips checks when bypassed", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const calls: unknown[] = []
      const promptOps = stubOps()

      const exec = (extra?: Record<string, any>) =>
        def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps, ...extra },
            messages: [],
            metadata: () => Effect.void,
            ask: (input) =>
              Effect.sync(() => {
                calls.push(input)
              }),
          },
        )

      yield* exec()
      yield* exec({ bypassAgentCheck: true })

      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual({
        permission: "task",
        patterns: ["general"],
        always: ["*"],
        metadata: {
          description: "inspect bug",
          subagent_type: "general",
        },
      })
    }),
  )

  it.instance("execute cancels child session when abort signal fires", () =>
    Effect.gen(function* () {
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const ready = defer<SessionPrompt.PromptInput>()
      const cancelled = defer<SessionID>()
      const abort = new AbortController()
      const promptOps: TaskPromptOps = {
        ...unusedNoticeOps,
        cancel: (sessionID) =>
          Effect.sync(() => {
            cancelled.resolve(sessionID)
          }),
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (input) =>
          Effect.promise(() => {
            ready.resolve(input)
            return cancelled.promise
          }).pipe(Effect.as(reply(input, "cancelled"))),
      }

      const fiber = yield* def
        .execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: abort.signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.forkChild)

      const input = yield* Effect.promise(() => ready.promise)
      abort.abort()
      expect(yield* Effect.promise(() => cancelled.promise)).toBe(input.sessionID)

      const exit = yield* Fiber.await(fiber)
      expect(Exit.isSuccess(exit)).toBe(true)
    }),
  )

  it.instance("execute creates a child when task_id does not exist", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      let seen: SessionPrompt.PromptInput | undefined
      const promptOps = stubOps({ text: "created", onPrompt: (input) => (seen = input) })

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          task_id: "ses_missing",
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: { promptOps },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      const kids = yield* sessions.children(chat.id)
      expect(kids).toHaveLength(1)
      expect(kids[0]?.id).toBe(result.metadata.sessionId)
      expect(result.metadata.sessionId).not.toBe("ses_missing")
      expect(result.output).toContain(`<task id="${result.metadata.sessionId}" state="completed">`)
      expect(seen?.sessionID).toBe(result.metadata.sessionId)
    }),
  )

  it.instance("prevents subagents from launching subagents by default", () =>
    Effect.gen(function* () {
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const child = yield* sessions.create({ parentID: chat.id, title: "child" })
      const nestedAssistant = yield* sessions.updateMessage({
        ...assistant,
        id: MessageID.ascending(),
        parentID: MessageID.ascending(),
        sessionID: child.id,
      })
      const tool = yield* TaskTool
      const def = yield* tool.init()
      let asked = false

      const exit = yield* def
        .execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
          },
          {
            sessionID: child.id,
            messageID: nestedAssistant.id,
            agent: "general",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.sync(() => (asked = true)),
          },
        )
        .pipe(Effect.exit)

      expect(Exit.isFailure(exit)).toBe(true)
      expect(asked).toBe(false)
      expect(yield* sessions.children(child.id)).toHaveLength(0)
    }),
  )

  it.instance(
    "allows nested subagents up to the configured depth",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const child = yield* sessions.create({ parentID: chat.id, title: "child" })
        const nestedAssistant = yield* sessions.updateMessage({
          ...assistant,
          id: MessageID.ascending(),
          parentID: MessageID.ascending(),
          sessionID: child.id,
        })
        const tool = yield* TaskTool
        const def = yield* tool.init()

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
          },
          {
            sessionID: child.id,
            messageID: nestedAssistant.id,
            agent: "general",
            abort: new AbortController().signal,
            extra: { promptOps: stubOps() },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        expect((yield* sessions.get(result.metadata.sessionId)).parentID).toBe(child.id)
      }),
    { config: { subagent_depth: 2 } },
  )

  it.instance(
    "execute shapes child permissions for task, todowrite, and primary tools",
    () =>
      Effect.gen(function* () {
        const sessions = yield* Session.Service
        const { chat, assistant } = yield* seed()
        const tool = yield* TaskTool
        const def = yield* tool.init()
        let seen: SessionPrompt.PromptInput | undefined
        const promptOps = stubOps({ onPrompt: (input) => (seen = input) })

        const result = yield* def.execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "reviewer",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )

        const child = yield* sessions.get(result.metadata.sessionId)
        expect(child.parentID).toBe(chat.id)
        expect(child.agent).toBe("reviewer")
        expect(child.permission).toEqual([
          {
            permission: "todowrite",
            pattern: "*",
            action: "deny",
          },
          {
            permission: "bash",
            pattern: "*",
            action: "deny",
          },
          {
            permission: "read",
            pattern: "*",
            action: "deny",
          },
        ])
        expect(seen?.tools).toBeUndefined()
      }),
    {
      config: {
        agent: {
          reviewer: {
            mode: "subagent",
            permission: {
              task: "allow",
            },
          },
        },
        experimental: {
          primary_tools: ["bash", "read"],
        },
      },
    },
  )

  it.instance("promotes a running foreground task without restarting it", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const ready = yield* Deferred.make<void>()
      const done = yield* Deferred.make<void>()
      const injected = yield* Deferred.make<SessionPrompt.PromptInput>()
      let runs = 0
      const promptOps: TaskPromptOps = {
        ...unusedNoticeOps,
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (input) => {
          if (input.sessionID === chat.id) {
            return Deferred.succeed(injected, input).pipe(Effect.as(reply(input, "injected")))
          }
          return Effect.gen(function* () {
            runs += 1
            yield* Deferred.succeed(ready, undefined)
            yield* Deferred.await(done)
            return reply(input, "background done")
          })
        },
      }

      const fiber = yield* def
        .execute(
          {
            description: "inspect bug",
            prompt: "look into the cache key path",
            subagent_type: "general",
          },
          {
            sessionID: chat.id,
            messageID: assistant.id,
            agent: "build",
            abort: new AbortController().signal,
            extra: { promptOps },
            messages: [],
            metadata: () => Effect.void,
            ask: () => Effect.void,
          },
        )
        .pipe(Effect.forkChild)

      yield* Deferred.await(ready)
      const job = (yield* jobs.list())[0]
      expect(job).toBeDefined()
      if (!job) throw new Error("task job not found")
      expect(job.metadata?.parentSessionId).toBe(chat.id)
      yield* jobs.promote(job.id)

      const result = yield* Fiber.join(fiber)
      expect(result.metadata.background).toBe(true)
      expect(result.output).toContain(`state="running"`)
      expect((yield* jobs.get(result.metadata.sessionId))?.status).toBe("running")
      expect(runs).toBe(1)

      yield* Deferred.succeed(done, undefined)
      expect((yield* jobs.wait({ id: result.metadata.sessionId })).info?.output).toBe("background done")
      expect((yield* Deferred.await(injected)).parts[0]?.type).toBe("text")
      expect(runs).toBe(1)
    }),
  )

  it.instance("execute launches background tasks without waiting for completion", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: {
            promptOps: {
              ...stubOps(),
              prompt: () => Effect.never,
            } satisfies TaskPromptOps,
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      const job = yield* jobs.get(result.metadata.sessionId)
      expect(result.metadata.background).toBe(true)
      expect(result.output).toContain(`state="running"`)
      expect(job?.status).toBe("running")
    }),
  )

  it.instance("background task completion waits for running updates", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const first = defer<void>()
      const second = defer<void>()
      const updated = defer<SessionPrompt.PromptInput>()
      const injected = defer<SessionPrompt.PromptInput>()
      let prompts = 0
      const promptOps: TaskPromptOps = {
        ...stubOps(),
        prompt: (input) => {
          if (input.sessionID === chat.id) {
            injected.resolve(input)
            return Effect.succeed(reply(input, "done"))
          }
          prompts++
          if (prompts === 1) return Effect.promise(() => first.promise).pipe(Effect.as(reply(input, "first done")))
          updated.resolve(input)
          return Effect.promise(() => second.promise).pipe(Effect.as(reply(input, "second done")))
        },
      }
      const context = {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "build",
        abort: new AbortController().signal,
        extra: { promptOps },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const started = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        context,
      )
      const result = yield* def.execute(
        {
          description: "add investigation scope",
          prompt: "also inspect cancellation",
          subagent_type: "general",
          task_id: started.metadata.sessionId,
        },
        context,
      )

      expect(result.metadata.sessionId).toBe(started.metadata.sessionId)
      expect(result.metadata.background).toBe(true)
      expect(result.output).toContain("Background task updated")
      first.resolve()
      expect((yield* jobs.get(started.metadata.sessionId))?.status).toBe("running")
      expect((yield* Effect.promise(() => updated.promise)).parts).toEqual([
        { type: "text", text: "also inspect cancellation" },
      ])

      second.resolve()
      const waited = yield* jobs.wait({ id: started.metadata.sessionId, timeout: 1_000 })
      expect(waited.info?.status).toBe("completed")
      expect(waited.info?.output).toBe("second done")
      const notification = yield* Effect.promise(() => injected.promise)
      expect(notification.variant).toBe("xhigh")
      expect(notification.parts[0]?.type).toBe("text")
      if (notification.parts[0]?.type === "text") expect(notification.parts[0].text).toContain("second done")
    }),
  )

  it.instance("background tasks complete through the background job service", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: { promptOps: stubOps({ text: "background done" }) },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      const waited = yield* jobs.wait({ id: result.metadata.sessionId, timeout: 1_000 })
      expect(waited.timedOut).toBe(false)
      expect(waited.info?.status).toBe("completed")
      expect(waited.info?.output).toBe("background done")
    }),
  )

  it.instance("background task completion does not wait for the parent async prompt", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: {
            promptOps: {
              ...stubOps({ text: "background done" }),
              prompt: (input) =>
                input.sessionID === chat.id ? Effect.never : Effect.succeed(reply(input, "background done")),
            } satisfies TaskPromptOps,
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      const waited = yield* jobs.wait({ id: result.metadata.sessionId, timeout: 1_000 })
      expect(waited.timedOut).toBe(false)
      expect(waited.info?.status).toBe("completed")
    }),
  )

  it.instance("removing the parent session cancels running background tasks", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: {
            promptOps: {
              ...stubOps(),
              prompt: () => Effect.never,
            } satisfies TaskPromptOps,
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      yield* sessions.remove(chat.id)
      const waited = yield* jobs.wait({ id: result.metadata.sessionId, timeout: 1_000 })
      expect(waited.timedOut).toBe(false)
      expect(waited.info?.status).toBe("cancelled")
    }),
  )

  it.instance("removing the child task session cancels its running background task", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: {
            promptOps: {
              ...stubOps(),
              prompt: () => Effect.never,
            } satisfies TaskPromptOps,
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      yield* sessions.remove(result.metadata.sessionId)
      const waited = yield* jobs.wait({ id: result.metadata.sessionId, timeout: 1_000 })
      expect(waited.timedOut).toBe(false)
      expect(waited.info?.status).toBe("cancelled")
    }),
  )

  it.instance("cancelling the parent run cancels running background tasks", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const runState = yield* SessionRunState.Service
      const { chat, assistant } = yield* seed()
      const tool = yield* TaskTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        {
          description: "inspect bug",
          prompt: "look into the cache key path",
          subagent_type: "general",
          background: true,
        },
        {
          sessionID: chat.id,
          messageID: assistant.id,
          agent: "build",
          abort: new AbortController().signal,
          extra: {
            promptOps: {
              ...stubOps(),
              prompt: () => Effect.never,
            } satisfies TaskPromptOps,
          },
          messages: [],
          metadata: () => Effect.void,
          ask: () => Effect.void,
        },
      )

      yield* runState.cancel(chat.id)
      const waited = yield* jobs.wait({ id: result.metadata.sessionId, timeout: 1_000 })
      expect(waited.timedOut).toBe(false)
      expect(waited.info?.status).toBe("cancelled")
    }),
  )

  it.instance("cancelling a child run cancels its own pre-runner task job", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const runState = yield* SessionRunState.Service
      const sessions = yield* Session.Service
      const { chat } = yield* seed()
      const child = yield* sessions.create({ parentID: chat.id, title: "child" })

      yield* jobs.start({
        id: child.id,
        type: "task",
        metadata: { parentSessionId: chat.id, sessionId: child.id },
        run: Effect.never,
      })

      yield* runState.cancel(child.id)

      expect((yield* jobs.get(child.id))?.status).toBe("cancelled")
    }),
  )

  it.instance("cancelling a parent run recursively cancels descendant background tasks", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const runState = yield* SessionRunState.Service
      const sessions = yield* Session.Service
      const { chat } = yield* seed()
      const child = yield* sessions.create({ parentID: chat.id, title: "child" })
      const grandchild = yield* sessions.create({ parentID: child.id, title: "grandchild" })

      yield* jobs.start({
        id: child.id,
        type: "task",
        metadata: { parentSessionId: chat.id, sessionId: child.id },
        run: Effect.never,
      })
      yield* jobs.start({
        id: grandchild.id,
        type: "task",
        metadata: { parentSessionId: child.id, sessionId: grandchild.id },
        run: Effect.never,
      })

      yield* runState.cancel(chat.id)

      expect((yield* jobs.get(child.id))?.status).toBe("cancelled")
      expect((yield* jobs.get(grandchild.id))?.status).toBe("cancelled")
    }),
  )

  it.instance("keepBackground stops the turn's foreground task but leaves background tasks running", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const runState = yield* SessionRunState.Service
      const sessions = yield* Session.Service
      const { chat } = yield* seed()
      const kept = yield* sessions.create({ parentID: chat.id, title: "background" })
      const keptChild = yield* sessions.create({ parentID: kept.id, title: "background child" })
      const foreground = yield* sessions.create({ parentID: chat.id, title: "foreground" })
      const start = (id: string, parentSessionId: string, background: boolean) =>
        jobs.start({
          id,
          type: "task",
          metadata: { parentSessionId, sessionId: id, ...(background ? { background: true } : {}) },
          run: Effect.never,
        })
      yield* start(kept.id, chat.id, true)
      yield* start(keptChild.id, kept.id, true)
      yield* start(foreground.id, chat.id, false)

      yield* runState.cancel(chat.id, { keepBackground: true })

      expect((yield* jobs.get(foreground.id))?.status).toBe("cancelled")
      expect((yield* jobs.get(kept.id))?.status).toBe("running")
      expect((yield* jobs.get(keptChild.id))?.status).toBe("running")

      yield* runState.cancel(chat.id)

      expect((yield* jobs.get(kept.id))?.status).toBe("cancelled")
      expect((yield* jobs.get(keptChild.id))?.status).toBe("cancelled")
    }),
  )

  it.instance("task_cancel stops this chat's running background task without a parent notice", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const { chat, assistant } = yield* seed()
      const task = yield* (yield* TaskTool).init()
      const cancel = yield* (yield* TaskCancelTool).init()
      const cancelled: string[] = []
      const parentPrompts: string[] = []
      const promptOps: TaskPromptOps = {
        ...stubOps(),
        cancel: (sessionID) => Effect.sync(() => void cancelled.push(sessionID)),
        prompt: (input) => {
          if (input.sessionID === chat.id) {
            parentPrompts.push(input.sessionID)
            return Effect.succeed(reply(input, "notice"))
          }
          return Effect.never
        },
      }
      const context = {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "build",
        abort: new AbortController().signal,
        extra: { promptOps },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      const started = yield* task.execute(
        { description: "slow scan", prompt: "scan everything", subagent_type: "general", background: true },
        context,
      )
      expect(started.output).toContain("task_cancel")
      const id = started.metadata.sessionId
      const result = yield* cancel.execute({ task_id: id }, context)

      expect(result.output).toStartWith(`Stopped task ${id}.`)
      expect((yield* jobs.get(id))?.status).toBe("cancelled")
      expect(cancelled).toEqual([id])
      expect((yield* cancel.execute({ task_id: id }, context)).output).toBe(`Task ${id} already cancelled.`)
      expect(parentPrompts).toEqual([])
    }),
  )

  it.instance("task_cancel refuses tasks it does not own and ids that are not running", () =>
    Effect.gen(function* () {
      const jobs = yield* BackgroundJob.Service
      const sessions = yield* Session.Service
      const { chat, assistant } = yield* seed()
      const other = yield* sessions.create({ title: "other chat" })
      const foreign = yield* sessions.create({ parentID: other.id, title: "foreign" })
      const idle = yield* sessions.create({ parentID: chat.id, title: "idle" })
      yield* jobs.start({
        id: foreign.id,
        type: "task",
        metadata: { parentSessionId: other.id, sessionId: foreign.id },
        run: Effect.never,
      })
      const cancel = yield* (yield* TaskCancelTool).init()
      const context = {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "build",
        abort: new AbortController().signal,
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      expect((yield* cancel.execute({ task_id: foreign.id }, context)).output).toBe(
        `Task ${foreign.id} is not a subagent of this chat.`,
      )
      expect((yield* jobs.get(foreign.id))?.status).toBe("running")
      expect((yield* cancel.execute({ task_id: idle.id }, context)).output).toBe(
        `Task ${idle.id} is not running in the background.`,
      )
      expect((yield* cancel.execute({ task_id: "ses_missing" }, context)).output).toBe("No task ses_missing.")
    }),
  )
})
