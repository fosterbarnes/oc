/**
 * Spawn planning: what a single `claude` spawn gets before it starts.
 * Which `--mcp-config` files, which proxy tool definitions, what opencode's
 * live tool registry says, the proxy MCP server itself, and the CLI args
 * that tie them together (`planSpawn`).
 */
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import type { ClaudeCodeConfig } from "./types.js"
import type { TurnContext } from "./turnContext.js"
import { shouldStripContextReminders } from "./messageBuilder.js"
import { mergeOpencodeMcp, type RuntimeMcpStatus } from "./mcpBridge.js"
import { fetchOpencodeToolList, type OpencodeToolListItem } from "./runtimeStatus.js"
import { buildAppendedSystemPrompt, buildToolEnvironmentNote } from "./prompts.js"
import { buildCliArgs, thinkingCliOptions } from "./cliArgs.js"
import type { CliVersion } from "./cliVersion.js"
import { ensureSkillPlugin, fetchOpencodeSkills, poolSkillsDir } from "./skillPlugin.js"
import { parseModelId } from "./models.js"
import { createProxyMcpServer, type ProxyMcpServer, type ProxyToolCall } from "./proxyMcp.js"
import {
  overlayTaskProxyDescription,
  overlayQuestionProxyDescription,
  filterQuestionProxyByOpencodeSupport,
  DEFAULT_PROXY_TOOLS,
  TASK_BATCH_TOOL_NAME,
  type ProxyToolDef,
} from "./proxyToolDefs.js"
import {
  resolveMcpProxyToolDefs,
  resolveDisallowedTools,
  resolveProxyOpencodeToolDefs,
  filterProxyByModelTools,
  filterProxyOpencodeToolDefs,
  nativeToolsDeniedByHost,
  splitCommandTools,
  type McpProxyToolResolution,
  type ModelToolEntry,
} from "./proxyToolSelection.js"
import { queuePendingProxyCall } from "./proxyBroker.js"
import { log } from "./logger.js"
import { createHash } from "node:crypto"
import { commandToolPlan, harnessToolsDenied } from "./callOptions.js"
import { CLAUDE_NATIVE_TOOLS, type CommandToolPlan } from "./shared.js"

export function toolCatalogHash(
  config: ClaudeCodeConfig,
  tools: readonly ModelToolEntry[] | undefined,
  commandPlan?: CommandToolPlan,
  harnessDenied: string[] = [],
) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        {
          tools: tools
            ?.map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }))
            .toSorted((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
          proxyTools: config.proxyTools,
          proxyOpencodeTools: config.proxyOpencodeTools,
          extraDisallowedTools: config.extraDisallowedTools,
          proxyToolTimeoutMs: config.proxyToolTimeoutMs,
          webSearch: config.webSearch,
          strictMcpConfig: config.strictMcpConfig,
          mcpConfig: config.mcpConfig,
          permissionMode: config.permissionMode,
          skipPermissions: config.skipPermissions,
          commandPlan,
          harnessDenied,
        },
        (_: string, value: unknown) =>
          value !== null && typeof value === "object" && !Array.isArray(value)
            ? Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => a.localeCompare(b)))
            : value,
      ),
    )
    .digest("hex")
}

/** One per-turn snapshot of opencode's live tool registry. */
export interface LiveToolInfo {
  /** False when nothing answered (no SDK client, fetch failed). */
  resolved: boolean
  taskDescription: string | undefined
  questionDescription: string | undefined
  hasQuestion: boolean
  /**
   * The raw registry entries behind the fields above, so `proxyOpencodeTools`
   * can be resolved from the same single fetch rather than a second one.
   */
  items?: OpencodeToolListItem[]
}

/**
 * Build the `--mcp-config` list (the operator's own `mcpConfig` plus the
 * proxy) and read opencode's enabled MCP servers. opencode's servers are
 * never handed to the CLI directly: their tools reach Claude only through
 * the proxy, so every call goes through opencode's permissions. `mcpHash`
 * tracks the merged opencode MCP block so a mid-session change respawns
 * the claude process with fresh proxy defs.
 *
 * `runtimeStatus` is a snapshot of opencode's `client.mcp.status()`. When
 * provided it overlays opencode's UI-toggled state on top of disk config
 * so `/mcps` toggles propagate without a config file write.
 */
