import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Permission } from "@/permission"
import { SessionV1 } from "@opencode-ai/core/v1/session"

import { Session } from "@/session/session"
import { MessageV2 } from "@/session/message-v2"
import { SessionPrompt } from "@/session/prompt"
import { SessionQueue } from "@/session/queue"
import { SessionRevert } from "@/session/revert"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "@/session/todo"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { Snapshot } from "@/snapshot"
import { Schema, Struct } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import {
  ApiNotFoundError,
  ConflictError,
  InvalidRequestError,
  ModelNotFoundError,
  PermissionNotFoundError,
  SessionBusyError,
  TimeoutError,
  UpstreamError,
} from "../errors"
import { described } from "./metadata"
import { QueryBoolean } from "./query"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"

const root = "/session"
export const ListQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  scope: Schema.optional(Schema.Literals(["project"])),
  path: Schema.optional(Schema.String),
  roots: Schema.optional(QueryBoolean),
  start: Schema.optional(Schema.NumberFromString),
  search: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
})
export const DiffQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  ...Struct.omit(SessionSummary.DiffInput.fields, ["sessionID"]),
})
export const MessagesQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  limit: Schema.optional(Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  before: Schema.optional(Schema.String),
})
export const StatusMap = Schema.Record(Schema.String, SessionStatus.Info)
export const UpdatePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  sessionComplete: Schema.optional(Schema.Boolean),
  sessionFailed: Schema.optional(Schema.Boolean),
  sessionInProgress: Schema.optional(Schema.Boolean),
  metadata: Schema.optional(Session.Metadata),
  permission: Schema.optional(PermissionV1.Ruleset),
  time: Schema.optional(
    Schema.Struct({
      archived: Schema.optional(Session.ArchivedTimestamp),
    }),
  ),
})
export const ForkPayload = Schema.Struct(Struct.omit(Session.ForkInput.fields, ["sessionID"]))
export const InitPayload = Schema.Struct({
  modelID: ModelV2.ID,
  providerID: ProviderV2.ID,
  messageID: MessageID,
})
export const SummarizePayload = Schema.Struct({
  providerID: ProviderV2.ID,
  modelID: ModelV2.ID,
  auto: Schema.optional(Schema.Boolean),
})
export const PromptPayload = Schema.Struct(Struct.omit(SessionPrompt.PromptInput.fields, ["sessionID"]))
export const GeneratePayload = Schema.Struct(Struct.omit(SessionPrompt.GenerateInput.fields, ["sessionID"]))
// 422 for providers that cannot run a tool-less side question yet (Claude Code, Cursor).
export class UnsupportedProviderError extends Schema.TaggedErrorClass<UnsupportedProviderError>()(
  "UnsupportedProviderError",
  {
    providerID: Schema.String,
    message: Schema.String,
  },
  { httpApiStatus: 422 },
) {}
export const CommandPayload = Schema.Struct(Struct.omit(SessionPrompt.CommandInput.fields, ["sessionID"]))
export const ShellPayload = Schema.Struct(Struct.omit(SessionPrompt.ShellInput.fields, ["sessionID"]))
export const RevertPayload = Schema.Struct(Struct.omit(SessionRevert.RevertInput.fields, ["sessionID"]))
export const PermissionResponsePayload = Schema.Struct({
  response: PermissionV1.Reply,
})
export const ResumeEntry = Schema.Struct({
  id: Schema.String,
  sessionID: SessionID,
  directory: Schema.String,
  fireAt: Schema.Number,
  reason: Schema.String,
  createdAt: Schema.Number,
  attempts: Schema.Number,
})
export const ResumeState = Schema.Struct({
  enabled: Schema.Boolean,
  prompt: Schema.String,
  entries: Schema.Array(ResumeEntry),
})
export const ResumeEnabledPayload = Schema.Struct({
  enabled: Schema.Boolean,
  prompt: Schema.optional(Schema.String),
})
export const ResumeCancelPayload = Schema.Struct({
  id: Schema.String,
})
// `add` takes the prompt snapshot; the id is optional and makes a repeated add a no-op.
export const QueuePayload = Schema.Union([
  Schema.Struct({ type: Schema.Literal("add"), id: Schema.optional(MessageID), ...SessionQueue.Payload.fields }),
  Schema.Struct({ type: Schema.Literal("edit"), id: MessageID, text: Schema.String }),
  Schema.Struct({ type: Schema.Literal("cancel"), id: MessageID }),
  Schema.Struct({ type: Schema.Literal("resume") }),
]).annotate({ discriminator: "type" })

