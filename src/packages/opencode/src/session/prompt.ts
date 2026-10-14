import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import os from "os"
import { createHash } from "node:crypto"
import { SessionID, MessageID, PartID } from "./schema"
import { isClaudeCodeProvider } from "@/provider/claude-code/shared"
import { CURSOR_PROVIDER_ID } from "@/provider/cursor/shared"
import { MessageV2 } from "./message-v2"
import { SessionRevert } from "./revert"
import { Session } from "./session"
import { Agent } from "../agent/agent"
import { Provider } from "@/provider/provider"

import { type Tool as AITool, tool, jsonSchema } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"
import { SessionCompaction } from "./compaction"
import { SessionHandoff } from "./handoff"
import { limitAction, overLimit } from "./overflow"
import { SystemPrompt } from "./system"
import { Instruction } from "./instruction"
import { Plugin } from "../plugin"
import { MAX_STEPS_PROMPT } from "@opencode-ai/core/session/runner/max-steps"
import { ToolRegistry } from "@/tool/registry"
import { MCP } from "../mcp"
import { LSP } from "@/lsp/lsp"
import { ulid } from "ulid"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import * as Stream from "effect/Stream"
import { Command } from "../command"
import { pathToFileURL, fileURLToPath } from "url"
import { Config } from "@/config/config"
import { ConfigMarkdown } from "@/config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@opencode-ai/core/util/error"
import { SessionProcessor } from "./processor"
import { Tool } from "@/tool/tool"
import { Permission } from "@/permission"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { Shell } from "@opencode-ai/core/shell"
import { ShellID } from "@/tool/shell/id"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { imageDir } from "@opencode-ai/core/util/imageDir"
import { Truncate } from "@/tool/truncate"
import { Image } from "@/image/image"
import { decodeDataUrl } from "@/util/data-url"
import { Cause, Effect, Exit, Latch, Layer, Option, Scope, Context, Schema, Semaphore, Types } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import { SessionRunState } from "./run-state"
import { SessionQueue } from "./queue"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Database } from "@opencode-ai/core/database/database"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { eq } from "drizzle-orm"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { SessionReminders } from "./reminders"
import { SessionTools } from "./tools"
import { LLMEvent } from "@opencode-ai/llm"
import { Question } from "@/question"
import { SessionWork } from "@opencode-ai/core/session/work"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

const decodeMessageInfo = Schema.decodeUnknownExit(SessionV1.Info)
const decodeMessagePart = Schema.decodeUnknownExit(SessionV1.Part)
const decodeAutoRename = Schema.decodeUnknownOption(Schema.Struct({
  state: Schema.Literals(["pending", "attempted"]),
  title: Schema.optional(Schema.String),
}))
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
const MAX_MCP_RESOURCE_BLOB_BYTES = 10 * 1024 * 1024
const SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES = new Set([
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

const STRUCTURED_OUTPUT_DESCRIPTION = `Use this tool to return your final response in the requested structured format.

IMPORTANT:
- You MUST call this tool exactly once at the end of your response
- The input must be valid JSON matching the required schema
- Complete all necessary research and tool calls BEFORE calling this tool
- This tool provides your final answer - no further actions are taken after calling it`

const STRUCTURED_OUTPUT_SYSTEM_PROMPT = `IMPORTANT: The user has requested structured output. You MUST use the StructuredOutput tool to provide your final response. Do NOT respond with plain text - you MUST call the StructuredOutput tool with your answer formatted according to the schema.`

const GENERATE_TIMEOUT = "120 seconds"
const SIDE_QUESTION_INSTRUCTION = [
  "The user is asking a quick side question about the conversation so far.",
  "Answer directly and concisely in markdown from what you already know.",
  "Do not call any tools and do not take any actions.",
  "This answer is not added to the conversation.",
].join(" ")

function mcpResourceBase64Size(value: string) {
  const trimmed = value.replace(/\s/g, "")
  const padding = trimmed.endsWith("==") ? 2 : trimmed.endsWith("=") ? 1 : 0
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding)
}

function formatMcpResourceBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
}

function isOrphanedInterruptedTool(part: SessionV1.ToolPart) {
  // cleanup() marks abandoned tool_use blocks this way after retries/aborts.
  // They are not pending work and must not trigger an assistant-prefill request.
  return part.state.status === "error" && part.state.metadata?.interrupted === true
}

const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
}

type PromptFilePart = Extract<PromptInput["parts"][number], { type: "file" }>

// Writes pasted image bytes into the image folder and returns the file path. The hash in the name
// makes identical bytes reuse the existing file instead of writing a second copy.
const writeImage = Effect.fn("SessionPrompt.writeImage")(function* (
  fsys: FSUtil.Interface,
  dir: string,
  bytes: Uint8Array,
  mime: string,
) {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8)
  const suffix = `-${hash}.${IMAGE_EXTENSIONS[mime] ?? "png"}`
  yield* fsys.ensureDir(dir)
  const existing = (yield* fsys.readDirectoryEntries(dir)).find((entry) => entry.name.endsWith(suffix))
  if (existing) return path.join(dir, existing.name)
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)
  const file = path.join(dir, `${stamp}${suffix}`)
  yield* fsys.writeWithDirs(file, bytes)
  return file
})

export interface Interface {
  readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  readonly prompt: (input: PromptInput) => Effect.Effect<SessionV1.WithParts, Image.Error | Session.BusyError>
  readonly loop: (input: LoopInput) => Effect.Effect<SessionV1.WithParts, Session.BusyError>
  readonly shell: (input: ShellInput) => Effect.Effect<SessionV1.WithParts, Session.BusyError>
  readonly command: (input: CommandInput) => Effect.Effect<SessionV1.WithParts, Image.Error | Session.BusyError>
  readonly resolvePromptParts: (template: string) => Effect.Effect<PromptInput["parts"]>
  readonly rename: (sessionID: SessionID) => Effect.Effect<{ session: Session.Info; model?: string }, Session.BusyError>
  readonly generate: (input: GenerateInput) => Effect.Effect<GenerateResult, GenerateError | Session.BusyError>
  readonly queue: {
    readonly snapshot: (sessionID: SessionID) => Effect.Effect<SessionQueue.Snapshot>
    readonly add: (input: SessionQueue.AddInput) => Effect.Effect<SessionQueue.Snapshot>
    readonly edit: (input: {
      sessionID: SessionID
      id: MessageID
      text: string
    }) => Effect.Effect<SessionQueue.Snapshot, SessionQueue.NotFoundError | SessionQueue.BusyError>
    readonly cancel: (input: {
      sessionID: SessionID
      id: MessageID
    }) => Effect.Effect<SessionQueue.Snapshot, SessionQueue.NotFoundError | SessionQueue.BusyError>
    readonly resume: (sessionID: SessionID) => Effect.Effect<SessionQueue.Snapshot>
  }
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionPrompt") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const status = yield* SessionStatus.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const provider = yield* Provider.Service
    const processor = yield* SessionProcessor.Service
    const compaction = yield* SessionCompaction.Service
    const handoff = yield* SessionHandoff.Service
    const plugin = yield* Plugin.Service
    const commands = yield* Command.Service
    const config = yield* Config.Service
    const permission = yield* Permission.Service
    const fsys = yield* FSUtil.Service
    const mcp = yield* MCP.Service
    const lsp = yield* LSP.Service
    const registry = yield* ToolRegistry.Service
    const truncate = yield* Truncate.Service
    const image = yield* Image.Service
    const imageSaveLock = Semaphore.makeUnsafe(1)
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const scope = yield* Scope.Scope
    const instruction = yield* Instruction.Service
    const state = yield* SessionRunState.Service
    const revert = yield* SessionRevert.Service
    const summary = yield* SessionSummary.Service
    const sys = yield* SystemPrompt.Service
    const llm = yield* LLM.Service
    const events = yield* EventV2Bridge.Service
    const flags = yield* RuntimeFlags.Service
    const database = yield* Database.Service
    const question = yield* Question.Service
    const work = yield* SessionWork.Service
    const queue = yield* SessionQueue.Service
    const { db } = database
    // Session work is admitted per project directory; work that lands during that project's reload is refused.
    const gated = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      InstanceState.context.pipe(Effect.flatMap((ctx) => work.run(ctx.directory, effect)))
    // The HTTP routes already answer a busy session with 409.
    const gatedSession = <A, E, R>(sessionID: SessionID, effect: Effect.Effect<A, E, R>) =>
      gated(effect).pipe(
        Effect.catchIf(
          (error): error is SessionWork.BusyError => error instanceof SessionWork.BusyError,
          () => Effect.fail(new Session.BusyError({ sessionID })),
        ),
      )
    const ops = Effect.fn("SessionPrompt.ops")(function* () {
      return {
        cancel: (sessionID: SessionID) => cancel(sessionID),
        resolvePromptParts: (template: string) => resolvePromptParts(template),
        prompt: (input: TurnInput) => gated(prompt(input)).pipe(Effect.catch(Effect.die)),
        loop: (sessionID: SessionID) => loop({ sessionID }),
        available: (sessionID: SessionID) => state.available(sessionID),
        cancellation: (sessionID: SessionID) => state.cancellation(sessionID),
        partMetadata: (input) => partMetadata(input),
      } satisfies TaskPromptOps
    })