export function effectiveMcpConfig(
  config: ClaudeCodeConfig,
  cwd: string,
  proxyConfigPath?: string,
  runtimeStatus?: RuntimeMcpStatus,
) {
  const merged = mergeOpencodeMcp(cwd, runtimeStatus)
  const paths = [config.mcpConfig ?? [], proxyConfigPath ?? []].flat()
  return {
    paths,
    mcpHash: merged.enabledServerNames.length > 0 ? merged.hash : null,
    allEnabledServerNames: merged.enabledServerNames,
  }
}

/** Warn once per spawn about opencode MCP servers that are not reachable. */
export function warnUnavailableMcpServers(runtimeStatus: RuntimeMcpStatus | undefined) {
  const unavailable = Object.entries(runtimeStatus ?? {}).filter(
    ([, status]) => status !== "connected" && status !== "disabled",
  )
  if (unavailable.length === 0) return
  log.warn("opencode MCP servers unavailable this spawn; their tools are left out", {
    servers: Object.fromEntries(unavailable),
  })
}

/** Resolve ProxyToolDef[] for the configured proxyTools names. */
export function resolvedProxyTools(config: ClaudeCodeConfig): ProxyToolDef[] | null {
  const names = config.proxyTools
  if (!names || names.length === 0) return null
  const defsByName = new Map(DEFAULT_PROXY_TOOLS.map((t) => [t.name.toLowerCase(), t]))
  const picked: ProxyToolDef[] = []
  const seen = new Set<string>()
  const unknown: string[] = []
  const pick = (def: ProxyToolDef) => {
    if (seen.has(def.name)) return
    seen.add(def.name)
    picked.push(def)
  }
  for (const n of names) {
    const def = defsByName.get(String(n).toLowerCase())
    if (!def) {
      unknown.push(String(n))
      continue
    }
    pick(def)
    // `task_batch` rides along with `task`: it is the same dispatch path for
    // two or more subagents at once (TASK_BATCH_PROXY_NOTE), and a
    // `proxyTools` list that names `Task` should not have to know it exists.
    if (def.name === "task") {
      const batch = defsByName.get(TASK_BATCH_TOOL_NAME)
      if (batch) pick(batch)
    }
  }
  // A typo used to vanish here. Silence is the wrong response: unknown
  // names are not proxied, so the matching Claude built-in stays enabled
  // and unmediated, and if *every* name is unknown the whole turn runs
  // with no proxy at all (issue #26).
  if (unknown.length > 0) {
    const known = [...defsByName.keys()].join(", ")
    if (picked.length === 0) {
      log.warn("no proxyTools entry was recognised; nothing will be proxied this turn", { unknown, known })
    } else {
      log.warn("ignoring unknown proxyTools entries", { unknown, known })
    }
  }
  return picked.length > 0 ? picked : null
}

/**
 * Resolve ProxyToolDef[] for opencode's MCP-backed tools. The proxy is the
 * only route to them, so each call runs in opencode, is permission-checked,
 * and renders as an opencode tool call. Discovery reads the `tools` array
 * opencode passes `doStream` (the model's merged tool set), not
 * `client.tool.list()`, which lists only the `ToolRegistry`.
 *
 * Returns null when no enabled server contributed a tool.
 */
export function resolvedProxyMcpTools(
  allEnabledServerNames: string[],
  modelTools: readonly ModelToolEntry[] | undefined,
  taken?: ReadonlySet<string>,
): McpProxyToolResolution | null {
  if (allEnabledServerNames.length === 0) return null

  const resolution = resolveMcpProxyToolDefs({
    serverNames: allEnabledServerNames,
    tools: modelTools,
    taken,
  })
  if (resolution.defs.length === 0) {
    // Normal when the agent's tool set excludes MCP tools.
    log.info("no model tools for enabled opencode MCP servers this spawn", {
      servers: allEnabledServerNames,
      modelTools: modelTools?.length ?? 0,
    })
    return null
  }
  log.debug("routing opencode MCP tools through the proxy", {
    servers: [...resolution.coveredServers],
    tools: resolution.defs.map((def) => def.name),
  })
  return resolution
}

