import { describe, expect, spyOn, test } from "bun:test"
import fuzzysort from "fuzzysort"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Deferred, Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import { Fff } from "#fff"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FileSystem } from "@opencode-ai/core/filesystem"
import { Protected } from "@opencode-ai/core/filesystem/protected"
import { FileSystemSearch } from "@opencode-ai/core/filesystem/search"
import { Location } from "@opencode-ai/core/location"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Ripgrep.node))

const withTmp = <A, E, R>(f: (directory: AbsolutePath) => Effect.Effect<A, E, R>) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(Effect.flatMap((tmp) => f(AbsolutePath.make(tmp.path))))

describe("Ripgrep", () => {
  it.live("globs files as an array", () =>
    withTmp((cwd) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.mkdir(path.join(cwd, "src")))
        yield* Effect.promise(() => fs.writeFile(path.join(cwd, "src", "match.ts"), "needle\n"))
        const result = yield* (yield* Ripgrep.Service).glob({ cwd, pattern: "**/*.ts", limit: 10 })
        expect(result.map((item) => item.path)).toEqual([RelativePath.make("src/match.ts")])
      }),
    ),
  )

  it.live("greps files with include filtering", () =>
    withTmp((cwd) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => fs.mkdir(path.join(cwd, "src")))
        yield* Effect.promise(() => fs.writeFile(path.join(cwd, "src", "match.ts"), "needle\n"))
        yield* Effect.promise(() => fs.writeFile(path.join(cwd, "src", "skip.txt"), "needle\n"))
        const result = yield* (yield* Ripgrep.Service).grep({ cwd, pattern: "needle", include: "*.ts", limit: 10 })
        expect(result).toHaveLength(1)
        expect(result[0]?.entry.path).toBe(RelativePath.make("src/match.ts"))
        expect(result[0]?.submatches[0]?.text).toBe("needle")
      }),
    ),
  )
})

const searchLayer = (directory: string, find: Ripgrep.Interface["find"], vcs?: Location.Interface["vcs"]) =>
  AppNodeBuilder.build(FileSystemSearch.node, [
    [
      Location.node,
      Layer.succeed(
        Location.Service,
        Location.Service.of(location(Location.Ref.make({ directory: AbsolutePath.make(directory) }), { vcs })),
      ),
    ],
    [
      Ripgrep.node,
      Layer.succeed(
        Ripgrep.Service,
        Ripgrep.Service.of({ find, glob: () => Effect.succeed([]), grep: () => Effect.succeed([]) }),
      ),
    ],
  ])

