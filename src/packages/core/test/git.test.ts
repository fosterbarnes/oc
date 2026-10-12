import { describe, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Git } from "@opencode-ai/core/git"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
import { branch, commit, gitRemote } from "./fixture/git"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(Git.node))

describe("Git", () => {
  it.live("clones a remote and reads checkout metadata", () =>
    withRemote((fixture) =>
      Effect.gen(function* () {
        const git = yield* Git.Service
        const target = AbsolutePath.make(path.join(fixture.root, "checkout"))
        const repository = yield* git.repo.clone({ remote: fixture.remote, directory: target })

        expect(yield* git.remote.get(repository)).toBe(fixture.remote)
        expect(yield* git.history.head(repository)).toBeString()
        expect(yield* git.history.branch(repository)).toBe("main")
        expect(yield* git.history.defaultRemoteBranch(repository)).toBe("main")
        expect(repository.worktree).toBe(target)
        expect(repository.gitDirectory).toBe(AbsolutePath.make(path.join(target, ".git")))
        expect(repository.commonDirectory).toBe(repository.gitDirectory)
        expect(yield* read(path.join(target, "README.md"))).toBe("one\n")
      }),
    ),
  )

  it.live(
    "fetches, checks out, and resets remote changes",
    () =>
      withRemote((fixture) =>
        Effect.gen(function* () {
          const git = yield* Git.Service
          const target = AbsolutePath.make(path.join(fixture.root, "checkout"))
          const repository = yield* git.repo.clone({ remote: fixture.remote, directory: target })

          yield* Effect.promise(() => commit(fixture.source, "two\n", "second"))
          yield* git.sync.fetchRemotes(repository)
          yield* git.sync.resetHard(repository, "origin/main")
          expect(yield* read(path.join(target, "README.md"))).toBe("two\n")

          yield* Effect.promise(() => branch(fixture.source, "feature/docs", "feature\n"))
          yield* git.sync.fetchBranch(repository, { branch: "feature/docs" })
          yield* git.sync.checkoutRemoteBranch(repository, { branch: "feature/docs" })
          yield* git.sync.resetHard(repository, "origin/feature/docs")
          expect(yield* git.history.branch(repository)).toBe("feature/docs")
          expect(yield* read(path.join(target, "README.md"))).toBe("feature\n")
        }),
      ),
    30_000,
  )
})

function withRemote<A, E, R>(body: (fixture: Awaited<ReturnType<typeof gitRemote>>) => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.promise(async () => {
      const root = await tmpdir()
      return { root, fixture: await gitRemote(root.path) }
    }),
    (input) => body(input.fixture),
    (input) => Effect.promise(() => input.root[Symbol.asyncDispose]()),
  )
}

function read(file: string) {
  return Effect.promise(() => fs.readFile(file, "utf8")).pipe(Effect.map((content) => content.replace(/\r\n/g, "\n")))
}

async function initRepo(directory: string) {
  await $`git init`.cwd(directory).quiet()
  await $`git config core.fsmonitor false`.cwd(directory).quiet()
  await $`git config core.autocrlf false`.cwd(directory).quiet()
  await $`git config commit.gpgsign false`.cwd(directory).quiet()
  await $`git config user.email test@opencode.test`.cwd(directory).quiet()
  await $`git config user.name Test`.cwd(directory).quiet()
  await $`git commit --allow-empty -m root`.cwd(directory).quiet()
}