/**
 * Live tool info derived from a single `client.tool.list()` fetch:
 *
 * - `taskDescription`: opencode's `task` tool description exactly as the
 *   registry renders it for native models, including the "Available
 *   agent types" list. Overlaid onto the static `task` proxy def so
 *   Claude sees the same subagent catalog native models see, instead
 *   of hunting through config files.
 * - `questionDescription` / `hasQuestion`: opencode's `question` tool
 *   description and whether the registry has the entry at all. Older
 *   builds lack it, in which case a `mcp__opencode_proxy__question`
 *   call resolves to `:gear: invalid`; the version gate drops the def.
 *
 * Returns undefined/false when the SDK client is unavailable (direct
 * AI-SDK use, tests) so the static defs stand. `resolved` distinguishes
 * "the registry answered and has no `question` entry" from "nobody
 * answered": only the former is a real version-gate signal.
 */
export async function fetchLiveToolInfo(config: ClaudeCodeConfig, modelId: string): Promise<LiveToolInfo> {
  const items = await fetchOpencodeToolList(config.provider, modelId, config.cwd)
  const question = items?.find((item) => item.id === "question")
  return {
    resolved: items !== undefined,
    taskDescription: items?.find((item) => item.id === "task")?.description,
    questionDescription: question?.description,
    hasQuestion: !!question,
    items,
  }
}

/**
 * Whether dcp-style context reminders should be stripped from this turn's
 * messages. Config-only and synchronous, so it can be answered before the
 * spawn block resolves anything: `userMsg` is built well ahead of it.
 */
export function stripContextRemindersEnabled(config: ClaudeCodeConfig): boolean {
  return shouldStripContextReminders({
    enabled: config.stripContextReminders,
    proxyTools: config.proxyTools,
    proxyOpencodeTools: config.proxyOpencodeTools,
  })
}

/** Share one lazy registry request within a turn without making it stale. */
export function createLiveToolInfoLoader(config: ClaudeCodeConfig, modelId: string): () => Promise<LiveToolInfo> {
  let pending: Promise<LiveToolInfo> | undefined
  return () => {
    pending ??= fetchLiveToolInfo(config, modelId)
    return pending
  }
}

/**
 * Create a proxy MCP server for a single active Claude process/session.
 * The process lifecycle owns the server lifecycle via session-manager.
 */
export async function ensureProxyServer(
  config: ClaudeCodeConfig,
  tools: ProxyToolDef[],
  sessionKeyForCalls: string,
): Promise<ProxyMcpServer> {
  const timeoutOverrides = config.proxyToolTimeoutMs
  const srv = await createProxyMcpServer(tools, timeoutOverrides)
  srv.calls.on("call", (call: ProxyToolCall) => {
    queuePendingProxyCall(sessionKeyForCalls, call, timeoutOverrides)
  })
  return srv
}

/**
 * Everything one spawn of `claude` needs. Computed every turn, even when a
 * live process is reused, because the start watchdog respawns with `cliArgs`.
 * A reused process keeps its system prompt, so no prompt file is written then.
 */
