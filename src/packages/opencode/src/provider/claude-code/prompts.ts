/**
 * The text this plugin appends to Claude Code's system prompt: the active oc
 * agent's own prompt plus a short note on oc-only tools. Claude Code's prompt,
 * CLAUDE.md and the repo AGENTS.md (which Claude Code loads itself) cover the
 * rest, so oc's environment, instruction and skill blocks are never forwarded.
 */
import { writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { log } from "./logger.js"
import { pluginTmpDir } from "./tmp.js"

const MULTI_STEP_TASK_HINT = `## Continuing through multi-step tasks

opencode requires the user to press "continue" after each turn ends. When a
task has multiple steps, do them all in one turn — chain tool calls rather
than pausing for user confirmation between subtasks. End the turn only
when the task is done, you need clarification on intent, or you hit a real
blocker. The user can interrupt or abort at any time; turn endings should
mark meaningful checkpoints, not every completed substep.`

/**
 * Section of the tool environment note, emitted when the `task` proxy is
 * live. Live sessions (2026-07-04) showed models resolving opencode's
 * "call the task tool with subagent: X" mention hint to Claude Code's
 * native TaskCreate: haiku created a todo and narrated a dispatch that
 * never happened; sonnet probed TaskCreate's schema before recovering.
 * Name the exact tool and the failure mode.
 */
export const SUBAGENT_DISPATCH_HINT = `### Subagents

Subagent dispatch in this environment goes through exactly two tools: \`mcp__opencode_proxy__task\` for one subagent and \`mcp__opencode_proxy__task_batch\` for two or more at once.

- Two or more independent subagents in one response: make ONE \`mcp__opencode_proxy__task_batch\` call with a \`tasks\` array (each item is a normal task input). Claude Code runs MCP calls one at a time, so several \`mcp__opencode_proxy__task\` calls in the same response run serially; \`task_batch\` runs them concurrently in opencode and returns every result together, labelled in order.
- When the user mentions \`@<agent>\` or an instruction says "call the task tool with subagent: <name>", call \`mcp__opencode_proxy__task\` with \`subagent_type: "<name>"\`.
- Todo management does not dispatch subagents; only the proxy calls above do. Never report a subagent as dispatched unless \`mcp__opencode_proxy__task\` returned its result.
- Do not verify a subagent's existence by searching config files - the tool's description lists the available agent types, and invalid types fail fast with a clear error.`

/**
 * Section of the tool environment note, emitted when the `question` proxy
 * survived the version gate. Live testing (2026-07-05, haiku) showed the model's reasoning
 * correctly identified `mcp__opencode_proxy__question` as the tool to use,
 * but then emitted a tool call for bare `question` — stripping the MCP
 * prefix. opencode's AI SDK bridge has no bare `question` tool, so the
 * call rendered as `⚙ invalid`. Same near-miss pattern the task proxy
 * hit (TaskCreate vs mcp__opencode_proxy__task); the fix is the same:
 * name the exact tool in the system prompt so the model doesn't
 * abbreviate.
 */
export const QUESTION_PROXY_HINT = `### Asking the operator questions

Structured questions in this environment go through exactly one tool: \`mcp__opencode_proxy__question\`.

- When you need to ask the operator a question with options, call \`mcp__opencode_proxy__question\` with a \`questions\` array (each item has \`question\`, \`header\`, \`options\` of \`{label, description}\`, and optional \`multiple\`).
- Do NOT call bare \`question\` — that is not a tool. Always use the full \`mcp__opencode_proxy__question\` name when invoking it.
- Claude Code's built-in \`AskUserQuestion\` is disabled in this environment; the proxy is the only way to ask structured questions.`

/**
 * The oc-only tool note for one spawn, or undefined when nothing is proxied.
 * Proxy tools are deferred MCP tools, so their schemas cost nothing until
 * Claude loads one; the note only says where they live. The task and
 * question sections ride along only when that proxy is live, so a gated or
 * permission-denied tool is never advertised.
 */
export function buildToolEnvironmentNote(proxyTools: string[]): string | undefined {
  if (proxyTools.length === 0) return undefined
  return [
    "## OpenCode tools",
    "",
    "You are running inside OpenCode, which shows this conversation to the user. OpenCode-only tools are MCP tools named `mcp__opencode_proxy__<name>`. Load one with ToolSearch (`select:mcp__opencode_proxy__<name>`) if it is deferred, and always call it by its full name.",
    ...(proxyTools.includes("task") ? ["", SUBAGENT_DISPATCH_HINT] : []),
    ...(proxyTools.includes("question") ? ["", QUESTION_PROXY_HINT] : []),
  ].join("\n")
}

export function buildAppendedSystemPrompt(options: {
  /** The active oc agent's own prompt. */
  agentPrompt?: string
  multiStepHint?: boolean
  /** `buildToolEnvironmentNote` output for this spawn. */
  toolEnvironment?: string
}): string | undefined {
  const content = [
    options.agentPrompt?.trim(),
    options.toolEnvironment,
    options.multiStepHint ? MULTI_STEP_TASK_HINT : undefined,
  ]
    .filter(Boolean)
    .join("\n\n")
  if (!content) return undefined

  // Inside the plugin's own 0700 scratch directory and 0600, not loose in the
  // OS tmpdir world-readable: the agent prompt can carry private instructions.
  const path = join(pluginTmpDir(), `opencode-cc-sys-${randomUUID()}.md`)
  try {
    writeFileSync(path, content, { encoding: "utf8", mode: 0o600 })
    return path
  } catch (err) {
    log.warn("failed to write system prompt file", { error: String(err) })
    return undefined
  }
}
