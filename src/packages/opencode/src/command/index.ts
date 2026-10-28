import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { ConfigCommandV1 } from "@opencode-ai/core/v1/config/command"
import path from "path"
import { InstanceState } from "@/effect/instance-state"
import { EffectBridge } from "@/effect/bridge"
import type { InstanceContext } from "@/project/instance-context"
import { Effect, Layer, Context, Schema } from "effect"
import { Config } from "@/config/config"
import { ConfigCommand } from "@/config/command"
import { Fingerprint } from "@/util/fingerprint"
import { EventV2Bridge } from "@/event-v2-bridge"
import { TuiEvent } from "@/server/tui-event"
import { MCP } from "../mcp"
import { Skill } from "../skill"
import PROMPT_INITIALIZE from "./template/initialize.txt"
import PROMPT_REVIEW from "./template/review.txt"
import { LegacyEvent } from "@opencode-ai/schema/legacy-event"

type State = {
  commands: Record<string, Info>
  // Signature of command and skill files at load time; a mismatch on read triggers a rebuild.
  fingerprint: string
}

export const Event = {
  Executed: LegacyEvent.CommandExecuted,
}

// Leads a turn that combines several slash commands (`SessionPrompt.command`); titles strip it (`titleGen.ts`).
export const COMPOSED_PREAMBLE = [
  "Apply all listed slash commands together to the user request below.",
  "They are complementary unless their instructions directly conflict.",
  "For direct conflicts at the same instruction priority, later command instructions take precedence.",
  "These commands replace any earlier slash command's persona, mode, and rules from this conversation.",
  "Follow higher-priority instructions and permission restrictions. Writing a plan does not authorize implementing it.",
].join("\n")

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  agent: Schema.optional(Schema.String),
  model: Schema.optional(Schema.String),
  source: Schema.optional(Schema.Literals(["command", "mcp", "skill"])),
  // Server-side only (lazy MCP prompt promises, full skill bodies); `GET /command` leaves it out.
  template: Schema.optional(Schema.Unknown),
  subtask: Schema.optional(Schema.Boolean),
  hints: Schema.Array(Schema.String),
}).annotate({ identifier: "Command" })

// `permission` and `toolHost` stay server-side (not in the public schema); `command()` applies them to that turn only.
export type Info = Omit<Schema.Schema.Type<typeof Info>, "template"> & {
  template: Promise<string> | string
  permission?: ConfigPermissionV1.Info
  toolHost?: ConfigCommandV1.ToolHost
}

export function hints(template: string) {
  const result: string[] = []
  const numbered = template.match(/\$\d+/g)
  if (numbered) {
    for (const match of [...new Set(numbered)].sort()) result.push(match)
  }
  if (template.includes("$ARGUMENTS")) result.push("$ARGUMENTS")
  return result
}

export const Default = {
  INIT: "init",
  REVIEW: "review",
} as const

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Command") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const mcp = yield* MCP.Service
    const skill = yield* Skill.Service
    const events = yield* EventV2Bridge.Service

    // Skills also appear as commands, so their files count toward the command signature.
    const readFingerprint = Effect.fnUntraced(function* () {
      const dirs = yield* config.directories()
      const commands = yield* Effect.promise(() => ConfigCommand.fingerprint(dirs))
      return `${commands}\n${yield* skill.fingerprint()}`
    })

    const init = Effect.fn("Command.state")(function* (ctx: InstanceContext) {
      // Fingerprint before loading so an edit during the load is picked up by the next read.
      const fingerprint = yield* readFingerprint()
      const loaded = yield* config.commands()
      for (const diag of loaded.diagnostics) {
        yield* Effect.logWarning("invalid command file", { path: diag.path, message: diag.message })
        yield* events
          .publish(TuiEvent.ToastShow, {
            title: "Invalid command file",
            message: `${diag.path}\n${diag.message}`,
            variant: "warning",
            duration: 8000,
          })
          .pipe(Effect.ignore)
      }
      const bridge = yield* EffectBridge.make()
      const commands: Record<string, Info> = {}

      commands[Default.INIT] = {
        name: Default.INIT,
        description: "guided AGENTS.md setup",
        source: "command",
        get template() {
          return PROMPT_INITIALIZE.replace("${path}", ctx.worktree)
        },
        hints: hints(PROMPT_INITIALIZE),
      }
      commands[Default.REVIEW] = {
        name: Default.REVIEW,
        description: "review changes [commit|branch|pr], defaults to uncommitted",
        source: "command",
        get template() {
          return PROMPT_REVIEW.replace("${path}", ctx.worktree)
        },
        subtask: true,
        hints: hints(PROMPT_REVIEW),
      }

      for (const [name, command] of Object.entries(loaded.commands)) {
        commands[name] = {
          name,
          agent: command.agent,
          model: command.model,
          description: command.description,
          source: "command",
          get template() {
            return command.template
          },
          subtask: command.subtask,
          permission: command.permission,
          toolHost: command.toolHost,
          hints: hints(command.template),
        }
      }

      for (const [name, prompt] of Object.entries(yield* mcp.prompts())) {
        commands[name] = {
          name,
          source: "mcp",
          description: prompt.description,
          get template() {
            return bridge.promise(
              mcp
                .getPrompt(
                  prompt.client,
                  prompt.name,
                  prompt.arguments
                    ? Object.fromEntries(prompt.arguments.map((argument, i) => [argument.name, `$${i + 1}`]))
                    : {},
                )
                .pipe(
                  Effect.map(
                    (template) =>
                      template?.messages
                        .map((message) => (message.content.type === "text" ? message.content.text : ""))
                        .join("\n") || "",
                  ),
                ),
            )
          },
          hints: prompt.arguments?.map((_, i) => `$${i + 1}`) ?? [],
        }
      }

      for (const item of yield* skill.all()) {
        if (commands[item.name]) continue
        const dir = item.location === "<built-in>" ? undefined : path.dirname(item.location)
        commands[item.name] = {
          name: item.name,
          description: item.description,
          source: "skill",
          get template() {
            if (!dir) return item.content
            return [
              item.content,
              "",
              `Base directory for this skill: ${dir}`,
              "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
            ].join("\n")
          },
          toolHost: item.toolHost,
          hints: [],
        }
      }

      return {
        commands,
        fingerprint,
      }
    })

    const state = yield* InstanceState.make<State>((ctx) => init(ctx))

    // Command files are hot-reloaded: rebuild when any command file was added, changed, or removed.
    const current = Fingerprint.reloading(state, readFingerprint())

    const get = Effect.fn("Command.get")(function* (name: string) {
      const s = yield* current()
      return s.commands[name]
    })

    const list = Effect.fn("Command.list")(function* () {
      const s = yield* current()
      return Object.values(s.commands)
    })

    return Service.of({ get, list })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, MCP.node, Skill.node, EventV2Bridge.node],
})

export * as Command from "."
