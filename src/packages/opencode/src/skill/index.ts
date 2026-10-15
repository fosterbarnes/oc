import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "path"
import { Effect, Layer, Context, Option, Schema } from "effect"
import { ConfigCommandV1 } from "@opencode-ai/core/v1/config/command"
import type { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstanceState } from "@/effect/instance-state"
import { Global } from "@opencode-ai/core/global"
import { SkillPlugin } from "@opencode-ai/core/plugin/skill"
import { Permission } from "@/permission"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Config } from "@/config/config"
import { FrontmatterError } from "@opencode-ai/core/v1/config/error"
import { ConfigMarkdown } from "@/config/markdown"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Fingerprint } from "@/util/fingerprint"
import { TuiEvent } from "@/server/tui-event"
import { Discovery } from "./discovery"
import { isRecord } from "@/util/record"
import { escapeHtml } from "@/util/html"

const CLAUDE_EXTERNAL_DIR = ".claude"
const AGENTS_EXTERNAL_DIR = ".agents"
const EXTERNAL_SKILL_PATTERN = "skills/**/SKILL.md"
const OPENCODE_SKILL_PATTERN = "{skill,skills}/**/SKILL.md"
const SKILL_PATTERN = "**/SKILL.md"

// Built-in skill that ships with opencode. The model's intuition for what an
// opencode.json should look like is often wrong, and opencode hard-fails on
// invalid config, so users hit cryptic startup errors. Loading this skill
// when the model is asked to touch opencode's own config files gives it the
// actual schemas instead of guesses.
const CUSTOMIZE_OPENCODE_SKILL_NAME = "customize-opencode"
const CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION =
  "Use ONLY when the user is editing or creating opencode's own configuration: opencode.json, opencode.jsonc, files under .opencode/, or files under ~/.config/opencode/. Also use when creating or fixing opencode agents, subagents, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring opencode itself."
const CUSTOMIZE_OPENCODE_SKILL_BODY = SkillPlugin.CustomizeOpencodeContent

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  location: Schema.String,
  content: Schema.String,
})
// `toolHost` stays server-side (not in the public schema); a skill run as a slash command applies it to that turn.
export type Info = Schema.Schema.Type<typeof Info> & { toolHost?: ConfigCommandV1.ToolHost }

const decodeToolHost = Schema.decodeUnknownOption(ConfigCommandV1.ToolHost)

