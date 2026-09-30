export * as ConfigAgent from "./agent"

import path from "path"
import os from "os"
import matter from "gray-matter"
import { Exit, Schema } from "effect"
import { Glob } from "@opencode-ai/core/util/glob"
import { ConfigMarkdown as ConfigMarkdownCore } from "@opencode-ai/core/config/markdown"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import { FrontmatterError, InvalidError } from "@opencode-ai/core/v1/config/error"
import { Filesystem } from "@/util/filesystem"
import { configEntryNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"
import { ConfigParse } from "./parse"

async function parseAgentMarkdown(filePath: string) {
  const text = await Filesystem.readText(filePath)
  try {
    return (matter as unknown as (input: string, opts: object) => ReturnType<typeof matter>)(text, {})
  } catch (err) {
    try {
      return (matter as unknown as (input: string, opts: object) => ReturnType<typeof matter>)(
        ConfigMarkdownCore.sanitize(text),
        {},
      )
    } catch (err2) {
      throw new FrontmatterError(
        {
          path: filePath,
          message: `${filePath}: Failed to parse YAML frontmatter: ${err2 instanceof Error ? err2.message : String(err2)}`,
        },
        { cause: err2 },
      )
    }
  }
}

/**
 * Resolve `{file:path}` tokens in a markdown agent's frontmatter `prompt`.
 * Paths are relative to the markdown file (or `~/` / absolute). Content is
 * inserted raw, not JSON-escaped, since it becomes the system prompt directly.
 */
async function resolvePromptFiles(text: string, mdPath: string) {
  const matches = Array.from(text.matchAll(/\{file:([^}]+)\}/g))
  if (!matches.length) return text
  let out = ""
  let cursor = 0
  for (const match of matches) {
    out += text.slice(cursor, match.index)
    let filePath = match[1].trim()
    if (filePath.startsWith("~/")) filePath = path.join(os.homedir(), filePath.slice(2))
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(path.dirname(mdPath), filePath)
    const content = await Filesystem.readText(resolved).catch((error: NodeJS.ErrnoException) => {
      throw new InvalidError(
        { path: mdPath, message: `bad file reference: "${match[0]}" ${resolved} does not exist` },
        { cause: error },
      )
    })
    out += content.trim()
    cursor = match.index + match[0].length
  }
  out += text.slice(cursor)
  return out
}

const FAMILY_KEYS = new Set(["variants", "agents"])

/**
 * One markdown file is either a single agent, a `variants` list
 * (`<stem>-<id>`), or an `agents` map (explicit names). Shared frontmatter
 * is copied onto each child. `{file:}` prompts resolve once per distinct
 * reference. An empty prompt is omitted so native agents keep their prompt.
 */
async function expandAgentFile(
  data: Record<string, unknown>,
  body: string,
  name: string,
  mdPath: string,
): Promise<Record<string, Record<string, unknown>>> {
  const shared: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (!FAMILY_KEYS.has(key)) shared[key] = value
  }

  const children: Record<string, Record<string, unknown>> = {}
  if (data.agents && typeof data.agents === "object" && !Array.isArray(data.agents)) {
    for (const [agentName, overrides] of Object.entries(data.agents as Record<string, unknown>)) {
      if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
        throw new InvalidError({ path: mdPath, message: `${mdPath}: agent "${agentName}" must be an object` })
      }
      children[agentName] = { ...shared, ...(overrides as Record<string, unknown>) }
    }
  } else if (Array.isArray(data.variants)) {
    for (const entry of data.variants) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new InvalidError({ path: mdPath, message: `${mdPath}: each variant must be an object` })
      }
      const variant = entry as Record<string, unknown>
      const id = typeof variant.id === "string" ? variant.id.trim() : ""
      if (!id) throw new InvalidError({ path: mdPath, message: `${mdPath}: variant missing id` })
      const { id: _id, ...overrides } = variant
      children[`${name}-${id}`] = { ...shared, variant: id, ...overrides }
    }
  } else {
    children[name] = { ...shared }
  }

  const cache = new Map<string, string>()
  const resolve = async (text: string) => {
    const cached = cache.get(text)
    if (cached !== undefined) return cached
    const resolved = await resolvePromptFiles(text, mdPath)
    cache.set(text, resolved)
    return resolved
  }

  const sharedPrompt = typeof shared.prompt === "string" ? await resolve(shared.prompt) : ""
  const trimmedBody = body.trim()

  for (const config of Object.values(children)) {
    delete config.variants
    delete config.agents
    const own = typeof config.prompt === "string" && config.prompt !== shared.prompt ? await resolve(config.prompt) : sharedPrompt
    const prompt = [own.trim(), trimmedBody].filter(Boolean).join("\n\n")
    if (prompt) config.prompt = prompt
    else delete config.prompt
  }
  return children
}

