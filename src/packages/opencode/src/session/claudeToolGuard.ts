import path from "path"
import { Cause, Effect, Exit } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import type { ClaudeToolGuard } from "@/provider/claude-code/shared"
import { assertExternalDirectoryEffect, expandHome } from "@/tool/external-directory"
import { ShellID } from "@/tool/shell/id"
import { Tool } from "@/tool/tool"

type ShellTool = { execute: (args: never, ctx: Tool.Context) => Effect.Effect<unknown, unknown, never> }

const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"])
const TODO_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate", "TaskGet", "TaskList"])

/** Applies oc's rules to a Claude Code built-in before the CLI runs it. Returns a denial, if any. */
export function make(input: {
  run: EffectBridge.Shape
  context: (callID: string, signal: AbortSignal) => Tool.Context
  shell?: ShellTool
}): ClaudeToolGuard {
  return async (tool, args, callID, signal) => {
    const exit = await input.run.promise(
      check(tool, args, input.context(callID, signal), input.shell).pipe(Effect.exit),
      { signal },
    )
    if (Exit.isSuccess(exit)) return undefined
    const error = Cause.squash(exit.cause)
    if (error instanceof PermissionV1.RejectedError) return "Denied by user."
    return error instanceof Error ? error.message : "oc could not check this tool call."
  }
}

const check = Effect.fn("ClaudeToolGuard.check")(function* (
  tool: string,
  args: Record<string, unknown>,
  ctx: Tool.Context,
  shell?: ShellTool,
) {
  if (tool === "ToolSearch" || tool.startsWith("mcp__opencode_proxy__")) return
  const instance = yield* InstanceState.context
  const file = (value: unknown) => {
    if (typeof value !== "string" || !value) return undefined
    const expanded = expandHome(value)
    return path.resolve(instance.directory, process.platform === "win32" ? FSUtil.windowsPath(expanded) : expanded)
  }
  const ask = (permission: string, pattern: string, always = "*", metadata: Record<string, unknown> = {}) =>
    ctx.ask({ permission, patterns: [pattern], always: [always], metadata })

  if (tool === "Bash" || tool === "PowerShell" || tool === "Monitor") {
    const command = typeof args.command === "string" ? args.command : tool
    if (!shell) return yield* ask(ShellID.ToolID, command, command, { command })
    const claudeShell = tool === "PowerShell" ? "powershell" : "bash"
    return yield* shell
      .execute({ command, description: "Check Claude shell permission" } as never, {
        ...ctx,
        extra: { ...ctx.extra, claudeShell },
      })
      .pipe(Effect.orDie, Effect.asVoid)
  }
  if (tool === "TaskStop") return yield* ask(ShellID.ToolID, tool, tool, { command: tool })
  if (EDIT_TOOLS.has(tool)) {
    const target = file(args.file_path ?? args.notebook_path)
    if (!target) return yield* ask("edit", "*")
    yield* assertExternalDirectoryEffect(ctx, target)
    return yield* ask("edit", path.relative(instance.worktree, target), "*", { filepath: target, diff: "" })
  }
  if (tool === "Read") {
    const target = file(args.file_path)
    if (!target) return yield* ask("read", "*")
    yield* assertExternalDirectoryEffect(ctx, target)
    return yield* ask("read", path.relative(instance.worktree, target))
  }
  if (tool === "Glob" || tool === "Grep") {
    const search = file(args.path)
    if (search) yield* assertExternalDirectoryEffect(ctx, search, { kind: "directory" })
    return yield* ask(tool.toLowerCase(), String(args.pattern ?? "*"))
  }
  if (tool === "WebFetch") return yield* ask("webfetch", String(args.url ?? "*"))
  if (tool === "WebSearch") return yield* ask("websearch", String(args.query ?? "*"))
  if (tool === "Skill") {
    const name = String(args.skill ?? "*").replace(/^oc:/, "")
    return yield* ask("skill", name, name)
  }
  if (TODO_TOOLS.has(tool)) return yield* ask("todowrite", "*")
  return yield* ask(tool, "*")
})

export * as ClaudeToolGuardCheck from "./claudeToolGuard"
