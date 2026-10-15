import type { OpencodeToolDef } from "./descriptors.js"
import type { ParsedExecRequest } from "./execParse.js"
import { str } from "./values.js"

// Cursor subagent types -> host agents, and the host catalog the task tool advertises.

const CURSOR_SUBAGENT_TYPE_TO_OPENCODE: Record<string, string> = {
  generalPurpose: "general",
  "general-purpose": "general",
  general_purpose: "general",
  general: "general",
  unspecified: "general",
  "cursor-guide": "explore",
  cursor_guide: "explore",
  "best-of-n-runner": "general",
  best_of_n_runner: "general",
  bash: "general",
  shell: "general",
  debug: "general",
  computer_use: "general",
  computerUse: "general",
  browser_use: "general",
  browserUse: "general",
  media_review: "general",
  mediaReview: "general",
  watch_video: "general",
  watchVideo: "general",
  vm_setup_helper: "general",
  vmSetupHelper: "general",
  explore: "explore",
  bugbot: "explore",
  "security-review": "explore",
  security_review: "explore",
}

export type HostSubagentDefinition = {
  name: string
  description?: string
}

export type HostSubagentCatalog = {
  executor?: "task"
  agents: HostSubagentDefinition[]
  /** True when the OpenCode task tool supplied its complete, permission-filtered catalog. */
  complete: boolean
}

const SUBAGENT_CATALOG_MARKER = "Available agent types and the tools they have access to:"

function parseSubagentDescriptionCatalog(description: string | undefined): {
  found: boolean
  agents: HostSubagentDefinition[]
} {
  if (!description) return { found: false, agents: [] }
  const marker = description.indexOf(SUBAGENT_CATALOG_MARKER)
  if (marker < 0) return { found: false, agents: [] }

  const agents: HostSubagentDefinition[] = []
  const lines = description.slice(marker + SUBAGENT_CATALOG_MARKER.length).split(/\r?\n/)
  let started = false
  for (const line of lines) {
    const match = line.match(/^\s*-\s+([^:]+):\s*(.*)$/)
    if (!match) {
      if (started && line.trim()) break
      continue
    }
    started = true
    const name = match[1]!.trim().replace(/^`|`$/g, "")
    if (!name) continue
    const agentDescription = match[2]!.trim()
    agents.push({
      name,
      ...(agentDescription ? { description: agentDescription } : {}),
    })
  }
  return { found: true, agents }
}

function subagentTypeEnumValues(schema: unknown): string[] {
  const out = new Set<string>()
  const seen = new Set<object>()
  const visit = (value: unknown, propertyName?: string): void => {
    if (!value || typeof value !== "object") return
    if (seen.has(value as object)) return
    seen.add(value as object)
    if (Array.isArray(value)) {
      for (const item of value) visit(item, propertyName)
      return
    }

    const record = value as Record<string, unknown>
    if (propertyName === "subagent_type" && Array.isArray(record.enum)) {
      for (const item of record.enum) {
        if (typeof item === "string" && item) out.add(item)
      }
    }
    for (const [key, child] of Object.entries(record)) visit(child, key)
  }
  visit(schema)
  return [...out]
}

/** Extract the current host's permission-filtered Task/Actor recipient catalog. */
export function extractHostSubagentCatalog(tools: OpencodeToolDef[]): HostSubagentCatalog {
  const executorTool = tools.find((tool) => tool.name === "task")
  if (!executorTool) return { agents: [], complete: true }

  const described = parseSubagentDescriptionCatalog(executorTool.description)
  const enumNames = subagentTypeEnumValues(executorTool.inputSchema)
  const descriptions = new Map(described.agents.map((agent) => [agent.name, agent.description]))
  // A structured subagent_type enum is stricter than prose, so it is authoritative.
  const names = new Set(enumNames.length > 0 ? enumNames : described.agents.map((agent) => agent.name))
  return {
    executor: "task",
    agents: [...names].map((name) => ({
      name,
      ...(descriptions.get(name) ? { description: descriptions.get(name) } : {}),
    })),
    complete: enumNames.length > 0 || described.found,
  }
}

const GENERIC_CURSOR_SUBAGENT_TYPES = new Set([
  "generalPurpose",
  "general-purpose",
  "general_purpose",
  "general",
  "unspecified",
])

function cursorSubagentCandidates(subagentType: string): string[] {
  if (GENERIC_CURSOR_SUBAGENT_TYPES.has(subagentType)) return ["general"]
  if (subagentType === "cursor-guide" || subagentType === "cursor_guide") {
    return ["scout", "explore", "general"]
  }
  if (
    subagentType === "explore" ||
    subagentType === "bugbot" ||
    subagentType === "security-review" ||
    subagentType === "security_review"
  ) {
    return ["explore", "general"]
  }
  return ["general"]
}

/** Resolve a Cursor subtype against the agents the host can spawn this turn. */
export function resolveCursorSubagentType(subagentType: string, catalog?: HostSubagentCatalog): string | undefined {
  const available = new Set(catalog?.agents.map((agent) => agent.name) ?? [])

  // Explicit host/custom names win. `unspecified` and general aliases are
  // intentionally excluded so they always select the host's generic agent.
  if (!GENERIC_CURSOR_SUBAGENT_TYPES.has(subagentType) && available.has(subagentType)) {
    return subagentType
  }

  const candidates = cursorSubagentCandidates(subagentType)
  for (const candidate of candidates) {
    if (available.has(candidate)) return candidate
  }
  if (catalog?.complete) return undefined
  return candidates[0]
}

/**
 * Cursor's native Task/subagent protocol uses Cursor-owned subtype names while
 * OpenCode-family hosts execute named agents. Map known Cursor built-ins to
 * the closest host agent and preserve unknown values so user-defined OpenCode
 * agents can still be called by exact name.
 */
export function mapCursorSubagentTypeToOpenCode(subagentType: string): string {
  return CURSOR_SUBAGENT_TYPE_TO_OPENCODE[subagentType] ?? subagentType
}

/** Resolve a native Cursor subagent request to this turn's executor and catalog. */
export function remapNativeSubagentForCatalog(
  parsed: ParsedExecRequest,
  advertisedToolNames: Iterable<string>,
  catalog?: HostSubagentCatalog,
): void {
  if (parsed.resultField !== "subagent_result" || parsed.toolName !== "task") return
  const advertised = new Set(advertisedToolNames)
  if (!advertised.has("task")) return
  const executor = "task" as const

  const description = str(parsed.args.description) ?? ""
  const prompt = str(parsed.args.prompt) ?? ""
  const cursorSubagentType = str(parsed.resultMetadata?.cursor_subagent_type) ?? str(parsed.args.subagent_type) ?? ""
  const subagentType = resolveCursorSubagentType(cursorSubagentType, catalog)
  if (!subagentType) {
    const available = catalog?.agents.map((agent) => agent.name).join(", ") || "none"
    parsed.localError =
      `Cursor subagent '${cursorSubagentType}' has no compatible host agent. ` + `Available subagents: ${available}.`
    return
  }

  const resumeAgentId = str(parsed.args.task_id)
  parsed.toolName = executor
  parsed.args = {
    description,
    prompt,
    subagent_type: subagentType,
    ...(resumeAgentId ? { task_id: resumeAgentId } : {}),
    ...(parsed.args.background === true ? { background: true } : {}),
  }
}
