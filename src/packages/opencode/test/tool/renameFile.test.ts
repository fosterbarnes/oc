import { afterEach, describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Cause, Effect, Exit } from "effect"
import path from "path"
import fs from "fs/promises"
import { RenameFileTool } from "../../src/tool/renameFile"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { EventV2Bridge } from "../../src/event-v2-bridge"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { Agent } from "../../src/agent/agent"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const asked: string[][] = []
const ctx: Tool.Context = {
  sessionID: SessionID.make("ses_test-rename-session"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: (input) => Effect.sync(() => void asked.push([...input.patterns])),
}

afterEach(async () => {
  asked.length = 0
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([FSUtil.node, EventV2Bridge.node, CrossSpawnSpawner.node, Truncate.node, Agent.node]),
  ),
)

const run = Effect.fn("RenameFileTest.run")(function* (args: Tool.InferParameters<typeof RenameFileTool>) {
  const tool = yield* (yield* RenameFileTool).init()
  return yield* tool.execute(args, ctx)
})

const fail = Effect.fn("RenameFileTest.fail")(function* (args: Tool.InferParameters<typeof RenameFileTool>) {
  const exit = yield* run(args).pipe(Effect.exit)
  if (Exit.isSuccess(exit)) throw new Error("expected rename to fail")
  return String(Cause.squash(exit.cause))
})

const put = (file: string, text: string) => Effect.promise(() => fs.writeFile(file, text))
const read = (file: string) => Effect.promise(() => fs.readFile(file, "utf-8"))
const names = (dir: string) => Effect.promise(() => fs.readdir(dir))

describe("tool.rename_file", () => {
  it.instance("renames in place, keeps content, and asks edit for both paths", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const from = path.join(test.directory, "old.md")
      yield* put(from, "plan body")
      const result = yield* run({ filePath: from, newName: "new.md" })

      expect(result.metadata.to).toBe(path.join(test.directory, "new.md"))
      expect(yield* read(path.join(test.directory, "new.md"))).toBe("plan body")
      expect(yield* names(test.directory)).not.toContain("old.md")
      expect(asked.at(-1)?.map((p) => path.basename(p))).toEqual(["old.md", "new.md"])
    }),
  )

  it.instance("resolves a relative filePath against the instance directory", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* put(path.join(test.directory, "rel.md"), "x")
      yield* run({ filePath: "rel.md", newName: "rel2.md" })
      expect(yield* read(path.join(test.directory, "rel2.md"))).toBe("x")
    }),
  )

  it.instance("rejects names that are paths or dot names, and the same name", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const from = path.join(test.directory, "a.md")
      yield* put(from, "x")
      for (const newName of ["sub/b.md", "..\\b.md", "../b.md", "..", ".", " "]) {
        expect(yield* fail({ filePath: from, newName })).toMatch(/newName/)
      }
      expect(yield* fail({ filePath: from, newName: "a.md" })).toContain("already named")
      expect(asked).toEqual([])
      expect(yield* read(from)).toBe("x")
    }),
  )

  it.instance("refuses an existing destination, a folder, and a missing file", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const from = path.join(test.directory, "a.md")
      yield* put(from, "a")
      yield* put(path.join(test.directory, "b.md"), "b")
      expect(yield* fail({ filePath: from, newName: "b.md" })).toContain("already exists")
      expect(yield* read(path.join(test.directory, "b.md"))).toBe("b")

      yield* Effect.promise(() => fs.mkdir(path.join(test.directory, "dir")))
      expect(yield* fail({ filePath: path.join(test.directory, "dir"), newName: "dir2" })).toContain("directory")
      expect(yield* fail({ filePath: path.join(test.directory, "gone.md"), newName: "x.md" })).toContain("not found")
    }),
  )

  it.instance("allows a case-only rename", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const from = path.join(test.directory, "plan.md")
      yield* put(from, "x")
      yield* run({ filePath: from, newName: "Plan.md" })
      expect(yield* names(test.directory)).toContain("Plan.md")
      expect(yield* names(test.directory)).not.toContain("plan.md")
    }),
  )
})
