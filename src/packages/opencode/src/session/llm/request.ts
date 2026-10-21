import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { Auth } from "@/auth"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { Permission } from "@/permission"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "../message-v2"
import type { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { SystemPrompt } from "../system"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Effect, Record } from "effect"
import { jsonSchema, tool as aiTool, type ModelMessage, type Tool } from "ai"
import type { Plugin } from "@/plugin"
import { mergeDeep } from "remeda"
import { COMPACTION_BOUNDARY_OPTION, CURSOR_COMPACTION_OPTION, CURSOR_PROVIDER_ID } from "@/provider/cursor/shared"
import {
  CLAUDE_CODE_AGENT_OPTION,
  CLAUDE_CODE_AGENT_PROMPT_OPTION,
  CLAUDE_CODE_COMMAND_PERMISSION_OPTION,
  CLAUDE_CODE_EXPLICIT_MODEL_OPTION,
  CLAUDE_CODE_HARNESS_DENIED_OPTION,
  CLAUDE_CODE_SESSION_OPTION,
  CLAUDE_HARNESS_ONLY_TOOLS,
  CLAUDE_NATIVE_TOOLS,
  isClaudeCodeProvider,
  type CommandToolPlan,
} from "@/provider/claude-code/shared"
import { Wildcard } from "@opencode-ai/core/util/wildcard"

const USER_AGENT = `opencode/${InstallationVersion}`

type PrepareInput = {
  readonly user: SessionV1.User
  readonly sessionID: string
  readonly parentSessionID?: string
  readonly model: Provider.Model
  readonly agent: Agent.Info
  readonly permission?: PermissionV1.Ruleset
  readonly system: string[]
  readonly messages: ModelMessage[]
  readonly small?: boolean
  readonly tools: Record<string, Tool>
  readonly provider: Provider.Info
  readonly auth: Auth.Info | undefined
  readonly plugin: Plugin.Interface
  readonly flags: RuntimeFlags.Info
  readonly isWorkflow: boolean
  readonly compactionBoundary?: string
}

export type Prepared = {
  readonly system: string[]
  readonly messages: ModelMessage[]
  readonly tools: Record<string, Tool>
  readonly params: {
    readonly temperature?: number
    readonly topP?: number
    readonly topK?: number
    readonly maxOutputTokens?: number
    readonly options: Record<string, any>
  }
  readonly messageTransformOptions: Record<string, any>
  readonly headers: Record<string, string>
}

const mergeOptions = (target: Record<string, any>, source: Record<string, any> | undefined): Record<string, any> =>
  mergeDeep(target, source ?? {}) as Record<string, any>

/** Cursor-only host mark so compaction Runs reset/rebase without a plugin hook. */
export function applyCursorCompactionOption(
  options: Record<string, any>,
  input: { readonly providerID: string; readonly agentName: string },
) {
  if (input.providerID !== CURSOR_PROVIDER_ID || input.agentName !== "compaction") return options
  options[CURSOR_COMPACTION_OPTION] = true
  return options
}

