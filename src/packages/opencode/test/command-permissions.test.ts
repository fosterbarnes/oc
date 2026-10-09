import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, symlink } from "node:fs/promises"
import { Effect, Fiber } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ConfigCommand } from "../src/config/command"
import { Permission } from "../src/permission"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { ApplyPatchTool } from "../src/tool/apply_patch"
import { EditTool } from "../src/tool/edit"
import { WriteTool } from "../src/tool/write"
import { LSP } from "../src/lsp/lsp"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Format } from "../src/format"
import { EventV2Bridge } from "../src/event-v2-bridge"
import { Truncate } from "../src/tool/truncate"
import { Agent } from "../src/agent/agent"
import { ToolRegistry } from "../src/tool/registry"
import { MessageID, SessionID } from "../src/session/schema"
import { TestInstance, tmpdir } from "./fixture/fixture"
import { pollWithTimeout, testEffect } from "./lib/effect"

test("command loader preserves nested path rules and scalar allow/deny order", async () => {
  await using dir = await tmpdir()
  await Bun.write(path.join(dir.path, "commands", "nested", "spit.md"), [
    "---", "permission:", '  "*": deny', "  edit:", '    "*": deny',
    '    "C:/plans/**/*.md": allow', "  read: allow", "  bash: deny", "---", "Discuss",
  ].join("\n"))
  const loaded = await ConfigCommand.load(dir.path)
  expect(loaded.diagnostics).toEqual([])
  expect(loaded.commands["nested/spit"].permission).toEqual({
    "*": "deny", edit: { "*": "deny", "C:/plans/**/*.md": "allow" }, read: "allow", bash: "deny",
  })
  const rules = Permission.fromConfig(loaded.commands["nested/spit"].permission!)
  expect(Permission.evaluate("read", "*", rules).action).toBe("allow")
  expect(Permission.evaluate("bash", "echo hello", rules).action).toBe("deny")
  expect(Permission.disabled(["edit", "write", "apply_patch", "bash", "unknown_mutator"], rules))
    .toEqual(new Set(["bash", "unknown_mutator"]))
  expect(Permission.disabled(["edit", "write", "apply_patch"], Permission.fromConfig({ write: "deny", apply_patch: "deny" })))
    .toEqual(new Set(["write", "apply_patch"]))
})

test("file rules match absolute targets and retain relative rules with directory containment", () => {
  const worktree = path.resolve("work")
  const plans = path.resolve("plans")
  const rules = Permission.fromConfig({ edit: { "*": "deny", [`${plans}/**/*.md`]: "allow", "src/*.ts": "allow" } })
  for (const file of [path.join(plans, "one.md"), path.join(plans, "nested", "two.md")]) {
    expect(Permission.evaluateFile(path.relative(worktree, file), worktree, rules).action).toBe("allow")
    expect(Permission.evaluateFile(file.replaceAll("\\", "/"), worktree, rules).action).toBe("allow")
  }
  for (const file of [path.join(plans, "one.txt"), `${plans}-other/one.md`, path.join(plans, "..", "outside.md")])
    expect(Permission.evaluateFile(file, worktree, rules).action).toBe("deny")
  expect(Permission.evaluateFile("src/file.ts", worktree, rules).action).toBe("allow")
})

const it = testEffect(LayerNode.compile(LayerNode.group([
  LSP.node, FSUtil.node, Format.node, EventV2Bridge.node, Truncate.node, Agent.node, Permission.node,
  ToolRegistry.node,
])))

