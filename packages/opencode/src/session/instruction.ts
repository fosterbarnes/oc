import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { httpClient } from "@opencode-ai/core/effect/app-node-platform"
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Layer, Context } from "effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { Config } from "@/config/config"
import { InstanceState } from "@/effect/instance-state"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Flag } from "@opencode-ai/core/flag/flag"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { withTransientReadRetry } from "@/util/effect-http-client"
import { Wildcard } from "@/util/wildcard"
import { Global } from "@opencode-ai/core/global"
import type { MessageV2 } from "./message-v2"
import type { MessageID } from "./schema"

function extract(messages: SessionV1.WithParts[]) {
  const paths = new Set<string>()
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "tool" && part.tool === "read" && part.state.status === "completed") {
        if (part.state.time.compacted) continue
        const loaded = part.state.metadata?.loaded
        if (!loaded || !Array.isArray(loaded)) continue
        for (const p of loaded) {
          if (typeof p === "string") paths.add(p)
        }
      }
    }
  }
  return paths
}

const isUrl = (item: string) => item.startsWith("https://") || item.startsWith("http://")

export interface Interface {
  readonly clear: (messageID: MessageID) => Effect.Effect<void>
  /** `model` is `providerID/modelID`; it adds matching `instructionsByModel` files. */
  readonly systemPaths: (model?: string) => Effect.Effect<Set<string>, FSUtil.Error>
  readonly system: (model?: string) => Effect.Effect<string[], FSUtil.Error>
  /** Content of the first matching `{ base }` entry, which replaces the built-in provider prompt. */
  readonly base: (model: string) => Effect.Effect<string | undefined, FSUtil.Error>
  readonly find: (dir: string) => Effect.Effect<string | undefined, FSUtil.Error>
  readonly resolve: (
    messages: SessionV1.WithParts[],
    filepath: string,
    messageID: MessageID,
  ) => Effect.Effect<{ filepath: string; content: string }[], FSUtil.Error>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Instruction") {}

const layer: Layer.Layer<
  Service,
  never,
  FSUtil.Service | Config.Service | Global.Service | HttpClient.HttpClient | RuntimeFlags.Service
> = Layer.effect(
  Service,
  Effect.gen(function* () {
    const cfg = yield* Config.Service
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))
    const globalFiles = [
      path.join(global.config, "AGENTS.md"),
      ...(!flags.disableClaudeCodePrompt ? [path.join(global.home, ".claude", "CLAUDE.md")] : []),
    ]
    const instructionFiles = [
      "AGENTS.md",
      ...(!flags.disableClaudeCodePrompt ? ["CLAUDE.md"] : []),
      "CONTEXT.md", // deprecated
    ]

    const state = yield* InstanceState.make(
      Effect.fn("Instruction.state")(() =>
        Effect.succeed({
          // Track which instruction files have already been attached for a given assistant message.
          claims: new Map<MessageID, Set<string>>(),
        }),
      ),
    )

    const relative = Effect.fnUntraced(function* (instruction: string) {
      const ctx = yield* InstanceState.context
      if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
        return yield* fs
          .globUp(instruction, ctx.directory, ctx.worktree)
          .pipe(Effect.catch(() => Effect.succeed([] as string[])))
      }
      return yield* fs
        .globUp(instruction, global.config, global.config)
        .pipe(Effect.catch(() => Effect.succeed([] as string[])))
    })

    const expand = Effect.fnUntraced(function* (raw: string) {
      const instruction = raw.startsWith("~/") ? path.join(global.home, raw.slice(2)) : raw
      return yield* (
        path.isAbsolute(instruction)
          ? fs.glob(path.basename(instruction), {
              cwd: path.dirname(instruction),
              absolute: true,
              include: "file",
            })
          : relative(instruction)
      ).pipe(Effect.catch(() => Effect.succeed([] as string[])))
    })

    // `instructions` followed by the entries of every `instructionsByModel` pattern matching `model`.
    const entries = Effect.fnUntraced(function* (model?: string) {
      const config = yield* cfg.get()
      const matched = Object.entries(config.instructionsByModel ?? {}).filter(
        ([pattern]) => model !== undefined && Wildcard.match(model, pattern),
      )
      return [...(config.instructions ?? []), ...matched.flatMap(([, items]) => items)]
    })

    const read = Effect.fnUntraced(function* (filepath: string) {
      return yield* fs.readFileString(filepath).pipe(Effect.catch(() => Effect.succeed("")))
    })