export const ClaudeAccount = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  current: Schema.Boolean,
  pinned: Schema.optional(Schema.Boolean),
  limitedUntil: Schema.optional(Schema.Number),
})
export const ClaudeAccounts = Schema.Struct({ accounts: Schema.Array(ClaudeAccount) })
// With `sessionID` the call pins/unpins that session (no `id` = unpin); without it, it sets the global account.
export const ClaudeAccountPayload = Schema.Struct({
  id: Schema.optional(Schema.String),
  sessionID: Schema.optional(Schema.String),
})
export const ClaudeAccountQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  sessionID: Schema.optional(Schema.String),
})

export const SessionPaths = {
  list: root,
  status: `${root}/status`,
  get: `${root}/:sessionID`,
  children: `${root}/:sessionID/children`,
  todo: `${root}/:sessionID/todo`,
  diff: `${root}/:sessionID/diff`,
  messages: `${root}/:sessionID/message`,
  message: `${root}/:sessionID/message/:messageID`,
  create: root,
  remove: `${root}/:sessionID`,
  update: `${root}/:sessionID`,
  fork: `${root}/:sessionID/fork`,
  abort: `${root}/:sessionID/abort`,
  share: `${root}/:sessionID/share`,
  init: `${root}/:sessionID/init`,
  summarize: `${root}/:sessionID/summarize`,
  handoff: `${root}/:sessionID/handoff`,
  rename: `${root}/:sessionID/rename`,
  prompt: `${root}/:sessionID/message`,
  promptAsync: `${root}/:sessionID/prompt_async`,
  generate: `${root}/:sessionID/generate`,
  command: `${root}/:sessionID/command`,
  shell: `${root}/:sessionID/shell`,
  revert: `${root}/:sessionID/revert`,
  unrevert: `${root}/:sessionID/unrevert`,
  permissions: `${root}/:sessionID/permissions/:permissionID`,
  deleteMessage: `${root}/:sessionID/message/:messageID`,
  deletePart: `${root}/:sessionID/message/:messageID/part/:partID`,
  updatePart: `${root}/:sessionID/message/:messageID/part/:partID`,
  resumeState: `${root}/resume/state`,
  resumeCancel: `${root}/resume/cancel`,
  queue: `${root}/:sessionID/queue`,
  // Two segments, like the resume routes: a one-segment path is swallowed by `get` (`/session/:sessionID`).
  claudeAccount: `${root}/claude/account`,
} as const

