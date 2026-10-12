export * as Git from "./git"

import path from "path"
import { randomUUID } from "crypto"
import { constants } from "fs"
import { lstat, open } from "fs/promises"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AbsolutePath, RelativePath } from "./schema"
import { FSUtil } from "./fs-util"
import { AppProcess } from "./process"
import { makeGlobalNode } from "./effect/app-node"
import { File } from "./file"
import { KeyedMutex } from "./effect/keyed-mutex"

export class Repository extends Schema.Class<Repository>("Git.Repository")({
  worktree: AbsolutePath,
  gitDirectory: AbsolutePath,
  commonDirectory: AbsolutePath,
}) {}

export const ChangeSet = Schema.String.pipe(Schema.brand("Git.ChangeSet"))
export type ChangeSet = typeof ChangeSet.Type

export const TreeID = Schema.String.pipe(Schema.brand("Git.TreeID"))
export type TreeID = typeof TreeID.Type

export class OperationError extends Schema.TaggedErrorClass<OperationError>()("Git.OperationError", {
  operation: Schema.Literals([
    "clone",
    "fetch",
    "checkout",
    "reset",
    "create",
    "refresh",
    "write_tree",
    "list_files",
    "diff",
    "restore",
  ]),
  message: Schema.String,
  directory: Schema.optional(AbsolutePath),
  cause: Schema.optional(Schema.Defect()),
}) {}

export class Worktree extends Schema.Class<Worktree>("Git.Worktree")({
  directory: AbsolutePath,
  kind: Schema.Literals(["main", "linked"]),
}) {}

export class WorktreeError extends Schema.TaggedErrorClass<WorktreeError>()("Git.WorktreeError", {
  operation: Schema.Literals(["create", "remove", "list", "merge"]),
  message: Schema.String,
  directory: Schema.optional(AbsolutePath),
  forceRequired: Schema.optional(Schema.Boolean),
  cause: Schema.optional(Schema.Defect()),
}) {}

