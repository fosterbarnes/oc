import { encodeMessage } from "./messages.js"
import { encodeJsonAsValue } from "./struct.js"
import { stringValue } from "./values.js"

// ── opencode tool definitions → Cursor request_context descriptors ──

export type OpencodeToolDef = {
  name: string
  description?: string
  inputSchema?: unknown
  /** Original flattened identity when `name` is a Cursor-facing alias. */
  sourceName?: string
}

export const CUSTOM_WEBSEARCH_TOOL = "custom_websearch"
export const CUSTOM_WEBFETCH_TOOL = "custom_webfetch"
export const CUSTOM_LIST_MCP_RESOURCES_TOOL = "custom_list_mcp_resources"
export const CUSTOM_READ_MCP_RESOURCE_TOOL = "custom_read_mcp_resource"

/** Cursor-facing alias → exact host tool name accepted by the AI SDK call. */
export type ToolAliasRegistry = ReadonlyMap<string, string>

export type AliasedToolCatalog = {
  advertisedTools: OpencodeToolDef[]
  aliases: ToolAliasRegistry
  ambiguous: ReadonlyMap<string, string[]>
}

export type ToolServerIdentity = {
  /** Cursor MCP server id / provider_identifier (e.g. opencode, github). */
  server: string
  /** Bare tool name inside that server (Cursor McpArgs.tool_name). */
  toolName: string
  /** Full OpenCode tool id used for local execution (e.g. github_create_pull_request). */
  opencodeName: string
}

/** Match OpenCode's McpCatalog.sanitize for config server ids. */
export function sanitizeMcpServerId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_")
}

/**
 * Resolve an OpenCode tool id using known MCP server ids from merged config.
 * Unknown names remain under the synthetic default server: a flattened tool
 * name alone cannot distinguish plugin/custom tools from `<server>_<tool>`.
 */
