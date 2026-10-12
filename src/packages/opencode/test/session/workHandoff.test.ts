import { expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { AppNodeBuilderV1 } from "@/effect/app-node-builder-v1"
import { WorkHandoff } from "@/session/workHandoff"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { InstanceStore } from "@/project/instance-store"
import { SessionRunState } from "@/session/run-state"
import { TestInstance } from "../fixture/fixture"
import { pollWithTimeout, testEffect } from "../lib/effect"

const it = testEffect(
  AppNodeBuilderV1.build(
    LayerNode.group([
      WorkHandoff.node,
      Session.node,
      SessionPrompt.node,
      InstanceStore.node,
      SessionProjector.node,
      SessionRunState.node,
    ]),
  ),
)

it.instance(
  "work handoff completes an idle session and double done is idempotent",
  () =>
    Effect.gen(function* () {
      const fixture = yield* TestInstance
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const handoff = yield* WorkHandoff.Service
      const session = yield* sessions.create({ title: "work handoff" })
      const resolve = (input: SessionPrompt.TurnInput) => prompt.prompt(input).pipe(Effect.orDie)
      const copy = yield* handoff.start(session.id, "idle", resolve)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => Bun.$`git worktree remove --force ${copy}`.cwd(fixture.directory).nothrow().quiet()).pipe(
          Effect.asVoid,
        ),
      )
      yield* Effect.promise(() => Bun.write(path.join(copy, "change.txt"), "work copy\n"))
      yield* handoff.request(session.id, resolve)
      yield* handoff.request(session.id, resolve)
      const finished = yield* pollWithTimeout(
        sessions
          .get(session.id)
          .pipe(Effect.map((current) => (current.metadata?.ocWorkHandoff?.phase === "complete" ? current : undefined))),
        "idle handoff did not complete",
        "20 seconds",
      )
      expect(finished.directory).toBe(fixture.directory)
      expect(
        (yield* Effect.promise(() => Bun.file(path.join(fixture.directory, "change.txt")).text())).replaceAll(
          "\r\n",
          "\n",
        ),
      ).toBe("work copy\n")
      expect(yield* Effect.promise(() => Bun.file(path.join(copy, ".git")).exists())).toBe(false)
      yield* handoff.request(session.id, resolve)
    }),
  { git: true },
  30_000,
)

it.instance(
  "work handoff preserves nested copies and duplicate done targets only the original copy",
  () =>
    Effect.gen(function* () {
      const fixture = yield* TestInstance
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const handoff = yield* WorkHandoff.Service
      const session = yield* sessions.create({ title: "nested work" })
      const resolve = (input: SessionPrompt.TurnInput) => prompt.prompt(input).pipe(Effect.orDie)
      const outer = yield* handoff.start(session.id, "outer", resolve)
      const inner = yield* handoff.start(session.id, "inner", resolve)
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await Bun.$`git worktree remove --force ${inner}`.cwd(fixture.directory).nothrow().quiet()
          await Bun.$`git worktree remove --force ${outer}`.cwd(fixture.directory).nothrow().quiet()
        }),
      )
      yield* Effect.promise(() => Bun.write(path.join(inner, "nested.txt"), "inner work\n"))
      yield* handoff.request(session.id, resolve, [], inner)
      yield* pollWithTimeout(
        Effect.gen(function* () {
          const current = yield* sessions.get(session.id)
          return !(yield* handoff.isPending(session.id)) && current.metadata?.ocWorkHandoff?.phase === "complete"
            ? current
            : undefined
        }),
        "inner handoff did not complete",
        "20 seconds",
      )
      yield* handoff.request(session.id, resolve, [], inner)
      expect((yield* sessions.get(session.id)).directory).toBe(outer)
      expect(yield* Effect.promise(() => Bun.file(path.join(outer, ".git")).exists())).toBe(true)
      expect(yield* Effect.promise(() => Bun.file(path.join(fixture.directory, "nested.txt")).exists())).toBe(false)
      yield* handoff.request(session.id, resolve, [], outer)
      yield* pollWithTimeout(
        sessions
          .get(session.id)
          .pipe(
            Effect.map((current) =>
              current.directory === fixture.directory && current.metadata?.ocWorkHandoff?.phase === "complete"
                ? current
                : undefined,
            ),
          ),
        "outer handoff did not complete",
        "20 seconds",
      )
      expect(
        (yield* Effect.promise(() => Bun.file(path.join(fixture.directory, "nested.txt")).text())).replaceAll(
          "\r\n",
          "\n",
        ),
      ).toBe("inner work\n")
    }),
  { git: true },
  45_000,
)

