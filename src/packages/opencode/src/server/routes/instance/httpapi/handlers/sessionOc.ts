// oc session endpoints (scheduled resumes, prompt queue, Claude account pool), lifted out of
// upstream's session handlers. Yielded inside `sessionHandlers` from its services; it also starts
// the scheduled-resume poll loop.
import { Config } from "@/config/config"
import { InstanceStore } from "@/project/instance-store"
import { pinSessionAccount, poolAccountIds, poolState, setCurrentAccount } from "@/provider/claude-code/accounts"
import { SessionPrompt } from "@/session/prompt"
import { ScheduledResume } from "@/session/scheduledResume"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Effect, Scope } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import { ClaudeAccountPayload, ClaudeAccountQuery, QueuePayload, ResumeCancelPayload, ResumeEnabledPayload } from "../groups/session"
import { ConflictError, InvalidRequestError, notFound } from "../errors"
import * as SessionError from "./session-errors"

const SCHEDULE_POLL_MS = 5_000

export const makeOcSessionHandlers = Effect.fnUntraced(function* ({ session, promptSvc, statusSvc, configSvc, scope }: {
  session: Session.Interface
  promptSvc: SessionPrompt.Interface
  statusSvc: SessionStatus.Interface
  configSvc: Config.Interface
  scope: Scope.Scope
}) {
  // Same check as `requireSession` in session.ts.
  const requireSession = Effect.fn("SessionHttpApi.requireSession")(function* (sessionID: SessionID) {
    return yield* SessionError.mapStorageNotFound(session.get(sessionID))
  })

  const resumeState = Effect.fn("SessionHttpApi.resumeState")(function* () {
    return ScheduledResume.getState()
  })

  const resumeSet = Effect.fn("SessionHttpApi.resumeSet")(function* (ctx: {
    payload: typeof ResumeEnabledPayload.Type
  }) {
    if (ctx.payload.prompt !== undefined) ScheduledResume.setPrompt(ctx.payload.prompt)
    return ScheduledResume.setEnabled(ctx.payload.enabled)
  })

  const resumeCancel = Effect.fn("SessionHttpApi.resumeCancel")(function* (ctx: {
    payload: typeof ResumeCancelPayload.Type
  }) {
    return ScheduledResume.cancel(ctx.payload.id)
  })

  const queueSnapshot = Effect.fn("SessionHttpApi.queueSnapshot")(function* (ctx: { params: { sessionID: SessionID } }) {
    yield* requireSession(ctx.params.sessionID)
    return yield* promptSvc.queue.snapshot(ctx.params.sessionID)
  })

  const queueChange = Effect.fn("SessionHttpApi.queueChange")(function* (
    sessionID: SessionID,
    change: typeof QueuePayload.Type,
  ) {
    switch (change.type) {
      case "add":
        if (change.parts.length === 0 || change.parts.some((part) => part.type === "text" && part.synthetic)) {
          return yield* new InvalidRequestError({
            message: "A queued prompt needs at least one part, and synthetic text cannot be queued",
            field: "parts",
          })
        }
        if (change.target && change.target !== "current" && change.runAt === undefined) {
          return yield* new InvalidRequestError({
            message: "Only a scheduled prompt can go to a fork or a new session",
            field: "runAt",
          })
        }
        return yield* promptSvc.queue.add({
          sessionID,
          id: change.id,
          payload: { agent: change.agent, model: change.model, variant: change.variant, parts: change.parts },
          runAt: change.runAt,
          target: change.target,
        })
      case "edit":
        if (!change.text.trim()) {
          return yield* new InvalidRequestError({ message: "Queued text cannot be empty", field: "text" })
        }
        return yield* promptSvc.queue.edit({ sessionID, id: change.id, text: change.text })
      case "cancel":
        return yield* promptSvc.queue.cancel({ sessionID, id: change.id })
      case "resume":
        return yield* promptSvc.queue.resume(sessionID)
    }
  })

  const queueUpdate = Effect.fn("SessionHttpApi.queueUpdate")(function* (ctx: {
    params: { sessionID: SessionID }
    payload: typeof QueuePayload.Type
  }) {
    yield* requireSession(ctx.params.sessionID)
    return yield* queueChange(ctx.params.sessionID, ctx.payload).pipe(
      Effect.catchTags({
        SessionQueueNotFoundError: (error) => Effect.fail(notFound(`Queued prompt not found: ${error.id}`)),
        SessionQueueBusyError: (error) =>
          Effect.fail(
            new ConflictError({
              message: `Queued prompt is being sent: ${error.id}`,
              resource: "session.queue",
            }),
          ),
      }),
    )
  })

  const claudePool = Effect.fnUntraced(function* () {
    const accounts = (yield* configSvc.get()).provider?.["claude-code"]?.options?.accounts
    return poolAccountIds(Array.isArray(accounts) ? accounts.filter((dir) => typeof dir === "string") : undefined)
  })

  const claudeAccountState = Effect.fn("SessionHttpApi.claudeAccountState")(function* (ctx: {
    query: typeof ClaudeAccountQuery.Type
  }) {
    return { accounts: poolState(yield* claudePool(), Date.now(), ctx.query.sessionID) }
  })

  const claudeAccountSet = Effect.fn("SessionHttpApi.claudeAccountSet")(function* (ctx: {
    payload: typeof ClaudeAccountPayload.Type
  }) {
    const ids = yield* claudePool()
    const { id, sessionID } = ctx.payload
    const ok = sessionID
      ? pinSessionAccount(sessionID, id, ids)
      : id !== undefined && setCurrentAccount(id, ids)
    if (!ok) return yield* new HttpApiError.BadRequest({})
    return { accounts: poolState(ids, Date.now(), sessionID) }
  })

  // Usage-reset auto-resumes: drain overdue entries at startup, then poll.
  // The loop forks into the app scope, like promptAsync above.
  const instances = yield* InstanceStore.Service
  yield* ScheduledResume.pollLoop(
    { session, status: statusSvc, prompt: promptSvc, store: instances },
    ScheduledResume.store,
  ).pipe(Effect.forkIn(scope))

  // Scheduled prompts: send what is due now (overdue ones fire on startup), then poll.
  const inSession = (sessionID: SessionID, effect: Effect.Effect<void>) =>
    session.get(sessionID).pipe(
      Effect.flatMap((info) => instances.provide({ directory: info.directory }, effect)),
      Effect.orDie,
    )
  yield* promptSvc.queue.fireDue(inSession).pipe(
    Effect.catchCause((cause) => Effect.logWarning("scheduled prompt poll failed", { cause: String(cause) })),
    Effect.andThen(Effect.sleep(SCHEDULE_POLL_MS)),
    Effect.forever,
    Effect.forkIn(scope),
  )

  return { resumeState, resumeSet, resumeCancel, queueSnapshot, queueUpdate, claudeAccountState, claudeAccountSet }
})