export function resolveToolServerIdentity(
  opencodeName: string,
  defaultServer = "opencode",
  knownMcpServers: Iterable<string> = [],
): ToolServerIdentity {
  if (!opencodeName) {
    return { server: defaultServer, toolName: "mcp", opencodeName: "mcp" }
  }

  // Longest first handles configured ids where one is a prefix of another
  // (e.g. "git" and "git_hub"). OpenCode flattens with the sanitized id.
  const servers = [...new Set([...knownMcpServers].map(sanitizeMcpServerId).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  )
  for (const server of servers) {
    const prefix = `${server}_`
    if (!opencodeName.startsWith(prefix) || opencodeName.length === prefix.length) continue
    return {
      server,
      toolName: opencodeName.slice(prefix.length),
      opencodeName,
    }
  }
  return { server: defaultServer, toolName: opencodeName, opencodeName }
}

/**
 * Convert opencode's per-turn tool list into Cursor `McpToolDefinition`
 * entries for `request_context.tools` (#7) and `AgentRunRequest.mcp_tools`.
 *
 * Builtins and unknown plugin/custom tools are advertised under the synthetic
 * default server (`opencode`). Tools whose prefixes match configured MCP
 * servers keep those server ids (`github`, …). Composite `name` is
 * `<server>-<bareTool>`; local execution still uses the full OpenCode id
 * reconstructed in `mcpRealToolName`.
 */
export function toolsToDescriptors(
  tools: OpencodeToolDef[],
  providerIdentifier = "opencode",
  knownMcpServers: Iterable<string> = [],
): Array<Record<string, unknown>> {
  return [...tools]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((t) => {
      const id = resolveToolServerIdentity(t.sourceName ?? t.name, providerIdentifier, knownMcpServers)
      const collisionSafeAlias = COLLISION_SAFE_ALIASES.has(t.name)
      return {
        // Keep the collision-safe public name exact. Prefixing it with the
        // synthetic default server weakens the distinction from Cursor-native
        // capabilities (web search/fetch, MCP resource list/read) in the
        // model-visible catalog.
        name: collisionSafeAlias ? t.name : `${id.server}-${id.toolName}`,
        description: t.description ?? "",
        input_schema: encodeJsonAsValue(normalizeInputSchema(t.inputSchema)),
        provider_identifier: id.server,
        tool_name: t.sourceName ? t.name : id.toolName,
      }
    })
}

function normalizeInputSchema(schema: unknown): Record<string, unknown> {
  if (schema && typeof schema === "object" && !Array.isArray(schema)) {
    return schema as Record<string, unknown>
  }
  return { type: "object", properties: {} }
}

type WebAliasRule = {
  alias: string
  exact: readonly string[]
  suffixes: readonly string[]
}

// Despite the name, these rules cover any advertised OpenCode tool whose bare
// name collides with a Cursor-native capability, not only web search/fetch  - 
// see the MCP resource entries below and
// tasks/plans/fix-cursor-mcp-resource-exec.md Phase 0/2.
const WEB_ALIAS_RULES: readonly WebAliasRule[] = [
  {
    alias: CUSTOM_WEBSEARCH_TOOL,
    exact: ["websearch", "web_search"],
    suffixes: ["_web_search", "-web_search", "_websearch", "-websearch"],
  },
  {
    alias: CUSTOM_WEBFETCH_TOOL,
    exact: ["webfetch", "web_fetch"],
    suffixes: ["_web_fetch", "-web_fetch", "_webfetch", "-webfetch"],
  },
  {
    alias: CUSTOM_LIST_MCP_RESOURCES_TOOL,
    exact: ["list_mcp_resources"],
    suffixes: ["_list_mcp_resources", "-list_mcp_resources"],
  },
  {
    alias: CUSTOM_READ_MCP_RESOURCE_TOOL,
    exact: ["read_mcp_resource"],
    suffixes: ["_read_mcp_resource", "-read_mcp_resource"],
  },
]

const COLLISION_SAFE_ALIASES = new Set([
  CUSTOM_WEBSEARCH_TOOL,
  CUSTOM_WEBFETCH_TOOL,
  CUSTOM_LIST_MCP_RESOURCES_TOOL,
  CUSTOM_READ_MCP_RESOURCE_TOOL,
  "question",
])

/**
 * Give collision-prone web capabilities names Cursor will not confuse with its
 * native UI-bound WebSearch/WebFetch interactions. Exact host tools win; a
 * flattened MCP suffix is accepted only when it identifies one unique tool.
 */
export function buildCustomWebToolAliases(tools: OpencodeToolDef[]): AliasedToolCatalog {
  const aliases = new Map<string, string>()
  const ambiguous = new Map<string, string[]>()
  const replacements = new Map<string, string>()

  for (const rule of WEB_ALIAS_RULES) {
    // A host/plugin may already expose the collision-safe public name. Keep it
    // authoritative instead of hiding it behind a second mapping.
    if (tools.some((tool) => tool.name === rule.alias)) continue

    const exact = tools.filter((tool) => rule.exact.includes(tool.name.toLowerCase()))
    const candidates =
      exact.length > 0
        ? exact
        : tools.filter((tool) => {
            const name = tool.name.toLowerCase()
            return rule.suffixes.some((suffix) => name.endsWith(suffix))
          })

    if (candidates.length !== 1) {
      if (candidates.length > 1)
        ambiguous.set(
          rule.alias,
          candidates.map((tool) => tool.name),
        )
      continue
    }

    const original = candidates[0]!.name
    aliases.set(rule.alias, original)
    replacements.set(original, rule.alias)
  }

  return {
    advertisedTools: tools.map((tool) => {
      const alias = replacements.get(tool.name)
      return alias ? { ...tool, name: alias, sourceName: tool.name } : { ...tool }
    }),
    aliases,
    ambiguous,
  }
}

export function resolveCustomWebToolAlias(toolName: string, aliases: ToolAliasRegistry | undefined): string {
  const direct = aliases?.get(toolName)
  if (direct) return direct
  for (const [alias, original] of aliases ?? []) {
    if (toolName.endsWith(`_${alias}`)) return original
  }
  return toolName
}

/**
 * Build the nested McpFileSystemOptions / McpMetaToolOptions shape used by
 * requestContext.#23 / #34. One `McpDescriptor` per resolved server (builtins
 * and unknown tools under the synthetic default; configured MCP tools under
 * their upstream server id).
 */
export function toolsToMcpDescriptors(
  tools: OpencodeToolDef[],
  providerIdentifier = "opencode",
  knownMcpServers: Iterable<string> = [],
): Array<Record<string, unknown>> {
  if (tools.length === 0) return []

  const order: string[] = []
  const byServer = new Map<string, Array<Record<string, unknown>>>()

  for (const t of tools) {
    const id = resolveToolServerIdentity(t.sourceName ?? t.name, providerIdentifier, knownMcpServers)
    let list = byServer.get(id.server)
    if (!list) {
      list = []
      byServer.set(id.server, list)
      order.push(id.server)
    }
    list.push({
      tool_name: t.sourceName ? t.name : id.toolName,
      description: t.description ?? "",
      input_schema: encodeJsonAsValue(normalizeInputSchema(t.inputSchema)),
    })
  }

  return order.map((server) => ({
    server_name: server,
    server_identifier: server,
    tools: byServer.get(server)!,
  }))
}

/**
 * Answer Cursor's exec #36 MCP-state probe from the same descriptors advertised
 * in RequestContext. OpenCode remains the executor; this only confirms that the
 * provider's virtual MCP servers and their tools are available.
 */
export function buildMcpStateResult(
  execId: number,
  args: Record<string, unknown>,
  requestContext: Record<string, unknown>,
): Uint8Array {
  const requested = new Set(
    Array.isArray(args.server_identifiers)
      ? args.server_identifiers.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [],
  )
  const fsOptions = recordValue(requestContext.mcp_file_system_options)
  const nested = Array.isArray(fsOptions?.mcp_descriptors)
    ? fsOptions.mcp_descriptors.map(recordValue).filter((d): d is Record<string, unknown> => !!d)
    : []
  const descriptors = nested.length > 0 ? nested : descriptorsFromFlatTools(requestContext.tools)
  const flatTools = Array.isArray(requestContext.tools)
    ? requestContext.tools.map(recordValue).filter((tool): tool is Record<string, unknown> => !!tool)
    : []
  const servers = descriptors
    .filter((descriptor) => {
      const id = stringValue(descriptor.server_identifier)
      return requested.size === 0 || (id !== undefined && requested.has(id))
    })
    .map((descriptor) => {
      const serverIdentifier = stringValue(descriptor.server_identifier) ?? stringValue(descriptor.server_name) ?? ""
      const tools = Array.isArray(descriptor.tools)
        ? descriptor.tools
            .map(recordValue)
            .filter((tool): tool is Record<string, unknown> => !!tool)
            .map((tool) => mcpStateToolDefinition(serverIdentifier, tool, flatTools))
        : []
      return {
        server_name: stringValue(descriptor.server_name) ?? serverIdentifier,
        server_identifier: serverIdentifier,
        tools,
      }
    })

  return encodeMessage("AgentClientMessage", {
    exec_client_message: {
      id: execId,
      mcp_state_exec_result: { success: { servers } },
    },
  })
}

/**
 * Exec #36 uses McpToolDefinition, not the narrower McpToolDescriptor used by
 * RequestContext's filesystem/meta-tool catalogs. Rehydrate the full identity
 * from RequestContext.tools so Cursor's native get_mcp_tools can correlate the
 * discovered definition with the later provider_identifier/tool_name request.
 */
function mcpStateToolDefinition(
  serverIdentifier: string,
  descriptor: Record<string, unknown>,
  flatTools: Array<Record<string, unknown>>,
): Record<string, unknown> {
  const toolName = stringValue(descriptor.tool_name) ?? ""
  const advertised = flatTools.find(
    (tool) => stringValue(tool.provider_identifier) === serverIdentifier && stringValue(tool.tool_name) === toolName,
  )
  return {
    name: stringValue(advertised?.name) ?? `${serverIdentifier}-${toolName}`,
    description: stringValue(advertised?.description) ?? stringValue(descriptor.description) ?? "",
    input_schema: advertised?.input_schema ?? descriptor.input_schema,
    provider_identifier: serverIdentifier,
    tool_name: toolName,
  }
}

/**
 * Total fallback for Cursor's native MCP-resource exec channel (agent.v1
 * fields #17/#18, tasks/plans/fix-cursor-mcp-resource-exec.md). Under Option B
 * `list_mcp_resources`/`read_mcp_resource` execute through the ordinary
 * field-11 MCP path via the alias rules above, so any 17/18 that still reaches
 * this provider is Cursor emitting the native variant unsolicited (its own
 * client owns both executors unconditionally - there is no descriptor to
 * un-advertise). This provider has no route for them, so answer with an
 * explicit unsupported error rather than a fake empty success: the model can
 * fall back to the field-11 MCP tools instead of trusting an empty listing.
 */
export function buildListMcpResourcesFallback(execId: number): Uint8Array {
  return encodeMessage("AgentClientMessage", {
    exec_client_message: {
      id: execId,
      list_mcp_resources_exec_result: {
        error: {
          error: "list_mcp_resources is not supported by this OpenCode provider; use the advertised MCP tools instead",
        },
      },
    },
  })
}

/** See buildListMcpResourcesFallback. Always an `error`, even for `download_path`. */
export function buildReadMcpResourceFallback(execId: number, server: string, uri: string): Uint8Array {
  return encodeMessage("AgentClientMessage", {
    exec_client_message: {
      id: execId,
      read_mcp_resource_exec_result: {
        error: {
          uri,
          error: `read_mcp_resource is not supported by this OpenCode provider (server "${server}"); use the advertised MCP tools instead`,
        },
      },
    },
  })
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function descriptorsFromFlatTools(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  const byServer = new Map<string, Array<Record<string, unknown>>>()
  for (const raw of value) {
    const tool = recordValue(raw)
    if (!tool) continue
    const server = stringValue(tool.provider_identifier) ?? "opencode"
    const tools = byServer.get(server) ?? []
    tools.push({
      tool_name: stringValue(tool.tool_name) ?? stringValue(tool.name) ?? "",
      description: stringValue(tool.description) ?? "",
      input_schema: tool.input_schema,
    })
    byServer.set(server, tools)
  }
  return [...byServer].map(([server, tools]) => ({
    server_name: server,
    server_identifier: server,
    tools,
  }))
}
