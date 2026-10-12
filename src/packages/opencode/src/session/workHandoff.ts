import path from "path"
import { Cause, Context, Effect, Exit, Layer, Option, Schema, Scope } from "effect"
import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { Git } from "@opencode-ai/core/git"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { MoveSession } from "@opencode-ai/core/control-plane/move-session"
import { ProjectCopy } from "@opencode-ai/core/project/copy"
import { ProjectDirectories } from "@opencode-ai/core/project/directories"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { EventV2 } from "@opencode-ai/core/event"
import { Event } from "@opencode-ai/schema/project-directories"
import { Database } from "@opencode-ai/core/database/database"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { eq } from "drizzle-orm"
import { Flock } from "@opencode-ai/core/util/flock"
import { InstanceStore } from "@/project/instance-store"
import { Config } from "@/config/config"
import { Provider } from "@/provider/provider"
import { isClaudeCodeProvider } from "@/provider/claude-code/shared"
import { Session } from "./session"
import { SessionID } from "./schema"
import { SessionRunState } from "./run-state"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TuiEvent } from "@/server/tui-event"
import type { SessionPrompt } from "./prompt"
import type { TaskPromptOps } from "@/tool/task"

const Recovery = Schema.Struct({
  copy: AbsolutePath,
  parent: AbsolutePath,
  phase: Schema.Literals(["created", "queued", "merged", "complete", "stopped"]),
  origin: Schema.optional(AbsolutePath),
  error: Schema.optional(Schema.String),
})

export interface Interface {
  readonly start: (sessionID: SessionID, name: string, prompt: TaskPromptOps["prompt"]) => Effect.Effect<string>
  readonly request: (
    sessionID: SessionID,
    prompt: TaskPromptOps["prompt"],
    resolved?: readonly string[],
    directory?: string,
  ) => Effect.Effect<void>
  readonly isPending: (sessionID: SessionID) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/WorkHandoff") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const git = yield* Git.Service
    const sessions = yield* Session.Service
    const runState = yield* SessionRunState.Service
    const move = yield* MoveSession.Service
    const instances = yield* InstanceStore.Service
    const directories = yield* ProjectDirectories.Service
    const locations = yield* LocationServiceMap.Service
    const events = yield* EventV2Bridge.Service
    const coreEvents = yield* EventV2.Service
    const database = yield* Database.Service
    const config = yield* Config.Service
    const provider = yield* Provider.Service
    const scope = yield* Scope.Scope
    const active = new Map<SessionID, { resolved: string[]; directory?: string; parent?: string }>()