    const partMetadata = Effect.fn("SessionPrompt.partMetadata")(function* (input: {
      sessionID: SessionID
      messageID: MessageID
      callID: string
      metadata: Record<string, unknown>
    }) {
      const message = yield* sessions.findMessage(input.sessionID, (item) => item.info.id === input.messageID).pipe(Effect.orDie)
      if (Option.isNone(message)) return
      const part = message.value.parts.find((item) => item.type === "tool" && item.callID === input.callID)
      if (part?.type !== "tool" || part.state.status !== "completed") return
      yield* sessions.updatePart({ ...part, state: { ...part.state, metadata: { ...part.state.metadata, ...input.metadata } } })
    })

    const cancel = Effect.fn("SessionPrompt.cancel")(function* (sessionID: SessionID) {
      yield* Effect.logInfo("cancel", { "session.id": sessionID })
      // Pause first so the drain cannot start the next queued prompt in the gap before the run stops.
      yield* queue.pause(sessionID, "interrupted")
      yield* question.cancel(sessionID)
      yield* state.cancel(sessionID)
    })

    const resolvePromptParts = Effect.fn("SessionPrompt.resolvePromptParts")(function* (template: string) {
      const ctx = yield* InstanceState.context
      const parts: Types.DeepMutable<PromptInput["parts"]> = [{ type: "text", text: template }]
      const files = ConfigMarkdown.files(template)
      const seen = new Set<string>()
      yield* Effect.forEach(
        files,
        Effect.fnUntraced(function* (match) {
          const name = match[1]
          if (!name) return
          if (seen.has(name)) return
          seen.add(name)

          const filepath = name.startsWith("~/")
            ? path.join(os.homedir(), name.slice(2))
            : path.resolve(ctx.worktree, name)

          const info = yield* fsys.stat(filepath).pipe(Effect.option)
          if (Option.isNone(info)) {
            const found = yield* agents.get(name)
            if (found) parts.push({ type: "agent", name: found.name })
            return
          }
          const stat = info.value
          parts.push({
            type: "file",
            url: pathToFileURL(filepath).href,
            filename: name,
            mime: stat.type === "Directory" ? "application/x-directory" : "text/plain",
          })
        }),
        { concurrency: "unbounded", discard: true },
      )
      return parts
    })

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
            .pipe(Stream.filter(LLMEvent.is.textDelta), Stream.map((e) => e.text), Stream.mkString)
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