it.instance("command file tools reject forbidden paths, mixed patches and rename targets before writes", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const permission = yield* Permission.Service
    const plans = path.join(instance.directory, "plans")
    const rules = Permission.fromConfig({ external_directory: "allow", edit: { "*": "deny", [`${plans}/**/*.md`]: "allow" } })
    const ctx = {
      sessionID: SessionID.make("ses_permission"), messageID: MessageID.make("msg_permission"),
      agent: "build", abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
      ask: (input: Omit<PermissionV1.AskInput, "sessionID" | "ruleset">) =>
        permission.ask({ ...input, sessionID: SessionID.make("ses_permission"), ruleset: rules }).pipe(Effect.orDie),
    }
    const writeInfo = yield* WriteTool
    const editInfo = yield* EditTool
    const patchInfo = yield* ApplyPatchTool
    const write = yield* writeInfo.init()
    const edit = yield* editInfo.init()
    const patch = yield* patchInfo.init()
    const target = path.join(plans, "nested", "note.md")
    yield* write.execute({ filePath: target, content: "before\n" }, ctx)
    yield* edit.execute({ filePath: target, oldString: "before", newString: "after" }, ctx)
    expect(yield* Effect.promise(() => Bun.file(target).text())).toBe("after\n")
    for (const file of [path.join(plans, "bad.txt"), path.join(instance.directory, "outside.md"), `${plans}-other/bad.md`]) {
      expect((yield* write.execute({ filePath: file, content: "forbidden" }, ctx).pipe(Effect.exit))._tag).toBe("Failure")
      expect(yield* Effect.promise(() => Bun.file(file).exists())).toBe(false)
    }
    for (const destination of ["outside.md", "plans/note.txt"]) {
      const patchText = `*** Begin Patch\n*** Add File: plans/created.md\n+new\n*** Update File: plans/nested/note.md\n*** Move to: ${destination}\n@@\n-after\n+changed\n*** End Patch`
      expect((yield* patch.execute({ patchText }, ctx).pipe(Effect.exit))._tag).toBe("Failure")
      expect(yield* Effect.promise(() => Bun.file(path.join(plans, "created.md")).exists())).toBe(false)
      expect(yield* Effect.promise(() => Bun.file(target).text())).toBe("after\n")
      expect(yield* Effect.promise(() => Bun.file(path.join(instance.directory, destination)).exists())).toBe(false)
    }
    expect((yield* patch.execute({ patchText: "*** Begin Patch\n*** Add File: plans/created.md\n+new\n*** Add File: plans/forbidden.txt\n+bad\n*** End Patch" }, ctx).pipe(Effect.exit))._tag).toBe("Failure")
    expect(yield* Effect.promise(() => Bun.file(path.join(plans, "created.md")).exists())).toBe(false)
    yield* patch.execute({ patchText: "*** Begin Patch\n*** Add File: plans/created.md\n+new\n*** End Patch" }, ctx)
    expect(yield* Effect.promise(() => Bun.file(path.join(plans, "created.md")).text())).toBe("new\n")
    const outside = path.join(instance.directory, "outside")
    yield* Effect.promise(() => mkdir(outside))
    yield* Effect.promise(() => symlink(outside, path.join(plans, "linked"), process.platform === "win32" ? "junction" : "dir"))
    const linked = path.join(plans, "linked", "escape.md")
    expect((yield* write.execute({ filePath: linked, content: "forbidden" }, ctx).pipe(Effect.exit))._tag).toBe("Failure")
    expect(yield* Effect.promise(() => Bun.file(path.join(outside, "escape.md")).exists())).toBe(false)
  }),
  { config: { formatter: false, lsp: false } },
)

it.instance("an earlier always approval cannot override command denials", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const permission = yield* Permission.Service
    const file = path.join(instance.directory, "outside.md")
    const request = {
      permission: "edit", patterns: [file], always: ["*"], metadata: {}, sessionID: SessionID.make("ses_approval"),
    }
    const asking = yield* permission.ask({ ...request, ruleset: [] }).pipe(Effect.forkChild)
    const pending = yield* pollWithTimeout(permission.list().pipe(Effect.map((items) => items[0])), "Permission was not requested")
    yield* permission.reply({ requestID: pending.id, reply: "always" })
    yield* Fiber.join(asking)
    expect((yield* permission.ask({ ...request, ruleset: Permission.fromConfig({ edit: "deny" }) }).pipe(Effect.exit))._tag).toBe("Failure")
  }),
)

it.instance("custom tools must pass their permission gate before executing", () =>
  Effect.gen(function* () {
    const instance = yield* TestInstance
    const registry = yield* ToolRegistry.Service
    const permission = yield* Permission.Service
    const custom = (yield* registry.all()).find((tool) => tool.id === "mutate")
    if (!custom) throw new Error("Fixture custom tool was not loaded")
    const file = path.join(instance.directory, "outside.md")
    const exit = yield* custom.execute({ filePath: file }, {
      sessionID: SessionID.make("ses_custom"), messageID: MessageID.make("msg_custom"),
      agent: "build", abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
      ask: (input) => permission.ask({ ...input, sessionID: SessionID.make("ses_custom"), ruleset: Permission.fromConfig({ "*": "deny" }) }).pipe(Effect.orDie),
    }).pipe(Effect.exit)
    expect(exit._tag).toBe("Failure")
    expect(yield* Effect.promise(() => Bun.file(file).exists())).toBe(false)
  }),
  { init: (dir) => Effect.promise(() => Bun.write(path.join(dir, ".opencode", "tools", "mutate.ts"),
    'export default { description: "Fixture mutator", args: { filePath: { type: "string" } }, async execute(args) { await Bun.write(args.filePath, "bypass"); return "changed" } }',
  )).pipe(Effect.asVoid) },
)