export const prepare = Effect.fn("LLMRequestPrep.prepare")(function* (input: PrepareInput) {
  const isOpenaiOauth = input.provider.id === "openai" && input.auth?.type === "oauth"
  const system = [
    [
      ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
      ...input.system,
      ...(input.user.system ? [input.user.system] : []),
    ]
      .filter((x) => x)
      .join("\n"),
  ]

  const header = system[0]
  yield* input.plugin.trigger(
    "experimental.chat.system.transform",
    { sessionID: input.sessionID, model: input.model },
    { system },
  )
  if (system.length > 2 && system[0] === header) {
    const rest = system.slice(1)
    system.length = 0
    system.push(header, rest.join("\n"))
  }

  // Compaction and rename agents pinned to their own model use their own variant, even on small requests.
  const pinned =
    (input.agent.name === "compaction" || input.agent.name === "rename") && input.agent.model && input.agent.variant
  const variantName = pinned ? input.agent.variant : input.user.model.variant
  const variant =
    (pinned || !input.small) && input.model.variants && variantName ? input.model.variants[variantName] : {}
  const base = input.small
    ? ProviderTransform.smallOptions(input.model)
    : ProviderTransform.options({
        model: input.model,
        // Subagents share the parent's prompt cache key so they reuse its cached prefix.
        sessionID: input.parentSessionID ?? input.sessionID,
        providerOptions: input.provider.options,
      })
  const options = mergeOptions(mergeOptions(mergeOptions(base, input.model.options), input.agent.options), variant)
  applyCursorCompactionOption(options, {
    providerID: input.model.providerID,
    agentName: input.agent.name,
  })
  const claudeCode = isClaudeCodeProvider(input.model.providerID)
  if (input.compactionBoundary && input.model.providerID === CURSOR_PROVIDER_ID)
    options[COMPACTION_BOUNDARY_OPTION] = input.compactionBoundary
  if (claudeCode) {
    options[CLAUDE_CODE_SESSION_OPTION] = input.sessionID
    options[CLAUDE_CODE_AGENT_OPTION] = input.agent.name
    if (input.agent.prompt) options[CLAUDE_CODE_AGENT_PROMPT_OPTION] = input.agent.prompt
    const plan = commandToolPlan(input.user)
    if (plan) options[CLAUDE_CODE_COMMAND_PERMISSION_OPTION] = JSON.stringify(plan)
    const harnessDenied = harnessToolsDenied(input)
    if (harnessDenied.length > 0) options[CLAUDE_CODE_HARNESS_DENIED_OPTION] = harnessDenied.join(",")
    if (input.user.model.explicit) options[CLAUDE_CODE_EXPLICIT_MODEL_OPTION] = "true"
  }
  if (
    input.model.api.npm === "@ai-sdk/azure" &&
    (input.provider.options.useCompletionUrls || input.model.options.useCompletionUrls || options.useCompletionUrls)
  ) {
    delete options.reasoningSummary
    delete options.include
  }
  if (isOpenaiOauth) options.instructions = system.join("\n")

  const messages =
    isOpenaiOauth || input.isWorkflow
      ? input.messages
      : [
          ...system.map(
            (x): ModelMessage => ({
              role: "system",
              content: x,
            }),
          ),
          ...input.messages,
        ]

  const params = yield* input.plugin.trigger(
    "chat.params",
    {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: input.provider,
      message: input.user,
    },
    {
      temperature: input.model.capabilities.temperature
        ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
        : undefined,
      topP: input.agent.topP ?? ProviderTransform.topP(input.model),
      topK: ProviderTransform.topK(input.model),
      // OpenAI counts a requested output limit against rate limits, so it keeps the provider default.
      maxOutputTokens:
        input.model.providerID === "openai"
          ? undefined
          : ProviderTransform.maxOutputTokens(
              input.model,
              input.flags.outputTokenMax,
              estimatePromptTokens(messages, input.tools),
            ),
      options,
    },
  )

  const { headers } = yield* input.plugin.trigger(
    "chat.headers",
    {
      sessionID: input.sessionID,
      agent: input.agent.name,
      model: input.model,
      provider: input.provider,
      message: input.user,
    },
    {
      headers: {},
    },
  )

  const tools = resolveTools(input)
  // Codex parity: OpenAI Responses-family providers hardcode `strict: false`
  // on every function tool so MCP-sourced and dynamic schemas that don't
  // satisfy OpenAI's structured-outputs constraints still register.
  if (
    input.model.api.npm === "@ai-sdk/openai" ||
    input.model.api.npm === "@ai-sdk/azure" ||
    input.model.api.npm === "@ai-sdk/amazon-bedrock/mantle"
  ) {
    for (const key of Object.keys(tools)) tools[key] = { ...tools[key], strict: false }
  }
  if (
    input.model.providerID.includes("github-copilot") &&
    Object.keys(tools).length === 0 &&
    hasToolCalls(input.messages)
  ) {
    // Copilot needs a tools field when replaying prior tool calls, even if no tools are currently enabled.
    tools["_noop"] = aiTool({
      description: "Do not call this tool. It exists only for API compatibility and must never be invoked.",
      inputSchema: jsonSchema({
        type: "object",
        properties: {
          reason: { type: "string", description: "Unused" },
        },
      }),
      execute: async () => ({ output: "", title: "", metadata: {} }),
    })
  }

  const opencodeProjectID = input.model.providerID.startsWith("opencode")
    ? (yield* InstanceState.context).project.id
    : undefined

  return {
    system,
    messages,
    tools: Object.fromEntries(Object.entries(tools).toSorted(([a], [b]) => a.localeCompare(b))),
    params,
    messageTransformOptions: options,
    headers: {
      "x-opencode-session-id": input.sessionID,
      ...(input.parentSessionID ? { "x-opencode-parent-session-id": input.parentSessionID } : {}),
      ...(input.model.providerID.startsWith("opencode")
        ? {
            ...(opencodeProjectID ? { "x-opencode-project": opencodeProjectID } : {}),
            "x-opencode-session": input.sessionID,
            "x-opencode-request": input.user.id,
            "x-opencode-client": input.flags.client,
            "User-Agent": USER_AGENT,
          }
        : {
            "x-session-affinity": input.sessionID,
            "X-Session-Id": input.sessionID,
            "User-Agent": USER_AGENT,
          }),
      ...(input.parentSessionID ? { "x-parent-session-id": input.parentSessionID } : {}),
      ...input.model.headers,
      ...headers,
    },
  }
})

