/**
 * Which proxy tools one spawn exposes, which Claude built-ins it disables,
 * and how opencode's MCP and registry tools become proxy defs.
 */
import { apiKey } from "@/tool/jevClient"
import { log } from "./logger.js"
import { showToast } from "./runtimeStatus.js"
import { toolNameForHost, type HostToolDialect } from "./hostTools.js"
import { TASK_BATCH_TOOL_NAME, type ProxyToolDef } from "./proxyToolDefs.js"
import {
  CLAUDE_HARNESS_ONLY_TOOLS,
  CLAUDE_NATIVE_TOOLS,
  CLAUDE_UNSUPPORTED_TOOLS,
  type CommandToolPlan,
} from "./shared.js"

/** CLI-ready list of Claude tool names to disable, for each proxied tool. */
export function disallowedToolFlags(tools: readonly Pick<ProxyToolDef, "name">[]): string[] {
  // Map our lowercase MCP tool names to the Claude tool name(s) they replace.
  // `task` disables Claude CLI's `Agent` tool (its built-in subagent
  // dispatcher) so subagent calls flow through opencode's `task` tool
  // instead - which lets opencode's configured subagent set (`build`,
  // `general`, custom subagents in opencode.json) execute the work
  // under opencode's permission/lifecycle, rather than Claude's
  // internal-only general-purpose / Explore / Plan options.
  // `Workflow` goes with them: it runs Claude's own subagents in the background, past oc.
  const nameMap: Record<string, string[]> = {
    task: ["Agent", "Task", "TaskOutput", "Workflow"],
    task_batch: ["Agent", "Task", "TaskOutput", "Workflow"],
    // `question` disables Claude Code's built-in `AskUserQuestion` so the
    // structured-questions path flows through opencode's native `question`
    // tool instead - same UI/permission/audit benefits as the other
    // proxies. Without this, the model can call both and the two paths
    // diverge (opencode's form vs the headless deny-and-render fallback).
    question: ["AskUserQuestion"],
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of tools) {
    const mapped = nameMap[t.name.toLowerCase()]
    if (!mapped) continue
    for (const claudeTool of mapped) {
      if (seen.has(claudeTool)) continue
      seen.add(claudeTool)
      out.push(claudeTool)
    }
  }
  return out
}

/** The opencode tool each static proxy def runs. */
const PROXY_DEF_OPENCODE_TOOL: Record<string, string> = {
  task: "task",
  [TASK_BATCH_TOOL_NAME]: "task",
  task_cancel: "task_cancel",
  question: "question",
  session_tail: "session_tail",
  run_after_turn: "run_after_turn",
  time: "time",
  schedule_prompt: "schedule_prompt",
  schedule_list: "schedule_list",
  schedule_cancel: "schedule_cancel",
}

/**
 * Drop the static defs whose opencode tool the calling agent may not use.
 * opencode removes permission-denied tools from the `tools` it hands the
 * provider (`resolveTools`), so a def missing there would only earn a
 * rejected call. Callers compute disallowed built-ins from the original defs
 * before filtering, or hiding `task` would reopen Claude's own Agent.
 * V2 names use the host translation table.
 */
export function filterProxyByModelTools(
  tools: ProxyToolDef[],
  modelTools: readonly ModelToolEntry[] | undefined,
  dialect: HostToolDialect = "v1",
): ProxyToolDef[] {
  const offered = modelToolNames(modelTools)
  return tools.flatMap((t) => {
    const id = PROXY_DEF_OPENCODE_TOOL[t.name]
    if (!id) return [t]
    const name = toolNameForHost(id, dialect)
    return name === null || (offered && !offered.has(name)) ? [] : [t]
  })
}

/**
 * Claude Code runs its built-ins itself, so oc's per-agent permissions reach
 * them only through `--disallowedTools`: an oc tool left out of the agent's
 * tool set (a read-only subagent, a denied tool) turns its built-ins off.
 * Missing tools are permission-denied or disabled capabilities. Websearch and
 * skill have separate provider settings.
 */
export function nativeToolsDeniedByHost(
  modelTools: readonly ModelToolEntry[] | undefined,
  dialect: HostToolDialect = "v1",
): string[] {
  const offered = modelToolNames(modelTools)
  if (!offered) return []
  return Object.entries(CLAUDE_NATIVE_TOOLS).flatMap(([id, natives]) => {
    const name = toolNameForHost(id, dialect)
    return name === null || offered.has(name) ? [] : natives
  })
}

/**
 * A command turn's split under its plan. Each oc tool the turn allows runs either as Claude's
 * built-in (in `plan.native`) or through the proxy, never both. Returns the oc tool names to
 * forward, the built-ins Claude keeps, and the built-ins to turn off.
 */
