import path from "node:path"
import fs from "node:fs/promises"
import { isDeepStrictEqual } from "node:util"
import matter from "gray-matter"
import { Global } from "@opencode-ai/core/global"
import { Glob } from "@opencode-ai/core/util/glob"
import type { LevelState } from "./subagentRef"

export interface UpsertInput {
  name: string
  model: string
  // Levels to set; merged into the entry's existing `reasoning` map.
  reasoning?: Partial<Record<string, LevelState>>
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

// Every `{agent,agents}/**/*.md` under `dir` (plus a configured `subagentFile` elsewhere) whose `agents:` is an
// editable block mapping, with its entry names.
async function editable(dir: string, file?: string) {
  const items = await Glob.scan("{agent,agents}/**/*.md", { cwd: dir, absolute: true, dot: true, symlink: true })
  if (file && !items.includes(path.resolve(file))) items.push(path.resolve(file))
  const files = await Promise.all(
    items.sort().map(async (file) => ({ file, names: await names(file).catch(() => undefined) })),
  )
  return files.flatMap((item) => (item.names ? [{ file: item.file, names: item.names }] : []))
}

/** The file whose `agents:` map defines `name`. */
export async function owner(name: string, dir = Global.Path.config, file?: string) {
  return (await editable(dir, file)).find((item) => item.names.includes(name))?.file
}

export async function list(dir = Global.Path.config, file?: string) {
  return (await editable(dir, file)).flatMap((item) => item.names.map((name) => ({ name, file: item.file })))
}

// `file` is where a new entry goes; an existing entry is edited in the file that owns it.
export async function upsert(input: UpsertInput, file = defaultFile(), dir = Global.Path.config) {
  validateName(input.name)
  const target = (await owner(input.name, dir, file)) ?? file
  const text = await fs.readFile(target, "utf8")
  const parsed = section(text)
  const existing = parsed.agents[input.name]
  const levels = Object.keys(input.reasoning ?? {}).length ? input.reasoning : undefined
  if (existing === undefined) {
    const entry = {
      model: input.model,
      ...(input.claudeAccount !== undefined ? { claudeAccount: input.claudeAccount } : {}),
      ...(levels ? { reasoning: levels } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    }
    const lines = [...parsed.lines]
    lines[parsed.start] = lines[parsed.start].replace(/\{\}/, "")
    lines.splice(
      parsed.end,
      0,
      `${" ".repeat(parsed.indent)}${input.name}:`,
      ...Object.entries(entry).map(
        ([key, value]) =>
          `${" ".repeat(parsed.indent + 2)}${key}: ${key === "reasoning" ? flow(levels!) : JSON.stringify(value)}`,
      ),
    )
    await writeValidated(target, lines.join(parsed.eol), {
      ...parsed.data,
      agents: { ...parsed.agents, [input.name]: entry },
    })
    return
  }
  const current = existing as Record<string, unknown>
  if (current.model !== input.model) throw new Error(`subagent already exists with a different model: ${input.name}`)
  if (input.claudeAccount !== undefined && current.claudeAccount !== input.claudeAccount)
    throw new Error(`subagent already exists with a different claudeAccount: ${input.name}`)
  if (!levels) return
  const reasoning = { ...(current.reasoning as Record<string, LevelState> | undefined), ...levels }
  const entry = block(parsed, input.name)
  const keyIndent = entryIndent(parsed, entry.start)
  const at = parsed.lines.findIndex((line, index) => {
    if (index <= entry.start || index >= entry.end) return false
    return line.startsWith(`${" ".repeat(keyIndent)}reasoning:`)
  })
  const lines = [...parsed.lines]
  const line = `${" ".repeat(keyIndent)}reasoning: ${flow(reasoning)}`
  if (at < 0) lines.splice(entry.end, 0, line)
  else {
    // The old value may continue on deeper-indented lines (block map form).
    const after = parsed.lines.findIndex(
      (item, index) =>
        index > at && index < entry.end && item.trim() && item.length - item.trimStart().length <= keyIndent,
    )
    lines.splice(at, (after < 0 ? entry.end : after) - at, line)
  }
  await writeValidated(target, lines.join(parsed.eol), {
    ...parsed.data,
    agents: { ...parsed.agents, [input.name]: { ...current, reasoning } },
  })
}

export async function remove(name: string, file = defaultFile(), dir = Global.Path.config) {
  validateName(name)
  const target = (await owner(name, dir, file)) ?? file
  const text = await fs.readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw new Error(`subagent file not found: ${target}`)
    throw error
  })
  const parsed = section(text)
  if (!Object.hasOwn(parsed.agents, name)) throw new Error(`subagent not found: ${name}`)
  const entry = block(parsed, name)
  const lines = [...parsed.lines]
  lines.splice(entry.start, entry.end - entry.start)
  const agents = { ...parsed.agents }
  delete agents[name]
  if (Object.keys(agents).length === 0) lines[parsed.start] = lines[parsed.start].replace(/^agents:/, "agents: {}")
  await writeValidated(target, lines.join(parsed.eol), { ...parsed.data, agents })
}

// Line range [start, end) of an entry's block, without trailing blanks or the next entry's comments.
function block(parsed: ReturnType<typeof section>, name: string) {
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
  return { start, end }
}

// Indent of the keys inside the entry that starts at `start`.
function entryIndent(parsed: ReturnType<typeof section>, start: number) {
  const first = parsed.lines.slice(start + 1).find((line) => line.trim() && !line.trimStart().startsWith("#"))
  return first ? first.length - first.trimStart().length : parsed.indent + 2
}

// The one canonical line shape `syncFreeSubs.ps1` also reads: `{ low: on, high: manual }`.
function flow(reasoning: Partial<Record<string, LevelState>>) {
  return `{ ${Object.entries(reasoning)
    .map(([level, state]) => `${level}: ${state}`)
    .join(", ")} }`
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