    // /btw side question: one tool-less model call over a snapshot of the history. Nothing is
    // written back, so messages, marks, and resume state stay as they were.
    const generate = Effect.fn("SessionPrompt.generate")(function* (input: GenerateInput) {
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
        if (automatic.value.title === undefined
          ? !Session.isDefaultTitle(session.title)
          : session.title !== automatic.value.title) return
      }

      const history = structuredClone(input.history.slice(0, input.history.indexOf(users[0]) + 1))
      const titled =
        marker === undefined
          ? title({ mode: "stock", session, history, providerID: input.providerID, modelID: input.modelID })
          : title({ mode: "marked", session, history })
      yield* gated(titled).pipe(
        Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("automatic title failed", { sessionID: session.id, error: Cause.squash(cause) })),
        Effect.forkIn(scope),
      )
    })

    const handleSubtask = Effect.fn("SessionPrompt.handleSubtask")(function* (input: {
      task: SessionV1.SubtaskPart
      model: Provider.Model
      lastUser: SessionV1.User
      sessionID: SessionID
      session: Session.Info
      msgs: SessionV1.WithParts[]
    }) {
      const { task, model, lastUser, sessionID, session, msgs } = input
      const ctx = yield* InstanceState.context
      const promptOps = yield* ops()
      const { task: taskTool } = yield* registry.named()
      const taskModel = task.model ? yield* getModel(task.model.providerID, task.model.modelID, sessionID) : model
      const assistantMessage: SessionV1.Assistant = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "assistant",
        parentID: lastUser.id,
        sessionID,
        mode: task.agent,
        agent: task.agent,
        variant: lastUser.model.variant,
        path: { cwd: ctx.directory, root: ctx.worktree },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: taskModel.id,
        providerID: taskModel.providerID,
        time: { created: Date.now() },
      })
      let part: SessionV1.ToolPart = yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistantMessage.id,
        sessionID: assistantMessage.sessionID,
        type: "tool",
        callID: ulid(),
        tool: TaskTool.id,
        state: {
          status: "running",
          input: {
            prompt: task.prompt,
            description: task.description,
            subagent_type: task.agent,
            command: task.command,
          },
          time: { start: Date.now() },
        },
      })
      const taskArgs = {
        prompt: task.prompt,
        description: task.description,
        subagent_type: task.agent,
        command: task.command,
      }
      yield* plugin.trigger(
        "tool.execute.before",
        { tool: TaskTool.id, sessionID, callID: part.id },
        { args: taskArgs },
      )

      const taskAgent = yield* agents.get(task.agent)
      if (!taskAgent) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${task.agent}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID, error: error.toObject() })
        throw error
      }

      let error: Error | undefined
      const taskAbort = new AbortController()
      const result = yield* taskTool
        .execute(taskArgs, {
          agent: task.agent,
          messageID: assistantMessage.id,
          sessionID,
          abort: taskAbort.signal,
          callID: part.callID,
          extra: { bypassAgentCheck: !lastUser.permission, turnPermission: lastUser.permission, promptOps },
          messages: msgs,
          metadata: (val: { title?: string; metadata?: Record<string, any> }) =>
            Effect.gen(function* () {
              part = yield* sessions.updatePart({
                ...part,
                type: "tool",
                state: { ...part.state, ...val },
              } satisfies SessionV1.ToolPart)
            }),
          ask: (req: any) =>
            permission
              .ask({
                ...req,
                sessionID,
                ruleset: Permission.merge(taskAgent.permission, session.permission ?? [], lastUser.permission ?? []),
              })
              .pipe(Effect.orDie),
        })
        .pipe(
          Effect.catchCause((cause) => {
            const defect = Cause.squash(cause)
            error = defect instanceof Error ? defect : new Error(String(defect))
            return Effect.logError("subtask execution failed", {
              error,
              agent: task.agent,
              description: task.description,
            })
          }),
          Effect.onInterrupt(() =>
            Effect.gen(function* () {
              taskAbort.abort()
              assistantMessage.finish = "tool-calls"
              assistantMessage.time.completed = Date.now()
              yield* sessions.updateMessage(assistantMessage)
              if (part.state.status === "running") {
                yield* sessions.updatePart({
                  ...part,
                  state: {
                    status: "error",
                    error: "Cancelled",
                    time: { start: part.state.time.start, end: Date.now() },
                    metadata: part.state.metadata,
                    input: part.state.input,
                  },
                } satisfies SessionV1.ToolPart)
              }
            }),
          ),
        )

      const attachments = result?.attachments?.map((attachment) => ({
        ...attachment,
        id: PartID.ascending(),
        sessionID,
        messageID: assistantMessage.id,
      }))

      yield* plugin.trigger(
        "tool.execute.after",
        { tool: TaskTool.id, sessionID, callID: part.id, args: taskArgs },
        result,
      )

      assistantMessage.finish = "tool-calls"
      assistantMessage.time.completed = Date.now()
      yield* sessions.updateMessage(assistantMessage)

      if (result && part.state.status === "running") {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "completed",
            input: part.state.input,
            title: result.title,
            metadata: result.metadata,
            output: result.output,
            attachments,
            time: { ...part.state.time, end: Date.now() },
          },
        } satisfies SessionV1.ToolPart)
      }

      if (!result) {
        yield* sessions.updatePart({
          ...part,
          state: {
            status: "error",
            error: error ? `Tool execution failed: ${error.message}` : "Tool execution failed",
            time: {
              start: part.state.status === "running" ? part.state.time.start : Date.now(),
              end: Date.now(),
            },
            metadata: part.state.status === "pending" ? undefined : part.state.metadata,
            input: part.state.input,
          },
        } satisfies SessionV1.ToolPart)
      }

      if (!task.command) return

      const summaryUserMsg: SessionV1.User = {
        id: MessageID.ascending(),
        sessionID,
        role: "user",
        time: { created: Date.now() },
        agent: lastUser.agent,
        model: lastUser.model,
        permission: lastUser.permission,
      }
      yield* sessions.updateMessage(summaryUserMsg)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: summaryUserMsg.id,
        sessionID,
        type: "text",
        text: "Summarize the task tool output above and continue with your task.",
        synthetic: true,
      } satisfies SessionV1.TextPart)
    })

    const shellImpl = Effect.fn("SessionPrompt.shellImpl")(function* (input: ShellInput, ready?: Latch.Latch) {
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const markReady = ready ? ready.open.pipe(Effect.asVoid) : Effect.void
          const { msg, part, cwd } = yield* Effect.gen(function* () {
            const ctx = yield* InstanceState.context
            const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
            if (session.revert) {
              yield* revert.cleanup(session)
            }
            const agent = yield* agents.get(input.agent)
            if (!agent) {
              const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
              const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
              const error = new NamedError.Unknown({ message: `Agent not found: "${input.agent}".${hint}` })
              yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
              throw error
            }
            const model = input.model ?? agent.model ?? (yield* currentModel(input.sessionID))
            const userMsg: SessionV1.User = {
              id: input.messageID ?? MessageID.ascending(),
              sessionID: input.sessionID,
              time: { created: Date.now() },
              role: "user",
              agent: input.agent,
              model: { providerID: model.providerID, modelID: model.modelID },
            }
            yield* sessions.updateMessage(userMsg)
            const userPart: SessionV1.Part = {
              type: "text",
              id: PartID.ascending(),
              messageID: userMsg.id,
              sessionID: input.sessionID,
              text: "The following tool was executed by the user",
              synthetic: true,
            }
            yield* sessions.updatePart(userPart)

            const msg: SessionV1.Assistant = {
              id: MessageID.ascending(),
              sessionID: input.sessionID,
              parentID: userMsg.id,
              mode: input.agent,
              agent: input.agent,
              cost: 0,
              path: { cwd: ctx.directory, root: ctx.worktree },
              time: { created: Date.now() },
              role: "assistant",
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: model.modelID,
              providerID: model.providerID,
            }
            yield* sessions.updateMessage(msg)
            const started = Date.now()
            const part: SessionV1.ToolPart = {
              type: "tool",
              id: PartID.ascending(),
              messageID: msg.id,
              sessionID: input.sessionID,
              tool: ShellID.ToolID,
              callID: ulid(),
              state: {
                status: "running",
                time: { start: started },
                input: { command: input.command },
              },
            }
            yield* sessions.updatePart(part)
            return { msg, part, cwd: ctx.directory }
          }).pipe(Effect.ensuring(markReady))

          const cfg = yield* config.get()
          const sh = Shell.preferred(cfg.shell)
          const args = Shell.args(sh, input.command, cwd)
          let output = ""
          let aborted = false

          const finish = Effect.uninterruptible(
            Effect.gen(function* () {
              if (aborted) {
                output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
              }
              const completed = Date.now()
              if (!msg.time.completed) {
                msg.time.completed = completed
                yield* sessions.updateMessage(msg)
              }
              if (part.state.status === "running") {
                part.state = {
                  status: "completed",
                  time: { ...part.state.time, end: completed },
                  input: part.state.input,
                  title: "",
                  metadata: { output },
                  output,
                }
                yield* sessions.updatePart(part)
              }
            }),
          )

          const exit = yield* restore(
            Effect.gen(function* () {
              const shellEnv = yield* plugin.trigger(
                "shell.env",
                { cwd, sessionID: input.sessionID, callID: part.callID },
                { env: {} },
              )
              const cmd = ChildProcess.make(sh, args, {
                cwd,
                extendEnv: true,
                env: { ...shellEnv.env, TERM: "dumb" },
                stdin: "ignore",
                forceKillAfter: "3 seconds",
              })
              const handle = yield* spawner.spawn(cmd)
              yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
                Effect.gen(function* () {
                  output += chunk
                  if (part.state.status === "running") {
                    part.state.metadata = { output }
                    yield* sessions.updatePart(part)
                  }
                }),
              )
              yield* handle.exitCode
            }).pipe(Effect.scoped, Effect.orDie),
          ).pipe(Effect.exit)

          if (Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause) && !Cause.hasDies(exit.cause)) {
            aborted = true
          }
          yield* finish

          if (Exit.isFailure(exit) && !aborted && !Cause.hasInterruptsOnly(exit.cause)) {
            return yield* Effect.failCause(exit.cause)
          }

          return { info: msg, parts: [part] }
        }),
      )
    })

    const getModel = Effect.fn("SessionPrompt.getModel")(function* (
      providerID: ProviderV2.ID,
      modelID: ModelV2.ID,
      sessionID: SessionID,
    ) {
      const exit = yield* provider.getModel(providerID, modelID).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) return exit.value
      const err = Cause.squash(exit.cause)
      if (Provider.ModelNotFoundError.isInstance(err)) {
        const hint = err.suggestions?.length ? ` Did you mean: ${err.suggestions.join(", ")}?` : ""
        yield* events.publish(Session.Event.Error, {
          sessionID,
          error: new NamedError.Unknown({
            message: `Model not found: ${err.providerID}/${err.modelID}.${hint}`,
          }).toObject(),
        })
      }
      return yield* Effect.die(err)
    })

    const currentModel = Effect.fnUntraced(function* (sessionID: SessionID) {
      const current = yield* db
        .select({ model: SessionTable.model })
        .from(SessionTable)
        .where(eq(SessionTable.id, sessionID))
        .get()
        .pipe(Effect.orDie)
      if (current?.model) {
        return {
          providerID: ProviderV2.ID.make(current.model.providerID),
          modelID: ModelV2.ID.make(current.model.id),
          ...(current.model.variant && current.model.variant !== "default" ? { variant: current.model.variant } : {}),
        }
      }
      const match = yield* sessions
        .findMessage(sessionID, (m) => m.info.role === "user" && !!m.info.model)
        .pipe(Effect.orDie)
      if (Option.isSome(match) && match.value.info.role === "user") return match.value.info.model
      return yield* provider.defaultModel().pipe(Effect.orDie)
    })

    const createUserMessage = Effect.fn("SessionPrompt.createUserMessage")(function* (input: TurnInput) {
      const agentName = input.agent
      const ag = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!ag) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }

      const model = input.model ?? ag.model ?? (yield* currentModel(input.sessionID))
      const same = ag.model && model.providerID === ag.model.providerID && model.modelID === ag.model.modelID
      const full =
        !input.variant && ag.variant && same
          ? yield* provider
              .getModel(model.providerID, model.modelID)
              .pipe(Effect.catchIf(Provider.ModelNotFoundError.isInstance, () => Effect.succeed(undefined)))
          : undefined
      const variant = input.variant ?? (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)

      const info: SessionV1.User = {
        id: input.messageID ?? MessageID.ascending(),
        role: "user",
        sessionID: input.sessionID,
        time: { created: Date.now() },
        tools: input.tools,
        permission: input.turnPermission?.map((rule) => ({ ...rule })),
        agent: ag.name,
        model: {
          providerID: model.providerID,
          modelID: model.modelID,
          variant,
          ...(input.explicitModel ? { explicit: true } : {}),
        },
        system: input.system,
        format: input.format,
      }

      const current = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      if (
        current.agent !== info.agent ||
        current.model?.providerID !== info.model.providerID ||
        current.model?.id !== info.model.modelID ||
        (current.model?.variant === "default" ? undefined : current.model?.variant) !== info.model.variant
      ) {
        yield* sessions.setAgentModel({
          sessionID: input.sessionID,
          agent: info.agent,
          model: {
            id: info.model.modelID,
            providerID: info.model.providerID,
            variant: info.model.variant ?? "default",
          },
          time: info.time.created,
        })
      }

      yield* Effect.addFinalizer(() => instruction.clear(info.id))

      type Draft<T> = T extends SessionV1.Part ? Omit<T, "id"> & { id?: string } : never
      const assign = (part: Draft<SessionV1.Part>): SessionV1.Part => ({
        ...part,
        id: part.id ? PartID.make(part.id) : PartID.ascending(),
      })

      // Synthetic line that tells the model where the image is on disk. Empty when no path is known.
      const imagePathParts = (part: PromptFilePart, filepath: string | undefined): Draft<SessionV1.Part>[] => {
        if (!filepath) return []
        const label = part.source?.text?.value ?? part.filename ?? "Image"
        return [
          {
            messageID: info.id,
            sessionID: input.sessionID,
            type: "text",
            synthetic: true,
            text: `${label} saved at ${filepath}`,
          },
        ]
      }

      // Path of a pasted image. A real file the client already points at is used in place; other
      // bytes are saved first. Undefined when the save fails, so the prompt still goes through.
      const savePastedImage = Effect.fnUntraced(function* (part: PromptFilePart) {
        const sourcePath = part.source?.type === "file" ? part.source.path : undefined
        if (sourcePath && path.isAbsolute(sourcePath) && (yield* fsys.isFile(sourcePath))) return sourcePath
        if (!/^data:[^,]*;base64,/.test(part.url)) return undefined
        const dir = imageDir((yield* config.get()).attachment?.image?.save_dir)
        const bytes = Buffer.from(part.url.slice(part.url.indexOf(",") + 1), "base64")
        return yield* imageSaveLock.withPermits(1)(writeImage(fsys, dir, bytes, part.mime)).pipe(
          Effect.catch((error) => Effect.logWarning("failed to save image", { error, dir }).pipe(Effect.as(undefined))),
        )
      })

      const resolvePart: (part: PromptInput["parts"][number]) => Effect.Effect<Draft<SessionV1.Part>[]> = Effect.fn(
        "SessionPrompt.resolveUserPart",
      )(function* (part) {
        if (part.type === "file") {
          if (part.source?.type === "resource") {
            const { clientName, uri } = part.source
            yield* Effect.logInfo("mcp resource", { clientName, uri, mime: part.mime })
            const pieces: Draft<SessionV1.Part>[] = [
              {
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Reading MCP resource: ${part.filename} (${uri})`,
              },
            ]
            const exit = yield* mcp.readResource(clientName, uri).pipe(Effect.exit)
            if (Exit.isSuccess(exit)) {
              const content = exit.value
              if (!content) throw new Error(`Resource not found: ${clientName}/${uri}`)
              const items = Array.isArray(content.contents) ? content.contents : [content.contents]
              for (const c of items) {
                if (!c || typeof c !== "object") continue
                if ("text" in c && typeof c.text === "string" && c.text) {
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: c.text,
                  })
                } else if ("blob" in c && typeof c.blob === "string" && c.blob) {
                  const mime = "mimeType" in c && typeof c.mimeType === "string" ? c.mimeType : part.mime
                  const filename = "uri" in c && typeof c.uri === "string" ? c.uri : part.filename
                  const size = mcpResourceBase64Size(c.blob)
                  if (!SUPPORTED_MCP_RESOURCE_ATTACHMENT_MIMES.has(mime)) {
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `[Binary MCP resource omitted: ${filename ?? uri} (${mime}, ${formatMcpResourceBytes(size)}) is not a supported attachment type]`,
                    })
                    continue
                  }
                  if (size > MAX_MCP_RESOURCE_BLOB_BYTES) {
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `[Binary MCP resource omitted: ${filename ?? uri} (${mime}, ${formatMcpResourceBytes(size)}) exceeds ${formatMcpResourceBytes(MAX_MCP_RESOURCE_BLOB_BYTES)}]`,
                    })
                    continue
                  }
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `[Binary MCP resource attached: ${filename ?? uri} (${mime})]`,
                  })
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "file",
                    mime,
                    filename,
                    url: `data:${mime};base64,${c.blob}`,
                  })
                }
              }
            } else {
              const error = Cause.squash(exit.cause)
              yield* Effect.logError("failed to read MCP resource", { error, clientName, uri })
              const message = error instanceof Error ? error.message : String(error)
              pieces.push({
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text: `Failed to read MCP resource ${part.filename}: ${message}`,
              })
            }
            return pieces
          }
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: decodeDataUrl(part.url),
                  },
                  { ...part, messageID: info.id, sessionID: input.sessionID },
                ]
              }
              if (part.mime.startsWith("image/")) {
                const filepath = yield* savePastedImage(part)
                return [{ ...part, messageID: info.id, sessionID: input.sessionID }, ...imagePathParts(part, filepath)]
              }
              break
            case "file:": {
              yield* Effect.logInfo("file", { mime: part.mime })
              const filepath = fileURLToPath(part.url)
              const mime = (yield* fsys.isDir(filepath)) ? "application/x-directory" : part.mime

              const { read } = yield* registry.named()
              const execRead = (args: Parameters<typeof read.execute>[0], extra?: Tool.Context["extra"]) => {
                const controller = new AbortController()
                return read
                  .execute(args, {
                    sessionID: input.sessionID,
                    abort: controller.signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true, ...extra },
                    messages: [],
                    metadata: () => Effect.void,
                    ask: () => Effect.void,
                  })
                  .pipe(Effect.onInterrupt(() => Effect.sync(() => controller.abort())))
              }

              if (mime === "text/plain") {
                let offset: number | undefined
                let limit: number | undefined
                const range = { start: url.searchParams.get("start"), end: url.searchParams.get("end") }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  if (start === end) {
                    const symbols = yield* lsp.documentSymbol(filePathURI).pipe(Effect.catch(() => Effect.succeed([])))
                    for (const symbol of symbols) {
                      let r: LSP.Range | undefined
                      if ("range" in symbol) r = symbol.range
                      else if ("location" in symbol) r = symbol.location.range
                      if (r?.start?.line && r?.start?.line === start) {
                        start = r.start.line
                        end = r?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start, 1)
                  if (end) limit = end - (offset - 1)
                }
                const args = { filePath: filepath, offset, limit }
                const pieces: Draft<SessionV1.Part>[] = [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]
                const exit = yield* provider.getModel(info.model.providerID, info.model.modelID).pipe(
                  Effect.flatMap((mdl) => execRead(args, { model: mdl })),
                  Effect.exit,
                )
                if (Exit.isSuccess(exit)) {
                  const result = exit.value
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  })
                  if (result.attachments?.length) {
                    pieces.push(
                      ...result.attachments.map((a) => ({
                        ...a,
                        synthetic: true,
                        filename: a.filename ?? part.filename,
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })),
                    )
                  } else {
                    pieces.push({ ...part, mime, messageID: info.id, sessionID: input.sessionID })
                  }
                } else {
                  const error = Cause.squash(exit.cause)
                  yield* Effect.logError("failed to read file", { error, filepath })
                  const message = error instanceof Error ? error.message : String(error)
                  yield* events.publish(Session.Event.Error, {
                    sessionID: input.sessionID,
                    error: new NamedError.Unknown({ message }).toObject(),
                  })
                  pieces.push({
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                  })
                }
                return pieces
              }

              if (mime === "application/x-directory") {
                const args = { filePath: filepath }
                const exit = yield* execRead(args).pipe(Effect.exit)
                if (Exit.isFailure(exit)) {
                  const error = Cause.squash(exit.cause)
                  yield* Effect.logError("failed to read directory", { error, filepath })
                  const message = error instanceof Error ? error.message : String(error)
                  yield* events.publish(Session.Event.Error, {
                    sessionID: input.sessionID,
                    error: new NamedError.Unknown({ message }).toObject(),
                  })
                  return [
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    },
                  ]
                }
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: exit.value.output,
                  },
                  { ...part, mime, messageID: info.id, sessionID: input.sessionID },
                ]
              }

              return [
                {
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Called the Read tool with the following input: {"filePath":"${filepath}"}`,
                },
                {
                  id: part.id,
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url:
                    `data:${mime};base64,` +
                    Buffer.from(yield* fsys.readFile(filepath).pipe(Effect.catch(Effect.die))).toString("base64"),
                  mime,
                  filename: part.filename!,
                  source: part.source,
                },
                ...imagePathParts(part, mime.startsWith("image/") ? filepath : undefined),
              ]
            }
          }
        }

        if (part.type === "agent") {
          const perm = Permission.evaluate("task", part.name, ag.permission)
          const hint = perm.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
          return [
            { ...part, messageID: info.id, sessionID: input.sessionID },
            {
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name +
                hint,
            },
          ]
        }

        return [{ ...part, messageID: info.id, sessionID: input.sessionID }]
      })

      const resolvedParts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: "unbounded" }).pipe(
        Effect.map((x) => x.flat().map(assign)),
      )

      yield* plugin.trigger(
        "chat.message",
        {
          sessionID: input.sessionID,
          agent: input.agent,
          model: input.model,
          messageID: input.messageID,
          variant: input.variant,
        },
        { message: info, parts: resolvedParts },
      )

      const parts = yield* Effect.forEach(resolvedParts, (part) =>
        part.type === "file" && part.mime.startsWith("image/")
          ? image.normalize(part).pipe(
              Effect.catchIf(
                (error) => error instanceof Image.ResizerUnavailableError,
                () => Effect.succeed(part),
              ),
            )
          : Effect.succeed(part),
      )

      const parsed = decodeMessageInfo(info, { errors: "all", propertyOrder: "original" })
      if (Exit.isFailure(parsed)) {
        yield* Effect.logError("invalid user message before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          agent: info.agent,
          model: info.model,
          cause: Cause.pretty(parsed.cause),
        })
      }
      for (const [index, part] of parts.entries()) {
        const p = decodeMessagePart(part, { errors: "all", propertyOrder: "original" })
        if (Exit.isSuccess(p)) continue
        yield* Effect.logError("invalid user part before save", {
          sessionID: input.sessionID,
          messageID: info.id,
          partID: part.id,
          partType: part.type,
          index,
          cause: Cause.pretty(p.cause),
          part,
        })
      }

      yield* sessions.updateMessage(info)
      for (const part of parts) yield* sessions.updatePart(part)

      return { info, parts }
    }, Effect.scoped)

    const prompt: (input: TurnInput) => Effect.Effect<SessionV1.WithParts, Image.Error | Session.BusyError> = Effect.fn(
      "SessionPrompt.prompt",
    )(function* (input: TurnInput) {
      if (!input.noReply) yield* state.assertAvailable(input.sessionID)
      const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
      yield* revert.cleanup(session)
      const message = yield* createUserMessage(input)
      if (input.persisted) yield* input.persisted
      yield* sessions.touch(input.sessionID)

      const permissions: PermissionV1.Rule[] = []
      for (const [t, enabled] of Object.entries(input.tools ?? {})) {
        permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
      }
      if (permissions.length > 0) {
        session.permission = Permission.merge(session.permission ?? [], permissions)
        yield* sessions.setPermission({ sessionID: session.id, permission: session.permission })
      }

      if (input.noReply === true) return message
      // Every real prompt (new session or reopening a complete/failed one) marks the root session in progress.
      if (!session.parentID && !session.sessionInProgress) {
        yield* sessions.setSessionInProgress({ sessionID: session.id, sessionInProgress: true })
      }
      return yield* loop({ sessionID: input.sessionID })
    })

    const lastAssistant = Effect.fnUntraced(function* (sessionID: SessionID) {
      const match = yield* sessions.findMessage(sessionID, (m) => m.info.role !== "user").pipe(Effect.orDie)
      if (Option.isSome(match)) return match.value
      const msgs = yield* sessions.messages({ sessionID, limit: 1 }).pipe(Effect.orDie)
      if (msgs.length > 0) return msgs[0]
      throw new Error("Impossible")
    })

    const runLoop: (sessionID: SessionID) => Effect.Effect<SessionV1.WithParts> = Effect.fn("SessionPrompt.run")(
      function* (sessionID: SessionID) {
        const ctx = yield* InstanceState.context
        let structured: unknown
        let step = 0
        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)

        while (true) {
          yield* status.set(sessionID, { type: "busy" })
          yield* Effect.logInfo("loop", { "session.id": sessionID, step })

          let msgs = yield* MessageV2.filterCompactedEffect(sessionID).pipe(
            Effect.provideService(Database.Service, database),
          )

          const { user: lastUser, assistant: lastAssistant, finished: lastFinished, tasks } = MessageV2.latest(msgs)

          if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

          const lastAssistantMsg = msgs.findLast(
            (msg) => msg.info.role === "assistant" && msg.info.id === lastAssistant?.id,
          )
          // Some providers return "stop" even when the assistant message contains
          // tool calls. Keep the loop running so tool results can be sent back to
          // the model, but ignore cleanup-marked interrupted orphans.
          const hasToolCalls =
            lastAssistantMsg?.parts.some(
              (part) => part.type === "tool" && !part.metadata?.providerExecuted && !isOrphanedInterruptedTool(part),
            ) ?? false

          if (
            lastAssistant?.finish &&
            !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
            !hasToolCalls &&
            lastAssistant.parentID === lastUser.id
          ) {
            const lastUserMsg = msgs.findLast((message) => message.info.id === lastUser.id)
            if (lastUserMsg && SessionHandoff.isHandoffMessage(lastUserMsg)) {
              const lastAssistantFull = msgs.findLast((message) => message.info.id === lastAssistant.id)
              if (
                lastAssistantFull &&
                !lastAssistant.error &&
                lastAssistant.finish !== "error"
              ) {
                const summary = SessionHandoff.assistantText(lastAssistantFull)
                if (summary) {
                  const original = msgs.findLast(
                    (message) => message.info.role === "user" && !SessionHandoff.isHandoffMessage(message),
                  )
                  const child = yield* handoff.finish({
                    fromID: sessionID,
                    summary,
                    lastUser,
                    origin: session,
                    permission:
                      original?.info.role === "user" ? (original.info.permission ?? session.permission) : session.permission,
                  })
                  if (child) {
                    yield* loop({ sessionID: child.id }).pipe(
                      Effect.catchCause((cause) =>
                        Effect.logError("Handoff kickoff failed", { sessionID: child.id, cause }),
                      ),
                      Effect.forkDetach,
                    )
                  }
                }
              }
              yield* Effect.logInfo("exiting loop after handoff", { "session.id": sessionID })
              break
            }
            const orphan = lastAssistantMsg?.parts.find(
              (part): part is SessionV1.ToolPart => part.type === "tool" && isOrphanedInterruptedTool(part),
            )
            if (orphan) {
              yield* Effect.logWarning("loop exit with orphaned interrupted tool", {
                "session.id": sessionID,
                messageID: lastAssistant.id,
                tool: orphan.tool,
                callID: orphan.callID,
              })
            }
            const cfg = yield* config.get()
            const action = lastFinished ? limitAction(cfg, lastFinished.providerID) : undefined
            // Resolve the model only when a limit applies, so a finished turn whose model left the config still exits.
            if (
              lastFinished &&
              lastFinished.summary !== true &&
              !lastFinished.error &&
              action &&
              action !== "off" &&
              SessionHandoff.canAutoHandoff({ session, messages: msgs })
            ) {
              const model = yield* getModel(lastFinished.providerID, lastFinished.modelID, sessionID)
              if (overLimit({ cfg, tokens: lastFinished.tokens, model, outputTokenMax: flags.outputTokenMax })) {
                if (action === "handoff") {
                  yield* handoff.enqueue({
                    sessionID,
                    agent: lastUser.agent,
                    model: lastUser.model,
                  })
                  continue
                }
                yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
                continue
              }
            }
            yield* Effect.logInfo("exiting loop", { "session.id": sessionID })
            break
          }

          step++
          if (step === 1)
            yield* startTitle({
              sessionID,
              modelID: lastUser.model.modelID,
              providerID: lastUser.model.providerID,
              history: msgs,
            }).pipe(Effect.catchCause((cause) => Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.logWarning("failed to start title generation", { sessionID, error: Cause.squash(cause) })))

          const model = yield* getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
          const task = tasks.pop()

          if (task?.type === "subtask") {
            yield* handleSubtask({ task, model, lastUser, sessionID, session, msgs })
            continue
          }

          if (task?.type === "compaction") {
            const result = yield* compaction.process({
              messages: msgs,
              parentID: lastUser.id,
              sessionID,
              auto: task.auto,
              overflow: task.overflow,
            })
            if (result === "stop") break
            continue
          }

          if (lastFinished && lastFinished.summary !== true) {
            const cfg = yield* config.get()
            const overflowed = yield* compaction.isOverflow({ tokens: lastFinished.tokens, model })
            const limited =
              limitAction(cfg, model.providerID) === "compact" &&
              overLimit({ cfg, tokens: lastFinished.tokens, model, outputTokenMax: flags.outputTokenMax })
            if (overflowed || limited) {
              yield* compaction.create({ sessionID, agent: lastUser.agent, model: lastUser.model, auto: true })
              continue
            }
          }

          const agent = yield* agents.get(lastUser.agent)
          if (!agent) {
            const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
            const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
            const error = new NamedError.Unknown({ message: `Agent not found: "${lastUser.agent}".${hint}` })
            yield* events.publish(Session.Event.Error, { sessionID, error: error.toObject() })
            throw error
          }
          const maxSteps = agent.steps ?? Infinity
          const isLastStep = step >= maxSteps
          msgs = yield* SessionReminders.apply({ messages: msgs, agent, session }).pipe(
            Effect.provideService(RuntimeFlags.Service, flags),
            Effect.provideService(FSUtil.Service, fsys),
            Effect.provideService(Session.Service, sessions),
          )

          const msg: SessionV1.Assistant = {
            id: MessageID.ascending(),
            parentID: lastUser.id,
            role: "assistant",
            mode: agent.name,
            agent: agent.name,
            variant: lastUser.model.variant,
            path: { cwd: ctx.directory, root: ctx.worktree },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
            modelID: model.id,
            providerID: model.providerID,
            time: { created: Date.now() },
            sessionID,
          }
          yield* sessions.updateMessage(msg)

          const finalizeInterruptedAssistant = Effect.gen(function* () {
            if (msg.time.completed) return
            msg.error ??= MessageV2.fromError(new DOMException("Aborted", "AbortError"), {
              providerID: msg.providerID,
              aborted: true,
            })
            msg.time.completed = Date.now()
            yield* sessions.updateMessage(msg)
          })

          const handle = yield* processor
            .create({
              assistantMessage: msg,
              sessionID,
              model,
            })
            .pipe(Effect.onInterrupt(() => finalizeInterruptedAssistant))

          const outcome: "break" | "continue" = yield* Effect.gen(function* () {
            const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
            const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false
            const promptOps = yield* ops()

            // Command rules stay on this user message; legacy boolean tools still work.
            const turnPermission = Permission.merge(
              session.permission ?? [],
              Object.entries(lastUser.tools ?? {}).map(([tool, enabled]) => ({
                permission: tool,
                action: enabled ? ("allow" as const) : ("deny" as const),
                pattern: "*",
              })),
              lastUser.permission ?? [],
            )
            const tools = yield* SessionTools.resolve({
              agent,
              session: { ...session, permission: turnPermission },
              model,
              processor: handle,
              bypassAgentCheck,
              messages: msgs,
              promptOps,
            }).pipe(
              Effect.provideService(Plugin.Service, plugin),
              Effect.provideService(Permission.Service, permission),
              Effect.provideService(ToolRegistry.Service, registry),
              Effect.provideService(MCP.Service, mcp),
              Effect.provideService(Truncate.Service, truncate),
              Effect.provideService(RuntimeFlags.Service, flags),
            )

            if (lastUser.format?.type === "json_schema") {
              tools["StructuredOutput"] = createStructuredOutputTool({
                schema: lastUser.format.schema,
                onSuccess(output) {
                  structured = output
                },
              })
            }

            if (step === 1)
              yield* summary.summarize({ sessionID, messageID: lastUser.id }).pipe(Effect.ignore, Effect.forkIn(scope))

            yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

            const modelKey = `${model.providerID}/${model.id}`
            // Claude Code brings its own environment, instructions and skills and takes only the agent prompt.
            const claudeCode = isClaudeCodeProvider(model.providerID)
            const [skills, env, instructions, base, mcpInstructions, modelMsgs] = yield* Effect.all([
              claudeCode ? Effect.succeed(undefined) : sys.skills(agent),
              claudeCode ? Effect.succeed([]) : sys.environment(model),
              claudeCode ? Effect.succeed([]) : instruction.system(modelKey).pipe(Effect.orDie),
              agent.prompt ? Effect.succeed(undefined) : instruction.base(modelKey).pipe(Effect.orDie),
              claudeCode ? Effect.succeed(undefined) : sys.mcp(agent, turnPermission),
              MessageV2.toModelMessagesEffect(msgs, model),
            ])
            const system = [
              ...env,
              ...instructions,
              ...(mcpInstructions ? [mcpInstructions] : []),
              ...(skills ? [skills] : []),
            ]
            const format = lastUser.format ?? { type: "text" as const }
            if (format.type === "json_schema") system.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)
            // A matching `instructionsByModel` base stands in for the built-in provider prompt.
            const result = yield* handle.process({
              user: lastUser,
              agent: base ? { ...agent, prompt: base } : agent,
              permission: turnPermission,
              sessionID,
              parentSessionID: session.parentID,
              system,
              messages: [
                ...modelMsgs,
                ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS_PROMPT }] : []),
              ],
              tools,
              model,
              toolChoice: format.type === "json_schema" ? "required" : undefined,
              compactionBoundary: msgs.find((m) => m.info.role === "assistant" && m.info.summary)?.info.id,
            })

            if (structured !== undefined) {
              handle.message.structured = structured
              handle.message.finish = handle.message.finish ?? "stop"
              yield* sessions.updateMessage(handle.message)
              return "break" as const
            }

            const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)
            if (finished && !handle.message.error) {
              // Surface any content-filter finish (e.g. Anthropic stop_reason:
              // refusal) as an error. These turns may have produced no visible
              // output at all - previously the session went idle silently - or
              // partial text that was cut off by the provider's filter.
              if (handle.message.finish === "content-filter") {
                handle.message.error = new SessionV1.ContentFilterError({
                  message: "The response was blocked by the provider's content filter",
                }).toObject()
                yield* sessions.updateMessage(handle.message)
                yield* events.publish(Session.Event.Error, { sessionID, error: handle.message.error })
                return "break" as const
              }
              if (format.type === "json_schema") {
                handle.message.error = new SessionV1.StructuredOutputError({
                  message: "Model did not produce structured output",
                  retries: 0,
                }).toObject()
                yield* sessions.updateMessage(handle.message)
                return "break" as const
              }
            }

            if (result === "stop") return "break" as const
            if (result === "compact") {
              yield* compaction.create({
                sessionID,
                agent: lastUser.agent,
                model: lastUser.model,
                auto: true,
                overflow: !handle.message.finish,
              })
            }
            return "continue" as const
          }).pipe(
            Effect.ensuring(instruction.clear(handle.message.id)),
            Effect.onInterrupt(() => finalizeInterruptedAssistant),
          )
          if (outcome === "break") break
          continue
        }

        yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))
        return yield* lastAssistant(sessionID)
      },
    )

    const loop: (input: LoopInput) => Effect.Effect<SessionV1.WithParts> = Effect.fn("SessionPrompt.loop")(function* (
      input: LoopInput,
    ) {
      return yield* state.ensureRunning(input.sessionID, lastAssistant(input.sessionID), runLoop(input.sessionID))
    })

    const shell: (input: ShellInput) => Effect.Effect<SessionV1.WithParts, Session.BusyError> = Effect.fn(
      "SessionPrompt.shell",
    )(function* (input: ShellInput) {
      const ready = yield* Latch.make()
      return yield* state.startShell(input.sessionID, lastAssistant(input.sessionID), shellImpl(input, ready), ready)
    })

    const command = Effect.fn("SessionPrompt.command")(function* (input: CommandInput) {
      yield* Effect.logInfo("command", {
        "session.id": input.sessionID,
        command: input.command,
        agent: input.agent,
      })
      const names = [...new Set([input.command, ...(input.additionalCommands ?? [])])]
      const available = yield* commands.list()
      const byName = new Map(available.map((definition) => [definition.name, definition]))
      const definitions = names.map((name) => byName.get(name))
      const missing = names.find((_, index) => !definitions[index])
      if (missing !== undefined) {
        const hint = available.length ? ` Available commands: ${available.map((c) => c.name).join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Command not found: "${missing}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }
      const selected = definitions.filter((definition) => definition !== undefined)
      const incompatible = selected
        .slice(1)
        .find(
          (definition) =>
            definition.agent !== undefined || definition.model !== undefined || definition.subtask === true,
        )
      if (incompatible) {
        const error = new NamedError.Unknown({
          message: `Command "/${incompatible.name}" selects an agent, model, or subtask. Run it first or separately.`,
        })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }
      const cmd = selected[0]
      const agentName = cmd.agent ?? input.agent
      const turnPermission = selected.some((definition) => definition.permission !== undefined)
        ? Permission.merge(...selected.map((definition) => Permission.fromConfig(definition.permission ?? {})))
        : undefined

      const raw = input.arguments.match(argsRegex) ?? []
      const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))
      const templates = yield* Effect.forEach(
        selected,
        Effect.fnUntraced(function* (definition) {
          const templateCommand = yield* Effect.promise(async () => definition.template)

          const placeholders = templateCommand.match(placeholderRegex) ?? []
          let last = 0
          for (const item of placeholders) {
            const value = Number(item.slice(1))
            if (value > last) last = value
          }

          const withArgs = templateCommand.replaceAll(placeholderRegex, (_, index) => {
            const position = Number(index)
            const argIndex = position - 1
            if (argIndex >= args.length) return ""
            if (position === last) return args.slice(argIndex).join(" ")
            return args[argIndex]
          })
          const usesArgumentsPlaceholder = templateCommand.includes("$ARGUMENTS")
          let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

          if (
            selected.length === 1 &&
            placeholders.length === 0 &&
            !usesArgumentsPlaceholder &&
            input.arguments.trim()
          ) {
            template = template + "\n\n" + input.arguments
          }

          const shellMatches = ConfigMarkdown.shell(template)
          if (shellMatches.length > 0) {
            const cfg = yield* config.get()
            const sh = Shell.preferred(cfg.shell)
            const results = yield* Effect.forEach(
              shellMatches,
              ([, cmd]) =>
                Effect.gen(function* () {
                  if (turnPermission) {
                    const session = yield* sessions.get(input.sessionID).pipe(Effect.orDie)
                    const agent = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
                    yield* permission.ask({
                      sessionID: input.sessionID,
                      permission: "bash",
                      patterns: [cmd],
                      always: [cmd],
                      metadata: { command: cmd },
                      ruleset: Permission.merge(agent?.permission ?? [], session.permission ?? [], turnPermission),
                    }).pipe(Effect.orDie)
                  }
                  const handle = yield* spawner.spawn(
                    ChildProcess.make(sh, Shell.args(sh, cmd, process.cwd()), {
                      stdin: "ignore",
                      stdout: "pipe",
                      stderr: "ignore",
                      forceKillAfter: "3 seconds",
                    }),
                  )
                  const text = yield* Stream.mkString(Stream.decodeText(handle.stdout))
                  yield* handle.exitCode
                  return text
                }).pipe(
                  Effect.scoped,
                  Effect.catch(() => Effect.succeed("")),
                ),
              { concurrency: "unbounded" },
            )
            let index = 0
            template = template.replace(bashRegex, () => results[index++])
          }
          return template.trim()
        }),
      )
      const template =
        selected.length === 1
          ? `[/${cmd.name} is active: its instructions replace any earlier slash command's persona, mode, and rules from this conversation.]\n\n${templates[0]}`
          : [
              "Apply all listed slash commands together to the user request below.",
              "They are complementary unless their instructions directly conflict.",
              "For direct conflicts at the same instruction priority, later command instructions take precedence.",
              "These commands replace any earlier slash command's persona, mode, and rules from this conversation.",
              "Follow higher-priority instructions and permission restrictions. Writing a plan does not authorize implementing it.",
              "",
              ...selected.map((definition, index) => `[/${definition.name}]\n${templates[index]}\n`),
              `[User request]\n${input.arguments}`,
            ].join("\n")

      const taskModel = yield* Effect.gen(function* () {
        if (cmd.model) return Provider.parseModel(cmd.model)
        if (cmd.agent) {
          const cmdAgent = yield* agents.get(cmd.agent)
          if (cmdAgent?.model) return cmdAgent.model
        }
        if (input.model) return Provider.parseModel(input.model)
        return yield* currentModel(input.sessionID)
      })

      yield* getModel(taskModel.providerID, taskModel.modelID, input.sessionID)

      const agent = agentName ? yield* agents.get(agentName) : yield* agents.defaultInfo()
      if (!agent) {
        const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
        const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
        const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
        yield* events.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
        throw error
      }

      const templateParts = yield* resolvePromptParts(template)
      const inputFiles = new Set(
        input.parts?.filter((part) => new URL(part.url).protocol === "file:").map((part) => fileURLToPath(part.url)),
      )
      const uniqueTemplateParts = templateParts
        .filter((part) => part.type !== "file" || !inputFiles.has(fileURLToPath(part.url)))
        .map((part) =>
          part.type === "text"
            ? { ...part, metadata: { ...part.metadata, ocCommandArguments: input.arguments } }
            : part,
        )
      const isSubtask = (agent.mode === "subagent" && cmd.subtask !== false) || cmd.subtask === true
      const parts = isSubtask
        ? [
            {
              type: "subtask" as const,
              agent: agent.name,
              description: cmd.description ?? "",
              command: input.command,
              model: { providerID: taskModel.providerID, modelID: taskModel.modelID },
              prompt: templateParts.find((y) => y.type === "text")?.text ?? "",
            },
          ]
        : [...uniqueTemplateParts, ...(input.parts ?? [])]

      const userAgent = isSubtask ? (input.agent ?? (yield* agents.defaultInfo()).name) : agent.name
      const userModel = isSubtask
        ? input.model
          ? Provider.parseModel(input.model)
          : yield* currentModel(input.sessionID)
        : taskModel

      yield* plugin.trigger(
        "command.execute.before",
        { command: input.command, sessionID: input.sessionID, arguments: input.arguments },
        { parts },
      )

      const result = yield* prompt({
        sessionID: input.sessionID,
        messageID: input.messageID,
        model: userModel,
        agent: userAgent,
        parts,
        variant: input.variant,
        turnPermission,
      })
      yield* events.publish(Command.Event.Executed, {
        name: input.command,
        sessionID: input.sessionID,
        arguments: input.arguments,
        messageID: result.info.id,
      })
      return result
    })

    // Queued prompts. One drain per session holds `draining` from claim until its turn ends, so no second
    // claim can slip in between a prompt being saved and its run starting. A drain keeps going while each
    // turn ends successfully; a second caller returns because the active drain picks up the next entry.
    const draining = new Set<SessionID>()
    const dispatchHead: (sessionID: SessionID) => Effect.Effect<boolean> = Effect.fn("SessionPrompt.dispatchQueued")(function* (sessionID: SessionID) {
      const idle = Effect.exit(state.assertNotBusy(sessionID)).pipe(Effect.map(Exit.isSuccess))
      const queued = yield* queue.claim(sessionID, idle)
      if (!queued) {
        const snapshot = yield* queue.snapshot(sessionID)
        const head = snapshot.entries[0]
        if (snapshot.pause !== "none" || head?.state !== "pending") return false
        // The turn ended between the failed claim and now: claim again instead of waiting for a run that is over.
        if (yield* idle) return yield* dispatchHead(sessionID)
        // Busy: wait out maintenance, then the run in progress, then drain again.
        yield* Effect.gen(function* () {
          yield* state.available(sessionID)
          const completion = yield* state.completion(sessionID)
          yield* completion.pipe(
            Effect.flatMap((ok) => (ok ? drainQueue(sessionID) : queue.pause(sessionID, "error"))),
          )
        }).pipe(Effect.forkIn(scope))
        return false
      }
      // Refused during this project's reload: the queue pauses like any failed turn and resumes on demand.
      const exit = yield* gated(
        prompt({ ...queued.payload, sessionID, messageID: queued.id, persisted: queue.complete(queued.id) }),
      ).pipe(Effect.exit)
      if (Exit.isSuccess(exit) && SessionRunState.successfulTurn(exit.value)) return true
      yield* queue.settle(queued.id)
      yield* queue.pause(sessionID, "error")
      return false
    })

    const drainQueue: (sessionID: SessionID) => Effect.Effect<void> = Effect.fn("SessionPrompt.drainQueue")(
      function* (sessionID: SessionID) {
        if (draining.has(sessionID)) return
        draining.add(sessionID)
        const sent = yield* dispatchHead(sessionID).pipe(
          Effect.ensuring(Effect.sync(() => draining.delete(sessionID))),
        )
        if (sent) yield* drainQueue(sessionID)
      },
    )

    const kick = (sessionID: SessionID) =>
      drainQueue(sessionID).pipe(
        Effect.catchCause((cause) => Effect.logError("queue drain failed", { sessionID, cause })),
        Effect.forkIn(scope),
        Effect.asVoid,
      )

    const queueOps: Interface["queue"] = {
      snapshot: queue.snapshot,
      add: (input) => queue.add(input).pipe(Effect.tap(() => kick(input.sessionID))),
      edit: queue.edit,
      cancel: (input) => queue.cancel(input).pipe(Effect.tap(() => kick(input.sessionID))),
      resume: (sessionID) => queue.resume(sessionID).pipe(Effect.tap(() => kick(sessionID))),
    }

    return Service.of({
      cancel,
      prompt: (input) => gatedSession(input.sessionID, prompt(input)),
      loop: (input) => gatedSession(input.sessionID, loop(input)),
      shell: (input) => gatedSession(input.sessionID, shell(input)),
      command: (input) => gatedSession(input.sessionID, command(input)),
      resolvePromptParts,
      rename: (sessionID) => gatedSession(sessionID, rename(sessionID)),
      generate: (input) => gatedSession(input.sessionID, generate(input)),
      queue: queueOps,
    })
  }),
)

