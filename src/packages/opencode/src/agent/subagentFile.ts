import path from "node:path"
import fs from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import matter from "gray-matter"
import { Global } from "@opencode-ai/core/global"

export interface AddInput {
  name: string
  model: string
  variant?: string
  description?: string
  // An `accounts` entry from the claude-code provider options (`~/.claude4`).
  claudeAccount?: string
}

export function defaultFile() {
  return path.join(Global.Path.config, "agents", "sub", "general.md")
}

export function validateName(name: string) {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(name)) throw new Error(`invalid subagent name: ${name}`)
}

export async function names(file = defaultFile()) {
  const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  })
  if (text === undefined) return []
  return Object.keys(section(text).agents)
}

export async function add(input: AddInput, file = defaultFile()) {
  validateName(input.name)
  const text = await fs.readFile(file, "utf8")
  const parsed = section(text)
  if (Object.hasOwn(parsed.agents, input.name)) throw new Error(`subagent already exists: ${input.name}`)
  const entry = {
    model: input.model,
    ...(input.variant !== undefined ? { variant: input.variant } : {}),
    ...(input.claudeAccount !== undefined ? { claudeAccount: input.claudeAccount } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  }
  const lines = [...parsed.lines]
  lines[parsed.start] = lines[parsed.start].replace(/\{\}/, "")
  lines.splice(
    parsed.end,
    0,
    `${" ".repeat(parsed.indent)}${input.name}:`,
    ...Object.entries(entry).map(([key, value]) => `${" ".repeat(parsed.indent + 2)}${key}: ${JSON.stringify(value)}`),
  )
  await writeValidated(file, lines.join(parsed.eol), {
    ...parsed.data,
    agents: { ...parsed.agents, [input.name]: entry },
  })
}

export async function remove(name: string, file = defaultFile()) {
  validateName(name)
  const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new Error(`subagent file not found: ${file}`)
    throw error
  })
  const parsed = section(text)
  if (!Object.hasOwn(parsed.agents, name)) throw new Error(`subagent not found: ${name}`)
  const start = parsed.lines.findIndex((line, index) => {
    if (index <= parsed.start || index >= parsed.end) return false
    if (!line.startsWith(" ".repeat(parsed.indent)) || line[parsed.indent] === " ") return false
    const match = line.match(/^\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[a-z0-9._-]+):(?:\s|$)/)
    if (!match) return false
    return Object.hasOwn(matter(`---\n${match[1]}: {}\n---`).data, name)
  })
  if (start < 0) throw new Error("Subagent entry is not an editable block mapping")
  const next = parsed.lines.findIndex(
    (line, index) =>
      index > start &&
      index < parsed.end &&
      line.trim() !== "" &&
      !line.trimStart().startsWith("#") &&
      line.length - line.trimStart().length <= parsed.indent,
  )
  let end = next < 0 ? parsed.end : next
  // Keep separator blanks and comments belonging to the following entry.
  while (end > start + 1) {
    const line = parsed.lines[end - 1]
    if (line.trim() && !(line.trimStart().startsWith("#") && line.length - line.trimStart().length <= parsed.indent))
      break
    end--
  }
  const lines = [...parsed.lines]
  lines.splice(start, end - start)
  const agents = { ...parsed.agents }
  delete agents[name]
  if (Object.keys(agents).length === 0) lines[parsed.start] = lines[parsed.start].replace(/^agents:/, "agents: {}")
  await writeValidated(file, lines.join(parsed.eol), { ...parsed.data, agents })
}

function section(text: string) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n"
  const lines = text.split(eol)
  if (lines[0] !== "---") throw new Error("YAML frontmatter not found")
  const close = lines.findIndex((line, index) => index > 0 && line === "---")
  if (close < 0) throw new Error("Unterminated YAML frontmatter")
  const data: Record<string, unknown> = matter(text).data
  const agents = data.agents
  if (!agents || typeof agents !== "object" || Array.isArray(agents)) throw new Error("agents: mapping not found")
  const start = lines.findIndex(
    (line, index) => index > 0 && index < close && /^agents:\s*(?:\{\})?\s*(?:#.*)?$/.test(line),
  )
  if (start < 0) throw new Error("agents: must be an editable block mapping")
  const boundary = lines.findIndex(
    (line, index) => index > start && index < close && /^\S/.test(line) && !line.startsWith("#"),
  )
  const end = boundary < 0 ? close : boundary
  const first = lines.slice(start + 1, end).find((line) => line.trim() && !line.trimStart().startsWith("#"))
  const indent = first ? first.length - first.trimStart().length : 2
  return { data, agents: agents as Record<string, unknown>, lines, eol, start, end, indent }
}

async function writeValidated(file: string, content: string, expected: Record<string, unknown>) {
  if (!isDeepStrictEqual(matter(content).data, expected)) throw new Error("Subagent edit would change unrelated YAML")
  const temporary = `${file}.tmp-${crypto.randomUUID()}`
  try {
    await fs.writeFile(temporary, content, "utf8")
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

export * as SubagentFile from "./subagentFile"
