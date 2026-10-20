import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { RelativePath } from "@opencode-ai/core/schema"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(Ripgrep.node))

describe("Ripgrep", () => {
  for (const hidden of [undefined, false, true]) {
    for (const limit of hidden ? [10] : [1, 10]) {
      it.live(`glob honors hidden=${hidden} before limit=${limit}`, () =>
        Effect.acquireUseRelease(
          Effect.promise(() => tmpdir()),
          (tmp) =>
            Effect.gen(function* () {
              yield* Effect.promise(() =>
                Promise.all(
                  ["src/visible.ts", ".hidden.ts", "src/.hidden.ts", ".hidden/nested.ts", ".git/config.ts"].map(
                    (file) => Bun.write(path.join(tmp.path, file), "needle\n"),
                  ),
                ),
              )
              const files = yield* (yield* Ripgrep.Service).glob({
                cwd: tmp.path,
                pattern: "**/*.ts",
                limit,
                ...(hidden === undefined ? {} : { hidden }),
              })

              expect(files.map((item) => item.path).sort()).toEqual(
                (hidden
                  ? [".hidden.ts", ".hidden/nested.ts", "src/.hidden.ts", "src/visible.ts"]
                  : ["src/visible.ts"]
                ).map((file) => RelativePath.make(file)),
              )
            }),
          (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
        ),
      )
    }
  }

  it.live("keeps ignored files out of catch-all find results", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, "node_modules", "pkg"), { recursive: true }))
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, "src")))
          yield* Effect.promise(() => Bun.$`git init -q ${tmp.path}`)
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, ".gitignore"), "node_modules/\n"))
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "node_modules", "pkg", "index.js"), "ignored\n"))
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "src", "index.js"), "included\n"))

          const files = yield* (yield* Ripgrep.Service).find({ cwd: tmp.path, pattern: "*", limit: 10 })
          expect(files.map((item) => item.path)).toContain(RelativePath.make("src/index.js"))
          expect(files.map((item) => item.path)).not.toContain(RelativePath.make("node_modules/pkg/index.js"))
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("never includes git metadata", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, ".opencode")))
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, ".opencode", "config"), "needle\n"))
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, ".git")))
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, ".git", "config"), "needle\n"))
          const ripgrep = yield* Ripgrep.Service

          const files = yield* ripgrep.find({ cwd: tmp.path, pattern: "**/*", limit: 10 })
          expect(files.map((item) => item.path)).toContain(RelativePath.make(".opencode/config"))
          expect(files.map((item) => item.path)).not.toContain(RelativePath.make(".git/config"))

          const observed: string[] = []
          const limited = yield* ripgrep.find({
            cwd: tmp.path,
            pattern: "**/*",
            limit: 1,
            onEntry: (entry) => Effect.sync(() => observed.push(entry.path)),
          })
          expect(observed).toEqual(limited.map((item) => item.path))

          const matches = yield* ripgrep.grep({ cwd: tmp.path, pattern: "needle", include: "config", limit: 10 })
          expect(matches.map((item) => item.entry.path)).toContain(RelativePath.make(".opencode/config"))
          expect(matches.map((item) => item.entry.path)).not.toContain(RelativePath.make(".git/config"))
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
  it.live("excludes protected directory trees from catch-all find results", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(() => fs.mkdir(path.join(tmp.path, "Pictures")))
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "Pictures", "private.jpg"), "private\n"))
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "visible.txt"), "visible\n"))

          const files = yield* (yield* Ripgrep.Service).find({
            cwd: tmp.path,
            pattern: "*",
            limit: 10,
            exclude: ["Pictures/**"],
          })

          expect(files.map((item) => item.path)).toContain(RelativePath.make("visible.txt"))
          expect(files.map((item) => item.path)).not.toContain(RelativePath.make("Pictures/private.jpg"))
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("does not split surrogate pairs in oversized line previews", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            fs.writeFile(path.join(tmp.path, "unicode.txt"), `needle${"x".repeat(1_993)}😀\n`),
          )

          const matches = yield* (yield* Ripgrep.Service).grep({
            cwd: tmp.path,
            pattern: "needle",
            limit: 10,
          })

          expect(matches[0]?.text).toBe(`needle${"x".repeat(1_993)}...`)
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )

  it.live("skips oversized JSON records and keeps remaining matches", () =>
    Effect.acquireUseRelease(
      Effect.promise(() => tmpdir()),
      (tmp) =>
        Effect.gen(function* () {
          const huge = "needle-huge " + "x".repeat(70 * 1024)
          yield* Effect.promise(() => fs.writeFile(path.join(tmp.path, "mixed.txt"), `${huge}\nneedle-small\n`))

          let oversized = 0
          const matches = yield* (yield* Ripgrep.Service).grep({
            cwd: tmp.path,
            pattern: "needle",
            limit: 10,
            onOversized: () => Effect.sync(() => void oversized++),
          })

          expect(matches.map((item) => item.text.trim())).toEqual(["needle-small"])
          expect(oversized).toBe(1)
        }),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ),
  )
})