    const fetch = Effect.fnUntraced(function* (url: string) {
      const res = yield* http.execute(HttpClientRequest.get(url)).pipe(
        Effect.timeout(5000),
        Effect.catch(() => Effect.succeed(null)),
      )
      if (!res) return ""
      const body = yield* res.arrayBuffer.pipe(Effect.catch(() => Effect.succeed(new ArrayBuffer(0))))
      return new TextDecoder().decode(body)
    })

    const clear = Effect.fn("Instruction.clear")(function* (messageID: MessageID) {
      const s = yield* InstanceState.get(state)
      s.claims.delete(messageID)
    })

    const systemPaths = Effect.fn("Instruction.systemPaths")(function* (model?: string) {
      const ctx = yield* InstanceState.context
      const paths = new Set<string>()

      for (const file of globalFiles) {
        if (yield* fs.existsSafe(file)) {
          paths.add(path.resolve(file))
          break
        }
      }

      // The first project-level match wins so we don't stack AGENTS.md/CLAUDE.md from every ancestor.
      if (!Flag.OPENCODE_DISABLE_PROJECT_CONFIG) {
        for (const file of instructionFiles) {
          const matches = yield* fs
            .findUp(file, ctx.directory, ctx.worktree)
            .pipe(Effect.catch(() => Effect.succeed([])))
          if (matches.length > 0) {
            matches.forEach((item) => paths.add(path.resolve(item)))
            break
          }
        }
      }

      for (const raw of yield* entries(model)) {
        if (typeof raw !== "string" || isUrl(raw)) continue
        const matches = yield* expand(raw)
        matches.forEach((item) => paths.add(path.resolve(item)))
      }

      return paths
    })

    const system = Effect.fn("Instruction.system")(function* (model?: string) {
      const paths = yield* systemPaths(model)
      const urls = (yield* entries(model)).filter((item): item is string => typeof item === "string" && isUrl(item))

      const files = yield* Effect.forEach(Array.from(paths), read, { concurrency: 8 })
      const remote = yield* Effect.forEach(urls, fetch, { concurrency: 4 })

      return [
        ...Array.from(paths).flatMap((item, i) => (files[i] ? [`Instructions from: ${item}\n${files[i]}`] : [])),
        ...urls.flatMap((item, i) => (remote[i] ? [`Instructions from: ${item}\n${remote[i]}`] : [])),
      ]
    })

    const base = Effect.fn("Instruction.base")(function* (model: string) {
      const entry = (yield* entries(model)).find((item) => typeof item !== "string")
      if (!entry || typeof entry === "string") return undefined
      const [file] = yield* expand(entry.base)
      if (!file) return undefined
      return (yield* read(file)) || undefined
    })

    const find = Effect.fn("Instruction.find")(function* (dir: string) {
      for (const file of instructionFiles) {
        const filepath = path.resolve(path.join(dir, file))
        if (yield* fs.existsSafe(filepath)) return filepath
      }
      return undefined
    })

    const resolve = Effect.fn("Instruction.resolve")(function* (
      messages: SessionV1.WithParts[],
      filepath: string,
      messageID: MessageID,
    ) {
      const sys = yield* systemPaths()
      const already = extract(messages)
      const results: { filepath: string; content: string }[] = []
      const s = yield* InstanceState.get(state)
      const root = path.resolve(yield* InstanceState.directory)

      const target = path.resolve(filepath)
      let current = path.dirname(target)

      // Walk upward from the file being read and attach nearby instruction files once per message.
      while (current.startsWith(root) && current !== root) {
        const found = yield* find(current)
        if (!found || found === target || sys.has(found) || already.has(found)) {
          current = path.dirname(current)
          continue
        }

        let set = s.claims.get(messageID)
        if (!set) {
          set = new Set()
          s.claims.set(messageID, set)
        }
        if (set.has(found)) {
          current = path.dirname(current)
          continue
        }

        set.add(found)
        const content = yield* read(found)
        if (content) {
          results.push({ filepath: found, content: `Instructions from: ${found}\n${content}` })
        }

        current = path.dirname(current)
      }

      return results
    })

    return Service.of({ clear, systemPaths, system, base, find, resolve })
  }),
)

export function loaded(messages: SessionV1.WithParts[]) {
  return extract(messages)
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, FSUtil.node, Global.node, RuntimeFlags.node, httpClient],
})

export * as Instruction from "./instruction"