    const lease = (key: string) =>
      Effect.acquireRelease(
        Effect.promise((signal) => Flock.acquire(key, { timeoutMs: 0, staleMs: 15_000, signal })),
        (lock) => Effect.promise(() => lock.release()),
      )
    const save = (sessionID: SessionID, state: typeof Recovery.Type) =>
      Effect.gen(function* () {
        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
        yield* sessions.setMetadata({ sessionID, metadata: { ...session.metadata, ocWorkHandoff: state } })
      })
    const exclusive = <A, E, R>(sessionID: SessionID, directory: string, effect: Effect.Effect<A, E, R>) =>
      instances
        .provide(
          { directory },
          runState.maintenance(
            sessionID,
            Effect.gen(function* () {
              yield* lease(`session:${sessionID}`)
              const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
              if (path.resolve(session.directory) !== path.resolve(directory))
                return yield* Effect.die(new Error("Session directory changed while preparing work handoff"))
              return yield* effect
            }).pipe(Effect.scoped),
          ),
        )
        .pipe(Effect.orDie)
    const prepareMove = (sessionID: SessionID, directory: string) =>
      Effect.gen(function* () {
        const { prepareSessionDirectoryMove } = yield* Effect.promise(
          () => import("@/provider/claude-code/sessionManager"),
        )
        yield* Effect.promise(() => prepareSessionDirectoryMove(sessionID, directory))
      })
    const family = (sessionID: SessionID, directory: string, projectID: Session.Info["projectID"]) =>
      database.db
        .select({ id: SessionTable.id, parentID: SessionTable.parent_id, directory: SessionTable.directory })
        .from(SessionTable)
        .where(eq(SessionTable.project_id, projectID))
        .all()
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            Effect.forEach(
              rows.filter((row) => row.id !== sessionID && FSUtil.contains(directory, row.directory)),
              (row) =>
                Effect.gen(function* () {
                  let parentID = row.parentID
                  const visited = new Set<SessionID>()
                  while (parentID && parentID !== sessionID && !visited.has(parentID)) {
                    visited.add(parentID)
                    parentID = (yield* sessions.get(parentID).pipe(Effect.orDie)).parentID ?? null
                  }
                  if (parentID !== sessionID)
                    return yield* Effect.die(
                      new Error(`Another session uses this copy: ${row.id}. Move it before /done`),
                    )
                  return { id: row.id, directory: row.directory }
                }),
            ),
          ),
        )

    const start: Interface["start"] = (sessionID, name, prompt) =>
      Effect.gen(function* () {
        if (active.has(sessionID))
          return yield* Effect.die(new Error("Work completion is already queued for this session"))
        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
        if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) return yield* Effect.die(new Error("Invalid work copy name"))
        const directory = yield* exclusive(
          sessionID,
          session.directory,
          Effect.gen(function* () {
            const repository = yield* git.repo.discover(AbsolutePath.make(session.directory))
            if (!repository) return yield* Effect.die(new Error("Work copies require a Git checkout"))
            if (path.dirname(repository.worktree) === repository.worktree)
              return yield* Effect.die(new Error("Work copies need a sibling directory outside their source checkout"))
            const providerID =
              session.model?.providerID ?? (yield* provider.defaultModel().pipe(Effect.orDie)).providerID
            const pinned = (yield* config.get()).provider?.[providerID]?.options?.cwd
            if (isClaudeCodeProvider(providerID) && typeof pinned === "string" && pinned)
              return yield* Effect.die(
                new Error(
                  "Remove the Claude Code provider's pinned cwd before /work so its tools follow the work copy",
                ),
              )
            yield* lease(`work-repository:${repository.commonDirectory}`)
            const previous = Schema.decodeUnknownOption(Recovery)(session.metadata?.ocWorkHandoff)
            const pending =
              Option.isSome(previous) &&
              previous.value.phase === "created" &&
              (session.directory === previous.value.parent || session.directory === previous.value.origin)
                ? previous.value
                : undefined
            if (pending) {
              const existingCopy = yield* git.repo.discover(pending.copy)
              if (
                !existingCopy ||
                existingCopy.worktree !== pending.copy ||
                (yield* git.worktree.parent(existingCopy)) !== pending.parent
              )
                return yield* Effect.die(new Error(`Created work copy needs recovery: ${pending.copy}`))
            }
            const copy = pending
              ? { directory: pending.copy }
              : yield* ProjectCopy.Service.use((copies) =>
                  copies.create({
                    projectID: session.projectID,
                    sourceDirectory: repository.worktree,
                    directory: AbsolutePath.make(path.dirname(repository.worktree)),
                    name: `${path.basename(repository.worktree).replace(/[^a-z0-9_-]+/gi, "-")}.work-${name}`,
                    strategy: ProjectCopy.StrategyID.make("git_worktree"),
                    state: true,
                  }),
                ).pipe(
                  Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(session.directory) }))),
                  Effect.orDie,
                )
            yield* save(sessionID, {
              copy: copy.directory,
              parent: repository.worktree,
              origin: AbsolutePath.make(session.directory),
              phase: "created",
            })
            yield* instances.load({ directory: copy.directory })
            yield* prepareMove(sessionID, copy.directory)
            yield* move
              .moveSession({ sessionID, destination: { directory: copy.directory }, moveChanges: false })
              .pipe(Effect.orDie)
            yield* instances.provide(
              { directory: copy.directory },
              prompt({
                sessionID,
                noReply: true,
                agent: session.agent,
                model: session.model ? { providerID: session.model.providerID, modelID: session.model.id } : undefined,
                variant: session.model?.variant,
                parts: [
                  {
                    type: "text",
                    synthetic: true,
                    text: `<system-reminder>You are in an isolated work copy at "${copy.directory}" of "${repository.worktree}". Changes merge back unstaged. Do not commit. Run any needed checks yourself before finishing; never hand them to the user. When finished, call work_done as your last tool and end the turn, or the user can run /done. Only ignored regular root .env* files were copied; ignored files are not merged.</system-reminder>`,
                  },
                ],
              }),
            )
            return copy.directory
          }),
        )
        return directory
      })

    const request: Interface["request"] = (sessionID, prompt, resolved = [], directory) =>
      Effect.gen(function* () {
        const existing = active.get(sessionID)
        if (existing) {
          if (
            directory &&
            existing.directory &&
            !FSUtil.contains(existing.directory, directory) &&
            (!existing.parent || path.resolve(directory) !== path.resolve(existing.parent))
          )
            return yield* Effect.die(new Error("Work completion belongs to another session directory"))
          if (resolved.length) existing.resolved = [...resolved]
          return
        }
        const job: { resolved: string[]; directory?: string; parent?: string } = { resolved: [...resolved], directory }
        active.set(sessionID, job)
        const session = yield* sessions.get(sessionID).pipe(Effect.orDie)
        const stored = Schema.decodeUnknownOption(Recovery)(session.metadata?.ocWorkHandoff)
        if (directory && path.resolve(directory) !== path.resolve(session.directory)) {
          if (
            Option.isSome(stored) &&
            stored.value.phase === "complete" &&
            FSUtil.contains(stored.value.copy, directory) &&
            stored.value.parent === session.directory
          ) {
            active.delete(sessionID)
            return
          }
          return yield* Effect.die(new Error("Session moved before work completion was queued"))
        }
        const tail =
          Option.isSome(stored) &&
          stored.value.phase === "merged" &&
          (FSUtil.contains(stored.value.copy, session.directory) || session.directory === stored.value.parent)
            ? stored.value
            : undefined
        const repository = yield* git.repo.discover(AbsolutePath.make(session.directory))
        const parent = tail?.parent ?? (repository ? yield* git.worktree.parent(repository) : undefined)
        if (!parent) {
          if (Option.isSome(stored) && stored.value.phase === "complete" && session.directory === stored.value.parent) {
            active.delete(sessionID)
            return
          }
          return yield* Effect.die(new Error("Session is not in a recorded work copy"))
        }
        const recovery = tail
          ? { ...tail, error: undefined }
          : {
              copy: repository?.worktree ?? AbsolutePath.make(session.directory),
              parent,
              origin: AbsolutePath.make(session.directory),
              phase: "queued" as const,
            }
        job.directory = recovery.copy
        job.parent = recovery.parent
        const history = yield* sessions.messages({ sessionID }).pipe(Effect.orDie)
        const original =
          history.findLast(
            (message) =>
              message.info.role === "user" && !message.parts.every((part) => "synthetic" in part && part.synthetic),
          )?.info ?? history.findLast((message) => message.info.role === "user")?.info
        const precedingCancellation = yield* runState.cancellation(sessionID)
        const complete = yield* instances.provide({ directory: session.directory }, runState.completion(sessionID))
        yield* save(sessionID, recovery)
        const finish = Effect.gen(function* () {
          if (!(yield* complete))
            return yield* Effect.die(new Error("Work completion cancelled: the preceding turn was aborted or failed"))
          if ((yield* runState.cancellation(sessionID)) !== precedingCancellation)
            return yield* Effect.die(new Error("Work completion cancelled before merge"))
          if (FSUtil.contains(recovery.copy, session.directory) && session.directory !== recovery.copy) {
            yield* exclusive(
              sessionID,
              session.directory,
              Effect.gen(function* () {
                yield* prepareMove(sessionID, recovery.copy)
                yield* move
                  .moveSession({ sessionID, destination: { directory: recovery.copy }, moveChanges: false })
                  .pipe(Effect.orDie)
              }),
            )
          }
          yield* lease(`work-copy:${recovery.copy}`)
          const parentRepo = yield* git.repo.discover(recovery.parent)
          if (!parentRepo) return yield* Effect.die(new Error("Parent repository missing"))
          yield* lease(`work-repository:${parentRepo.commonDirectory}`)
          const owned = new Set<SessionID>()
          const lockFamily = Effect.gen(function* () {
            for (const child of yield* family(sessionID, recovery.copy, session.projectID)) {
              if (owned.has(child.id)) continue
              yield* instances
                .provide({ directory: child.directory }, runState.assertNotBusy(child.id))
                .pipe(Effect.orDie)
              yield* lease(`session:${child.id}`)
              owned.add(child.id)
            }
          })
          yield* lockFamily
          if (repository) {
            const trees = yield* git.worktree.list(repository).pipe(Effect.orDie)
            for (const tree of trees) {
              const child = yield* git.repo.discover(tree.directory)
              if (child && (yield* git.worktree.parent(child)) === recovery.copy)
                return yield* Effect.die(new Error("Finish nested copies before /done"))
            }
          }
          const remainingCopy = yield* git.repo.discover(recovery.copy)
          let merged =
            recovery.phase === "merged" &&
            (!remainingCopy || (yield* git.worktree.unchanged(remainingCopy).pipe(Effect.orDie)))
          if (!merged && session.directory === recovery.parent) {
            yield* exclusive(
              sessionID,
              recovery.parent,
              Effect.gen(function* () {
                yield* prepareMove(sessionID, recovery.copy)
                yield* move
                  .moveSession({ sessionID, destination: { directory: recovery.copy }, moveChanges: false })
                  .pipe(Effect.orDie)
              }),
            )
          }
          for (let round = 0; !merged; round++) {
            const result = yield* exclusive(
              sessionID,
              recovery.copy,
              Effect.gen(function* () {
                const copy = yield* git.repo.discover(recovery.copy)
                if (!copy) return yield* Effect.die(new Error("Work copy is missing"))
                return yield* git.worktree.merge({ copy, resolved: job.resolved }).pipe(Effect.orDie)
              }),
            )
            job.resolved = []
            if (!result.conflicts.length) {
              merged = true
              yield* save(sessionID, { ...recovery, phase: "merged" })
              break
            }
            if (round === 2)
              return yield* Effect.die(
                new Error(`Conflict resolution stopped after two rounds. Copy retained: ${recovery.copy}`),
              )
            if (!original || original.role !== "user")
              return yield* Effect.die(new Error("No original model turn available for conflict resolution"))
            const input: SessionPrompt.TurnInput = {
              sessionID,
              agent: session.agent ?? original.agent,
              model: session.model
                ? { providerID: session.model.providerID, modelID: session.model.id }
                : original.model,
              variant: session.model?.variant ?? original.model.variant,
              turnPermission: original.permission,
              system: original.system,
              parts: [
                {
                  type: "text",
                  synthetic: true,
                  text: `Resolve the pending work-copy conflicts in:\n${result.conflicts.join("\n")}\nInspect both sides and preserve their intent. Some conflicts are binary, deletion, rename, or nontext and have no markers. Original parent and copy snapshots are recorded in git config oc.work.${path.basename(recovery.copy)}.ours and .theirs; the original base is refs/oc/work-base/${path.basename(recovery.copy)}. Use git show/diff to inspect these versions, including both sides of a rename or deletion. Do not commit. Remove all remaining conflict markers. Explicitly resolve every listed path, then call work_done with resolved equal to the list of resolved paths and end your turn. The server retries after successful completion; at most two resolution rounds are allowed.`,
                },
              ],
            }
            const cancellation = yield* runState.cancellation(sessionID)
            const answer = yield* instances.provide({ directory: recovery.copy }, prompt(input))
            if ((yield* runState.cancellation(sessionID)) !== cancellation)
              return yield* Effect.die(new Error("Conflict resolution was cancelled; copy retained"))
            if (!SessionRunState.successfulTurn(answer))
              return yield* Effect.die(new Error("Conflict resolution was aborted or failed; copy retained"))
            // Cancellation can return the last assistant. Join the actual runner outcome as well.
            if (
              !(yield* instances
                .provide({ directory: recovery.copy }, runState.completion(sessionID))
                .pipe(Effect.flatten))
            )
              return yield* Effect.die(new Error("Conflict resolution was cancelled; copy retained"))
          }
          yield* exclusive(
            sessionID,
            (yield* sessions.get(sessionID).pipe(Effect.orDie)).directory,
            Effect.gen(function* () {
              yield* lockFamily
              const copy = yield* git.repo.discover(recovery.copy)
              if (copy && copy.worktree === recovery.copy && !(yield* git.worktree.unchanged(copy).pipe(Effect.orDie)))
                return yield* Effect.die(new Error("Copy changed after merge; cleanup stopped to preserve new edits"))
              for (const child of yield* family(sessionID, recovery.copy, session.projectID)) {
                yield* instances
                  .provide(
                    { directory: child.directory },
                    runState.maintenance(
                      child.id,
                      Effect.gen(function* () {
                        yield* prepareMove(child.id, recovery.parent)
                        yield* move
                          .moveSession({
                            sessionID: child.id,
                            destination: { directory: recovery.parent },
                            moveChanges: false,
                          })
                          .pipe(Effect.orDie)
                      }),
                    ),
                  )
                  .pipe(Effect.orDie)
              }
              yield* prepareMove(sessionID, recovery.parent)
              yield* move
                .moveSession({ sessionID, destination: { directory: recovery.parent }, moveChanges: false })
                .pipe(Effect.orDie)
              const disposed = yield* instances.disposeWithin(recovery.copy)
              for (const directory of new Set([recovery.copy, ...disposed]))
                yield* locations.invalidate(Location.Ref.make({ directory: AbsolutePath.make(directory) }))
              const parentRepo = yield* git.repo.discover(recovery.parent)
              if (!parentRepo) return yield* Effect.die(new Error("Parent repository missing; cleanup retained"))
              yield* git.worktree
                .remove({ repository: parentRepo, directory: recovery.copy, force: true })
                .pipe(Effect.orDie)
              if (yield* directories.remove({ projectID: session.projectID, directory: recovery.copy }))
                yield* coreEvents.publish(Event.Updated, { projectID: session.projectID })
              yield* instances.provide(
                { directory: recovery.parent },
                prompt({
                  sessionID,
                  noReply: true,
                  agent: session.agent,
                  model: session.model
                    ? { providerID: session.model.providerID, modelID: session.model.id }
                    : undefined,
                  variant: session.model?.variant,
                  parts: [
                    {
                      type: "text",
                      synthetic: true,
                      text: `<system-reminder>Work merged as unstaged changes. The current working directory is now "${recovery.parent}". The work copy was removed. Use this directory for subsequent tools.</system-reminder>`,
                    },
                  ],
                }),
              )
              yield* save(sessionID, { ...recovery, phase: "complete" })
            }),
          )
          yield* events.publish(TuiEvent.ToastShow, {
            message: `Work merged as unstaged changes in ${recovery.parent}`,
            variant: "success",
            duration: 8000,
          })
        }).pipe(
          Effect.scoped,
          Effect.catchCause((cause) =>
            Effect.gen(function* () {
              const current = yield* sessions.get(sessionID).pipe(Effect.orDie)
              const state = Schema.decodeUnknownOption(Recovery)(current.metadata?.ocWorkHandoff)
              yield* Effect.logWarning("work handoff stopped", { sessionID, cause })
              const error = Cause.squash(cause)
              if (Option.isSome(state) && state.value.phase === "complete") return
              const message = error instanceof Error ? error.message : String(error)
              yield* save(sessionID, {
                ...recovery,
                phase: Option.isSome(state) && state.value.phase === "merged" ? "merged" : "stopped",
                error: message,
              })
              yield* events.publish(TuiEvent.ToastShow, {
                message: `${message}. Copy retained: ${recovery.copy}`,
                variant: "error",
                duration: 10000,
              })
            }),
          ),
          Effect.ensuring(
            Effect.sync(() => {
              active.delete(sessionID)
            }),
          ),
        )
        yield* finish.pipe(Effect.forkIn(scope))
      }).pipe(
        Effect.onExit((exit) =>
          Exit.isFailure(exit)
            ? Effect.sync(() => {
                active.delete(sessionID)
              })
            : Effect.void,
        ),
      )
    return Service.of({ start, request, isPending: (sessionID) => Effect.sync(() => active.has(sessionID)) })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer,
  deps: [
    Git.node,
    Session.node,
    SessionRunState.node,
    MoveSession.node,
    InstanceStore.node,
    ProjectDirectories.node,
    LocationServiceMap.node,
    EventV2Bridge.node,
    EventV2.node,
    Database.node,
    Config.node,
    Provider.node,
  ],
})

export * as WorkHandoff from "./workHandoff"