export function splitCommandTools(
  plan: CommandToolPlan,
  modelTools: readonly ModelToolEntry[] | undefined,
  dialect: HostToolDialect = "v1",
) {
  const offered = modelToolNames(modelTools) ?? new Set<string>()
  const native = new Set(
    plan.native.filter((id) => {
      const name = toolNameForHost(id, dialect)
      return name !== null && offered.has(name) && CLAUDE_NATIVE_TOOLS[id] !== undefined
    }),
  )
  // Claude's own Bash runs background jobs itself, so oc's job controls go with oc's shell.
  const replaced = new Set(
    [...native, ...(native.has("bash") ? ["bgStatus", "bgKill"] : [])].map((id) => toolNameForHost(id, dialect)),
  )
  const harnessOnly = new Set(plan.native.filter((id) => CLAUDE_HARNESS_ONLY_TOOLS[id] !== undefined))
  return {
    forwarded: [...offered].filter((name) => !replaced.has(name)),
    kept: [...native, ...harnessOnly].flatMap((id) => CLAUDE_NATIVE_TOOLS[id] ?? CLAUDE_HARNESS_ONLY_TOOLS[id]),
    off: [
      ...Object.entries(CLAUDE_NATIVE_TOOLS).flatMap(([id, natives]) => (native.has(id) ? [] : natives)),
      ...Object.entries(CLAUDE_HARNESS_ONLY_TOOLS).flatMap(([id, natives]) => (harnessOnly.has(id) ? [] : natives)),
    ],
  }
}

/** Filter explicitly forwarded registry tools against the host's resolved tool set. */
export function filterProxyOpencodeToolDefs(
  tools: ProxyToolDef[],
  modelTools: readonly ModelToolEntry[] | undefined,
  dialect: HostToolDialect = "v1",
): ProxyToolDef[] {
  const offered = modelToolNames(modelTools)
  if (!offered) return tools
  return tools.filter((tool) => {
    const name = toolNameForHost(tool.name, dialect)
    return name !== null && offered.has(name)
  })
}

function modelToolNames(tools: readonly ModelToolEntry[] | undefined) {
  if (!tools) return undefined
  return new Set(tools.flatMap((tool) => (typeof tool.name === "string" ? [tool.name] : [])))
}

/**
 * Everything that goes to `--disallowedTools` for one spawn: the built-ins
 * the proxied tools replace, plus the ones the operator named directly.
 *
 * `disallowedToolFlags` can only cover tools the plugin has a proxy for, so
 * a built-in with no equivalent (`NotebookEdit`, and anything Claude Code
 * ships next) is unreachable without `extraDisallowedTools` - issue #26.
 */
export function resolveDisallowedTools(options: {
  proxyTools?: ProxyToolDef[] | null
  extraDisallowedTools?: string[]
  disableWebSearch?: boolean
}): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    out.push(trimmed)
  }

  for (const name of disallowedToolFlags(options.proxyTools ?? [])) push(name)
  for (const name of CLAUDE_UNSUPPORTED_TOOLS) push(name)
  for (const name of options.extraDisallowedTools ?? []) push(String(name))
  if (options.disableWebSearch) push("WebSearch")
  return out
}

/** The shape of one `client.tool.list()` entry this resolver needs. */
export interface OpencodeToolListEntry {
  id: string
  description?: string
  parameters?: unknown
}

/**
 * Build proxy defs for the opencode tools named in `proxyOpencodeTools`.
 *
 * `resolvedProxyMcpTools` only forwards a tool whose id matches an enabled
 * MCP server (`<server>` or `<server>_<tool>`), so a tool another opencode
 * plugin declares directly matches nothing and is dropped. opencode-dcp's
 * `compress` is the case that motivated this: it is in opencode's registry,
 * dcp tells the model "you MUST use the `compress` tool now", and under this
 * provider the model was never offered it. This is the explicit allowlist
 * that forwards such a tool. It is deliberately never automatic: these run
 * inside opencode with the caller's permissions, so which ones cross over is
 * the operator's decision.
 *
 * A name already held by another proxy def wins, and the forwarded entry is
 * dropped with a warning rather than silently shadowed.
 */
