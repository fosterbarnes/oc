import type { LanguageModelV3CallOptions } from "@ai-sdk/provider"
import { trace } from "./debug.js"
import {
  CUSTOM_WEBFETCH_TOOL,
  CUSTOM_WEBSEARCH_TOOL,
  CUSTOM_LIST_MCP_RESOURCES_TOOL,
  CUSTOM_READ_MCP_RESOURCE_TOOL,
  type OpencodeToolDef,
} from "./protocol/descriptors.js"
import { parseExecIdFromToolCallId } from "./protocol/execParse.js"
import { extractHostSubagentCatalog } from "./protocol/subagents.js"
import { bindConversationId } from "./protocol/conversationBind.js"
import type { SeedHistoryMessage } from "./protocol/request.js"


// -- Prompt extraction --

export type ExtractedToolResult = {
  toolCallId: string
  sessionId: string
  execId: number
  toolName: string
  output: string
  error?: string
}

export function extractToolResults(prompt: LanguageModelV3CallOptions["prompt"]): ExtractedToolResult[] {
  const out: ExtractedToolResult[] = []
  for (const msg of prompt) {
    if (msg.role !== "tool" || !Array.isArray(msg.content)) continue
    for (const part of msg.content) {
      const p = part as unknown as Record<string, unknown>
      if (p.type !== "tool-result") continue
      const toolCallId = (p.toolCallId as string) ?? ""
      const parsed = parseExecIdFromToolCallId(toolCallId)
      if (!parsed) continue
      const { text, isError } = toolResultOutputToText(p.output)
      out.push({
        toolCallId,
        sessionId: parsed.sessionId,
        execId: parsed.execId,
        toolName: (p.toolName as string) ?? "mcp",
        output: text,
        error: isError ? text : undefined,
      })
    }
  }
  return out
}

/**
 * Tool results that form a live continuation: only the trailing run of `tool`
 * messages after the last non-tool message. Mid-prompt historical tool results
 * are ignored - they are conversation history, not replies for a held-open Run.
 */
export function extractTrailingToolResults(prompt: LanguageModelV3CallOptions["prompt"]): ExtractedToolResult[] {
  if (prompt.length === 0) return []
  let i = prompt.length - 1
  while (i >= 0 && prompt[i].role === "tool") i--
  // Continuations end with tool messages. Anything else (user/assistant/system)
  // means this is a fresh model call that merely carries tools in history.
  if (i === prompt.length - 1) return []
  return extractToolResults(prompt.slice(i + 1))
}

function toolResultOutputToText(output: unknown): { text: string; isError: boolean } {
  if (output == null) return { text: "", isError: false }
  if (typeof output === "string") return { text: output, isError: false }
  const o = output as Record<string, unknown>
  // LanguageModelV3 tool-result output: { type: "text"|"json"|"error-text"|..., value }
  const isError = typeof o.type === "string" && (o.type as string).startsWith("error")
  if (o.type === "text" || o.type === "error-text") {
    return { text: String(o.value ?? ""), isError }
  }
  if (o.type === "json" || o.type === "error-json") {
    return { text: JSON.stringify(o.value ?? null), isError }
  }
  if (o.type === "content" && Array.isArray(o.value)) {
    // Held-open continuation exec frames are text-only. Media is intentionally
    // omitted here and harvested from the full prompt when a fresh Run opens.
    const text = o.value
      .map((c) => {
        const cp = c as Record<string, unknown>
        return cp.type === "text" ? String(cp.text ?? "") : ""
      })
      .join("")
    return { text, isError }
  }
  return { text: JSON.stringify(output), isError }
}