const Issue = Schema.StructWithRest(
  Schema.Struct({
    message: Schema.String,
    path: Schema.Array(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
)

function isSkillFrontmatter(data: unknown): data is { name: string; description?: string; toolHost?: unknown } {
  return (
    isRecord(data) &&
    typeof data.name === "string" &&
    (data.description === undefined || typeof data.description === "string")
  )
}

export class InvalidError extends Schema.TaggedErrorClass<InvalidError>()("SkillInvalidError", {
  path: Schema.String,
  message: Schema.optional(Schema.String),
  issues: Schema.optional(Schema.Array(Issue)),
}) {}

export class NameMismatchError extends Schema.TaggedErrorClass<NameMismatchError>()("SkillNameMismatchError", {
  path: Schema.String,
  expected: Schema.String,
  actual: Schema.String,
}) {}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Skill.NotFoundError", {
  name: Schema.String,
  available: Schema.Array(Schema.String),
}) {
  override get message() {
    return `Skill "${this.name}" not found. Available skills: ${this.available.join(", ") || "none"}`
  }
}

type State = {
  skills: Record<string, Info>
  dirs: string[]
  // Signature of skill files at load time; a mismatch on read triggers a rebuild.
  fingerprint: string
}

export interface Interface {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly require: (name: string) => Effect.Effect<Info, NotFoundError>
  readonly all: () => Effect.Effect<Info[]>
  readonly dirs: () => Effect.Effect<string[]>
  readonly available: (agent?: Agent.Info) => Effect.Effect<Info[]>
  /** Changes whenever a skill file is added, edited, or removed. */
  readonly fingerprint: () => Effect.Effect<string>
}

// Last successfully parsed skill per file, so a broken edit keeps serving the previous version.
const lastGood = new Map<string, Info>()
const parsed = Fingerprint.memo<Awaited<ReturnType<typeof parse>>>()

function parse(match: string) {
  return ConfigMarkdown.parse(match).catch((err: unknown) => ({
    error: FrontmatterError.isInstance(err) ? err.data.message : `Failed to parse skill ${match}`,
  }))
}

async function load(match: string): Promise<{ info?: Info; problem?: string }> {
  const md = await parsed(match, () => parse(match))
  const previous = lastGood.get(match)
  if ("error" in md) return { info: previous, problem: md.error }
  // Files that never had valid frontmatter are skipped quietly, as before hot reload.
  if (!isSkillFrontmatter(md.data)) {
    return { info: previous, problem: previous ? `${match}: frontmatter needs a string name` : undefined }
  }
  const toolHost = md.data.toolHost === undefined ? undefined : decodeToolHost(md.data.toolHost)
  if (toolHost && Option.isNone(toolHost)) {
    return { info: previous, problem: `${match}: toolHost must map tool ids to auto, oc, or harness` }
  }
  const info = {
    name: md.data.name,
    description: md.data.description,
    location: match,
    content: md.content,
    ...(toolHost ? { toolHost: toolHost.value } : {}),
  }
  lastGood.set(match, info)
  return { info }
}

// Roots are resolved once per instance; URL skills are pulled here and later only rescanned from cache.
const discoverRoots = Effect.fnUntraced(function* (
  config: Config.Interface,
  discovery: Discovery.Interface,
  fsys: FSUtil.Interface,
  global: Global.Interface,
  disableExternalSkills: boolean,
  disableClaudeCodeSkills: boolean,
  directory: string,
  worktree: string,
) {
  const roots: Fingerprint.Root[] = []

  const externalDirs: string[] = []
  if (!disableExternalSkills) {
    if (!disableClaudeCodeSkills) externalDirs.push(CLAUDE_EXTERNAL_DIR)
    externalDirs.push(AGENTS_EXTERNAL_DIR)

    for (const dir of externalDirs) {
      const root = path.join(global.home, dir)
      if (!(yield* fsys.isDir(root))) continue
      roots.push({ dir: root, pattern: EXTERNAL_SKILL_PATTERN, dot: true })
    }

    const upDirs = yield* fsys
      .up({ targets: externalDirs, start: directory, stop: worktree })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])))

    for (const root of upDirs) {
      roots.push({ dir: root, pattern: EXTERNAL_SKILL_PATTERN, dot: true })
    }
  }

  for (const dir of yield* config.directories()) {
    roots.push({ dir, pattern: OPENCODE_SKILL_PATTERN })
  }

  const cfg = yield* config.get()
  for (const item of cfg.skills?.paths ?? []) {
    const expanded = item.startsWith("~/") ? path.join(global.home, item.slice(2)) : item
    const dir = path.isAbsolute(expanded) ? expanded : path.join(directory, expanded)
    if (!(yield* fsys.isDir(dir))) {
      yield* Effect.logWarning("skill path not found", { path: dir })
      continue
    }
    roots.push({ dir, pattern: SKILL_PATTERN })
  }

  for (const url of cfg.skills?.urls ?? []) {
    for (const dir of yield* discovery.pull(url)) {
      roots.push({ dir, pattern: SKILL_PATTERN })
    }
  }

  return roots
})