function isRealUserMessage(message: SessionV1.WithParts) {
  return message.info.role === "user" && !message.parts.every((part) => "synthetic" in part && part.synthetic)
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

// Single-command runs prepend an active-command header; titles use the task text.
function withoutCommandHeader(text: string) {
  return text.replace(/^\[[^\n]* is active:[^\n]*\]\n\n/, "")
}

const ModelRef = Schema.Struct({
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID,
})

export const PromptInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  model: Schema.optional(ModelRef),
  agent: Schema.optional(Schema.String),
  noReply: Schema.optional(Schema.Boolean),
  tools: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)).annotate({
    description:
      "@deprecated tools and permissions have been merged, you can set permissions on the session itself now",
  }),
  format: Schema.optional(SessionV1.Format),
  system: Schema.optional(Schema.String),
  variant: Schema.optional(Schema.String),
  parts: Schema.Array(
    Schema.Union([
      SessionV1.TextPartInput,
      SessionV1.FilePartInput,
      SessionV1.AgentPartInput,
      SessionV1.SubtaskPartInput,
    ]).annotate({ discriminator: "type" }),
  ),
})
export type PromptInput = Schema.Schema.Type<typeof PromptInput>
// Internal only: command rules are saved on the user message, never the session.
// `persisted` runs once the user message is saved; queued prompts use it to drop their queue row.
// `explicitModel` marks a turn whose caller named its model (`task` with `model`); saved as `model.explicit`.
export type TurnInput = PromptInput & {
  turnPermission?: PermissionV1.Ruleset
  persisted?: Effect.Effect<void>
  explicitModel?: boolean
}