describe("FileSystemSearch", () => {
  test("bounds a home scan even when home is detected as a repository", async () => {
    let observed: Ripgrep.FindInput | undefined
    const home = os.homedir()
    const layer = searchLayer(
      home,
      (input) =>
        Effect.gen(function* () {
          observed = input
          if (input.onEntry)
            yield* input.onEntry(FileSystem.Entry.make({ path: RelativePath.make("src/index.ts"), type: "file" }))
          return []
        }),
      { type: "git", store: AbsolutePath.make(path.join(home, ".git")) },
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* FileSystemSearch.Service
        yield* Effect.sleep("10 millis")
        expect(observed?.limit).toBe(100_000)
        expect(observed?.exclude).toEqual([...Protected.names()].map((name) => `${name}/**`))
        expect((yield* search.find({ query: "src", type: "directory" }))[0]?.path).toBe(
          RelativePath.make(`src${path.sep}`),
        )
      }).pipe(Effect.provide(layer), Effect.scoped),
    )
  })

  test("refreshes a stale ripgrep index atomically without blocking search", async () => {
    let scans = 0
    const initial = Effect.runSync(Deferred.make<void>())
    const started = Effect.runSync(Deferred.make<void>())
    const release = Effect.runSync(Deferred.make<void>())
    const layer = searchLayer(path.join(os.tmpdir(), "opencode-search-atomic"), (input) =>
      Effect.gen(function* () {
        scans++
        if (scans > 1) {
          yield* Deferred.succeed(started, undefined)
          yield* Deferred.await(release)
        }
        const entry = FileSystem.Entry.make({
          path: RelativePath.make(scans === 1 ? "src/old.ts" : "src/new.ts"),
          type: "file",
        })
        if (input.onEntry) yield* input.onEntry(entry)
        if (scans === 1) yield* Deferred.succeed(initial, undefined)
        return [entry]
      }),
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* FileSystemSearch.Service
        yield* Deferred.await(initial)
        expect((yield* search.find({ query: "old", type: "file" }))[0]?.path).toBe(RelativePath.make("src/old.ts"))
        expect(scans).toBe(1)

        yield* TestClock.adjust("10 seconds")
        yield* search.find({ query: "old", type: "file" })
        yield* Deferred.await(started)

        expect((yield* search.find({ query: "old", type: "file" }))[0]?.path).toBe(RelativePath.make("src/old.ts"))
        expect(scans).toBe(2)
        yield* Deferred.succeed(release, undefined)
        const refreshed = yield* Effect.gen(function* () {
          yield* Effect.yieldNow
          return yield* search.find({ query: "new", type: "file" })
        }).pipe(Effect.repeat({ until: (entries) => entries.length > 0 }))
        expect(refreshed[0]?.path).toBe(RelativePath.make("src/new.ts"))
        expect(scans).toBe(2)
      }).pipe(Effect.provide(layer), Effect.provide(TestClock.layer()), Effect.scoped),
    )
  })

  test("reuses location-owned fuzzy targets across index refreshes", async () => {
    let scans = 0
    const first = Effect.runSync(Deferred.make<void>())
    const second = Effect.runSync(Deferred.make<void>())
    const prepare = spyOn(fuzzysort, "prepare")
    const cleanup = spyOn(fuzzysort, "cleanup")
    const layer = searchLayer(path.join(os.tmpdir(), "opencode-search-cache"), (input) =>
      Effect.gen(function* () {
        scans++
        const entry = FileSystem.Entry.make({ path: RelativePath.make("src/index.ts"), type: "file" })
        if (input.onEntry) yield* input.onEntry(entry)
        yield* Deferred.succeed(scans === 1 ? first : second, undefined)
        return [entry]
      }),
    )

    await Effect.runPromise(
      Effect.gen(function* () {
        const search = yield* FileSystemSearch.Service
        yield* Deferred.await(first)
        yield* search.find({ query: "index", type: "file" })
        yield* TestClock.adjust("10 seconds")
        yield* search.find({ query: "index", type: "file" })
        yield* Deferred.await(second)
        yield* search.find({ query: "index", type: "file" })

        expect(prepare).toHaveBeenCalledTimes(2)
        expect(cleanup).toHaveBeenCalledTimes(3)
      }).pipe(Effect.provide(layer), Effect.provide(TestClock.layer()), Effect.scoped),
    )
    prepare.mockRestore()
    cleanup.mockRestore()
  })
})

describe("Fff", () => {
  // fffLayer does not wait for the initial scan, so this drives the picker directly and keeps a
  // matching file outside the ignored directory to prove the scan finished.
  test("honors wildcard directory rules from .gitignore", async () => {
    await using tmp = await tmpdir()
    await fs.mkdir(path.join(tmp.path, "rust/target/debug/deps"), { recursive: true })
    await fs.mkdir(path.join(tmp.path, "rust/src"), { recursive: true })
    await Bun.write(path.join(tmp.path, ".gitignore"), "**/target/\n")
    await Bun.write(path.join(tmp.path, "rust/target/debug/deps/ignored.rs"), "ignored")
    await Bun.write(path.join(tmp.path, "rust/src/target.rs"), "kept")
    expect(Bun.spawnSync(["git", "init", "-q"], { cwd: tmp.path }).exitCode).toBe(0)

    const made = Fff.create({
      basePath: tmp.path,
      aiMode: true,
      disableMmapCache: true,
      disableContentIndexing: true,
    })
    if (!made.ok) throw new Error(made.error)
    const picker = made.value
    expect((await picker.waitForScan(5_000)).ok).toBe(true)
    const found = picker.fileSearch("target", { pageIndex: 0, pageSize: 50 })
    picker.destroy()
    if (!found.ok) throw new Error(found.error)
    const paths = found.value.items.map((item) => item.relativePath.replaceAll("\\", "/"))

    expect(paths).toContain("rust/src/target.rs")
    expect(paths.filter((item) => item.startsWith("rust/target/"))).toEqual([])
  })
})