describe("Git worktrees", () => {
  it.live("creates, lists, and removes linked worktrees", () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(() => initRepo(root.path))
      const directory = AbsolutePath.make(yield* Effect.promise(() => fs.realpath(root.path)))
      const worktree = AbsolutePath.make(`${root.path}-git-worktree`)
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => fs.rm(worktree, { recursive: true, force: true })).pipe(Effect.ignore),
      )
      const git = yield* Git.Service
      const repo = yield* git.repo.discover(directory)
      if (!repo) throw new Error("Repository not found")

      yield* git.worktree.create({ repository: repo, directory: worktree })

      expect((yield* git.worktree.list(repo)).some((entry) => entry.directory.endsWith("-git-worktree"))).toBe(true)
      const linked = yield* git.repo.discover(worktree)
      expect(linked?.worktree).toBe(AbsolutePath.make(yield* Effect.promise(() => fs.realpath(worktree))))
      expect(linked?.commonDirectory).toBe(repo.commonDirectory)
      expect(linked?.gitDirectory).not.toBe(repo.gitDirectory)
      if (!linked) throw new Error("Linked worktree not found")
      yield* git.worktree.remove({ repository: linked, directory: worktree, force: false })
      expect((yield* git.worktree.list(repo)).some((entry) => entry.directory.endsWith("-git-worktree"))).toBe(false)
    }),
  )

  it.live("copies staged, unstaged, and untracked contents without changing source files or index", () =>
    withWorkRepo((git, main, directory) =>
      Effect.gen(function* () {
        const files = ["staged.txt", "unstaged.txt", "untracked.txt"]
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(main.worktree, files[0]), "staged\n")
          await $`git add staged.txt`.cwd(main.worktree).quiet()
          await fs.writeFile(path.join(main.worktree, files[0]), "staged plus unstaged\n")
          await fs.writeFile(path.join(main.worktree, files[1]), "unstaged\n")
          await fs.writeFile(path.join(main.worktree, files[2]), "untracked\n")
        })
        const before = yield* checkoutState(main, files)
        const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
        expect(yield* checkoutState(main, files)).toEqual(before)
        expect(
          yield* Effect.promise(() => Promise.all(files.map((file) => fs.readFile(path.join(copy.worktree, file))))),
        ).toEqual(before.files)
      }),
    ),
    30_000,
  )

  it.live("handoff preserves staged and unstaged parent edits through merge retry and removal", () =>
    withWorkRepo((git, main, directory) =>
      Effect.gen(function* () {
        // The dirty source is part of the base, not a change owned by the copy.
        yield* Effect.promise(() => fs.writeFile(path.join(main.worktree, "unstaged.txt"), "source edit\n"))
        const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(main.worktree, "parent.txt"), "parent commit\n")
          await $`git add parent.txt`.cwd(main.worktree).quiet()
          await $`git commit -m parent`.cwd(main.worktree).quiet()
          await fs.writeFile(path.join(main.worktree, "unstaged.txt"), "parent edit\n")
          await fs.writeFile(path.join(main.worktree, "staged.txt"), "parent staged\n")
          await $`git add staged.txt`.cwd(main.worktree).quiet()
          await fs.writeFile(path.join(copy.worktree, "copy.txt"), "copy committed\n")
          await $`git add copy.txt`.cwd(copy.worktree).quiet()
          await $`git commit -m copy`.cwd(copy.worktree).quiet()
          await fs.writeFile(path.join(copy.worktree, "new.txt"), "new\n")
          await fs.unlink(path.join(copy.worktree, "deleted.txt"))
        })
        const index = yield* Effect.promise(() => fs.readFile(path.join(main.gitDirectory, "index")))
        const cached = yield* Effect.promise(() => $`git diff --cached`.cwd(main.worktree).text())
        expect(yield* git.worktree.merge({ copy })).toEqual({ directory: main.worktree, conflicts: [] })
        expect(yield* read(path.join(main.worktree, "parent.txt"))).toBe("parent commit\n")
        expect(yield* read(path.join(main.worktree, "unstaged.txt"))).toBe("parent edit\n")
        expect(yield* read(path.join(main.worktree, "copy.txt"))).toBe("copy committed\n")
        expect(yield* read(path.join(main.worktree, "new.txt"))).toBe("new\n")
        expect(yield* Effect.promise(() => fs.readFile(path.join(main.gitDirectory, "index")))).toEqual(index)
        expect(yield* Effect.promise(() => $`git diff --cached`.cwd(main.worktree).text())).toBe(cached)
        const status = yield* Effect.promise(() => $`git status --porcelain`.cwd(main.worktree).text())
        expect(status).toContain(" M copy.txt")
        expect(status).toContain(" D deleted.txt")
        expect(status).toContain("?? new.txt")
        expect(
          yield* Effect.promise(() =>
            $`git config --get ${`oc.work.${path.basename(directory)}.base`}`
              .cwd(main.worktree)
              .nothrow()
              .quiet()
              .then((result) => result.exitCode),
          ),
        ).toBe(0)
        expect(yield* git.worktree.merge({ copy })).toEqual({ directory: main.worktree, conflicts: [] })
        expect(yield* read(path.join(main.worktree, "copy.txt"))).toBe("copy committed\n")
        yield* git.worktree.remove({ repository: main, directory, force: true })
        yield* git.worktree.remove({ repository: main, directory, force: true })
        expect(yield* Effect.promise(() => $`git for-each-ref refs/oc/`.cwd(main.worktree).text())).toBe("")
      }),
    ),
    30_000,
  )

  it.live(
    "handoff rejects unresolved markers and merges explicit resolution without changing real indexes",
    () =>
      withWorkRepo((git, main, directory) =>
        Effect.gen(function* () {
          const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
          yield* Effect.promise(async () => {
            await fs.writeFile(path.join(main.worktree, "copy.txt"), "parent\n")
            await fs.writeFile(path.join(copy.worktree, "copy.txt"), "copy\n")
            await fs.writeFile(path.join(copy.worktree, "new.txt"), "must not land\n")
          })
          const before = yield* checkoutState(main, ["copy.txt"])
          const copyIndex = yield* Effect.promise(() => fs.readFile(path.join(copy.gitDirectory, "index")))
          expect(yield* git.worktree.merge({ copy })).toEqual({ directory: copy.worktree, conflicts: ["copy.txt"] })
          const marked = yield* read(path.join(copy.worktree, "copy.txt"))
          expect(marked).toContain("<<<<<<<")
          expect(marked).toContain("=======")
          expect(marked).toContain(">>>>>>>")
          expect(marked).toContain("parent\n")
          expect(marked).toContain("copy\n")
          expect((yield* git.worktree.merge({ copy, resolved: ["copy.txt"] })).conflicts).toEqual(["copy.txt"])
          expect(yield* checkoutState(main, ["copy.txt"])).toEqual(before)
          expect(yield* Effect.promise(() => fs.readFile(path.join(copy.gitDirectory, "index")))).toEqual(copyIndex)
          expect(yield* checkoutState(main, ["copy.txt"])).toEqual(before)
          expect(
            yield* Effect.promise(() =>
              fs.access(path.join(main.worktree, "new.txt")).then(
                () => true,
                () => false,
              ),
            ),
          ).toBe(false)
          const base = yield* Effect.promise(() =>
            $`git config --get ${`oc.work.${path.basename(directory)}.base`}`.cwd(copy.worktree).text(),
          )
          expect(
            yield* Effect.promise(() =>
              $`git rev-parse ${`refs/oc/work/${path.basename(directory)}`}`.cwd(copy.worktree).text(),
            ),
          ).toBe(base)
          expect(yield* Effect.promise(() => $`git show ${`${base.trim()}:copy.txt`}`.cwd(copy.worktree).text())).toBe(
            "parent\n",
          )
          yield* Effect.promise(() => fs.writeFile(path.join(copy.worktree, "copy.txt"), "parent and copy\n"))
          expect(yield* git.worktree.merge({ copy, resolved: ["copy.txt"] })).toEqual({ directory: main.worktree, conflicts: [] })
          expect(yield* read(path.join(main.worktree, "copy.txt"))).toBe("parent and copy\n")
          expect(yield* Effect.promise(() => fs.readFile(path.join(main.gitDirectory, "index")))).toEqual(before.index)
          expect(yield* Effect.promise(() => $`git status --porcelain`.cwd(main.worktree).text())).toContain(
            " M copy.txt",
          )
        }),
      ),
    30_000,
  )

  it.live(
    "merges an inner copy into its outer copy without touching main",
    () =>
      withWorkRepo((git, main, directory) =>
        Effect.gen(function* () {
          const outer = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
          const innerDirectory = AbsolutePath.make(path.join(path.dirname(directory), "inner"))
          const inner = yield* git.worktree.copy({ repository: outer, directory: innerDirectory, name: "inner" })
          const before = yield* checkoutState(main, ["copy.txt"])
          yield* Effect.promise(() => fs.writeFile(path.join(inner.worktree, "copy.txt"), "inner\n"))
          expect(yield* git.worktree.merge({ copy: inner })).toEqual({ directory: outer.worktree, conflicts: [] })
          expect(yield* read(path.join(outer.worktree, "copy.txt"))).toBe("inner\n")
          expect(yield* checkoutState(main, ["copy.txt"])).toEqual(before)
          expect(yield* git.worktree.merge({ copy: outer })).toEqual({ directory: main.worktree, conflicts: [] })
          expect(yield* read(path.join(main.worktree, "copy.txt"))).toBe("inner\n")
        }),
      ),
    30_000,
  )

  it.live("handoff keeps all conflict names and requires binary and deletion resolution", () =>
    withWorkRepo((git, main, directory) => Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(main.worktree, "binary.dat"), Buffer.from([0, 1]))
        await $`git add binary.dat`.cwd(main.worktree).quiet()
        await $`git commit -m binary`.cwd(main.worktree).quiet()
      })
      const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(main.worktree, "binary.dat"), Buffer.from([0, 2]))
        await fs.writeFile(path.join(copy.worktree, "binary.dat"), Buffer.from([0, 3]))
        await fs.writeFile(path.join(main.worktree, "deleted.txt"), "modified\n")
        await fs.unlink(path.join(copy.worktree, "deleted.txt"))
      })
      const before = yield* checkoutState(main, ["binary.dat", "deleted.txt"])
      const conflict = yield* git.worktree.merge({ copy })
      expect(conflict.conflicts).toEqual(["binary.dat", "deleted.txt"])
      expect((yield* git.worktree.merge({ copy })).conflicts).toEqual(conflict.conflicts)
      expect(yield* checkoutState(main, ["binary.dat", "deleted.txt"])).toEqual(before)
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(copy.worktree, "binary.dat"), Buffer.from([0, 4]))
        await fs.unlink(path.join(copy.worktree, "deleted.txt"))
      })
      expect((yield* git.worktree.merge({ copy, resolved: conflict.conflicts })).conflicts).toEqual([])
      expect(yield* Effect.promise(() => fs.readFile(path.join(main.worktree, "binary.dat")))).toEqual(Buffer.from([0, 4]))
      expect(yield* Effect.promise(() => fs.readFile(path.join(main.gitDirectory, "index")))).toEqual(before.index)
    })), 30_000,
  )

  it.live("handoff copies only ignored regular root environment files without following links", () =>
    withWorkRepo((git, main, directory) => Effect.gen(function* () {
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(main.worktree, ".gitignore"), ".env*\nignored/\n")
        await fs.writeFile(path.join(main.worktree, ".env.local"), "LOCAL=1\n")
        await fs.mkdir(path.join(main.worktree, ".envDirectory"))
        await fs.writeFile(path.join(main.worktree, ".envDirectory", "secret"), "not copied")
        await fs.mkdir(path.join(main.worktree, "ignored"))
        await fs.writeFile(path.join(main.worktree, "ignored", ".env"), "not copied")
        await fs.symlink(path.join(main.worktree, "ignored"), path.join(main.worktree, ".envEscape"), process.platform === "win32" ? "junction" : "dir")
      })
      const before = yield* checkoutState(main, ["copy.txt"])
      const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
      expect(yield* read(path.join(copy.worktree, ".env.local"))).toBe("LOCAL=1\n")
      const files = yield* Effect.promise(() => fs.readdir(copy.worktree))
      expect(files).not.toContain(".envDirectory")
      expect(files).not.toContain(".envEscape")
      expect(files).not.toContain("ignored")
      expect(yield* checkoutState(main, ["copy.txt"])).toEqual(before)
    })), 30_000,
  )

  it.live("handoff refuses removing a parent copy while nested copies remain", () =>
    withWorkRepo((git, main, directory) => Effect.gen(function* () {
      const outer = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
      const innerDirectory = AbsolutePath.make(path.join(path.dirname(directory), "inner"))
      const inner = yield* git.worktree.copy({ repository: outer, directory: innerDirectory, name: "inner" })
      expect((yield* git.worktree.remove({ repository: main, directory, force: true }).pipe(Effect.flip)).message).toContain("nested")
      expect(yield* git.worktree.parent(outer)).toBe(main.worktree)
      yield* git.worktree.remove({ repository: main, directory: inner.worktree, force: true })
      yield* git.worktree.remove({ repository: main, directory, force: true })
    })), 30_000,
  )

  it.live("handoff resumes a partially written merge without overwriting newer unrelated parent files", () =>
    withWorkRepo((git, main, directory) => Effect.gen(function* () {
      const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(copy.worktree, ".gitattributes"), "bad.txt filter=fail\n")
        await fs.writeFile(path.join(copy.worktree, "a.txt"), "written before failure\n")
        await fs.writeFile(path.join(copy.worktree, "bad.txt"), "written after retry\n")
        await $`git config filter.fail.smudge ${"exit 1"}`.cwd(main.worktree).quiet()
        await $`git config filter.fail.clean cat`.cwd(main.worktree).quiet()
        await $`git config filter.fail.required true`.cwd(main.worktree).quiet()
      })
      const index = yield* Effect.promise(() => fs.readFile(path.join(main.gitDirectory, "index")))
      const head = yield* git.history.head(main)
      const failure = yield* git.worktree.merge({ copy }).pipe(Effect.flip)
      expect(failure.operation).toBe("merge")
      expect(yield* read(path.join(main.worktree, "a.txt"))).toBe("written before failure\n")
      expect(yield* Effect.promise(() => $`git config --get oc.work.copy.writing`.cwd(main.worktree).text())).toContain('"tree"')
      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(main.worktree, "outside.txt"), "new parent work\n")
        await $`git config --unset filter.fail.smudge`.cwd(main.worktree).quiet()
        await $`git config filter.fail.required false`.cwd(main.worktree).quiet()
      })
      expect((yield* git.worktree.merge({ copy })).conflicts).toEqual([])
      expect(yield* read(path.join(main.worktree, "bad.txt"))).toBe("written after retry\n")
      expect(yield* read(path.join(main.worktree, "outside.txt"))).toBe("new parent work\n")
      expect(yield* Effect.promise(() => fs.readFile(path.join(main.gitDirectory, "index")))).toEqual(index)
      expect(yield* git.history.head(main)).toBe(head)
    })), 30_000,
  )

  it.live("ignores final-newline differences when both sides change the same line", () =>
    withWorkRepo((git, main, directory) =>
      Effect.gen(function* () {
        const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(main.worktree, "copy.txt"), "main")
          await fs.writeFile(path.join(copy.worktree, "copy.txt"), "main\n")
        })
        expect(yield* git.worktree.merge({ copy })).toEqual({ directory: main.worktree, conflicts: [] })
        expect((yield* read(path.join(main.worktree, "copy.txt"))).trimEnd()).toBe("main")
      }),
    ),
    30_000,
  )

  it.live("preserves CRLF checkout bytes and does not introduce phantom changes", () =>
    withWorkRepo((git, main, directory) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await $`git config core.autocrlf true`.cwd(main.worktree).quiet()
          await fs.writeFile(path.join(main.worktree, "copy.txt"), "base\r\n")
        })
        const before = yield* checkoutState(main, ["copy.txt"])
        const copy = yield* git.worktree.copy({ repository: main, directory, name: path.basename(directory) })
        expect(yield* checkoutState(main, ["copy.txt"])).toEqual(before)
        expect(yield* Effect.promise(() => fs.readFile(path.join(copy.worktree, "copy.txt"), "utf8"))).toBe("base\r\n")
        yield* Effect.promise(() => fs.writeFile(path.join(copy.worktree, "copy.txt"), "changed\r\n"))
        yield* git.worktree.merge({ copy })
        expect(yield* Effect.promise(() => fs.readFile(path.join(main.worktree, "copy.txt"), "utf8"))).toBe(
          "changed\r\n",
        )
        expect(yield* Effect.promise(() => $`git diff --name-only`.cwd(main.worktree).text())).toBe("copy.txt\n")
      }),
    ),
    30_000,
  )
})