export async function planSpawn(input: {
  config: ClaudeCodeConfig
  turn: TurnContext
  options: LanguageModelV3CallOptions
  /** Pool account id this spawn runs as; decides whose skills folder dedupes oc skills. */
  account: string
  reusing: boolean
  proxyServer: ProxyMcpServer | null
  proxyTools: ProxyToolDef[] | null
  runtimeStatus: RuntimeMcpStatus | undefined
  cliVersion: CliVersion | null
  loadLiveToolInfo: () => Promise<LiveToolInfo>
}) {
  const config = input.config
  const turn = input.turn
  const commandPermission = commandToolPlan(input.options.providerOptions, config.provider) !== undefined
  const spawnModel = parseModelId(turn.effectiveModelId)
  const systemPrompt = (toolEnvironment?: string) =>
    input.reusing
      ? undefined
      : buildAppendedSystemPrompt({
          agentPrompt: turn.agentPrompt,
          multiStepHint: config.multiStepContinuation !== false,
          toolEnvironment,
        })

  // Text-only requests have no execution authority, including inherited MCP
  // tools. A compaction turn resumes the conversation only to run `/compact`.
  if (turn.compactionMode || !input.options.tools?.length) {
    const systemPromptFile = turn.compactionMode ? undefined : systemPrompt()
    return {
      cliArgs: buildCliArgs({
        sessionKey: turn.sessionKey,
        skipPermissions: false,
        model: spawnModel.model,
        tools: [],
        strictMcpConfig: true,
        disallowedTools: ["*"],
        appendSystemPromptFile: systemPromptFile,
        fastMode: spawnModel.fast,
        cliVersion: input.cliVersion,
      }),
      systemPromptFile,
      proxyServer: null,
      mcpHash: null,
    }
  }

  const [tools, skills] = await Promise.all([assembleProxyTools(input), fetchOpencodeSkills(turn.cwd)])
  const proxyServer =
    input.proxyServer ??
    (tools.combined.length > 0
      ? await ensureProxyServer(config, tools.combined, turn.sessionKey)
      : null)
  const mcp = effectiveMcpConfig(config, turn.cwd, proxyServer?.configPath(), input.runtimeStatus)
  const systemPromptFile = systemPrompt(
    buildToolEnvironmentNote(
      tools.combined.map((t) => t.name),
      tools.replaced,
    ),
  )
  return {
    cliArgs: buildCliArgs({
      sessionKey: turn.sessionKey,
      skipPermissions: config.skipPermissions !== false,
      model: spawnModel.model,
      permissionMode: config.permissionMode,
      // Closed command turns keep only ToolSearch (it loads schemas but runs
      // nothing) plus the built-ins their plan hands to Claude.
      tools: tools.cliTools,
      mcpConfig: commandPermission ? proxyServer?.configPath() : mcp.paths,
      strictMcpConfig: commandPermission || config.strictMcpConfig,
      disallowedTools: tools.disallowed.length > 0 ? tools.disallowed : undefined,
      appendSystemPromptFile: systemPromptFile,
      pluginDir: skills ? ensureSkillPlugin(skills, undefined, poolSkillsDir(input.account)) : undefined,
      ...thinkingCliOptions(),
      fastMode: spawnModel.fast,
      cliVersion: input.cliVersion,
    }),
    systemPromptFile,
    proxyServer,
    mcpHash: mcp.mcpHash,
  }
}
/**
 * The proxy tool list for one spawn: the configured static defs (overlaid
 * with opencode's live descriptions and version gates), opencode's MCP tools,
 * and explicitly forwarded opencode tools, plus the built-ins to disallow.
 */
