// oc session endpoints (scheduled resumes, prompt queue, Claude account pool), lifted out of
// upstream's session handlers. Yielded inside `sessionHandlers` from its services; it also starts
// the scheduled-resume poll loop.
import { Config } from "@/config/config"
import { InstanceStore } from "@/project/instance-store"
import {
  apiKeyReady,
  configureApiAccount,
  pinSessionAccount,
  poolAccountIds,
  poolState,
  setCurrentAccount,
} from "@/provider/claude-code/accounts"
import { sessionWorkingAccount } from "@/provider/claude-code/sessionManager"
import { SessionPrompt } from "@/session/prompt"
import { ScheduledDelivery } from "@/session/scheduledDelivery"
import { ScheduledResume } from "@/session/scheduledResume"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { SessionStatus } from "@/session/status"
import { Effect, Scope } from "effect"
import { HttpApiError } from "effect/unstable/httpapi"
import {
  ClaudeAccountPayload,
  ClaudeAccountQuery,
  QueuePayload,
  ResumeCancelPayload,
  ResumeEnabledPayload,
} from "../groups/session"
import { ConflictError, InvalidRequestError, notFound } from "../errors"
import * as SessionError from "./session-errors"

export const makeOcSessionHandlers = Effect.fnUntraced(function* ({
  session,
  promptSvc,
  statusSvc,
  configSvc,
  scope,
}: {
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
    return yield* Effect.try({ try: ScheduledResume.getState, catch: () => new HttpApiError.BadRequest({}) })
  })

  const resumeSet = Effect.fn("SessionHttpApi.resumeSet")(function* (ctx: {
    payload: typeof ResumeEnabledPayload.Type
  }) {
    return yield* Effect.try({
      try: () => {
        if (ctx.payload.prompt !== undefined) ScheduledResume.setPrompt(ctx.payload.prompt)
        return ScheduledResume.setEnabled(ctx.payload.enabled)
      },
      catch: () => new HttpApiError.BadRequest({}),
    })
  })

  const resumeCancel = Effect.fn("SessionHttpApi.resumeCancel")(function* (ctx: {
    payload: typeof ResumeCancelPayload.Type
  }) {
    return yield* Effect.try({
      try: () => ScheduledResume.cancel(ctx.payload.id),
      catch: () => new HttpApiError.BadRequest({}),
    })
  })

  const queueSnapshot = Effect.fn("SessionHttpApi.queueSnapshot")(function* (ctx: {
    params: { sessionID: SessionID }
  }) {
    yield* requireSession(ctx.params.sessionID)
    return yield* promptSvc.queue.snapshot(ctx.params.sessionID)
  })

  const checkAdd = Effect.fnUntraced(function* (
    change: Omit<Extract<typeof QueuePayload.Type, { type: "add" }>, "type">,
  ) {
    // Synthetic text is allowed only as editor context, and never on its own.
    if (
      change.parts.some((part) => part.type === "text" && part.synthetic && part.metadata?.kind !== "editor_context") ||
      (!change.commands?.length &&
        !change.chain?.length &&
        !change.parts.some((part) => part.type !== "text" || !part.synthetic))
    ) {
      return yield* new InvalidRequestError({
        message: "A queued prompt needs a command or a part of its own; synthetic text is only editor context",
        field: "parts",
      })
    }
    // A TUI runs the chain once it reaches the front, with the agent and model it was queued with.
    if (change.chain?.length && (change.runAt !== undefined || !change.agent || !change.model)) {
      return yield* new InvalidRequestError({
        message: "A revive chain needs an agent and model and cannot be scheduled",
        field: "chain",
      })
    }
    if (change.target && change.target !== "current" && change.runAt === undefined) {
      return yield* new InvalidRequestError({
        message: "Only a scheduled prompt can go to a fork or a new session",
        field: "runAt",
      })
    }
  })

  const queueChange = Effect.fn("SessionHttpApi.queueChange")(function* (
    sessionID: SessionID,
    change: typeof QueuePayload.Type,
  ) {
    switch (change.type) {
      case "add":
      case "batch": {
        const entries = change.type === "add" ? [change] : change.entries
        yield* Effect.forEach(entries, checkAdd, { discard: true })
        return yield* promptSvc.queue.add(
          sessionID,
          entries.map((change) => ({
            id: change.id,
            payload: {
              agent: change.agent,
              model: change.model,
              variant: change.variant,
              split: change.split,
              parts: change.parts,
              ...(change.commands?.length && { commands: change.commands }),
              ...(change.chain?.length && { chain: change.chain }),
            },
            runAt: change.runAt,
            target: change.target,
          })),
        )
      }
      case "edit":
        // Empty text is a bare command (`/ship`), so the edit must name its commands.
        if (!change.text.trim() && !change.commands?.length && !change.chain?.length) {
          return yield* new InvalidRequestError({ message: "Queued text cannot be empty", field: "text" })
        }
        // Same rule as add: only a TUI runs a chain, at the front of this session's queue.
        const edited = (yield* promptSvc.queue.snapshot(sessionID)).entries.find((entry) => entry.id === change.id)
        if (change.chain?.length && edited?.runAt !== undefined) {
          return yield* new InvalidRequestError({ message: "A revive chain cannot be scheduled", field: "chain" })
        }
        return yield* promptSvc.queue.edit({
          sessionID,
          id: change.id,
          text: change.text,
          commands: change.commands,
          split: change.split,
          chain: change.chain,
        })
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

  const queueTake = Effect.fn("SessionHttpApi.queueTake")(function* (ctx: { params: { sessionID: SessionID } }) {
    yield* requireSession(ctx.params.sessionID)
    return { payload: yield* promptSvc.queue.takeChain(ctx.params.sessionID) }
  })

  // Also sets up the API-credit profile, so Home and the pickers list it before the first Claude turn.
  const claudePool = Effect.fnUntraced(function* () {
    const options = (yield* configSvc.get()).provider?.["claude-code"]?.options
    const accounts = Array.isArray(options?.accounts)
      ? options.accounts.filter((dir): dir is string => typeof dir === "string")
      : undefined
    configureApiAccount(options?.apiAccount, accounts)
    // A keychain key read re-configures the profile when it lands; wait so pickers list it.
    yield* Effect.promise(apiKeyReady)
    return poolAccountIds(accounts)
  })

  // A session still working keeps its account until the work ends, so it is reported as current.
  const claudeState = (ids: string[], sessionID: string | undefined) =>
    poolState(ids, Date.now(), sessionID, sessionID ? sessionWorkingAccount(sessionID) : undefined, {
      withApi: true,
    })

  const claudeAccountState = Effect.fn("SessionHttpApi.claudeAccountState")(function* (ctx: {
    query: typeof ClaudeAccountQuery.Type
  }) {
    return { accounts: claudeState(yield* claudePool(), ctx.query.sessionID) }
  })

  const claudeAccountSet = Effect.fn("SessionHttpApi.claudeAccountSet")(function* (ctx: {
    payload: typeof ClaudeAccountPayload.Type
  }) {
    const ids = yield* claudePool()
    const { id, sessionID } = ctx.payload
    // Without a session this sets the global account, which `setCurrentAccount` keeps to the pool.
    const ok = sessionID ? pinSessionAccount(sessionID, id, ids) : id !== undefined && setCurrentAccount(id, ids)
    if (!ok) return yield* new HttpApiError.BadRequest({})
    return { accounts: claudeState(ids, sessionID) }
  })

  // Both sleepers wake on local writes. Cross-process changes reconcile at most once a minute.
  const instances = yield* InstanceStore.Service
  yield* ScheduledResume.pollLoop(
    { session, status: statusSvc, prompt: promptSvc, store: instances },
    ScheduledResume.store,
  ).pipe(Effect.forkScoped, Effect.provideService(Scope.Scope, scope))

  const inSession = (sessionID: SessionID, effect: Effect.Effect<void>) =>
    session.get(sessionID).pipe(
      Effect.flatMap((info) => instances.provide({ directory: info.directory }, effect)),
      Effect.orDie,
    )
  yield* Effect.gen(function* () {
    const version = ScheduledDelivery.queueWake.version()
    yield* promptSvc.queue
      .fireDue(inSession)
      .pipe(Effect.catchCause((cause) => Effect.logWarning("scheduled prompt drain failed", { cause: String(cause) })))
    yield* ScheduledDelivery.queueWake.wait(version, yield* promptSvc.queue.deadline())
  }).pipe(Effect.forever, Effect.forkScoped, Effect.provideService(Scope.Scope, scope))

  return {
    resumeState,
    resumeSet,
    resumeCancel,
    queueSnapshot,
    queueUpdate,
    queueTake,
    claudeAccountState,
    claudeAccountSet,
  }
})
