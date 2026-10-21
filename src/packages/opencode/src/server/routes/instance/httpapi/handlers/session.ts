import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Agent } from "@/agent/agent"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Command } from "@/command"
import { Config } from "@/config/config"
import { claudeSteerSinks, STEERED_METADATA_KEY } from "@/provider/claude-code/shared"
import { Permission } from "@/permission"
import { SessionShare } from "@/share/session"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import { SessionHandoff } from "@/session/handoff"
import { MessageV2 } from "@/session/message-v2"
import { EffectBridge } from "@/effect/bridge"
import { SessionPrompt } from "@/session/prompt"
import { SessionRevert } from "@/session/revert"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionSummary } from "@/session/summary"
import { Todo } from "@/session/todo"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { NamedError } from "@opencode-ai/core/util/error"
import { Cause, Effect, Exit, Option, Schema, Scope } from "effect"
import * as Stream from "effect/Stream"
import { InstanceState } from "@/effect/instance-state"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiError, HttpApiSchema } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import {
  CommandPayload,
  DiffQuery,
  ForkPayload,
  GeneratePayload,
  InitPayload,
  ListQuery,
  MessagesQuery,
  PermissionResponsePayload,
  PromptPayload,
  RevertPayload,
  ShellPayload,
  SummarizePayload,
  UnsupportedProviderError,
  UpdatePayload,
} from "../groups/session"
import {
  InvalidRequestError,
  ModelNotFoundError,
  PermissionNotFoundError,
  TimeoutError,
  UpstreamError,
} from "../errors"
import * as SessionError from "./session-errors"
import { makeOcSessionHandlers } from "./sessionOc"

const tryParseJson = (text: string) =>
  Effect.try({
    try: () => JSON.parse(text) as unknown,
    catch: () => new HttpApiError.BadRequest({}),
  })