// Media counts as a flat allowance: its base64 text says nothing about its token cost.
const MEDIA_TOKENS = 1_600
const MEDIA_PART_TYPES = new Set(["image", "file", "media", "image-data", "file-data", "image-url", "file-url"])

/** Rough prompt size in tokens: text, tool calls and results, and tool definitions. */
export function estimatePromptTokens(messages: ModelMessage[], tools: Record<string, Tool>) {
  let chars = 0
  let media = 0
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      chars += value.length
      return
    }
    if (Array.isArray(value)) return value.forEach(visit)
    if (typeof value !== "object" || value === null || ArrayBuffer.isView(value)) return
    const record = value as Record<string, unknown>
    if (typeof record.type === "string" && MEDIA_PART_TYPES.has(record.type)) {
      media++
      return
    }
    for (const [key, item] of Object.entries(record)) if (key !== "providerOptions") visit(item)
  }
  visit(messages)
  for (const tool of Object.values(tools)) {
    visit(tool.description)
    visit(JSON.stringify((tool.inputSchema as { jsonSchema?: unknown } | undefined)?.jsonSchema ?? {}))
  }
  return Math.ceil(chars / 4) + media * MEDIA_TOKENS
}

function resolveTools(input: Pick<PrepareInput, "tools" | "agent" | "permission" | "user">) {
  const disabled = Permission.disabled(
    Object.keys(input.tools),
    Permission.merge(input.agent.permission, input.permission ?? []),
    input.user.permission,
  )
  return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
}

/**
 * Claude built-ins with no oc proxy that the agent or session permissions deny. oc may not offer
 * these tools at all, so the offered tool list can't carry the denial the way it does for the rest.
 */
export function harnessToolsDenied(input: Pick<PrepareInput, "agent" | "permission" | "user">) {
  const disabled = Permission.disabled(
    Object.keys(CLAUDE_HARNESS_ONLY_TOOLS),
    Permission.merge(input.agent.permission, input.permission ?? []),
    input.user.permission,
  )
  return Object.entries(CLAUDE_HARNESS_ONLY_TOOLS).flatMap(([id, natives]) => (disabled.has(id) ? natives : []))
}

const FILE_TOOLS = new Set(["read", "glob", "grep", "edit", "write"])
// A permission no rule names, so only a catch-all rule can match it.
const UNLISTED_PERMISSION = "\u0000unlisted"

/**
 * Which tools a command turn hands to Claude Code's own built-ins. Per oc tool id (or "*"),
 * `toolHost` picks "oc" (always the proxy), "harness" (always Claude's own), or "auto": Claude's
 * own unless the command's rules limit the tool (a pattern or `ask`), which only oc can enforce.
 * A denied tool stays off whatever the choice. Only the command's own rules count, so a command
 * turn starts from the same Claude tools as an ordinary turn.
 */
export function commandToolPlan(user: SessionV1.User): CommandToolPlan | undefined {
  if (user.permission === undefined && user.toolHost === undefined) return undefined
  const rules = user.permission ?? []
  const host = (tool: string) => user.toolHost?.[tool] ?? user.toolHost?.["*"] ?? "auto"
  const limited = (tool: string) => {
    const keys = [tool === "write" ? "edit" : tool, ...(FILE_TOOLS.has(tool) ? ["external_directory"] : [])]
    return rules.some(
      (rule) =>
        keys.some((key) => Wildcard.match(key, rule.permission)) && (rule.pattern !== "*" || rule.action === "ask"),
    )
  }
  // Harness-only tools have no oc version, so "oc" turns them off and the command's rules decide.
  const harnessOnly = Object.keys(CLAUDE_HARNESS_ONLY_TOOLS).filter(
    (tool) => host(tool) !== "oc" && !Permission.disabled([tool], rules).has(tool),
  )
  return {
    native: [
      ...Object.keys(CLAUDE_NATIVE_TOOLS).filter((tool) =>
        host(tool) === "auto" ? !limited(tool) : host(tool) === "harness",
      ),
      ...harnessOnly,
    ],
    closed: host("*") === "oc" || Permission.disabled([UNLISTED_PERMISSION], rules).size > 0,
  }
}

export function hasToolCalls(messages: ModelMessage[]): boolean {
  for (const msg of messages) {
    if (!Array.isArray(msg.content)) continue
    for (const part of msg.content) {
      if (part.type === "tool-call" || part.type === "tool-result") return true
    }
  }
  return false
}

export * as LLMRequestPrep from "./request"