export interface AgentDiagnostic {
  path: string
  message: string
  issues?: { path: string[]; message: string }[]
}

function agentDiagnosticMessage(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { message?: string; issues?: { path?: unknown[]; message?: string }[] } }).data
    if (typeof data?.message === "string" && data.message.trim()) return data.message
    if (Array.isArray(data?.issues) && data.issues.length) {
      return data.issues.map((issue) => `${issue.path?.join(".") || ""}: ${issue.message ?? ""}`.trim()).join("; ")
    }
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function agentDiagnosticIssues(error: unknown): { path: string[]; message: string }[] | undefined {
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { issues?: { path?: unknown[]; message?: string }[] } }).data
    if (Array.isArray(data?.issues) && data.issues.length) {
      return data.issues.map((issue) => ({
        path: Array.isArray(issue.path) ? issue.path.map(String) : [],
        message: String(issue.message ?? ""),
      }))
    }
  }
  return undefined
}

export async function scan(dir: string): Promise<{
  agents: Record<string, ConfigAgentV1.Info>
  diagnostics: AgentDiagnostic[]
  files: number
}> {
  const agents: Record<string, ConfigAgentV1.Info> = {}
  const diagnostics: AgentDiagnostic[] = []
  const items = await Glob.scan("{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })
  items.sort()
  for (const item of items) {
    let md: Awaited<ReturnType<typeof parseAgentMarkdown>>
    try {
      md = await parseAgentMarkdown(item)
    } catch (error) {
      diagnostics.push({
        path: item,
        message: agentDiagnosticMessage(error),
        issues: agentDiagnosticIssues(error),
      })
      continue
    }

    const relative = path.relative(dir, item).replaceAll("\\", "/")
    const underSub = relative.startsWith("agents/sub/") || relative.startsWith("agent/sub/")
    let name = configEntryNameFromPath(relative, ["agent/", "agents/"])
    if (name.startsWith("sub/")) name = name.slice("sub/".length)

    let entries: Record<string, Record<string, unknown>>
    try {
      entries = await expandAgentFile(md.data, md.content, name, item)
    } catch (error) {
      diagnostics.push({
        path: item,
        message: agentDiagnosticMessage(error),
        issues: agentDiagnosticIssues(error),
      })
      continue
    }

    if (underSub) {
      const wrong = Object.entries(entries).filter(([, config]) => config.mode && config.mode !== "subagent")
      if (wrong.length) {
        diagnostics.push({
          path: item,
          message: `${item}: agents/sub is only for mode: subagent`,
        })
        continue
      }
      for (const config of Object.values(entries)) config.mode = "subagent"
    }

    for (const [agentName, config] of Object.entries(entries)) {
      try {
        agents[agentName] = ConfigParse.schema(ConfigAgentV1.Info, { ...config, name: agentName }, item)
      } catch (error) {
        diagnostics.push({
          path: item,
          message: agentDiagnosticMessage(error),
          issues: agentDiagnosticIssues(error),
        })
      }
    }
  }
  return { agents, diagnostics, files: items.length }
}

export async function load(dir: string) {
  return (await scan(dir)).agents
}

export async function loadMode(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  for (const item of await Glob.scan("{mode,modes}/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const config = {
      name: configEntryNameFromPath(path.relative(dir, item), ["mode/", "modes/"]),
      ...md.data,
      prompt: md.content.trim(),
    }
    const parsed = Schema.decodeUnknownExit(ConfigAgentV1.Info)(config, { errors: "all", propertyOrder: "original" })
    if (Exit.isSuccess(parsed)) {
      result[config.name] = {
        ...parsed.value,
        mode: "primary" as const,
      }
    }
  }
  return result
}