export const sessionHandlers = HttpApiBuilder.group(InstanceHttpApi, "session", (handlers) =>
  Effect.gen(function* () {
    const session = yield* Session.Service
    const shareSvc = yield* SessionShare.Service
    const promptSvc = yield* SessionPrompt.Service
    const revertSvc = yield* SessionRevert.Service
    const compactSvc = yield* SessionCompaction.Service
    const handoffSvc = yield* SessionHandoff.Service
    const runState = yield* SessionRunState.Service
    const agentSvc = yield* Agent.Service
    const permissionSvc = yield* Permission.Service
    const statusSvc = yield* SessionStatus.Service
    const todoSvc = yield* Todo.Service
    const summary = yield* SessionSummary.Service
    const events = yield* EventV2Bridge.Service
    const configSvc = yield* Config.Service
    const scope = yield* Scope.Scope
    const busyResponse = (error: Session.BusyError) =>
      SessionError.mapBusy(Effect.fail(error)).pipe(
        Effect.catch((error) => Effect.succeed(HttpServerResponse.jsonUnsafe(error, { status: 409 }))),
      )

    const list = Effect.fn("SessionHttpApi.list")(function* (ctx: { query: typeof ListQuery.Type }) {
      const directory = ctx.query.directory ? yield* InstanceState.directory : undefined
      return yield* session.list({
        directory: ctx.query.scope === "project" ? undefined : directory,
        scope: ctx.query.scope,
        path: ctx.query.path,
        roots: ctx.query.roots,
        start: ctx.query.start,
        search: ctx.query.search,
        limit: ctx.query.limit,
      })
    })

    const status = Effect.fn("SessionHttpApi.status")(function* () {
      return Object.fromEntries(yield* statusSvc.list())
    })

    const requireSession = Effect.fn("SessionHttpApi.requireSession")(function* (sessionID: SessionID) {
      return yield* SessionError.mapStorageNotFound(session.get(sessionID))
    })

    const get = Effect.fn("SessionHttpApi.get")(function* (ctx: { params: { sessionID: SessionID } }) {
      return yield* requireSession(ctx.params.sessionID)
    })

    const children = Effect.fn("SessionHttpApi.children")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* session.children(ctx.params.sessionID)
    })

    const todo = Effect.fn("SessionHttpApi.todo")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* todoSvc.get(ctx.params.sessionID)
    })

    const diff = Effect.fn("SessionHttpApi.diff")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof DiffQuery.Type
    }) {
      return yield* summary.diff({ sessionID: ctx.params.sessionID, messageID: ctx.query.messageID })
    })

    const messages = Effect.fn("SessionHttpApi.messages")(function* (ctx: {
      params: { sessionID: SessionID }
      query: typeof MessagesQuery.Type
    }) {
      if (ctx.query.before && ctx.query.limit === undefined) return yield* new HttpApiError.BadRequest({})
      if (ctx.query.before) {
        const before = ctx.query.before
        yield* Effect.try({
          try: () => MessageV2.cursor.decode(before),
          catch: () => new HttpApiError.BadRequest({}),
        })
      }
      yield* requireSession(ctx.params.sessionID)
      if (ctx.query.limit === undefined || ctx.query.limit === 0) {
        return yield* SessionError.mapStorageNotFound(session.messages({ sessionID: ctx.params.sessionID }))
      }

      const page = yield* SessionError.mapStorageNotFound(
        MessageV2.page({
          sessionID: ctx.params.sessionID,
          limit: ctx.query.limit,
          before: ctx.query.before,
        }),
      )
      if (!page.cursor) return page.items

      const request = yield* HttpServerRequest.HttpServerRequest
      // toURL() honors the Host + x-forwarded-proto headers, so the Link
      // header echoes the real origin instead of a hard-coded localhost.
      const url = Option.getOrElse(HttpServerRequest.toURL(request), () => new URL(request.url, "http://localhost"))
      url.searchParams.set("limit", ctx.query.limit.toString())
      url.searchParams.set("before", page.cursor)
      return HttpServerResponse.jsonUnsafe(page.items, {
        headers: {
          "Access-Control-Expose-Headers": "Link, X-Next-Cursor",
          Link: `<${url.toString()}>; rel="next"`,
          "X-Next-Cursor": page.cursor,
        },
      })
    })

    const message = Effect.fn("SessionHttpApi.message")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
    }) {
      return yield* SessionError.mapStorageNotFound(
        MessageV2.get({ sessionID: ctx.params.sessionID, messageID: ctx.params.messageID }),
      )
    })

    const create = Effect.fn("SessionHttpApi.create")(function* (ctx: { payload?: Session.CreateInput }) {
      return yield* shareSvc.create(ctx.payload)
    })

    const createRaw = Effect.fn("SessionHttpApi.createRaw")(function* (ctx: {
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      if (body.trim().length === 0) return yield* create({})

      const json = yield* tryParseJson(body)
      const decoded = yield* Schema.decodeUnknownEffect(Session.CreateInput)(json).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      const payload = decoded
        ? {
            ...decoded,
            permission: decoded.permission ? [...decoded.permission] : undefined,
          }
        : decoded
      return yield* create({ payload })
    })

    const remove = Effect.fn("SessionHttpApi.remove")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* SessionError.mapStorageNotFound(session.remove(ctx.params.sessionID))
      return true
    })

    const update = Effect.fn("SessionHttpApi.update")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof UpdatePayload.Type
    }) {
      const current = yield* requireSession(ctx.params.sessionID)
      if (ctx.payload.title !== undefined) {
        yield* session.setTitle({ sessionID: ctx.params.sessionID, title: ctx.payload.title })
      }
      if (ctx.payload.agent !== undefined) {
        yield* session.setAgent({ sessionID: ctx.params.sessionID, agent: ctx.payload.agent })
      }
      if (
        ctx.payload.sessionComplete !== undefined ||
        ctx.payload.sessionFailed !== undefined ||
        ctx.payload.sessionInProgress !== undefined
      ) {
        yield* session.setSessionMarks({
          sessionID: ctx.params.sessionID,
          sessionComplete: ctx.payload.sessionComplete,
          sessionFailed: ctx.payload.sessionFailed,
          sessionInProgress: ctx.payload.sessionInProgress,
        })
      }
      if (ctx.payload.metadata !== undefined) {
        yield* session.setMetadata({ sessionID: ctx.params.sessionID, metadata: ctx.payload.metadata })
      }
      if (ctx.payload.permission !== undefined) {
        yield* session.setPermission({
          sessionID: ctx.params.sessionID,
          permission: Permission.merge(current.permission ?? [], ctx.payload.permission),
        })
      }
      if (ctx.payload.time?.archived !== undefined) {
        yield* session.setArchived({ sessionID: ctx.params.sessionID, time: ctx.payload.time.archived })
      }
      if (ctx.payload.time?.viewed !== undefined) {
        yield* SessionError.mapStorageNotFound(
          session.setViewed({ sessionID: ctx.params.sessionID, idle: ctx.payload.time.viewed }),
        )
      }
      return yield* requireSession(ctx.params.sessionID)
    })

    const fork = Effect.fn("SessionHttpApi.fork")(function* (ctx: {
      params: { sessionID: SessionID }
      payload?: typeof ForkPayload.Type
    }) {
      return yield* SessionError.mapStorageNotFound(
        session.fork({
          sessionID: ctx.params.sessionID,
          messageID: ctx.payload?.messageID,
        }),
      )
    })

    const forkRaw = Effect.fn("SessionHttpApi.forkRaw")(function* (ctx: {
      params: { sessionID: SessionID }
      request: HttpServerRequest.HttpServerRequest
    }) {
      const body = yield* Effect.orDie(ctx.request.text)
      if (body.trim().length === 0) return yield* fork({ params: ctx.params })

      const json = yield* tryParseJson(body)
      const payload = yield* Schema.decodeUnknownEffect(ForkPayload)(json).pipe(
        Effect.mapError(() => new HttpApiError.BadRequest({})),
      )
      return yield* fork({ params: ctx.params, payload })
    })

    const abort = Effect.fn("SessionHttpApi.abort")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* promptSvc.cancel(ctx.params.sessionID)
      return true
    })

    const init = Effect.fn("SessionHttpApi.init")(
      function* (ctx: { params: { sessionID: SessionID }; payload: typeof InitPayload.Type }) {
        yield* requireSession(ctx.params.sessionID)
        yield* promptSvc
          .command({
            sessionID: ctx.params.sessionID,
            messageID: ctx.payload.messageID,
            model: `${ctx.payload.providerID}/${ctx.payload.modelID}`,
            command: Command.Default.INIT,
            arguments: "",
          })
          .pipe(
            Effect.mapError((error) => (error instanceof Session.BusyError ? error : new HttpApiError.BadRequest({}))),
          )
        return true
      },
      Effect.catchTag("SessionBusyError", busyResponse),
    )

    // share/unshare errors aren't all client-induced - storage and network
    // failures from SessionShare are real possibilities. Map to a typed 500
    // (matches the legacy route behavior which routed any failure through
    // ErrorMiddleware -> NamedError.Unknown 500) instead of blanket-mapping
    // every failure to a 400 BadRequest.
    const share = Effect.fn("SessionHttpApi.share")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      yield* shareSvc.share(ctx.params.sessionID).pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
      return yield* requireSession(ctx.params.sessionID)
    })

    const unshare = Effect.fn("SessionHttpApi.unshare")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      yield* shareSvc
        .unshare(ctx.params.sessionID)
        .pipe(Effect.mapError(() => new HttpApiError.InternalServerError({})))
      return yield* requireSession(ctx.params.sessionID)
    })

    const handoffNow = Effect.fn("SessionHttpApi.handoff")(
      function* (ctx: { params: { sessionID: SessionID } }) {
        const current = yield* requireSession(ctx.params.sessionID)
        yield* revertSvc.cleanup(current)
        const messages = yield* SessionError.mapStorageNotFound(session.messages({ sessionID: ctx.params.sessionID }))
        const lastUser = messages.findLast((message) => message.info.role === "user")?.info
        const defaultAgent = yield* agentSvc.defaultAgent()
        const agent = lastUser?.role === "user" ? lastUser.agent : (current.agent ?? defaultAgent)
        const model =
          lastUser?.role === "user"
            ? lastUser.model
            : current.model
              ? {
                  providerID: current.model.providerID,
                  modelID: current.model.id,
                  variant: current.model.variant,
                }
              : undefined
        if (!model) return yield* new HttpApiError.BadRequest({})
        yield* handoffSvc.enqueue({
          sessionID: ctx.params.sessionID,
          agent,
          model,
        })
        yield* promptSvc.loop({ sessionID: ctx.params.sessionID })
        return true
      },
      Effect.catchTag("SessionBusyError", busyResponse),
    )

    const summarize = Effect.fn("SessionHttpApi.summarize")(
      function* (ctx: { params: { sessionID: SessionID }; payload: typeof SummarizePayload.Type }) {
        yield* revertSvc.cleanup(yield* requireSession(ctx.params.sessionID))
        const messages = yield* SessionError.mapStorageNotFound(session.messages({ sessionID: ctx.params.sessionID }))
        const defaultAgent = yield* agentSvc.defaultAgent()
        const currentAgent = messages.findLast((message) => message.info.role === "user")?.info.agent ?? defaultAgent

        yield* compactSvc.create({
          sessionID: ctx.params.sessionID,
          agent: currentAgent,
          model: {
            providerID: ctx.payload.providerID,
            modelID: ctx.payload.modelID,
          },
          auto: ctx.payload.auto ?? false,
        })
        yield* promptSvc.loop({ sessionID: ctx.params.sessionID })
        return true
      },
      Effect.catchTag("SessionBusyError", busyResponse),
    )

    const rename = Effect.fn("SessionHttpApi.rename")(
      function* (ctx: { params: { sessionID: SessionID } }) {
        yield* requireSession(ctx.params.sessionID)
        return yield* promptSvc.rename(ctx.params.sessionID)
      },
      Effect.catchTag("SessionBusyError", busyResponse),
    )

    const prompt = Effect.fn("SessionHttpApi.prompt")(
      function* (ctx: { params: { sessionID: SessionID }; payload: typeof PromptPayload.Type }) {
        yield* requireSession(ctx.params.sessionID)
        const message = yield* promptSvc
          .prompt({
            ...ctx.payload,
            sessionID: ctx.params.sessionID,
          })
          .pipe(
            Effect.mapError((error) => (error instanceof Session.BusyError ? error : new HttpApiError.BadRequest({}))),
          )
        return HttpServerResponse.stream(Stream.make(JSON.stringify(message)).pipe(Stream.encodeText), {
          contentType: "application/json",
        })
      },
      Effect.catchTag("SessionBusyError", busyResponse),
    )

    const promptAsync = Effect.fn("SessionHttpApi.promptAsync")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof PromptPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* promptSvc.prompt({ ...ctx.payload, sessionID: ctx.params.sessionID }).pipe(
        Effect.catchCause((cause) =>
          Effect.gen(function* () {
            yield* Effect.logError("prompt_async failed", { sessionID: ctx.params.sessionID, cause })
            const error = Cause.squash(cause)
            yield* events.publish(Session.Event.Error, {
              sessionID: ctx.params.sessionID,
              error: new NamedError.Unknown({
                message: error instanceof SessionRunState.HeldElsewhereError ? error.message : Cause.pretty(cause),
              }).toObject(),
            })
          }),
        ),
        Effect.forkIn(scope, { startImmediately: true }),
      )
      return HttpApiSchema.NoContent.make()
    })

    const command = Effect.fn("SessionHttpApi.command")(
      function* (ctx: { params: { sessionID: SessionID }; payload: typeof CommandPayload.Type }) {
        yield* requireSession(ctx.params.sessionID)
        return yield* promptSvc
          .command({ ...ctx.payload, sessionID: ctx.params.sessionID })
          .pipe(
            Effect.mapError((error) => (error instanceof Session.BusyError ? error : new HttpApiError.BadRequest({}))),
          )
      },
      Effect.catchTag("SessionBusyError", busyResponse),
    )

    // Domain errors become the typed wire errors declared on the endpoint.
    const generate = Effect.fn("SessionHttpApi.generate")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof GeneratePayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* promptSvc.generate({ ...ctx.payload, sessionID: ctx.params.sessionID }).pipe(
        Effect.catchTags({
          GenerateUnsupportedError: (error) =>
            Effect.fail(new UnsupportedProviderError({ providerID: error.providerID, message: error.message })),
          GenerateAgentNotFoundError: (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message, field: "agent" })),
          GenerateFailedError: (error) => Effect.fail(new UpstreamError({ message: error.message, service: "model" })),
          GenerateTimeoutError: (error) =>
            Effect.fail(new TimeoutError({ message: error.message, operation: "session.generate" })),
          ProviderModelNotFoundError: (error) =>
            Effect.fail(
              new ModelNotFoundError({
                providerID: error.providerID,
                modelID: error.modelID,
                suggestions: error.suggestions ?? [],
                message: error.message,
              }),
            ),
          SessionBusyError: busyResponse,
        }),
      )
    })

    const shell = Effect.fn("SessionHttpApi.shell")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof ShellPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* SessionError.mapBusy(promptSvc.shell({ ...ctx.payload, sessionID: ctx.params.sessionID }))
    })

    const revert = Effect.fn("SessionHttpApi.revert")(function* (ctx: {
      params: { sessionID: SessionID }
      payload: typeof RevertPayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* SessionError.mapBusy(revertSvc.revert({ sessionID: ctx.params.sessionID, ...ctx.payload }))
    })

    const unrevert = Effect.fn("SessionHttpApi.unrevert")(function* (ctx: { params: { sessionID: SessionID } }) {
      yield* requireSession(ctx.params.sessionID)
      return yield* SessionError.mapBusy(revertSvc.unrevert({ sessionID: ctx.params.sessionID }))
    })

    const permissionRespond = Effect.fn("SessionHttpApi.permissionRespond")(function* (ctx: {
      params: { sessionID: SessionID; permissionID: PermissionV1.ID }
      payload: typeof PermissionResponsePayload.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* permissionSvc.reply({ requestID: ctx.params.permissionID, reply: ctx.payload.response }).pipe(
        Effect.catchTag("Permission.NotFoundError", (error) =>
          Effect.fail(
            new PermissionNotFoundError({
              requestID: String(error.requestID),
              message: `Permission request not found: ${error.requestID}`,
            }),
          ),
        ),
      )
      return true
    })

    const deleteMessage = Effect.fn("SessionHttpApi.deleteMessage")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID }
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* SessionError.mapBusy(runState.assertAvailable(ctx.params.sessionID))
      if (Exit.isSuccess(yield* Effect.exit(runState.assertNotBusy(ctx.params.sessionID)))) {
        yield* SessionError.mapBusy(runState.maintenance(ctx.params.sessionID, session.removeMessage(ctx.params)))
        return true
      }
      if (!(yield* unsendable(ctx.params)))
        return yield* SessionError.mapBusy(Effect.fail(new Session.BusyError({ sessionID: ctx.params.sessionID })))
      return true
    })

    // A user message the running turn has not started on and Claude has not read can be deleted while
    // busy: nothing answers it yet. A steer still held by the Claude turn is taken back here.
    const unsendable = Effect.fn("SessionHttpApi.unsendable")(function* (params: {
      sessionID: SessionID
      messageID: MessageID
    }) {
      const msgs = yield* session.messages({ sessionID: params.sessionID }).pipe(Effect.orDie)
      const message = msgs.find((msg) => msg.info.id === params.messageID)
      if (message?.info.role !== "user") return false
      if (msgs.some((msg) => msg.info.role === "assistant" && msg.info.parentID === params.messageID)) return false
      if (message.parts.some((part) => part.type === "text" && part.metadata?.[STEERED_METADATA_KEY])) return false
      // The snapshot may predate the CLI receipt. Only its live held-message owner can
      // authorize busy deletion; unknown messages might already be entering another step.
      const sink = claudeSteerSinks.get(params.sessionID)
      if (!sink) return false
      const bridge = yield* EffectBridge.make()
      return yield* Effect.promise(() =>
        sink.retract(params.messageID, () => bridge.promise(session.removeMessage(params).pipe(Effect.asVoid))),
      )
    })

    const deletePart = Effect.fn("SessionHttpApi.deletePart")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID; partID: PartID }
    }) {
      yield* requireSession(ctx.params.sessionID)
      yield* session.removePart(ctx.params)
      return true
    })

    const updatePart = Effect.fn("SessionHttpApi.updatePart")(function* (ctx: {
      params: { sessionID: SessionID; messageID: MessageID; partID: PartID }
      payload: typeof SessionV1.Part.Type
    }) {
      yield* requireSession(ctx.params.sessionID)
      const payload = ctx.payload as SessionV1.Part
      if (
        payload.id !== ctx.params.partID ||
        payload.messageID !== ctx.params.messageID ||
        payload.sessionID !== ctx.params.sessionID
      ) {
        return yield* new HttpApiError.BadRequest({})
      }
      return yield* session.updatePart(payload)
    })

    const oc = yield* makeOcSessionHandlers({ session, promptSvc, statusSvc, configSvc, scope })

    return handlers
      .handle("list", list)
      .handle("status", status)
      .handle("get", get)
      .handle("children", children)
      .handle("todo", todo)
      .handle("diff", diff)
      .handle("messages", messages)
      .handle("message", message)
      .handleRaw("create", createRaw)
      .handle("remove", remove)
      .handle("update", update)
      .handleRaw("fork", forkRaw)
      .handle("abort", abort)
      .handle("init", init)
      .handle("share", share)
      .handle("unshare", unshare)
      .handle("handoff", handoffNow)
      .handle("summarize", summarize)
      .handle("rename", rename)
      .handle("prompt", prompt)
      .handle("promptAsync", promptAsync)
      .handle("command", command)
      .handle("generate", generate)
      .handle("shell", shell)
      .handle("revert", revert)
      .handle("unrevert", unrevert)
      .handle("permissionRespond", permissionRespond)
      .handle("deleteMessage", deleteMessage)
      .handle("deletePart", deletePart)
      .handle("updatePart", updatePart)
      .handle("resumeState", oc.resumeState)
      .handle("resumeSet", oc.resumeSet)
      .handle("resumeCancel", oc.resumeCancel)
      .handle("queue", oc.queueSnapshot)
      .handle("queueUpdate", oc.queueUpdate)
      .handle("claudeAccountState", oc.claudeAccountState)
      .handle("claudeAccountSet", oc.claudeAccountSet)
  }),
)