function checkoutState(repository: Git.Repository, files: string[]) {
  return Effect.promise(async () => ({
    // status --no-optional-locks must not refresh the index under test.
    status: await $`git --no-optional-locks status --porcelain`.cwd(repository.worktree).text(),
    index: await fs.readFile(path.join(repository.gitDirectory, "index")),
    files: await Promise.all(files.map((file) => fs.readFile(path.join(repository.worktree, file)))),
  }))
}

function withWorkRepo<A, E, R>(
  body: (git: Git.Interface, main: Git.Repository, directory: AbsolutePath) => Effect.Effect<A, E, R>,
) {
  return Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    )
    const mainDirectory = AbsolutePath.make(path.join(root.path, "main"))
    yield* Effect.promise(async () => {
      await fs.mkdir(mainDirectory)
      await initRepo(mainDirectory)
      await Promise.all(
        ["staged.txt", "unstaged.txt", "copy.txt", "deleted.txt"].map((file) =>
          fs.writeFile(path.join(mainDirectory, file), "base\n"),
        ),
      )
      await $`git add .`.cwd(mainDirectory).quiet()
      await $`git commit -m initial`.cwd(mainDirectory).quiet()
    })
    const git = yield* Git.Service
    const main = yield* git.repo.discover(mainDirectory)
    if (!main) throw new Error("Repository not found")
    return yield* body(git, main, AbsolutePath.make(path.join(root.path, "copy")))
  })
}