async function assembleProxyTools(input: Parameters<typeof planSpawn>[0]) {
  const config = input.config
  const modelTools = input.options.tools as readonly ModelToolEntry[] | undefined
  const dialect = config.hostApi === "v2" ? "v2" : "v1"
  const commandPlan = commandToolPlan(input.options.providerOptions, config.provider)
  const harnessDenied = harnessToolsDenied(input.options.providerOptions, config.provider)
  if (commandPlan) {
    // Each allowed oc tool runs as Claude's built-in when the plan says so, otherwise through the
    // proxy where oc enforces the turn's rules. Directly configured MCP servers stay out.
    const split = splitCommandTools(commandPlan, modelTools, dialect)
    const forwarded = new Set(split.forwarded)
    const staticDefs = filterProxyByModelTools(input.proxyTools ?? [], modelTools, dialect)
    const taken = new Set(staticDefs.map((tool) => tool.name))
    return {
      combined: [
        ...staticDefs,
        ...(modelTools ?? []).flatMap((tool): ProxyToolDef[] =>
          tool.name &&
          forwarded.has(tool.name) &&
          !taken.has(tool.name) &&
          (tool.type === undefined || tool.type === "function")
            ? [
                {
                  name: tool.name,
                  description: tool.description ?? "",
                  inputSchema: tool.inputSchema as Record<string, unknown>,
                },
              ]
            : [],
        ),
      ],
      replaced: Object.keys(CLAUDE_NATIVE_TOOLS).filter((id) => forwarded.has(id)),
      // A closed turn lists its built-ins in `--tools`, so nothing else needs turning off.
      cliTools: commandPlan.closed
        ? [
            "ToolSearch",
            ...split.kept.filter(
              (name) =>
                !harnessDenied.includes(name) && (name !== "WebSearch" || config.webSearch !== "disabled"),
            ),
          ]
        : undefined,
      disallowed: commandPlan.closed
        ? (config.extraDisallowedTools ?? [])
        : resolveDisallowedTools({
            proxyTools: input.proxyTools,
            extraDisallowedTools: [...split.off, ...harnessDenied, ...(config.extraDisallowedTools ?? [])],
            disableWebSearch: config.webSearch === "disabled",
          }),
    }
  }

  // opencode's MCP tools reach Claude only as proxy defs, one per tool of
  // each connected server.
  warnUnavailableMcpServers(input.runtimeStatus)
  const mcpDefs =
    resolvedProxyMcpTools(
      effectiveMcpConfig(config, input.turn.cwd, undefined, input.runtimeStatus).allEnabledServerNames,
      modelTools,
      new Set((input.proxyTools ?? []).map((def) => def.name)),
    )?.defs ?? []

  // The `task` description (with its "Available agent types" list), the
  // `question` version gate, and `proxyOpencodeTools` all derive from one
  // registry fetch. Spawn-time only; a reused process keeps its defs.
  const taskEnabled = input.proxyTools?.some((t) => t.name === "task") ?? false
  const questionEnabled = input.proxyTools?.some((t) => t.name === "question") ?? false
  const opencodeToolsRequested = (config.proxyOpencodeTools?.length ?? 0) > 0
  const live: LiveToolInfo =
    taskEnabled || questionEnabled || opencodeToolsRequested
      ? await input.loadLiveToolInfo()
      : { resolved: false, taskDescription: undefined, questionDescription: undefined, hasQuestion: false }

  const gated = gateStaticDefs(input.proxyTools, live, taskEnabled, questionEnabled)
  const staticDefs = gated ? filterProxyByModelTools(gated, modelTools, dialect) : []

  // Opencode tools that belong to no MCP server are invisible to the MCP
  // resolution, so an explicitly named one is resolved here. Last in `taken`,
  // so a static def or an MCP tool keeps a contested name and this one is
  // dropped with a warning rather than shadowing it.
  const resolvedOpencodeDefs = resolveProxyOpencodeToolDefs({
    requested: config.proxyOpencodeTools,
    items: live.items,
    taken: new Set([...staticDefs, ...mcpDefs].map((t) => t.name)),
  })
  const opencodeDefs = filterProxyOpencodeToolDefs(resolvedOpencodeDefs, modelTools, dialect)
  if (opencodeDefs.length > 0) {
    log.info("forwarding opencode tools through the proxy", { tools: opencodeDefs.map((t) => t.name) })
  }

  return {
    combined: [...staticDefs, ...mcpDefs, ...opencodeDefs],
    cliTools: undefined,
    replaced: [],
    // Disallow against the post-version-gate defs, before the model-tools
    // filter: an unsupported question proxy leaves its native fallback live,
    // and a permission-denied proxy keeps its native replacement off.
    disallowed: resolveDisallowedTools({
      proxyTools: [...(gated ?? []), ...resolvedOpencodeDefs],
      extraDisallowedTools: [
        ...nativeToolsDeniedByHost(modelTools, dialect),
        ...harnessDenied,
        ...(config.extraDisallowedTools ?? []),
      ],
      disableWebSearch: config.webSearch === "disabled",
    }),
  }
}

function gateStaticDefs(
  defs: ProxyToolDef[] | null,
  live: LiveToolInfo,
  taskEnabled: boolean,
  questionEnabled: boolean,
) {
  if (!defs) return null
  const withTask = taskEnabled ? overlayTaskProxyDescription(defs, live.taskDescription) : defs
  if (taskEnabled) {
    // Whether the model sees opencode's agent list is the difference between
    // a dispatch and an "Unknown agent type" guess.
    log.info("task proxy description overlay", {
      applied: Boolean(live.taskDescription),
      liveDescriptionLength: live.taskDescription?.length ?? 0,
      listsAgentTypes: Boolean(live.taskDescription?.includes("Available agent types")),
    })
  }
  if (!questionEnabled) return withTask
  // When the gate drops the def the model silently falls back to the
  // deny/markdown path, which looks like the feature is off; log it.
  log.info("question proxy version gate", { opencodeHasQuestion: live.hasQuestion, kept: live.hasQuestion })
  return filterQuestionProxyByOpencodeSupport(
    overlayQuestionProxyDescription(withTask, live.hasQuestion ? live.questionDescription : undefined),
    live.hasQuestion,
  )
}