export function resolveProxyOpencodeToolDefs(options: {
  requested?: readonly string[]
  items?: readonly OpencodeToolListEntry[]
  taken?: ReadonlySet<string>
}): ProxyToolDef[] {
  const requested = options.requested ?? []
  if (requested.length === 0) return []

  const items = options.items
  if (!items) {
    log.warn("proxyOpencodeTools is set but opencode's tool registry did not answer; forwarding nothing this spawn", {
      requested: requested.map(String),
    })
    return []
  }

  const byLowerId = new Map<string, OpencodeToolListEntry>()
  for (const item of items) {
    const key = item.id.toLowerCase()
    if (!byLowerId.has(key)) byLowerId.set(key, item)
  }

  const taken = options.taken ?? new Set<string>()
  const out: ProxyToolDef[] = []
  const seen = new Set<string>()
  const unknown: string[] = []
  const collided: string[] = []

  for (const raw of requested) {
    const name = String(raw).trim()
    if (!name) continue
    const item = byLowerId.get(name.toLowerCase())
    if (!item) {
      unknown.push(name)
      continue
    }
    if (taken.has(item.id)) {
      collided.push(item.id)
      continue
    }
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push({
      name: item.id,
      description: typeof item.description === "string" ? item.description : "",
      inputSchema:
        item.parameters && typeof item.parameters === "object"
          ? (item.parameters as Record<string, unknown>)
          : { type: "object", properties: {} },
    })
  }

  // The registry hides the jev_* tools while no key is set (`tool/registry.ts`), so say that instead.
  const keyless = apiKey() ? [] : unknown.filter((name) => name.toLowerCase().startsWith("jev_"))
  if (keyless.length > 0)
    showToast(
      `Jev tools need TYPESAFE_API_KEY: ${keyless.join(", ")} stay off until it is set and oc restarts.`,
      "warning",
      "Jev key missing",
    )
  const missing = unknown.filter((name) => !keyless.includes(name))
  // Same reasoning as the `proxyTools` typo warning: an unrecognised name is
  // simply not forwarded, and silence looks from the outside like the option
  // was ignored.
  if (missing.length > 0) {
    log.warn("ignoring unknown proxyOpencodeTools entries", {
      unknown: missing,
      known: [...byLowerId.values()].map((item) => item.id).join(", "),
    })
    showToast(
      `Claude Code setting proxyOpencodeTools lists tools oc does not have: ${missing.join(", ")}. They are ignored.`,
      "warning",
      "Config entry ignored",
    )
  }
  if (collided.length > 0) {
    log.warn("proxyOpencodeTools entry dropped: a proxy tool already holds that name," + " and it keeps it", {
      collided,
    })
    showToast(
      `Claude Code setting proxyOpencodeTools entries ${collided.join(", ")} were dropped: a built-in proxy tool already uses that name.`,
      "warning",
      "Config entry ignored",
    )
  }
  return out
}

/** One entry of the AI SDK `tools` array opencode hands `doStream`. */
export interface ModelToolEntry {
  type?: string
  name?: string
  description?: string
  inputSchema?: unknown
}

/** What `resolveMcpProxyToolDefs` found, split by the two things callers need. */
export interface McpProxyToolResolution {
  /** One def per MCP tool that will be served from the proxy instead. */
  defs: ProxyToolDef[]
  /** Only the servers a def was actually built for. */
  coveredServers: Set<string>
}

/**
 * Build proxy defs for opencode's MCP-backed tools out of the tool array
 * opencode already passes to `doStream`.
 *
 * The discovery source matters, and it is the whole reason this function
 * exists. The obvious source, `client.tool.list()` behind
 * `/experimental/tool`, enumerates opencode's `ToolRegistry` only: built-ins
 * plus plugin-declared tools. MCP tools are not in that registry on 1.18.31,
 * they are merged into the model's tool set afterwards, so a registry-based
 * match finds nothing however the prefix rule is written. The AI SDK `tools`
 * argument is downstream of that merge, so it is the one place a provider
 * plugin can see them at all.
 *
 * Matching is still by enabled-server prefix, longest name first so
 * `slack_intl_*` resolves to `slack_intl` and not `slack`. That is
 * deliberately narrow: everything else in the array is a built-in or another
 * plugin's tool, and forwarding those wholesale is what the explicit
 * `proxyOpencodeTools` allowlist is for.
 */
export function resolveMcpProxyToolDefs(options: {
  serverNames: readonly string[]
  tools?: readonly ModelToolEntry[]
  taken?: ReadonlySet<string>
}): McpProxyToolResolution {
  const empty: McpProxyToolResolution = { defs: [], coveredServers: new Set() }
  const serverNames = options.serverNames ?? []
  if (serverNames.length === 0) return empty

  const tools = options.tools
  if (!tools || tools.length === 0) return empty

  const serversByLengthDesc = [...serverNames].sort((a, b) => b.length - a.length)
  const taken = options.taken ?? new Set<string>()
  const defs: ProxyToolDef[] = []
  const coveredServers = new Set<string>()
  const seen = new Set<string>()
  const collided: string[] = []

  for (const tool of tools) {
    // opencode only ever puts plain function tools in this array; a
    // provider-defined entry has no opencode executor behind it, so
    // forwarding one would produce a call nothing can answer.
    if (tool?.type !== undefined && tool.type !== "function") continue
    const name = typeof tool?.name === "string" ? tool.name.trim() : ""
    if (!name) continue

    const matchedServer = serversByLengthDesc.find((server) => name === server || name.startsWith(`${server}_`))
    if (!matchedServer) continue
    if (seen.has(name)) continue
    if (taken.has(name)) {
      collided.push(name)
      continue
    }
    seen.add(name)
    coveredServers.add(matchedServer)
    defs.push({
      name,
      description: typeof tool.description === "string" ? tool.description : "",
      inputSchema:
        tool.inputSchema && typeof tool.inputSchema === "object"
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: "object", properties: {} },
    })
  }

  if (collided.length > 0) {
    // WARN, not NOTICE: src/logger.ts mirrors warn and error to opencode.log,
    // and a shadowed MCP tool silently stops being routed through opencode,
    // which is exactly the class of surprise this lane exists to end.
    log.warn(
      "MCP tool not routed through the proxy: another proxy tool already holds" + " that name, and it keeps it",
      { collided },
    )
  }
  return { defs, coveredServers }
}