describe("Git trees", () => {
  it.live("captures, compares, previews, and restores scoped trees", () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      yield* Effect.promise(async () => {
        await initRepo(root.path)
        await fs.mkdir(path.join(root.path, "scope"))
        await fs.writeFile(path.join(root.path, "scope", "tracked.txt"), "one\n")
        await fs.writeFile(path.join(root.path, "outside.txt"), "outside\n")
        await $`git add .`.cwd(root.path).quiet()
        await $`git commit -m initial`.cwd(root.path).quiet()
      })
      const git = yield* Git.Service
      const source = yield* git.repo.discover(AbsolutePath.make(root.path))
      if (!source) throw new Error("Repository not found")
      const storage = AbsolutePath.make(path.join(root.path, ".snapshot"))
      const repository = yield* git.repo.create({ worktree: source.worktree, gitDirectory: storage, seed: source })
      yield* git.index.refresh({ repository, scope: RelativePath.make("scope") })
      const before = yield* git.tree.write(repository)

      yield* Effect.promise(async () => {
        await fs.writeFile(path.join(root.path, "scope", "tracked.txt"), "two\n")
        await fs.writeFile(path.join(root.path, "scope", "added.txt"), "added\n")
        await fs.writeFile(path.join(root.path, "outside.txt"), "changed outside\n")
      })
      yield* git.index.refresh({ repository, scope: RelativePath.make("scope") })
      const after = yield* git.tree.write(repository)

      expect(yield* git.tree.files({ repository, from: before, to: after })).toEqual([
        RelativePath.make("scope/added.txt"),
        RelativePath.make("scope/tracked.txt"),
      ])
      const diffs = yield* git.tree.diff({ repository, from: before, to: after, context: 1 })
      expect(diffs.map((item) => [item.path, item.status])).toEqual([
        [RelativePath.make("scope/added.txt"), "added"],
        [RelativePath.make("scope/tracked.txt"), "modified"],
      ])

      const files = new Map([[RelativePath.make("scope/tracked.txt"), before]])
      const preview = yield* git.tree.preview({ repository, current: after, files, context: 1 })
      expect(preview).toHaveLength(1)
      expect(preview[0]?.path).toBe(RelativePath.make("scope/tracked.txt"))
      yield* git.tree.restore({ repository, files })
      expect(yield* read(path.join(root.path, "scope", "tracked.txt"))).toBe("one\n")
      expect(yield* read(path.join(root.path, "scope", "added.txt"))).toBe("added\n")
      expect(yield* read(path.join(root.path, "outside.txt"))).toBe("changed outside\n")
    }),
  )
})