export class Service extends Context.Service<Service, Interface>()("@opencode/Skill") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const discovery = yield* Discovery.Service
    const config = yield* Config.Service
    const events = yield* EventV2Bridge.Service
    const fsys = yield* FSUtil.Service
    const global = yield* Global.Service
    const flags = yield* RuntimeFlags.Service
    const discovered = yield* InstanceState.make(
      Effect.fn("Skill.discovery")(function* (ctx) {
        return yield* discoverRoots(
          config,
          discovery,
          fsys,
          global,
          flags.disableExternalSkills,
          flags.disableClaudeCodeSkills,
          ctx.directory,
          ctx.worktree,
        )
      }),
    )
    const state = yield* InstanceState.make(
      Effect.fn("Skill.state")(function* () {
        const roots = yield* InstanceState.get(discovered)
        const matches = yield* Effect.promise(() => Fingerprint.scan(roots))
        // Fingerprint before parsing so an edit during the load is picked up by the next read.
        const fingerprint = yield* Effect.promise(() => Fingerprint.of(matches))
        const loaded = yield* Effect.promise(() => Promise.all(matches.map(load)))
        // Register the built-in skill BEFORE disk skills so a user-disk
        // skill with the same name can override it.
        const skills: Record<string, Info> = {
          [CUSTOMIZE_OPENCODE_SKILL_NAME]: {
            name: CUSTOMIZE_OPENCODE_SKILL_NAME,
            description: CUSTOMIZE_OPENCODE_SKILL_DESCRIPTION,
            location: "<built-in>",
            content: CUSTOMIZE_OPENCODE_SKILL_BODY,
          },
        }
        for (const item of loaded) {
          if (item.problem) {
            yield* Effect.logWarning("invalid skill file", { message: item.problem })
            yield* events
              .publish(TuiEvent.ToastShow, {
                title: "Invalid skill file",
                message: item.problem,
                variant: "warning",
                duration: 8000,
              })
              .pipe(Effect.ignore)
          }
          if (!item.info) continue
          if (skills[item.info.name]) {
            yield* Effect.logWarning("duplicate skill name", {
              name: item.info.name,
              existing: skills[item.info.name].location,
              duplicate: item.info.location,
            })
          }
          skills[item.info.name] = item.info
        }
        yield* Effect.logInfo("init", { count: Object.keys(skills).length })
        return { skills, dirs: [...new Set(matches.map((match) => path.dirname(match)))], fingerprint }
      }),
    )

    // Skill files are hot-reloaded: rebuild when any SKILL.md was added, changed, or removed.
    const current = Fingerprint.reloading(
      state,
      Effect.gen(function* () {
        const roots = yield* InstanceState.get(discovered)
        return yield* Effect.promise(() => Fingerprint.scan(roots).then(Fingerprint.of))
      }),
    )

    const get = Effect.fn("Skill.get")(function* (name: string) {
      const s = yield* current()
      return s.skills[name]
    })

    const require = Effect.fn("Skill.require")(function* (name: string) {
      const s = yield* current()
      const info = s.skills[name]
      if (info) return info
      return yield* new NotFoundError({ name, available: Object.keys(s.skills).toSorted() })
    })

    const all = Effect.fn("Skill.all")(function* () {
      const s = yield* current()
      return Object.values(s.skills)
    })

    const dirs = Effect.fn("Skill.dirs")(function* () {
      return (yield* current()).dirs
    })

    const available = Effect.fn("Skill.available")(function* (agent?: Agent.Info) {
      const s = yield* current()
      const list = Object.values(s.skills).toSorted((a, b) => a.name.localeCompare(b.name))
      if (!agent) return list
      return list.filter((skill) => Permission.evaluate("skill", skill.name, agent.permission).action !== "deny")
    })

    const fingerprint = Effect.fn("Skill.fingerprint")(function* () {
      return (yield* current()).fingerprint
    })

    return Service.of({ get, require, all, dirs, available, fingerprint })
  }),
)

export function fmt(list: Info[], opts: { verbose: boolean }) {
  const described = list.filter((skill) => skill.description !== undefined)
  if (described.length === 0) return "No skills are currently available."
  if (opts.verbose) {
    return [
      "<available_skills>",
      ...described
        .toSorted((a, b) => a.name.localeCompare(b.name))
        .flatMap((skill) => [
          "  <skill>",
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${escapeHtml(skill.location)}</location>`,
          "  </skill>",
        ]),
      "</available_skills>",
    ].join("\n")
  }

  return [
    "## Available Skills",
    ...described
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((skill) => `- **${skill.name}**: ${skill.description}`),
  ].join("\n")
}

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Discovery.node, Config.node, EventV2Bridge.node, FSUtil.node, Global.node, RuntimeFlags.node],
})

export * as Skill from "."
