import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Deferred, Effect, Layer } from "effect"
import { Project } from "@/project/project"
import { Session as SessionNs } from "@/session/session"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { provideInstance, TestInstance, tmpdirScoped } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Database } from "@opencode-ai/core/database/database"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { eq } from "drizzle-orm"

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([SessionNs.node, SessionProjector.node, Project.node, CrossSpawnSpawner.node, Database.node]),
  ),
)

const withSession = (input?: Parameters<SessionNs.Interface["create"]>[0]) =>
  Effect.acquireRelease(SessionNs.use.create(input), (created) =>
    SessionNs.Service.use((session) => session.remove(created.id).pipe(Effect.ignore)),
  )

describe("session.listGlobal", () => {
  it.instance(
    "intersects all manual statuses with search before limiting and retains root/archive conditions",
    () =>
      Effect.gen(function* () {
        const instance = yield* TestInstance
        const sessions = yield* SessionNs.Service
        const database = yield* Database.Service
        const unmarked = yield* withSession({ title: "status-target-unmarked" })
        const progress = yield* withSession({ title: "status-target-progress" })
        const complete = yield* withSession({ title: "status-target-complete" })
        const failed = yield* withSession({ title: "status-target-failed" })
        const archived = yield* withSession({ title: "status-target-archived" })
        const child = yield* withSession({ title: "status-target-child", parentID: progress.id })
        yield* sessions.setSessionInProgress({ sessionID: progress.id, sessionInProgress: true })
        yield* sessions.setSessionComplete({ sessionID: complete.id, sessionComplete: true })
        yield* sessions.setSessionFailed({ sessionID: failed.id, sessionFailed: true })
        yield* sessions.setSessionInProgress({ sessionID: archived.id, sessionInProgress: true })
        yield* sessions.setArchived({ sessionID: archived.id, time: 1 })
        yield* sessions.setSessionInProgress({ sessionID: child.id, sessionInProgress: true })
        yield* Effect.forEach([unmarked, progress, complete, failed, archived, child], (session, index) =>
          database.db
            .update(SessionTable)
            .set({ time_updated: index + 1 })
            .where(eq(SessionTable.id, session.id))
            .run()
            .pipe(Effect.orDie),
        )
        // More recent nonmatches than the limit must not hide the older marked rows.
        yield* Effect.forEach([0, 1, 2], (index) => withSession({ title: `status-other-${index}` }))
        const query = { directory: instance.directory, roots: true, search: "status-target", limit: 1 }
        for (const [status, expected] of [
          ["unmarked", unmarked],
          ["in_progress", progress],
          ["complete", complete],
          ["failed", failed],
        ] as const) {
          expect((yield* sessions.listGlobal({ ...query, status })).map((session) => session.id)).toEqual([
            expected.id,
          ])
        }
        expect((yield* sessions.listGlobal({ ...query, limit: 10 })).map((session) => session.id)).toEqual([
          failed.id,
          complete.id,
          progress.id,
          unmarked.id,
        ])
        expect(
          (yield* sessions.listGlobal({ ...query, status: "in_progress", archived: true })).map(
            (session) => session.id,
          ),
        ).toEqual([archived.id])
        expect(
          (yield* sessions.listGlobal({ ...query, status: "in_progress", roots: false })).map(
            (session) => session.id,
          ),
        ).toEqual([child.id])
        expect(yield* sessions.listGlobal({ ...query, status: "in_progress", start: 3 })).toEqual([])
        expect(yield* sessions.listGlobal({ ...query, status: "complete", cursor: 3 })).toEqual([])
      }),
    { git: true },
  )

  it.instance(
    "lists sessions across projects with project metadata",
    () =>
      Effect.gen(function* () {
        const first = yield* TestInstance
        const second = yield* tmpdirScoped({ git: true })

        const firstSession = yield* withSession({ title: "first-session" })
        const secondSession = yield* withSession({ title: "second-session" }).pipe(provideInstance(second))

        const sessions = yield* SessionNs.Service.use((session) => session.listGlobal({ limit: 200 }))
        const ids = sessions.map((session) => session.id)

        expect(ids).toContain(firstSession.id)
        expect(ids).toContain(secondSession.id)

        const firstProject = yield* Project.use.get(firstSession.projectID)
        const secondProject = yield* Project.use.get(secondSession.projectID)

        const firstItem = sessions.find((session) => session.id === firstSession.id)
        const secondItem = sessions.find((session) => session.id === secondSession.id)

        expect(firstItem?.project?.id).toBe(firstProject?.id)
        expect(firstItem?.project?.worktree).toBe(firstProject?.worktree)
        expect(secondItem?.project?.id).toBe(secondProject?.id)
        expect(secondItem?.project?.worktree).toBe(secondProject?.worktree)
        expect(first.directory).not.toBe(second)
      }),
    { git: true },
  )

  it.instance(
    "excludes archived sessions by default",
    () =>
      Effect.gen(function* () {
        const archived = yield* withSession({ title: "archived-session" })

        yield* SessionNs.Service.use((session) => session.setArchived({ sessionID: archived.id, time: Date.now() }))

        const sessions = yield* SessionNs.Service.use((session) => session.listGlobal({ limit: 200 }))
        const ids = sessions.map((session) => session.id)

        expect(ids).not.toContain(archived.id)

        const allSessions = yield* SessionNs.Service.use((session) =>
          session.listGlobal({ limit: 200, archived: true }),
        )
        const allIds = allSessions.map((session) => session.id)

        expect(allIds).toContain(archived.id)
      }),
    { git: true },
  )

  it.instance(
    "supports cursor pagination",
    () =>
      Effect.gen(function* () {
        const test = yield* TestInstance

        const first = yield* withSession({ title: "page-one" })
        const ready = yield* Deferred.make<void>()
        yield* Deferred.succeed(ready, undefined).pipe(Effect.delay("5 millis"), Effect.forkScoped)
        yield* Deferred.await(ready).pipe(
          Effect.timeoutOrElse({
            duration: "1 second",
            orElse: () => Effect.fail(new Error("timed out waiting between session creates")),
          }),
        )
        const second = yield* withSession({ title: "page-two" })

        const page = yield* SessionNs.Service.use((session) =>
          session.listGlobal({ directory: test.directory, limit: 1 }),
        )
        expect(page.length).toBe(1)
        expect(page[0].id).toBe(second.id)

        const next = yield* SessionNs.Service.use((session) =>
          session.listGlobal({ directory: test.directory, limit: 10, cursor: page[0].time.updated }),
        )
        const ids = next.map((session) => session.id)

        expect(ids).toContain(first.id)
        expect(ids).not.toContain(second.id)
      }),
    { git: true },
  )
})
