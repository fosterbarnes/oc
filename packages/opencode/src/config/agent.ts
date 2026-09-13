export * as ConfigAgent from "./agent"

import path from "path"
import os from "os"
import { Exit, Schema } from "effect"
import { Glob } from "@opencode-ai/core/util/glob"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import { InvalidError } from "@opencode-ai/core/v1/config/error"
import { Filesystem } from "@/util/filesystem"
import { configEntryNameFromPath } from "./entry-name"
import * as ConfigMarkdown from "./markdown"
import { ConfigParse } from "./parse"

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

export async function load(dir: string) {
  const result: Record<string, ConfigAgentV1.Info> = {}
  for (const item of await Glob.scan("{agent,agents}/**/*.md", {
    cwd: dir,
    absolute: true,
    dot: true,
    symlink: true,
  })) {
    const md = await ConfigMarkdown.parse(item).catch(() => undefined)
    if (!md) continue

    const name = configEntryNameFromPath(path.relative(dir, item), ["agent/", "agents/"])

    // Frontmatter `prompt` (with optional {file:...} includes) comes first; the
    // markdown body is appended so a file can share a base prompt and add to it.
    const head = typeof md.data.prompt === "string" ? await resolvePromptFiles(md.data.prompt, item) : ""
    const body = md.content.trim()
    const prompt = [head.trim(), body].filter(Boolean).join("\n\n")

    const config = {
      name,
      ...md.data,
      prompt,
    }
    result[config.name] = ConfigParse.schema(ConfigAgentV1.Info, config, item)
  }
  return result
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