export class LoopInput extends Schema.Class<LoopInput>("SessionPrompt.LoopInput")({
  sessionID: SessionID,
}) {}

export const ShellInput = Schema.Struct({
  sessionID: SessionID,
  messageID: Schema.optional(MessageID),
  agent: Schema.String,
  model: Schema.optional(ModelRef),
  command: Schema.String,
})
export type ShellInput = Schema.Schema.Type<typeof ShellInput>

export const CommandInput = Schema.Struct({
  messageID: Schema.optional(MessageID),
  sessionID: SessionID,
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  arguments: Schema.String,
  command: Schema.String,
  variant: Schema.optional(Schema.String),
  additionalCommands: Schema.optional(Schema.Array(Schema.String)),
  // Inlined (no identifier annotation) to keep the original SDK output - the
  // PromptInput call site below references FilePartInput by ref via the
  // Schema export in message-v2.ts.
  parts: Schema.optional(
    Schema.Array(
      Schema.Union([
        Schema.Struct({
          id: Schema.optional(PartID),
          type: Schema.Literal("file"),
          mime: Schema.String,
          filename: Schema.optional(Schema.String),
          url: Schema.String,
          source: Schema.optional(SessionV1.FilePartSource),
        }),
      ]).annotate({ discriminator: "type" }),
    ),
  ),
})
export type CommandInput = Schema.Schema.Type<typeof CommandInput>

