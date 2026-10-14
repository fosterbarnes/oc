import { Agent } from "@/agent/agent"
import { SubagentFile } from "@/agent/subagentFile"
import { Command } from "@/command"
import { Config } from "@/config/config"
import * as InstanceState from "@/effect/instance-state"
import { Format } from "@/format"
import { Global } from "@opencode-ai/core/global"
import { LSP } from "@/lsp/lsp"
import { Plugin } from "@/plugin"
import { InstanceStore } from "@/project/instance-store"
import { Vcs } from "@/project/vcs"
import { Skill } from "@/skill"
import { SessionWork } from "@opencode-ai/core/session/work"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../api"
import { ConflictError } from "../errors"
import { ApiVcsApplyError } from "../groups/instance"
import { markInstanceForDisposal } from "../lifecycle"

export const instanceHandlers = HttpApiBuilder.group(InstanceHttpApi, "instance", (handlers) =>
  Effect.gen(function* () {
    const agent = yield* Agent.Service
    const command = yield* Command.Service
    const config = yield* Config.Service
    const format = yield* Format.Service
    const lsp = yield* LSP.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const store = yield* InstanceStore.Service
    const vcs = yield* Vcs.Service
    const work = yield* SessionWork.Service

    const dispose = Effect.fn("InstanceHttpApi.dispose")(function* () {
      yield* markInstanceForDisposal(yield* InstanceState.context)
      return true
    })

    // Validates first, so a bad config leaves the running instance untouched. Refused while this project
    // has session work running; session work for this project is refused (409) until the reload ends.
    // Other projects are not affected. invalidate drops only the cached global config file, which the
    // reload must re-read, so it stays before store.reload.
    const reload = Effect.fn("InstanceHttpApi.reload")(function* () {
      const ctx = yield* InstanceState.context
      const reloading = Effect.gen(function* () {
        yield* config.preflight(ctx)
        yield* config.invalidate()
        yield* store.reload(ctx)
        return true
      })
      return yield* work.maintain(ctx.directory, reloading).pipe(
        Effect.catchTag("SessionWorkBusyError", () =>
          Effect.fail(
            new ConflictError({
              message: "Session work is running in this project; finish or cancel it before reloading",
              resource: "session",
            }),
          ),
        ),
      )
    })

    const getPath = Effect.fn("InstanceHttpApi.path")(function* () {
      const ctx = yield* InstanceState.context
      return {
        home: Global.Path.home,
        state: Global.Path.state,
        config: Global.Path.config,
        worktree: ctx.worktree,
        directory: ctx.directory,
      }
    })

    const getVcs = Effect.fn("InstanceHttpApi.vcs")(function* () {
      const [branch, default_branch] = yield* Effect.all([vcs.branch(), vcs.defaultBranch()], {
        concurrency: "unbounded",
      })
      return { branch, default_branch }
    })

    const getVcsStatus = Effect.fn("InstanceHttpApi.vcsStatus")(function* () {
      return yield* vcs.status()
    })

    const getVcsDiff = Effect.fn("InstanceHttpApi.vcsDiff")(function* (ctx: {
      query: { mode: Vcs.Mode; context?: number }
    }) {
      return yield* vcs.diff(ctx.query.mode, { context: ctx.query.context })
    })

    const getVcsDiffRaw = Effect.fn("InstanceHttpApi.vcsDiffRaw")(function* () {
      return yield* vcs.diffRaw()
    })

    const applyVcs = Effect.fn("InstanceHttpApi.vcsApply")(function* (ctx: { payload: Vcs.ApplyInput }) {
      return yield* vcs.apply(ctx.payload).pipe(
        Effect.mapError(
          (error) =>
            new ApiVcsApplyError({
              name: "VcsApplyError",
              data: {
                message: error.message,
                reason: error.reason,
              },
            }),
        ),
      )
    })

    const getCommand = Effect.fn("InstanceHttpApi.command")(function* () {
      return yield* command.list()
    })

    const getAgent = Effect.fn("InstanceHttpApi.agent")(function* () {
      return yield* agent.list()
    })

    const addAgentSub = Effect.fn("InstanceHttpApi.agentSub")(function* (ctx: {
      payload: { name: string; model: string; variant?: string; description?: string }
    }) {
      const cfg = yield* config.get()
      const file = cfg.subagentFile ?? SubagentFile.defaultFile()
      yield* Effect.promise(() => SubagentFile.add(ctx.payload, file))
      return true
    })

    const removeAgentSub = Effect.fn("InstanceHttpApi.agentSubRemove")(function* (ctx: { params: { name: string } }) {
      const cfg = yield* config.get()
      const file = cfg.subagentFile ?? SubagentFile.defaultFile()
      yield* Effect.promise(() => SubagentFile.remove(ctx.params.name, file))
      return true
    })

    const getSkill = Effect.fn("InstanceHttpApi.skill")(function* () {
      return yield* skill.all()
    })

    const getLsp = Effect.fn("InstanceHttpApi.lsp")(function* () {
      return yield* lsp.status()
    })

    const getFormatter = Effect.fn("InstanceHttpApi.formatter")(function* () {
      return yield* format.status()
    })

    return handlers
      .handle("dispose", dispose)
      .handle("reload", reload)
      .handle("path", getPath)
      .handle("vcs", getVcs)
      .handle("vcsStatus", getVcsStatus)
      .handle("vcsDiff", getVcsDiff)
      .handle("vcsDiffRaw", getVcsDiffRaw)
      .handle("vcsApply", applyVcs)
      .handle("command", getCommand)
      .handle("agent", getAgent)
      .handle("agentSubList", () =>
        Effect.gen(function* () {
          const cfg = yield* config.get()
          return yield* Effect.promise(() => SubagentFile.names(cfg.subagentFile ?? SubagentFile.defaultFile()))
        }),
      )
      .handle("agentSub", addAgentSub)
      .handle("agentSubRemove", removeAgentSub)
      .handle("skill", getSkill)
      .handle("lsp", getLsp)
      .handle("plugin", () => plugin.status())
      .handle("formatter", getFormatter)
  }),
)