export function extractSystemPrompt(prompt: LanguageModelV3CallOptions["prompt"]): string | undefined {
  const parts: string[] = []
  for (const m of prompt) {
    if (m.role === "system" && typeof m.content === "string") parts.push(m.content)
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined
}

/**
 * Cursor's native UI interactions cannot be surfaced through the AI SDK.
 * Redirect only to OpenCode tools that are genuinely advertised this turn;
 * compaction keeps its dedicated summary prompt unchanged.
 *
 * Cursor Agent Run never removes native Shell/Grep/Read from the model. These
 * lines are host-identity injection so the model uses advertised OpenCode names
 * and does not narrate missing MCP tools. Native Read/Grep/Shell still remap.
 *
 * Lead with the host/provider split. Model branding and a `cursor` tool
 * namespace must not be read as Cursor IDE. Empty catalogs still get the host
 * block so a seed Run cannot omit it; compaction keeps its own prompt.
 */
export function buildOpenCodeInteractionGuidance(
  tools: OpencodeToolDef[],
  isCompaction: boolean,
  workspaceRoot: string,
): string | undefined {
  if (isCompaction) return undefined
  const names = new Set(tools.map((tool) => tool.name))
  const hostPreamble = [
    "You are in OpenCode. You are not in Cursor IDE.",
    "Cursor is only the model provider for this turn. It is not the app, the host, or the session runtime.",
    "Do not treat model branding, a `cursor` tool namespace, or Cursor-named tools as evidence of Cursor IDE.",
    "Session, task, and spawn tools belong to OpenCode. A child task is a new OpenCode session, never a Cursor IDE session.",
    "That child uses Cursor SwitchMode, CreatePlan, AskQuestion, and native Shell/Grep/Read remap only when the child's model is this same native Cursor provider.",
    "If the child's model is any other OpenCode model, it calls OpenCode tools directly and never raises those Cursor interactions.",
    "Decide the host from these sentences. Do not decide it from the model name or from tool-namespace labels.",
  ]
  if (names.size === 0) return hostPreamble.join("\n")
  const instructions: string[] = []
  const subagents = extractHostSubagentCatalog(tools)

  if (names.has("question")) {
    // Cursor-native AskQuestion is translated into this tool (see
    // protocol/askQuestion.ts), so both routes reach the user. Saying so stops
    // the model from treating a question as impossible when it reaches for its
    // native interaction first.
    instructions.push(
      "- When user input is required, call the OpenCode `question` tool (Cursor may list it as `question` or `opencode-question`). Cursor-native AskQuestion is the same channel and is also accepted.",
    )
  }
  if (names.has("skill")) {
    instructions.push(
      "- For OpenCode vs Cursor skill-catalog questions, call OpenCode `skill` with name `host-skills` first. Do not invent skill names.",
    )
  }
  // CreatePlan is a Cursor InteractionQuery (#7), not an OpenCode/MCP catalog
  // tool. Always say so when we advertise any tools - otherwise the model sees
  // CreatePlan in Cursor's function definitions, notices it is absent from the
  // OpenCode list, and narrates "No CreatePlan MCP tool is available" even
  // though the provider bridges the native interaction.
  instructions.push(
    "- Cursor-native CreatePlan is accepted as a Cursor interaction (not an OpenCode or MCP catalog tool). Raise it normally; the provider writes the plan under the host's calculated plans directory and handles execution approval. Do not narrate that CreatePlan is missing, unavailable, or not an MCP tool.",
  )
  instructions.push(
    "- Do not SwitchMode to Cursor plan or spec. That mode is disabled. OpenCode planning is a different primary agent, not Cursor unifiedMode. A rejected plan/spec SwitchMode is expected; stay on this agent and keep working. Do not narrate that planning is blocked.",
  )
  if (names.has("todowrite")) {
    instructions.push(
      "- For planning task lists, call the OpenCode `todowrite` tool and/or write the plan as normal markdown.",
    )
  }
  if (names.has("plan_exit")) {
    instructions.push(
      "- To leave Cursor plan mode, call the OpenCode `plan_exit` tool. SwitchMode to any non-plan target (agent, build, chat, debug, edit, ...) is also accepted as leave-plan.",
    )
  }
  if (names.has(CUSTOM_WEBSEARCH_TOOL)) {
    instructions.push(
      `- For web searches, call \`${CUSTOM_WEBSEARCH_TOOL}\`; do not use Cursor's native WebSearch interaction.`,
    )
  }
  if (names.has(CUSTOM_WEBFETCH_TOOL)) {
    instructions.push(
      `- To fetch a known URL, call \`${CUSTOM_WEBFETCH_TOOL}\`; do not use Cursor's native WebFetch interaction.`,
    )
  }
  if (names.has(CUSTOM_LIST_MCP_RESOURCES_TOOL)) {
    instructions.push(
      `- To list MCP resources, call \`${CUSTOM_LIST_MCP_RESOURCES_TOOL}\`; do not use Cursor's native resource-listing interaction.`,
    )
  }
  if (names.has(CUSTOM_READ_MCP_RESOURCE_TOOL)) {
    instructions.push(
      `- To read an MCP resource, call \`${CUSTOM_READ_MCP_RESOURCE_TOOL}\`; do not use Cursor's native resource-reading interaction.`,
    )
  }
  if (names.has("task")) {
    const target = "`task`"
    const available = subagents.agents.map((agent) => `\`${agent.name}\``).join(", ")
    instructions.push(
      `- Native Cursor Task/subagent requests are executed through OpenCode ${target}. ` +
        "Advertised custom subagent names are used exactly; otherwise `unspecified` and `generalPurpose` select host `general`, " +
        "`bugbot`, `security-review`, and `explore` select host `explore` (then `general`), and other specialized Cursor types fall back to `general`." +
        (available ? ` Spawnable host agents this turn: ${available}.` : ""),
    )
    if (subagents.agents.some((agent) => agent.name === "scout")) {
      instructions.push(
        "- Host `scout` is available for external documentation and dependency-source research. Use Cursor `cursor-guide` for that use case; local repository discovery still uses `bugbot`/`explore`.",
      )
    }
  }
  if (names.has("bash") && process.platform === "win32") {
    instructions.push(
      "- To delete a file, call OpenCode `bash` with `Remove-Item -LiteralPath <path> -Force`. Cursor-native Delete is accepted and rewritten that way on Windows; do not use Unix `rm -f`.",
    )
  }
  if (names.has("write")) {
    instructions.push(
      names.has("edit")
        ? "- For file changes, use OpenCode `edit` for targeted changes to existing files and `write` to create files or intentionally replace complete contents; do not use shell, Python, or heredocs to change file content while these tools are available."
        : "- Use OpenCode `write` for file-content changes; do not use shell, Python, or heredocs to change file content while it is available.",
    )
  } else if (names.has("apply_patch")) {
    // This host withheld `edit`/`write` and offers `apply_patch` instead. Native
    // Cursor write/edit requests are translated into it, so say so rather than
    // leaving the turn with no file-editing guidance at all.
    instructions.push(
      "- Use OpenCode `apply_patch` for file-content changes; do not use shell, Python, or heredocs to change file content while it is available. Cursor-native write and edit requests are accepted and converted to `apply_patch` automatically.",
    )
  }
  if (names.has("edit") || names.has("write") || names.has("apply_patch")) {
    instructions.push(
      "- Never use a read result as complete file content when it says the output is capped, partial, or requires another offset. Read the remaining ranges first, or make a targeted edit/patch from complete context; do not pass a partial read back as a whole-file replacement.",
    )
  }
  return [
    ...hostPreamble,
    `OpenCode exposes exactly these executable tools for this turn: ${[...names].map((name) => `\`${name}\``).join(", ")}.`,
    "This is OpenCode, not Cursor IDE. Call only the listed host names. Do not inventory tools or list Cursor IDE tools.",
    "If this turn lists host tools, do not write that they are missing, disabled, or MCP-unavailable. Call a listed tool instead of announcing discovery.",
    "There is no GetDynamicTools, CallDynamicTool, or StrReplace on this host. Do not claim those ran. Prefer listed OpenCode names (grep, read, edit, bash). Native Cursor Read/Grep/Shell in this session are those same tools.",
    "When asked to describe available tools, repeat only the exact host names in the first sentence. Do not add Cursor-native aliases, dynamic-tool helpers, MCP namespaces, or hypothetical tools unless the user explicitly asks for a mapping.",
    "OpenCode `read` already attaches image bytes on the next turn. Do not call `cursor_image_save` after OpenCode `read`; that tool only commits images Cursor generated this session.",
    `Workspace root: ${JSON.stringify(workspaceRoot)}. Resolve workspace paths against exactly this root; never invent an absolute prefix, and verify uncertain paths with an available tool before using them.`,
    subagents.executor
      ? "Call only tools in that exact list for ordinary host execution. Cursor-native Task/subagent requests are permitted because a compatible host executor is listed. Bridged Cursor interactions named below (AskQuestion, CreatePlan, SwitchMode off plan, ...) are not OpenCode/MCP catalog tools - raise them normally except SwitchMode to plan/spec, which is rejected. Do not narrate that those interactions are missing."
      : "Call only tools in that exact list for ordinary host execution. Bridged Cursor interactions named below (AskQuestion, CreatePlan, SwitchMode off plan, ...) are not OpenCode/MCP catalog tools - raise them normally except SwitchMode to plan/spec, which is rejected. Do not narrate that those interactions are missing. Other unlisted Cursor-native tools are not bridged; complete the work with the listed tools or explain the limitation without claiming a missing MCP tool.",
    ...(instructions.length > 0
      ? ["Use these OpenCode tools instead of equivalent Cursor-native UI interactions:"]
      : []),
    ...instructions,
    "Emit the actual tool call and wait for its result; never merely claim or summarize that a tool was used.",
  ].join("\n")
}

/**
 * Prior prompt turns for a seed ConversationStateStructure. Tool results must
 * never be replayed as assistant-authored prose: that teaches the model to
 * counterfeit `Tool result (...)` text instead of emitting a real tool call.
 * Normal rebases omit old results; compaction can retain all results and
 * interrupted continuations retain only the trailing live result suffix as
 * explicit OpenCode-host observations.
 */
export function extractPromptHistory(
  prompt: LanguageModelV3CallOptions["prompt"],
  options?: {
    preserveTrailingUser?: boolean
    toolResults?: "omit" | "all" | "trailing"
  },
): SeedHistoryMessage[] {
  const out: SeedHistoryMessage[] = []
  const toolResults = options?.toolResults ?? "omit"
  let trailingToolStart = prompt.length
  if (toolResults === "trailing") {
    while (trailingToolStart > 0 && prompt[trailingToolStart - 1]?.role === "tool") {
      trailingToolStart--
    }
  }
  for (let messageIndex = 0; messageIndex < prompt.length; messageIndex++) {
    const m = prompt[messageIndex]!
    if (m.role === "system") {
      if (typeof m.content === "string" && m.content.length > 0) {
        out.push({ role: "system", content: m.content })
      }
      continue
    }
    if (m.role === "user") {
      const text = extractUserText(m as unknown as Record<string, unknown>)
      if (text && text !== ".") out.push({ role: "user", content: text })
      continue
    }
    if (m.role === "assistant") {
      const text = extractAssistantHistoryText(m as unknown as Record<string, unknown>)
      if (text) appendSeedHistory(out, "assistant", text)
      continue
    }
    if (m.role === "tool" && Array.isArray(m.content)) {
      if (toolResults === "omit" || (toolResults === "trailing" && messageIndex < trailingToolStart)) continue
      const results: string[] = []
      for (const part of m.content) {
        const p = part as unknown as Record<string, unknown>
        if (p.type !== "tool-result") continue
        const toolName = typeof p.toolName === "string" && p.toolName ? p.toolName : "tool"
        const toolCallId = typeof p.toolCallId === "string" ? p.toolCallId : ""
        const result = toolResultOutputToText(p.output)
        results.push(
          formatSeedToolObservation({
            toolName,
            toolCallId,
            output: result.text,
            isError: result.isError,
          }),
        )
      }
      if (results.length > 0) appendSeedHistory(out, "user", results.join("\n\n"))
    }
  }
  // Live user message is the Run action, not seed history.
  if (!options?.preserveTrailingUser && out.length > 0 && out[out.length - 1]!.role === "user") {
    out.pop()
  }
  return out
}

function formatSeedToolObservation(input: {
  toolName: string
  toolCallId: string
  output: string
  isError: boolean
}): string {
  const metadata = JSON.stringify({
    source: "opencode-tool",
    tool: input.toolName,
    callId: input.toolCallId,
    status: input.isError ? "error" : "completed",
  })
  return `OpenCode host observation ${metadata}:\n${input.output}`
}

function extractAssistantHistoryText(msg: Record<string, unknown>): string {
  const content = msg.content
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const texts: string[] = []
  for (const part of content) {
    const p = part as Record<string, unknown>
    if (p.type === "text" && typeof p.text === "string" && p.text.length > 0) {
      texts.push(p.text)
    }
  }
  return texts.join("\n")
}

function appendSeedHistory(out: SeedHistoryMessage[], role: SeedHistoryMessage["role"], content: string): void {
  if (!content) return
  const last = out[out.length - 1]
  if (last?.role === role) {
    last.content += `\n\n${content}`
    return
  }
  out.push({ role, content })
}

/** OpenCode session id header, if present. */
export function opencodeSessionKey(callOptions: LanguageModelV3CallOptions): string | undefined {
  const h = callOptions.headers ?? {}
  const raw = h["x-session-id"] ?? h["X-Session-Id"] ?? h["x-session-affinity"] ?? h["x-opencode-session"]
  if (typeof raw === "string" && raw.trim().length > 0) return raw.trim()
  return undefined
}

/**
 * Map OpenCode's session id header to the active Cursor conversation_id.
 * Compaction resets remint via bindConversationId; otherwise the binding is
 * sticky for the OpenCode session. Falls back to a random UUID with no header.
 */
export function resolveConversationId(callOptions: LanguageModelV3CallOptions): string {
  return bindConversationId(opencodeSessionKey(callOptions)).conversationId
}

export function extractTools(callOptions: LanguageModelV3CallOptions): OpencodeToolDef[] {
  const tools = callOptions.tools
  if (!tools || tools.length === 0) {
    trace("extractTools: callOptions.tools empty/missing")
    return []
  }
  const out: OpencodeToolDef[] = []
  for (const t of tools) {
    // LanguageModelV3FunctionTool always has type:"function". Be defensive in
    // case a middleware strips it - still accept anything with a name + schema.
    const any = t as { type?: string; name?: string; description?: string; inputSchema?: unknown }
    if (any.type === "function" || (any.name && any.inputSchema !== undefined)) {
      if (!any.name) continue
      out.push({ name: any.name, description: any.description, inputSchema: any.inputSchema })
    }
  }
  trace(`extractTools: ${tools.length} incoming -> ${out.length} advertised [${out.map((t) => t.name).join(",")}]`)
  return out
}

export function extractUserText(lastUser: Record<string, unknown> | undefined): string {
  if (!lastUser) return "."
  const content = lastUser.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    const texts: string[] = []
    for (const part of content) {
      const p = part as Record<string, unknown>
      if (p.type === "text" && typeof p.text === "string") texts.push(p.text)
    }
    if (texts.length > 0) return texts.join("\n")
  }
  return "."
}