export const GenerateInput = Schema.Struct({
  sessionID: SessionID,
  prompt: Schema.String.check(Schema.isPattern(/\S/)),
  model: Schema.optional(ModelRef),
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

/** @internal Exported for testing */
export function createStructuredOutputTool(input: {
  schema: Record<string, any>
  onSuccess: (output: unknown) => void
}): AITool {
  // Remove $schema property if present (not needed for tool input)
  const { $schema: _, ...toolSchema } = input.schema

  return tool({
    description: STRUCTURED_OUTPUT_DESCRIPTION,
    inputSchema: jsonSchema(toolSchema as JSONSchema7),
    async execute(args) {
      // AI SDK validates args against inputSchema before calling execute()
      input.onSuccess(args)
      return {
        output: "Structured output captured successfully.",
        title: "Structured Output",
        metadata: { valid: true },
      }
    },
    toModelOutput({ output }) {
      return {
        type: "text",
        value: output.output,
      }
    },
  })
}
const bashRegex = /!`([^`]+)`/g
// Match [Image N] as single token, quoted strings, or non-space sequences
const argsRegex = /(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi
const placeholderRegex = /\$(\d+)/g
const quoteTrimRegex = /^["']|["']$/g

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [
    SessionStatus.node,
    Session.node,
    Agent.node,
    Provider.node,
    SessionProcessor.node,
    SessionCompaction.node,
    SessionHandoff.node,
    Plugin.node,
    Command.node,
    Config.node,
    Permission.node,
    FSUtil.node,
    MCP.node,
    LSP.node,
    ToolRegistry.node,
    Truncate.node,
    Image.node,
    CrossSpawnSpawner.node,
    Instruction.node,
    SessionRunState.node,
    SessionRevert.node,
    SessionSummary.node,
    SystemPrompt.node,
    LLM.node,
    EventV2Bridge.node,
    RuntimeFlags.node,
    Database.node,
    Question.node,
    SessionWork.node,
    SessionQueue.node,
  ],
})

export * as SessionPrompt from "./prompt"