export const SessionApi = HttpApi.make("session")
  .add(
    HttpApiGroup.make("session")
      .add(
        HttpApiEndpoint.get("list", SessionPaths.list, {
          query: ListQuery,
          success: described(Schema.Array(Session.Info), "List of sessions"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.list",
            summary: "List sessions",
            description: "Get a list of all OpenCode sessions, sorted by most recently updated.",
          }),
        ),
        HttpApiEndpoint.get("status", SessionPaths.status, {
          query: WorkspaceRoutingQuery,
          success: described(StatusMap, "Get session status"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.status",
            summary: "Get session status",
            description: "Retrieve the current status of all sessions, including active, idle, and completed states.",
          }),
        ),
        HttpApiEndpoint.get("get", SessionPaths.get, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Session.Info, "Get session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.get",
            summary: "Get session",
            description: "Retrieve detailed information about a specific OpenCode session.",
          }),
        ),
        HttpApiEndpoint.get("children", SessionPaths.children, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Session.Info), "List of children"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.children",
            summary: "Get session children",
            description: "Retrieve all child sessions that were forked from the specified parent session.",
          }),
        ),
        HttpApiEndpoint.get("todo", SessionPaths.todo, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(Todo.Info), "Todo list"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.todo",
            summary: "Get session todos",
            description: "Retrieve the todo list associated with a specific session, showing tasks and action items.",
          }),
        ),
        HttpApiEndpoint.get("diff", SessionPaths.diff, {
          params: { sessionID: SessionID },
          query: DiffQuery,
          success: described(Schema.Array(Snapshot.FileDiff), "Successfully retrieved diff"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.diff",
            summary: "Get message diff",
            description: "Get the file changes (diff) that resulted from a specific user message in the session.",
          }),
        ),
        HttpApiEndpoint.get("messages", SessionPaths.messages, {
          params: { sessionID: SessionID },
          query: MessagesQuery,
          success: described(Schema.Array(SessionV1.WithParts), "List of messages"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.messages",
            summary: "Get session messages",
            description: "Retrieve all messages in a session, including user prompts and AI responses.",
          }),
        ),
        HttpApiEndpoint.get("message", SessionPaths.message, {
          params: { sessionID: SessionID, messageID: MessageID },
          query: WorkspaceRoutingQuery,
          success: described(SessionV1.WithParts, "Message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.message",
            summary: "Get message",
            description: "Retrieve a specific message from a session by its message ID.",
          }),
        ),
        HttpApiEndpoint.post("create", SessionPaths.create, {
          query: WorkspaceRoutingQuery,
          payload: [HttpApiSchema.NoContent, Session.CreateInput],
          success: described(Session.Info, "Successfully created session"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.create",
            summary: "Create session",
            description: "Create a new OpenCode session for interacting with AI assistants and managing conversations.",
          }),
        ),
        HttpApiEndpoint.delete("remove", SessionPaths.remove, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Successfully deleted session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.delete",
            summary: "Delete session",
            description: "Delete a session and permanently remove all associated data, including messages and history.",
          }),
        ),
        HttpApiEndpoint.patch("update", SessionPaths.update, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: UpdatePayload,
          success: described(Session.Info, "Successfully updated session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.update",
            summary: "Update session",
            description: "Update properties of an existing session, such as title or other metadata.",
          }),
        ),
        HttpApiEndpoint.post("fork", SessionPaths.fork, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: [HttpApiSchema.NoContent, ForkPayload],
          success: described(Session.Info, "200"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.fork",
            summary: "Fork session",
            description: "Create a new session by forking an existing session at a specific message point.",
          }),
        ),
        HttpApiEndpoint.post("abort", SessionPaths.abort, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Aborted session"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.abort",
            summary: "Abort session",
            description: "Abort an active session and stop any ongoing AI processing or command execution.",
          }),
        ),
        HttpApiEndpoint.post("init", SessionPaths.init, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: InitPayload,
          success: described(Schema.Boolean, "200"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.init",
            summary: "Initialize session",
            description:
              "Analyze the current application and create an AGENTS.md file with project-specific agent configurations.",
          }),
        ),
        HttpApiEndpoint.post("share", SessionPaths.share, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Session.Info, "Successfully shared session"),
          error: [HttpApiError.InternalServerError, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.share",
            summary: "Share session",
            description: "Create a shareable link for a session, allowing others to view the conversation.",
          }),
        ),
        HttpApiEndpoint.delete("unshare", SessionPaths.share, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Session.Info, "Successfully unshared session"),
          error: [HttpApiError.InternalServerError, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.unshare",
            summary: "Unshare session",
            description: "Remove the shareable link for a session, making it private again.",
          }),
        ),
        HttpApiEndpoint.post("handoff", SessionPaths.handoff, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Started session handoff"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.handoff",
            summary: "Handoff session",
            description: "Write a handoff summary in this session and continue in a linked new session.",
          }),
        ),
        HttpApiEndpoint.post("summarize", SessionPaths.summarize, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: SummarizePayload,
          success: described(Schema.Boolean, "Summarized session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.summarize",
            summary: "Summarize session",
            description: "Generate a concise summary of the session using AI compaction to preserve key information.",
          }),
        ),
        HttpApiEndpoint.post("rename", SessionPaths.rename, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(
            Schema.Struct({ session: Session.Info, model: Schema.optional(Schema.String) }),
            "Renamed session and the provider/model that wrote the title",
          ),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.rename",
            summary: "Rename session",
            description: "Generate a new session title from the conversation using the rename agent.",
          }),
        ),
        HttpApiEndpoint.post("prompt", SessionPaths.prompt, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: PromptPayload,
          success: described(SessionV1.WithParts, "Created message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.prompt",
            summary: "Send message",
            description: "Create and send a new message to a session, streaming the AI response.",
          }),
        ),
        HttpApiEndpoint.post("promptAsync", SessionPaths.promptAsync, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: PromptPayload,
          success: described(HttpApiSchema.NoContent, "Prompt accepted"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.prompt_async",
            summary: "Send async message",
            description:
              "Create and send a new message to a session asynchronously, starting the session if needed and returning immediately.",
          }),
        ),
        HttpApiEndpoint.post("generate", SessionPaths.generate, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: GeneratePayload,
          success: described(SessionPrompt.GenerateResult, "Side answer; the session is not changed"),
          error: [
            HttpApiError.BadRequest,
            ApiNotFoundError,
            InvalidRequestError,
            ModelNotFoundError,
            UnsupportedProviderError,
            UpstreamError,
            TimeoutError,
          ],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.generate",
            summary: "Generate side answer",
            description:
              "Answer a side question from the session's context with one model call, without adding messages, marks, or resume state to the session.",
          }),
        ),
        HttpApiEndpoint.post("command", SessionPaths.command, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: CommandPayload,
          success: described(SessionV1.WithParts, "Created message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.command",
            summary: "Send command",
            description: "Send a new command to a session for execution by the AI assistant.",
          }),
        ),
        HttpApiEndpoint.post("shell", SessionPaths.shell, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: ShellPayload,
          success: described(SessionV1.WithParts, "Created message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.shell",
            summary: "Run shell command",
            description: "Execute a shell command within the session context and return the AI's response.",
          }),
        ),
        HttpApiEndpoint.post("revert", SessionPaths.revert, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: RevertPayload,
          success: described(Session.Info, "Updated session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.revert",
            summary: "Revert message",
            description:
              "Revert a specific message in a session, undoing its effects and restoring the previous state.",
          }),
        ),
        HttpApiEndpoint.post("unrevert", SessionPaths.unrevert, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(Session.Info, "Updated session"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.unrevert",
            summary: "Restore reverted messages",
            description: "Restore all previously reverted messages in a session.",
          }),
        ),
        HttpApiEndpoint.post("permissionRespond", SessionPaths.permissions, {
          params: { sessionID: SessionID, permissionID: PermissionV1.ID },
          query: WorkspaceRoutingQuery,
          payload: PermissionResponsePayload,
          success: described(Schema.Boolean, "Permission processed successfully"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, PermissionNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "permission.respond",
            summary: "Respond to permission",
            description: "Approve or deny a permission request from the AI assistant.",
            deprecated: true,
          }),
        ),
        HttpApiEndpoint.delete("deleteMessage", SessionPaths.deleteMessage, {
          params: { sessionID: SessionID, messageID: MessageID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Successfully deleted message"),
          error: [HttpApiError.BadRequest, ApiNotFoundError, SessionBusyError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.deleteMessage",
            summary: "Delete message",
            description:
              "Permanently delete a specific message and all of its parts from a session without reverting file changes.",
          }),
        ),
        HttpApiEndpoint.delete("deletePart", SessionPaths.deletePart, {
          params: { sessionID: SessionID, messageID: MessageID, partID: PartID },
          query: WorkspaceRoutingQuery,
          success: described(Schema.Boolean, "Successfully deleted part"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "part.delete",
            description: "Delete a part from a message.",
          }),
        ),
        HttpApiEndpoint.patch("updatePart", SessionPaths.updatePart, {
          params: { sessionID: SessionID, messageID: MessageID, partID: PartID },
          query: WorkspaceRoutingQuery,
          payload: SessionV1.Part,
          success: described(SessionV1.Part, "Successfully updated part"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "part.update",
            description: "Update a part in a message.",
          }),
        ),
        HttpApiEndpoint.get("resumeState", SessionPaths.resumeState, {
          query: WorkspaceRoutingQuery,
          success: described(ResumeState, "Scheduled auto-resume state"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.resume.state",
            summary: "Get scheduled resumes",
            description: "Get the auto-resume toggle, prompt, and pending scheduled resume entries.",
          }),
        ),
        HttpApiEndpoint.put("resumeSet", SessionPaths.resumeState, {
          query: WorkspaceRoutingQuery,
          payload: ResumeEnabledPayload,
          success: described(ResumeState, "Updated scheduled auto-resume state"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.resume.set",
            summary: "Set auto-resume",
            description: "Enable or disable automatic resume prompts after usage-limit resets.",
          }),
        ),
        HttpApiEndpoint.post("resumeCancel", SessionPaths.resumeCancel, {
          query: WorkspaceRoutingQuery,
          payload: ResumeCancelPayload,
          success: described(Schema.Boolean, "Cancelled scheduled resume"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.resume.cancel",
            summary: "Cancel scheduled resume",
            description: "Cancel a pending scheduled resume entry by id.",
          }),
        ),
        HttpApiEndpoint.get("queue", SessionPaths.queue, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          success: described(SessionQueue.Snapshot, "Queued prompts and pause state"),
          error: [HttpApiError.BadRequest, ApiNotFoundError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.queue.get",
            summary: "Get queued prompts",
            description:
              "List the prompts queued while the session was busy, oldest first, and why the queue is paused. Queued prompts are kept in the database and survive restarts; a restart pauses them until resumed.",
          }),
        ),
        HttpApiEndpoint.post("queueUpdate", SessionPaths.queue, {
          params: { sessionID: SessionID },
          query: WorkspaceRoutingQuery,
          payload: QueuePayload,
          success: described(SessionQueue.Snapshot, "Queue after the change"),
          error: [HttpApiError.BadRequest, InvalidRequestError, ApiNotFoundError, ConflictError],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.queue.update",
            summary: "Change queued prompts",
            description:
              "Add, edit, or cancel a queued prompt, or resume a paused queue. Only pending prompts can be edited or cancelled; a prompt being sent returns a conflict.",
          }),
        ),
        HttpApiEndpoint.get("claudeAccountState", SessionPaths.claudeAccount, {
          query: ClaudeAccountQuery,
          success: described(ClaudeAccounts, "Claude Code pool accounts"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.claudeAccount.state",
            summary: "Get Claude accounts",
            description: "List the Claude Code pool accounts, the active one, and any usage limits.",
          }),
        ),
        HttpApiEndpoint.put("claudeAccountSet", SessionPaths.claudeAccount, {
          query: WorkspaceRoutingQuery,
          payload: ClaudeAccountPayload,
          success: described(ClaudeAccounts, "Updated Claude Code pool accounts"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "session.claudeAccount.set",
            summary: "Set Claude account",
            description:
              "Make a Claude Code pool account the active one for new turns, or pin/unpin it for one session when sessionID is given.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "session",
          description: "Experimental HttpApi session routes.",
        }),
      )
      .middleware(InstanceContextMiddleware)
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
