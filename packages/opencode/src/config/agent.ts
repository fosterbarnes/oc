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

    const name = configEntryNameFromPath(path.relative(dir, item), ["agent/", "agents/"])

    let head = ""
    try {
      head = typeof md.data.prompt === "string" ? await resolvePromptFiles(md.data.prompt, item) : ""
    } catch (error) {
      diagnostics.push({
        path: item,
        message: agentDiagnosticMessage(error),
        issues: agentDiagnosticIssues(error),
      })
      continue
    }
    const body = md.content.trim()
    const prompt = [head.trim(), body].filter(Boolean).join("\n\n")

    const config = {
      name,
      ...md.data,
      prompt,
    }
    try {
      agents[config.name] = ConfigParse.schema(ConfigAgentV1.Info, config, item)
    } catch (error) {
      diagnostics.push({
        path: item,
        message: agentDiagnosticMessage(error),
        issues: agentDiagnosticIssues(error),
      })
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