export class PatchError extends Schema.TaggedErrorClass<PatchError>()("Git.PatchError", {
  operation: Schema.Literals(["capture", "apply", "reset"]),
  directory: AbsolutePath,
  message: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {}

export interface Interface {
  readonly repo: {
    readonly discover: (input: AbsolutePath) => Effect.Effect<Repository | undefined>
    readonly clone: (input: {
      remote: string
      directory: AbsolutePath
      branch?: string
      depth?: number
    }) => Effect.Effect<Repository, OperationError>
    readonly create: (input: {
      worktree: AbsolutePath
      gitDirectory: AbsolutePath
      seed?: Repository
    }) => Effect.Effect<Repository, OperationError>
  }
  readonly remote: {
    readonly get: (repository: Repository, name?: string) => Effect.Effect<string | undefined>
  }
  readonly history: {
    readonly head: (repository: Repository) => Effect.Effect<string | undefined>
    readonly branch: (repository: Repository) => Effect.Effect<string | undefined>
    readonly defaultRemoteBranch: (repository: Repository, remote?: string) => Effect.Effect<string | undefined>
    readonly rootCommits: (repository: Repository) => Effect.Effect<readonly string[]>
  }
  readonly sync: {
    readonly fetchRemotes: (repository: Repository, input?: { prune?: boolean }) => Effect.Effect<void, OperationError>
    readonly fetchBranch: (
      repository: Repository,
      input: { remote?: string; branch: string; force?: boolean },
    ) => Effect.Effect<void, OperationError>
    readonly checkoutRemoteBranch: (
      repository: Repository,
      input: { remote?: string; branch: string; reset?: boolean },
    ) => Effect.Effect<void, OperationError>
    readonly resetHard: (repository: Repository, revision: string) => Effect.Effect<void, OperationError>
  }
  readonly change: {
    readonly capture: (input: { repository: Repository; path: AbsolutePath }) => Effect.Effect<ChangeSet, PatchError>
    readonly apply: (input: {
      repository: Repository
      path: AbsolutePath
      changes: ChangeSet
    }) => Effect.Effect<void, PatchError>
    readonly discard: (input: {
      repository: Repository
      path: AbsolutePath
      index: "preserve" | "reset"
      untracked: "preserve" | "remove"
    }) => Effect.Effect<void, PatchError>
  }
  readonly worktree: {
    readonly create: (input: {
      repository: Repository
      directory: AbsolutePath
    }) => Effect.Effect<Repository, WorktreeError>
    readonly copy: (input: {
      repository: Repository
      directory: AbsolutePath
      name: string
    }) => Effect.Effect<Repository, WorktreeError>
    readonly remove: (input: {
      repository: Repository
      directory: AbsolutePath
      force: boolean
    }) => Effect.Effect<void, WorktreeError>
    readonly list: (repository: Repository) => Effect.Effect<readonly Worktree[], WorktreeError>
    readonly parent: (repository: Repository) => Effect.Effect<AbsolutePath | undefined>
    readonly unchanged: (repository: Repository) => Effect.Effect<boolean, WorktreeError>
    /** Merge only the copy's changes into its recorded parent, preserving the real index. */
    readonly merge: (input: {
      copy: Repository
      resolved?: readonly string[]
    }) => Effect.Effect<{ readonly directory: AbsolutePath; readonly conflicts: readonly string[] }, WorktreeError>
  }
  readonly index: {
    /** Refresh only the requested project-relative scope, preserving all other entries. */
    readonly refresh: (input: {
      repository: Repository
      scope: RelativePath
      ignores?: Repository
      maximumUntrackedFileBytes?: number
    }) => Effect.Effect<{ readonly skipped: readonly RelativePath[] }, OperationError>
    readonly ignored: (input: {
      repository: Repository
      paths: readonly RelativePath[]
    }) => Effect.Effect<ReadonlySet<RelativePath>, OperationError>
  }
  readonly tree: {
    readonly capture: (input: {
      repository: Repository
      scopes: readonly RelativePath[]
      ignores?: Repository
      maximumUntrackedFileBytes?: number
    }) => Effect.Effect<TreeID, OperationError>
    readonly write: (repository: Repository) => Effect.Effect<TreeID, OperationError>
    readonly files: (input: {
      repository: Repository
      from: TreeID
      to: TreeID
    }) => Effect.Effect<readonly RelativePath[], OperationError>
    readonly diff: (input: {
      repository: Repository
      from: TreeID
      to: TreeID
      context?: number
      paths?: readonly RelativePath[]
    }) => Effect.Effect<readonly File.Diff[], OperationError>
    readonly preview: (input: {
      repository: Repository
      current: TreeID
      files: ReadonlyMap<RelativePath, TreeID>
      context?: number
    }) => Effect.Effect<readonly File.Diff[], OperationError>
    readonly restore: (input: {
      repository: Repository
      files: ReadonlyMap<RelativePath, TreeID>
    }) => Effect.Effect<void, OperationError>
    readonly checkout: (input: { repository: Repository; tree: TreeID }) => Effect.Effect<void, OperationError>
  }
}

export class Service extends Context.Service<Service, Interface>()("@opencode/GitV2") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const proc = yield* AppProcess.Service
    const locks = KeyedMutex.makeUnsafe<string>()
    const locked = <A, E, R>(repository: Repository, effect: Effect.Effect<A, E, R>) =>
      locks.withLock(repository.gitDirectory)(effect)

    const discover = Effect.fn("Git.repo.discover")(function* (input: AbsolutePath) {
      const dotgit = yield* fs.up({ targets: [".git"], start: input }).pipe(
        Effect.map((matches) => matches[0]),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (!dotgit) return undefined

      const cwd = path.dirname(dotgit)
      const git = run(cwd, proc)
      const topLevel = yield* git(["rev-parse", "--show-toplevel"])
      const gitDir = yield* git(["rev-parse", "--git-dir"])
      const commonDir = yield* git(["rev-parse", "--git-common-dir"])
      if (gitDir.exitCode !== 0 || commonDir.exitCode !== 0) return undefined

      return new Repository({
        worktree: AbsolutePath.make(topLevel.exitCode === 0 ? resolvePath(cwd, topLevel.text) : cwd),
        gitDirectory: AbsolutePath.make(resolvePath(cwd, gitDir.text)),
        commonDirectory: AbsolutePath.make(resolvePath(cwd, commonDir.text)),
      })
    })

    const remote = Effect.fn("Git.remote.get")(function* (repository: Repository, name = "origin") {
      const result = yield* run(repository.worktree, proc)(["remote", "get-url", name])
      if (result.exitCode !== 0) return undefined
      return result.text.trim() || undefined
    })

    const roots = Effect.fn("Git.history.rootCommits")(function* (repository: Repository) {
      const result = yield* run(repository.worktree, proc)(["rev-list", "--max-parents=0", "HEAD"])
      if (result.exitCode !== 0) return []
      return result.text
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .toSorted()
    })

    const head = Effect.fn("Git.history.head")(function* (repository: Repository) {
      const result = yield* run(repository.worktree, proc)(["rev-parse", "HEAD"])
      if (result.exitCode !== 0) return undefined
      return result.text.trim() || undefined
    })

    const branch = Effect.fn("Git.history.branch")(function* (repository: Repository) {
      const result = yield* run(repository.worktree, proc)(["symbolic-ref", "--quiet", "--short", "HEAD"])
      if (result.exitCode !== 0) return undefined
      return result.text.trim() || undefined
    })

    const remoteHead = Effect.fn("Git.history.defaultRemoteBranch")(function* (
      repository: Repository,
      remoteName = "origin",
    ) {
      const result = yield* run(repository.worktree, proc)(["symbolic-ref", `refs/remotes/${remoteName}/HEAD`])
      if (result.exitCode !== 0) return undefined
      return result.text.trim().replace(new RegExp(`^refs/remotes/${remoteName}/`), "") || undefined
    })

    const operation = Effect.fnUntraced(function* (
      operation: OperationError["operation"],
      directory: AbsolutePath,
      args: string[],
    ) {
      const result = yield* execute(
        directory,
        proc,
      )(args).pipe(
        Effect.mapError((cause) => new OperationError({ operation, directory, message: cause.message, cause })),
      )
      if (result.exitCode === 0) return
      return yield* new OperationError({
        operation,
        directory,
        message: result.stderr.trim() || result.text.trim() || `Git ${operation} failed`,
      })
    })

    const clone = Effect.fn("Git.repo.clone")(function* (input: {
      remote: string
      directory: AbsolutePath
      branch?: string
      depth?: number
    }) {
      yield* operation("clone", AbsolutePath.make(path.dirname(input.directory)), [
        "clone",
        "--depth",
        String(input.depth ?? 100),
        ...(input.branch ? ["--branch", input.branch] : []),
        "--",
        input.remote,
        input.directory,
      ])
      const repository = yield* discover(input.directory)
      if (repository) return repository
      return yield* new OperationError({
        operation: "clone",
        directory: input.directory,
        message: "Cloned repository could not be opened",
      })
    })

    const fetch = Effect.fn("Git.sync.fetchRemotes")(function* (
      repository: Repository,
      input: { prune?: boolean } = {},
    ) {
      yield* operation("fetch", repository.worktree, ["fetch", "--all", ...(input.prune === false ? [] : ["--prune"])])
    })

    const fetchBranch = Effect.fn("Git.sync.fetchBranch")(function* (
      repository: Repository,
      input: { remote?: string; branch: string; force?: boolean },
    ) {
      const remoteName = input.remote ?? "origin"
      const spec = `refs/heads/${input.branch}:refs/remotes/${remoteName}/${input.branch}`
      yield* operation("fetch", repository.worktree, ["fetch", remoteName, input.force === false ? spec : `+${spec}`])
    })

    const checkout = Effect.fn("Git.sync.checkoutRemoteBranch")(function* (
      repository: Repository,
      input: { remote?: string; branch: string; reset?: boolean },
    ) {
      const remoteName = input.remote ?? "origin"
      yield* operation("checkout", repository.worktree, [
        "checkout",
        ...(input.reset === false ? [input.branch] : ["-B", input.branch, `${remoteName}/${input.branch}`]),
      ])
    })

    const reset = Effect.fn("Git.sync.resetHard")(function* (repository: Repository, revision: string) {
      yield* operation("reset", repository.worktree, ["reset", "--hard", revision])
    })

    const repositoryArgs = (repository: Repository, args: string[]) => [
      "--git-dir",
      repository.gitDirectory,
      "--work-tree",
      repository.worktree,
      ...args,
    ]

    const repositoryOperation = Effect.fnUntraced(function* (
      operationName: OperationError["operation"],
      repository: Repository,
      args: string[],
      options?: { stdin?: string; env?: Record<string, string> },
    ) {
      const result = yield* proc
        .run(
          ChildProcess.make("git", repositoryArgs(repository, args), {
            cwd: repository.worktree,
            env: options?.env,
            extendEnv: true,
          }),
          { stdin: options?.stdin },
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new OperationError({
                operation: operationName,
                directory: repository.worktree,
                message: cause.message,
                cause,
              }),
          ),
        )
      const text = result.stdout.toString("utf8")
      if (result.exitCode === 0) return { text, stderr: result.stderr.toString("utf8") }
      return yield* new OperationError({
        operation: operationName,
        directory: repository.worktree,
        message: result.stderr.toString("utf8").trim() || text.trim() || `Git ${operationName} failed`,
      })
    })

    const create = Effect.fn("Git.repo.create")(function* (input: {
      worktree: AbsolutePath
      gitDirectory: AbsolutePath
      seed?: Repository
    }) {
      yield* fs.ensureDir(input.gitDirectory).pipe(
        Effect.mapError(
          (cause) =>
            new OperationError({
              operation: "create",
              directory: input.gitDirectory,
              message: "Failed to create Git storage",
              cause,
            }),
        ),
      )
      const repository = new Repository({
        worktree: input.worktree,
        gitDirectory: input.gitDirectory,
        commonDirectory: input.gitDirectory,
      })
      yield* repositoryOperation("create", repository, ["init"])
      yield* Effect.forEach(
        [
          ["core.autocrlf", "false"],
          ["core.longpaths", "true"],
          ["core.symlinks", "true"],
          ["core.fsmonitor", "false"],
          ["feature.manyFiles", "true"],
          ["index.version", "4"],
          ["index.threads", "true"],
          ["core.untrackedCache", "true"],
        ],
        ([key, value]) => repositoryOperation("create", repository, ["config", key, value]),
        { discard: true },
      )
      if (!input.seed) return repository
      yield* fs.ensureDir(path.join(input.gitDirectory, "objects", "info")).pipe(
        Effect.mapError(
          (cause) =>
            new OperationError({
              operation: "create",
              directory: input.gitDirectory,
              message: "Failed to configure shared Git objects",
              cause,
            }),
        ),
      )
      yield* fs
        .writeFileString(
          path.join(input.gitDirectory, "objects", "info", "alternates"),
          path.join(input.seed.commonDirectory, "objects") + "\n",
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new OperationError({
                operation: "create",
                directory: input.gitDirectory,
                message: "Failed to configure shared Git objects",
                cause,
              }),
          ),
        )
      yield* fs
        .copyFile(path.join(input.seed.gitDirectory, "index"), path.join(input.gitDirectory, "index"))
        .pipe(Effect.catch(() => Effect.void))
      return repository
    })

    const refresh = Effect.fn("Git.index.refresh")(function* (input: {
      repository: Repository
      scope: RelativePath
      ignores?: Repository
      maximumUntrackedFileBytes?: number
    }) {
      const list = (args: string[]) =>
        repositoryOperation("refresh", input.repository, args).pipe(
          Effect.map((result) => result.text.split("\0").filter(Boolean)),
        )
      const [tracked, untracked] = yield* Effect.all(
        [
          list(["diff-files", "--name-only", "-z", "--", input.scope]),
          list(["ls-files", "--others", "--exclude-standard", "-z", "--", input.scope]),
        ],
        { concurrency: 2 },
      )
      const candidates = Array.from(new Set([...tracked, ...untracked]))
      if (!candidates.length) return { skipped: [] }
      const ignored = input.ignores
        ? new Set(
            (yield* repositoryOperation("refresh", input.ignores, ["check-ignore", "--no-index", "--stdin", "-z"], {
              stdin: candidates.join("\0") + "\0",
            }).pipe(Effect.catch(() => Effect.succeed({ text: "", stderr: "" })))).text
              .split("\0")
              .filter(Boolean),
          )
        : new Set<string>()
      const allowed = candidates.filter((item) => !ignored.has(item))
      const maximum = input.maximumUntrackedFileBytes
      const skipped = maximum
        ? (yield* Effect.forEach(
            untracked.filter((item) => allowed.includes(item)),
            (item) =>
              fs.stat(path.join(input.repository.worktree, item)).pipe(
                Effect.map((info) =>
                  info.type === "File" && Number(info.size) > maximum ? RelativePath.make(item) : undefined,
                ),
                Effect.catch(() => Effect.succeed(undefined)),
              ),
            { concurrency: 8 },
          )).filter((item): item is RelativePath => item !== undefined)
        : []
      const stage = allowed.filter((item) => !skipped.includes(RelativePath.make(item)))
      const remove = [...ignored, ...skipped]
      if (remove.length)
        yield* repositoryOperation(
          "refresh",
          input.repository,
          ["rm", "--cached", "-f", "--ignore-unmatch", "--pathspec-from-file=-", "--pathspec-file-nul"],
          { stdin: remove.join("\0") + "\0" },
        )
      if (stage.length)
        yield* repositoryOperation(
          "refresh",
          input.repository,
          ["add", "--all", "--sparse", "--pathspec-from-file=-", "--pathspec-file-nul"],
          { stdin: stage.join("\0") + "\0" },
        )
      return { skipped }
    })

    const ignored = Effect.fn("Git.index.ignored")(function* (input: {
      repository: Repository
      paths: readonly RelativePath[]
    }) {
      if (!input.paths.length) return new Set<RelativePath>()
      const result = yield* proc
        .run(
          ChildProcess.make("git", repositoryArgs(input.repository, ["check-ignore", "--no-index", "--stdin", "-z"]), {
            cwd: input.repository.worktree,
            extendEnv: true,
          }),
          { stdin: input.paths.join("\0") + "\0" },
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new OperationError({
                operation: "list_files",
                directory: input.repository.worktree,
                message: cause.message,
                cause,
              }),
          ),
        )
      if (result.exitCode !== 0 && result.exitCode !== 1)
        return yield* new OperationError({
          operation: "list_files",
          directory: input.repository.worktree,
          message: result.stderr.toString("utf8").trim() || "Failed to check ignored paths",
        })
      return new Set(
        result.stdout
          .toString("utf8")
          .split("\0")
          .filter(Boolean)
          .map((file) => RelativePath.make(file)),
      )
    })

    const writeTree = Effect.fn("Git.tree.write")(function* (repository: Repository) {
      return TreeID.make((yield* repositoryOperation("write_tree", repository, ["write-tree"])).text.trim())
    })

    const captureTree = Effect.fn("Git.tree.capture")(
      (input: {
        repository: Repository
        scopes: readonly RelativePath[]
        ignores?: Repository
        maximumUntrackedFileBytes?: number
      }) =>
        locked(
          input.repository,
          Effect.gen(function* () {
            yield* Effect.forEach(input.scopes, (scope) => refresh({ ...input, scope }), { discard: true })
            return yield* writeTree(input.repository)
          }),
        ),
    )

    const treeFiles = Effect.fn("Git.tree.files")(function* (input: {
      repository: Repository
      from: TreeID
      to: TreeID
    }) {
      return (yield* repositoryOperation("list_files", input.repository, [
        "diff",
        "--name-only",
        "-z",
        input.from,
        input.to,
      ])).text
        .split("\0")
        .filter(Boolean)
        .map((file) => RelativePath.make(file))
    })

    const treeDiff = Effect.fn("Git.tree.diff")(function* (input: {
      repository: Repository
      from: TreeID
      to: TreeID
      context?: number
      paths?: readonly RelativePath[]
    }) {
      const paths = input.paths ?? (yield* treeFiles(input))
      return yield* Effect.forEach(paths, (file) =>
        Effect.gen(function* () {
          const statusText = (yield* repositoryOperation("diff", input.repository, [
            "diff",
            "--name-status",
            "--no-renames",
            input.from,
            input.to,
            "--",
            file,
          ])).text.trim()
          const status = statusText.startsWith("A") ? "added" : statusText.startsWith("D") ? "deleted" : "modified"
          const stats = (yield* repositoryOperation("diff", input.repository, [
            "diff",
            "--numstat",
            "--no-renames",
            input.from,
            input.to,
            "--",
            file,
          ])).text.split("\t")
          const binary = stats[0] === "-" || stats[1] === "-"
          const patch = binary
            ? ""
            : (yield* repositoryOperation("diff", input.repository, [
                "diff",
                `--unified=${input.context ?? 3}`,
                "--no-renames",
                input.from,
                input.to,
                "--",
                file,
              ])).text
          return {
            path: file,
            status,
            additions: binary ? 0 : Number(stats[0] ?? 0),
            deletions: binary ? 0 : Number(stats[1] ?? 0),
            patch,
          } satisfies File.Diff
        }),
      )
    })

    const entry = Effect.fnUntraced(function* (repository: Repository, tree: TreeID, file: RelativePath) {
      const text = (yield* repositoryOperation("restore", repository, [
        "ls-tree",
        "-z",
        tree,
        "--",
        file,
      ])).text.replace(/\0$/, "")
      if (!text) return
      const match = text.match(/^(\d+)\s+\w+\s+([0-9a-f]+)\t/)
      if (!match)
        return yield* new OperationError({
          operation: "restore",
          directory: repository.worktree,
          message: `Invalid tree entry for ${file}`,
        })
      return { mode: match[1], object: match[2] }
    })

    const preview = Effect.fn("Git.tree.preview")(
      (input: {
        repository: Repository
        current: TreeID
        files: ReadonlyMap<RelativePath, TreeID>
        context?: number
      }) =>
        locked(
          input.repository,
          Effect.gen(function* () {
            const index = path.join(input.repository.gitDirectory, `preview-${randomUUID()}.index`)
            const env = { GIT_INDEX_FILE: index }
            return yield* Effect.gen(function* () {
              yield* repositoryOperation("diff", input.repository, ["read-tree", input.current], { env })
              yield* Effect.forEach(
                input.files,
                ([file, tree]) =>
                  Effect.gen(function* () {
                    const source = yield* entry(input.repository, tree, file)
                    if (!source) {
                      yield* repositoryOperation(
                        "diff",
                        input.repository,
                        ["update-index", "--force-remove", "--", file],
                        { env },
                      )
                      return
                    }
                    yield* repositoryOperation(
                      "diff",
                      input.repository,
                      ["update-index", "--add", "--cacheinfo", source.mode, source.object, file],
                      { env },
                    )
                  }),
                { discard: true },
              )
              const target = TreeID.make(
                (yield* repositoryOperation("diff", input.repository, ["write-tree"], { env })).text.trim(),
              )
              return yield* treeDiff({
                repository: input.repository,
                from: input.current,
                to: target,
                context: input.context,
                paths: Array.from(input.files.keys()),
              })
            }).pipe(Effect.ensuring(fs.remove(index).pipe(Effect.catch(() => Effect.void))))
          }),
        ),
    )

    const restore = Effect.fn("Git.tree.restore")(
      (input: { repository: Repository; files: ReadonlyMap<RelativePath, TreeID> }) =>
        locked(
          input.repository,
          Effect.forEach(
            input.files,
            ([file, tree]) =>
              Effect.gen(function* () {
                if (yield* entry(input.repository, tree, file)) {
                  yield* repositoryOperation("restore", input.repository, ["checkout", tree, "--", file])
                  return
                }
                yield* fs.remove(path.join(input.repository.worktree, file), { recursive: true, force: true }).pipe(
                  Effect.mapError(
                    (cause) =>
                      new OperationError({
                        operation: "restore",
                        directory: input.repository.worktree,
                        message: `Failed to remove ${file}`,
                        cause,
                      }),
                  ),
                )
              }),
            { discard: true },
          ),
        ),
    )

    const checkoutTree = Effect.fn("Git.tree.checkout")((input: { repository: Repository; tree: TreeID }) =>
      locked(
        input.repository,
        Effect.gen(function* () {
          yield* repositoryOperation("restore", input.repository, ["read-tree", input.tree])
          yield* repositoryOperation("restore", input.repository, ["checkout-index", "--all", "--force"])
        }),
      ),
    )

    const capture = Effect.fn("Git.change.capture")(function* (input: { repository: Repository; path: AbsolutePath }) {
      const scope = path.relative(input.repository.worktree, input.path).replaceAll("\\", "/") || "."
      const tracked = yield* execute(
        input.repository.worktree,
        proc,
      )(["diff", "--binary", "HEAD", "--", scope]).pipe(
        Effect.mapError(
          (cause) => new PatchError({ operation: "capture", directory: input.path, message: cause.message, cause }),
        ),
      )
      if (tracked.exitCode !== 0) {
        return yield* new PatchError({
          operation: "capture",
          directory: input.path,
          message: tracked.stderr.trim() || tracked.text.trim() || "Failed to capture tracked changes",
        })
      }

      const untracked = yield* execute(
        input.repository.worktree,
        proc,
      )(["ls-files", "--others", "--exclude-standard", "-z", "--", scope]).pipe(
        Effect.mapError(
          (cause) => new PatchError({ operation: "capture", directory: input.path, message: cause.message, cause }),
        ),
      )
      if (untracked.exitCode !== 0) {
        return yield* new PatchError({
          operation: "capture",
          directory: input.path,
          message: untracked.stderr.trim() || untracked.text.trim() || "Failed to list untracked changes",
        })
      }

      const created = yield* Effect.forEach(untracked.text.split("\0").filter(Boolean), (file) =>
        execute(
          input.repository.worktree,
          proc,
        )(["diff", "--binary", "--no-index", "--", "/dev/null", file]).pipe(
          Effect.mapError(
            (cause) => new PatchError({ operation: "capture", directory: input.path, message: cause.message, cause }),
          ),
          Effect.flatMap((result) =>
            // git diff --no-index returns 1 when differences were found.
            result.exitCode === 0 || result.exitCode === 1
              ? Effect.succeed(result.text)
              : Effect.fail(
                  new PatchError({
                    operation: "capture",
                    directory: input.path,
                    message:
                      result.stderr.trim() || result.text.trim() || `Failed to capture untracked change: ${file}`,
                  }),
                ),
          ),
        ),
      )
      return ChangeSet.make([tracked.text, ...created].filter(Boolean).join("\n"))
    })

    const apply = Effect.fn("Git.change.apply")(function* (input: {
      repository: Repository
      path: AbsolutePath
      changes: ChangeSet
    }) {
      const result = yield* proc
        .run(
          ChildProcess.make("git", ["apply", "-"], {
            cwd: input.path,
            extendEnv: true,
            stdin: Stream.make(new TextEncoder().encode(input.changes)),
          }),
        )
        .pipe(
          Effect.mapError(
            (cause) => new PatchError({ operation: "apply", directory: input.path, message: cause.message, cause }),
          ),
        )
      if (result.exitCode === 0) return
      return yield* new PatchError({
        operation: "apply",
        directory: input.path,
        message:
          result.stderr.toString("utf8").trim() || result.stdout.toString("utf8").trim() || "Failed to apply changes",
      })
    })

    const discard = Effect.fn("Git.change.discard")(function* (input: {
      repository: Repository
      path: AbsolutePath
      index: "preserve" | "reset"
      untracked: "preserve" | "remove"
    }) {
      const scope = path.relative(input.repository.worktree, input.path).replaceAll("\\", "/") || "."
      const restore = yield* execute(
        input.repository.worktree,
        proc,
      )(input.index === "reset" ? ["checkout", "HEAD", "--", scope] : ["checkout", "--", scope]).pipe(
        Effect.mapError(
          (cause) => new PatchError({ operation: "reset", directory: input.path, message: cause.message, cause }),
        ),
      )
      if (restore.exitCode !== 0) {
        return yield* new PatchError({
          operation: "reset",
          directory: input.path,
          message: restore.stderr.trim() || restore.text.trim() || "Failed to restore tracked changes",
        })
      }
      if (input.untracked === "preserve") return
      const clean = yield* execute(
        input.repository.worktree,
        proc,
      )(["clean", "-fd", "--", scope]).pipe(
        Effect.mapError(
          (cause) => new PatchError({ operation: "reset", directory: input.path, message: cause.message, cause }),
        ),
      )
      if (clean.exitCode === 0) return
      return yield* new PatchError({
        operation: "reset",
        directory: input.path,
        message: clean.stderr.trim() || clean.text.trim() || "Failed to clean untracked changes",
      })
    })

    const worktreeRun = Effect.fnUntraced(function* (
      operation: WorktreeError["operation"],
      repository: Repository,
      args: string[],
      worktreeDirectory?: AbsolutePath,
      cwd = repository.worktree,
      options?: { env?: Record<string, string>; stdin?: string },
    ) {
      const result = yield* proc
        .run(ChildProcess.make("git", args, { cwd, env: options?.env, extendEnv: true, stdin: "ignore" }), {
          stdin: options?.stdin,
        })
        .pipe(
          Effect.mapError(
            (cause) => new WorktreeError({ operation, directory: worktreeDirectory, message: cause.message, cause }),
          ),
        )
      if (result.exitCode === 0 || (result.exitCode === 1 && args[0] === "merge-tree"))
        return result.stdout.toString("utf8")
      const message = result.stderr.toString("utf8").trim() || result.stdout.toString("utf8").trim() || "Git failed"
      return yield* new WorktreeError({
        operation,
        directory: worktreeDirectory,
        message,
        forceRequired: operation === "remove" && /contains modified or untracked files|is dirty/i.test(message),
      })
    })

    const worktreeCreate = Effect.fn("Git.worktree.create")(function* (input: {
      repository: Repository
      directory: AbsolutePath
    }) {
      yield* worktreeRun(
        "create",
        input.repository,
        ["worktree", "add", "--detach", input.directory, "HEAD"],
        input.directory,
      )
      const repository = yield* discover(input.directory)
      if (repository) return repository
      return yield* new WorktreeError({
        operation: "create",
        directory: input.directory,
        message: "Created worktree could not be opened",
      })
    })

    const worktreeRemove = Effect.fn("Git.worktree.remove")(function* (input: {
      repository: Repository
      directory: AbsolutePath
      force: boolean
    }) {
      const name = path.basename(input.directory)
      const parents = yield* run(input.repository.commonDirectory, proc)(["config", "--get-regexp", "^oc\\.work\\..*\\.parent$"])
      if (parents.text.split("\n").some((line) => line && path.resolve(line.slice(line.indexOf(" ") + 1).trim()) === path.resolve(input.directory)))
        return yield* new WorktreeError({ operation: "remove", directory: input.directory, message: "Finish nested work copies before removing their parent" })
      const listed = yield* worktreeList(input.repository)
      if (listed.some((item) => path.resolve(item.directory) === path.resolve(input.directory))) yield* worktreeRun(
        "remove",
        input.repository,
        ["worktree", "remove", ...(input.force ? ["--force"] : []), input.directory],
        input.directory,
        input.repository.commonDirectory,
      )
      if (yield* fs.existsSafe(input.directory)) return yield* new WorktreeError({
        operation: "remove", directory: input.directory, message: "Copy directory still exists; recovery metadata retained",
      })
      const recorded = yield* run(input.repository.commonDirectory, proc)(["config", "--get", `oc.work.${name}.parent`])
      if (recorded.exitCode !== 0) return
      yield* Effect.forEach([`refs/oc/work/${name}`, `refs/oc/work-copy/${name}`, `refs/oc/work-base/${name}`, `refs/oc/work-parent/${name}`, `refs/oc/work-result/${name}`], (ref) =>
        worktreeRun("remove", input.repository, ["update-ref", "-d", ref], input.directory, input.repository.commonDirectory), { discard: true })
      yield* worktreeRun("remove", input.repository, ["config", "--remove-section", `oc.work.${name}`], input.directory, input.repository.commonDirectory)
    })

    const snapshot = Effect.fn("Git.worktree.snapshot")(function* (
      repository: Repository,
      operation: "create" | "merge",
    ) {
      const index = path.join(repository.gitDirectory, `work-${randomUUID()}.index`)
      return yield* Effect.gen(function* () {
        const original = path.join(repository.gitDirectory, "index")
        if (yield* fs.existsSafe(original)) yield* fs.copyFile(original, index)
        const options = { env: { GIT_INDEX_FILE: index } }
        yield* worktreeRun(operation, repository, ["add", "-A"], repository.worktree, repository.worktree, options)
        const tree = (yield* worktreeRun(
          operation,
          repository,
          ["write-tree"],
          repository.worktree,
          repository.worktree,
          options,
        )).trim()
        const parent = yield* head(repository)
        return (yield* worktreeRun(operation, repository, [
          "commit-tree",
          tree,
          ...(parent ? ["-p", parent] : []),
          "-m",
          "oc work snapshot",
        ])).trim()
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof WorktreeError
            ? cause
            : new WorktreeError({
                operation,
                directory: repository.worktree,
                message: "Failed to snapshot checkout",
                cause,
              }),
        ),
        Effect.ensuring(fs.remove(index, { force: true }).pipe(Effect.orDie)),
      )
    })

    const worktreeCopy = Effect.fn("Git.worktree.copy")(function* (input: {
      repository: Repository
      directory: AbsolutePath
      name: string
    }) {
      const base = yield* snapshot(input.repository, "create")
      yield* worktreeRun("create", input.repository, ["update-ref", `refs/oc/work/${input.name}`, base])
      yield* worktreeRun(
        "create",
        input.repository,
        ["worktree", "add", "--detach", input.directory, base],
        input.directory,
      )
      yield* worktreeRun("create", input.repository, [
        "config",
        `oc.work.${input.name}.parent`,
        input.repository.worktree,
      ])
      yield* worktreeRun("create", input.repository, ["config", `oc.work.${input.name}.base`, base])
      const envFiles = (yield* fs.readDirectoryEntries(input.repository.worktree)).filter(
        (item) => item.type === "file" && item.name.startsWith(".env"),
      )
      const ignoredFiles = yield* ignored({ repository: input.repository, paths: envFiles.map((item) => RelativePath.make(item.name)) })
      yield* Effect.forEach(envFiles.filter((item) => ignoredFiles.has(RelativePath.make(item.name))), (item) =>
        Effect.gen(function* () {
          const source = path.join(input.repository.worktree, item.name)
          if (path.resolve(yield* fs.realPath(source)) !== path.resolve(source)) return
          // Read the same descriptor we validate. fstat identity also covers Windows, where O_NOFOLLOW is unsupported.
          yield* Effect.tryPromise(async () => {
            const before = await lstat(source, { bigint: true })
            if (!before.isFile() || before.isSymbolicLink()) return
            const file = await open(source, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK))
            try {
              const opened = await file.stat({ bigint: true })
              if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) throw new Error("Environment file changed identity while opening")
              const destination = await open(path.join(input.directory, item.name), "wx", Number(opened.mode & 0o777n))
              try { await destination.writeFile(await file.readFile()) } finally { await destination.close() }
            } finally { await file.close() }
          })
        }), { discard: true },
      ).pipe(Effect.mapError((cause) => new WorktreeError({ operation: "create", directory: input.directory, message: "Failed to copy ignored environment files", cause })))
      const repository = yield* discover(input.directory)
      if (repository) return repository
      return yield* new WorktreeError({
        operation: "create",
        directory: input.directory,
        message: "Created worktree could not be opened",
      })
    }, Effect.mapError((cause) => cause instanceof WorktreeError ? cause :
      new WorktreeError({ operation: "create", message: cause.message, cause }),
    ))

    const worktreeMerge = Effect.fn("Git.worktree.merge")((input: { copy: Repository; resolved?: readonly string[] }) =>
      locks.withLock(input.copy.commonDirectory)(Effect.gen(function* () {
      const name = path.basename(input.copy.worktree)
      const config = (key: string) =>
        worktreeRun("merge", input.copy, ["config", "--get", `oc.work.${name}.${key}`]).pipe(
          Effect.map((value) => value.trim()),
          Effect.catch(() =>
            Effect.fail(
              new WorktreeError({
                operation: "merge",
                directory: input.copy.worktree,
                message: `Missing recorded work copy ${key}: ${input.copy.worktree}`,
              }),
            ),
          ),
        )
      const parentDirectory = AbsolutePath.make(yield* config("parent"))
      const base = yield* config("base")
      const writingText = yield* run(input.copy.worktree, proc)(["config", "--get", `oc.work.${name}.writing`])
      const writing = writingText.exitCode === 0 && writingText.text.trim()
        ? yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Struct({ before: Schema.String, tree: Schema.String, copy: Schema.String })))(writingText.text).pipe(
          Effect.mapError((cause) => new WorktreeError({ operation: "merge", directory: parentDirectory, message: "Invalid merge recovery record", cause })),
        ) : undefined
      const pendingText = yield* run(input.copy.worktree, proc)(["config", "--get", `oc.work.${name}.conflicts`])
      const pending = !writing && pendingText.exitCode === 0
        ? yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Array(Schema.String)))(pendingText.text).pipe(
            Effect.mapError((cause) => new WorktreeError({ operation: "merge", directory: input.copy.worktree, message: "Invalid pending conflict record", cause })),
          )
        : []
      const unresolved = yield* Effect.filter(pending, (file) => Effect.gen(function* () {
        const filename = path.join(input.copy.worktree, file)
        if (!FSUtil.contains(input.copy.worktree, filename) || !(input.resolved ?? []).includes(file)) return true
        if (!(yield* fs.existsSafe(filename))) return false
        if (!FSUtil.contains(input.copy.worktree, yield* fs.realPath(filename))) return true
        const bytes = yield* fs.readFile(filename)
        return /^(?:<{7,}|={7,}|>{7,}|\|{7,})(?:\s|$)/m.test(new TextDecoder().decode(bytes))
      }).pipe(Effect.mapError((cause) => new WorktreeError({ operation: "merge", directory: input.copy.worktree, message: `Cannot validate conflict ${file}`, cause }))))
      if (unresolved.length) return { directory: input.copy.worktree, conflicts: pending }
      const parent = yield* discover(parentDirectory)
      if (!parent)
        return yield* new WorktreeError({
          operation: "merge",
          directory: parentDirectory,
          message: "Recorded parent repository not found",
        })
      if (path.resolve(parent.commonDirectory) !== path.resolve(input.copy.commonDirectory))
        return yield* new WorktreeError({ operation: "merge", directory: parentDirectory, message: "Parent and copy do not share a Git repository" })
      const copy = yield* snapshot(input.copy, "merge")
      if (writing) {
        const trees = (yield* worktreeRun("merge", input.copy, ["rev-parse", `${copy}^{tree}`, `${writing.copy}^{tree}`])).trim().split(/\r?\n/)
        if (trees[0] !== trees[1]) return yield* new WorktreeError({ operation: "merge", directory: input.copy.worktree, message: "Copy changed during an interrupted merge; preserve both checkouts and resolve recovery before retry" })
      }
      const current = yield* snapshot(parent, "merge")
      // NUL-delimited conflict names are separate from Git's human-readable messages.
      const merged = writing ? `${writing.tree}\0\0` : yield* worktreeRun(
        "merge",
        parent,
        [
          "merge-tree",
          "--write-tree",
          "--name-only",
          "-z",
          "-X",
          "ignore-space-at-eol",
          "--merge-base",
          base,
          current,
          copy,
        ],
        parentDirectory,
      )
      const sections = merged.split("\0")
      const tree = sections[0].trim()
      const end = sections.indexOf("", 1)
      const conflicts = sections.slice(1, end < 0 ? undefined : end).filter(Boolean)
      const target = conflicts.length ? input.copy : parent
      const directory = target.worktree
      const changes = (yield* worktreeRun("merge", target, [
        "diff",
        "--name-status",
        "--no-renames",
        "-z",
        writing?.before ?? (conflicts.length ? copy : current),
        tree,
      ])).split("\0")
      const candidates = changes.flatMap((status, index) =>
        index % 2 === 0 && status ? [{ status, file: changes[index + 1] }] : [],
      )
      const paths = !writing ? candidates : (yield* Effect.forEach(candidates, (item) => Effect.gen(function* () {
        const actual = yield* worktreeRun("merge", parent, ["ls-tree", "-z", current, "--", item.file])
        const desired = yield* worktreeRun("merge", parent, ["ls-tree", "-z", writing.tree, "--", item.file])
        if (actual === desired) return undefined
        const original = yield* worktreeRun("merge", parent, ["ls-tree", "-z", writing.before, "--", item.file])
        if (actual !== original) return yield* new WorktreeError({ operation: "merge", directory: parentDirectory, message: `Parent changed after a partial merge: ${item.file}. Recovery retained without overwriting it` })
        return item
      }))).filter((item) => item !== undefined)
      const index = path.join(target.gitDirectory, `work-${randomUUID()}.index`)
      yield* Effect.gen(function* () {
        const options = { env: { GIT_INDEX_FILE: index } }
        yield* worktreeRun("merge", target, ["read-tree", tree], directory, directory, options)
        const expected = (yield* worktreeRun("merge", target, ["rev-parse", `${conflicts.length ? copy : current}^{tree}`])).trim()
        const observed = (yield* worktreeRun("merge", target, ["rev-parse", `${yield* snapshot(target, "merge")}^{tree}`])).trim()
        if (expected !== observed) return yield* new WorktreeError({ operation: "merge", directory, message: "Checkout changed while preparing merge; retry /done" })
        yield* Effect.forEach(paths, (item) => Effect.gen(function* () {
          const filename = path.join(directory, item.file)
          if (!FSUtil.contains(directory, filename)) return yield* new WorktreeError({ operation: "merge", directory, message: `Unsafe merge path: ${item.file}` })
          let ancestor = path.dirname(filename)
          while (!(yield* fs.existsSafe(ancestor))) ancestor = path.dirname(ancestor)
          if (!FSUtil.contains(directory, yield* fs.realPath(ancestor))) return yield* new WorktreeError({ operation: "merge", directory, message: `Merge path escapes checkout: ${item.file}` })
          if ((yield* fs.existsSafe(filename)) && !FSUtil.contains(directory, yield* fs.realPath(filename))) return yield* new WorktreeError({ operation: "merge", directory, message: `Merge path escapes checkout: ${item.file}` })
        }), { discard: true })
        if (conflicts.length) {
          yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.conflicts`, JSON.stringify(conflicts)])
          yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.ours`, current])
          yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.theirs`, copy])
          yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work-copy/${name}`, copy])
          yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work-base/${name}`, base])
        }
        if (!conflicts.length && !writing) {
          // Journal before the first parent write. Retry accepts only original or already-applied entries.
          yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work-parent/${name}`, current])
          yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work-copy/${name}`, copy])
          yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work-result/${name}`, tree])
          yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.writing`, JSON.stringify({ before: current, tree, copy })])
        }
        // Remove first to allow file/directory replacements; checkout applies smudge/autocrlf.
        yield* Effect.forEach(
          paths.filter((item) => item.status === "D"),
          (item) => fs.remove(path.join(directory, item.file), { force: true }),
          { discard: true },
        )
        const checkout = paths.filter((item) => item.status !== "D").map((item) => item.file)
        if (checkout.length)
          yield* worktreeRun("merge", target, ["checkout-index", "-f", "--stdin", "-z"], directory, directory, {
            ...options,
            stdin: checkout.join("\0") + "\0",
          })
      }).pipe(
        Effect.mapError((cause) =>
          cause instanceof WorktreeError
            ? cause
            : new WorktreeError({
                operation: "merge",
                directory,
                message: "Failed to write merged files",
                cause,
              }),
        ),
        Effect.ensuring(fs.remove(index, { force: true }).pipe(Effect.orDie)),
      )
      if (conflicts.length) {
        yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work/${name}`, current])
        yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.base`, current])
        return { directory, conflicts }
      }
      yield* worktreeRun("merge", input.copy, ["update-ref", `refs/oc/work/${name}`, copy])
      yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.base`, copy])
      yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.conflicts`, "[]"])
      yield* worktreeRun("merge", input.copy, ["config", `oc.work.${name}.writing`, ""])
      return { directory, conflicts }
    }).pipe(Effect.retry({ times: 1, while: (error) => error.message === "Checkout changed while preparing merge; retry /done" }))))

    const worktreeList = Effect.fn("Git.worktree.list")(function* (repository: Repository) {
      return (yield* worktreeRun("list", repository, ["worktree", "list", "--porcelain"]))
        .split("\n")
        .filter((line) => line.startsWith("worktree "))
        .map(
          (line, index) =>
            new Worktree({
              directory: AbsolutePath.make(resolvePath(repository.worktree, line.slice("worktree ".length).trim())),
              kind: index === 0 ? "main" : "linked",
            }),
        )
    })

    return Service.of({
      repo: { discover, clone, create },
      remote: { get: remote },
      history: { head, branch, defaultRemoteBranch: remoteHead, rootCommits: roots },
      sync: { fetchRemotes: fetch, fetchBranch, checkoutRemoteBranch: checkout, resetHard: reset },
      change: { capture, apply, discard },
      worktree: {
        create: worktreeCreate,
        copy: worktreeCopy,
        remove: worktreeRemove,
        list: worktreeList,
        merge: worktreeMerge,
        parent: (repository) => run(repository.worktree, proc)(["config", "--get", `oc.work.${path.basename(repository.worktree)}.parent`]).pipe(
          Effect.map((result) => result.exitCode === 0 ? AbsolutePath.make(result.text.trim()) : undefined),
        ),
        unchanged: (repository) => Effect.gen(function* () {
          const base = (yield* worktreeRun("merge", repository, ["config", "--get", `oc.work.${path.basename(repository.worktree)}.base`])).trim()
          const current = yield* snapshot(repository, "merge")
          const trees = (yield* worktreeRun("merge", repository, ["rev-parse", `${base}^{tree}`, `${current}^{tree}`])).trim().split(/\r?\n/)
          return trees[0] === trees[1]
        }),
      },
      index: { refresh, ignored },
      tree: {
        capture: captureTree,
        write: writeTree,
        files: treeFiles,
        diff: treeDiff,
        preview,
        restore,
        checkout: checkoutTree,
      },
    })
  }),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [FSUtil.node, AppProcess.node] })

interface Result {
  readonly exitCode: number
  readonly text: string
  readonly stderr: string
}

function run(cwd: string, proc: AppProcess.Interface) {
  return (args: string[]) =>
    execute(cwd, proc)(args).pipe(Effect.catch(() => Effect.succeed({ exitCode: 1, text: "", stderr: "" })))
}

function execute(cwd: string, proc: AppProcess.Interface) {
  return (args: string[]) =>
    proc
      .run(
        ChildProcess.make("git", args, {
          cwd,
          extendEnv: true,
          stdin: "ignore",
        }),
      )
      .pipe(
        Effect.map(
          (result) =>
            ({
              exitCode: result.exitCode,
              text: result.stdout.toString("utf8"),
              stderr: result.stderr.toString("utf8"),
            }) satisfies Result,
        ),
      )
}

function resolvePath(cwd: string, value: string) {
  const trimmed = value.replace(/[\r\n]+$/, "")
  if (!trimmed) return cwd
  const normalized = FSUtil.windowsPath(trimmed)
  if (path.isAbsolute(normalized)) return path.normalize(normalized)
  return path.resolve(cwd, normalized)
}
