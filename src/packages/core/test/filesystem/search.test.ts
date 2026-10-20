import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { Fff } from "#fff"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { AbsolutePath, RelativePath } from "@opencode-ai/core/schema"
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