it.instance(
  "work handoff retries failed copy removal from the parent",
  () =>
    Effect.gen(function* () {
      const fixture = yield* TestInstance
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const handoff = yield* WorkHandoff.Service
      const session = yield* sessions.create({ title: "retry cleanup" })
      const resolve = (input: SessionPrompt.TurnInput) => prompt.prompt(input).pipe(Effect.orDie)
      const copy = yield* handoff.start(session.id, "locked", resolve)
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          await Bun.$`git worktree unlock ${copy}`.cwd(fixture.directory).nothrow().quiet()
          await Bun.$`git worktree remove --force ${copy}`.cwd(fixture.directory).nothrow().quiet()
        }),
      )
      yield* Effect.promise(() => Bun.write(path.join(copy, "change.txt"), "retry cleanup\n"))
      yield* Effect.promise(() => Bun.$`git worktree lock ${copy}`.cwd(fixture.directory).quiet())
      yield* handoff.request(session.id, resolve)
      const failed = yield* pollWithTimeout(
        Effect.gen(function* () {
          const current = yield* sessions.get(session.id)
          return !(yield* handoff.isPending(session.id)) && current.metadata?.ocWorkHandoff?.phase === "merged"
            ? current
            : undefined
        }),
        "locked cleanup did not stop",
        "20 seconds",
      )
      expect(failed.directory).toBe(fixture.directory)
      expect(yield* Effect.promise(() => Bun.file(path.join(copy, ".git")).exists())).toBe(true)
      yield* Effect.promise(() => Bun.$`git worktree unlock ${copy}`.cwd(fixture.directory).quiet())
      yield* handoff.request(session.id, resolve)
      yield* pollWithTimeout(
        sessions
          .get(session.id)
          .pipe(Effect.map((current) => (current.metadata?.ocWorkHandoff?.phase === "complete" ? current : undefined))),
        "cleanup retry did not complete",
        "20 seconds",
      )
      expect(yield* Effect.promise(() => Bun.file(path.join(copy, ".git")).exists())).toBe(false)
      expect(
        (yield* Effect.promise(() => Bun.file(path.join(fixture.directory, "change.txt")).text())).replaceAll(
          "\r\n",
          "\n",
        ),
      ).toBe("retry cleanup\n")
    }),
  { git: true },
  40_000,
)

it.instance(
  "work handoff refuses deleting a copy another session uses",
  () =>
    Effect.gen(function* () {
      const fixture = yield* TestInstance
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const handoff = yield* WorkHandoff.Service
      const instances = yield* InstanceStore.Service
      const session = yield* sessions.create({ title: "shared copy" })
      const resolve = (input: SessionPrompt.TurnInput) => prompt.prompt(input).pipe(Effect.orDie)
      const copy = yield* handoff.start(session.id, "shared", resolve)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => Bun.$`git worktree remove --force ${copy}`.cwd(fixture.directory).nothrow().quiet()).pipe(
          Effect.asVoid,
        ),
      )
      const other = yield* instances.provide({ directory: copy }, sessions.create({ title: "other session" }))
      yield* handoff.request(session.id, resolve)
      yield* pollWithTimeout(
        Effect.gen(function* () {
          const current = yield* sessions.get(session.id)
          return !(yield* handoff.isPending(session.id)) && current.metadata?.ocWorkHandoff?.phase === "stopped"
            ? current
            : undefined
        }),
        "shared-copy handoff did not stop",
        "20 seconds",
      )
      expect((yield* sessions.get(session.id)).directory).toBe(copy)
      expect((yield* sessions.get(other.id)).directory).toBe(copy)
      expect(yield* Effect.promise(() => Bun.file(path.join(copy, ".git")).exists())).toBe(true)
    }),
  { git: true },
  30_000,
)

it.instance(
  "work handoff moves its idle subagent sessions with the parent",
  () =>
    Effect.gen(function* () {
      const fixture = yield* TestInstance
      const sessions = yield* Session.Service
      const prompt = yield* SessionPrompt.Service
      const handoff = yield* WorkHandoff.Service
      const instances = yield* InstanceStore.Service
      const session = yield* sessions.create({ title: "parent and subagents" })
      const resolve = (input: SessionPrompt.TurnInput) => prompt.prompt(input).pipe(Effect.orDie)
      const copy = yield* handoff.start(session.id, "family", resolve)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => Bun.$`git worktree remove --force ${copy}`.cwd(fixture.directory).nothrow().quiet()).pipe(
          Effect.asVoid,
        ),
      )
      const child = yield* instances.provide(
        { directory: copy },
        sessions.create({ title: "child", parentID: session.id }),
      )
      const grandchild = yield* instances.provide(
        { directory: copy },
        sessions.create({ title: "grandchild", parentID: child.id }),
      )
      yield* handoff.request(session.id, resolve)
      yield* pollWithTimeout(
        sessions
          .get(session.id)
          .pipe(Effect.map((current) => (current.metadata?.ocWorkHandoff?.phase === "complete" ? current : undefined))),
        "family handoff did not finish",
        "20 seconds",
      )
      expect((yield* sessions.get(child.id)).directory).toBe(fixture.directory)
      expect((yield* sessions.get(grandchild.id)).directory).toBe(fixture.directory)
      expect((yield* sessions.get(grandchild.id)).parentID).toBe(child.id)
      expect(yield* Effect.promise(() => Bun.file(path.join(copy, ".git")).exists())).toBe(false)
    }),
  { git: true },
  35_000,
)
