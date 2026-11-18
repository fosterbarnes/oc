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
import { CLAUDE_NATIVE_TOOLS } from "./shared.js"

const MULTI_STEP_TASK_HINT = `## Continuing through multi-step tasks

opencode requires the user to press "continue" after each turn ends. When a
task has multiple steps, do them all in one turn - chain tool calls rather
than pausing for user confirmation between subtasks. End the turn only
when the task is done, you need clarification on intent, or you hit a real
blocker. When a question tool is available, ask clarification through it
instead: it waits for the answer without ending the turn. The user can interrupt or abort at any time; turn endings should
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
- Do not verify a subagent's existence by searching config files - the tool's description lists the available agent types, and invalid types fail fast with a clear error.
- Stop a background subagent with \`mcp__opencode_proxy__task_cancel\` and its task id. Claude Code's TaskStop does not see opencode subagents.`

/**
 * Section of the tool environment note, emitted when the `question` proxy
 * survived the version gate. Live testing (2026-07-05, haiku) showed the model's reasoning
 * correctly identified `mcp__opencode_proxy__question` as the tool to use,
 * but then emitted a tool call for bare `question` - stripping the MCP
 * prefix. opencode's AI SDK bridge has no bare `question` tool, so the
 * call rendered as `⚙ invalid`. Same near-miss pattern the task proxy
 * hit (TaskCreate vs mcp__opencode_proxy__task); the fix is the same:
 * name the exact tool in the system prompt so the model doesn't
 * abbreviate.
 */
export const QUESTION_PROXY_HINT = `### Asking the operator questions

Every question that needs an answer from the operator goes through exactly one tool: \`mcp__opencode_proxy__question\`.

- When you need a decision, preference, or clarification, call \`mcp__opencode_proxy__question\` with a \`questions\` array (each item has \`question\`, \`header\`, \`options\` of \`{label, description}\`, and optional \`multiple\`). For an open-ended question, pass \`options: []\`; the form always lets the operator type an answer.
- Load it with ToolSearch if it is deferred. A deferred tool is available; do not fall back to a plain-text question instead of loading it.
- Do NOT call bare \`question\` - that is not a tool. Always use the full \`mcp__opencode_proxy__question\` name when invoking it.
- Claude Code's built-in \`AskUserQuestion\` is disabled in this environment; the proxy is the only way to ask the operator questions.`

// Proxy tools are deferred, so Claude sees only the name `mode_switch`, not its when-to-use text.
// Live test 2026-11-16 (haiku): without this note the model told the user to change commands instead.
export const MODE_SWITCH_PROXY_HINT = `### Switching the active command

Each user message names the active slash command. Call \`mcp__opencode_proxy__mode_switch\` (load it with ToolSearch if it is deferred) when the latest request needs permissions the active command lacks, or clearly belongs to another command's job even if the active one could do it (for example mockup or plan revisions while in imp). Ask instead of telling the user to send another command or working around the active command's rules. The user approves or declines it in a form. Stay only for quick questions and small fixes within the active command's own job, and never switch only because the topic changed.`

/**
 * The oc-only environment note for one tool-enabled spawn. The no-shell-subagent
 * rule always applies: Bash may run even when no proxy survives. The skills
 * rule rides along only while Claude's `Skill` is on (`skills`). Proxy tools
 * are deferred MCP tools, so their schemas cost nothing until Claude loads one;
 * the note only says where they live. The task and question sections ride along
 * only when that proxy is live, so a gated or permission-denied tool is never
 * advertised. Command-permission turns also strip Claude's built-ins, so the
 * note names the proxy replacements (`replaced`: proxied oc tools whose Claude
 * Code built-ins are off this turn).
 */
export function buildToolEnvironmentNote(
  proxyTools: string[],
  replaced: string[] = [],
  skills = true,
  editDenied: string[] = [],
): string {
  return [
    "## OpenCode tools",
    "",
    "You are running inside OpenCode, which shows this conversation to the user.",
    "",
    ...(skills
      ? [
          "- Skills: prefer OpenCode skills (`oc:<name>`) over the user's own Claude Code skills from `~/.claude/skills`; those are for the Claude Code desktop app and may do oc-like things in a way that bypasses OpenCode. Skills built into Claude Code are fine.",
        ]
      : []),
    "- Never start an OpenCode subagent through a shell (`opencode run`, `opencode.exe`): it bypasses the TUI and the native subagent lifecycle.",
    "- Background Bash jobs and `Monitor` watches live only as long as this Claude process: an OpenCode restart, a usage-limit account failover or `/reload` ends them.",
    // Claude's own denial has no pointer to mode_switch, unlike oc's (PermissionV1.DeniedError.hint).
    ...(editDenied.length > 0
      ? [
          `- The active command denies edits to ${editDenied.join(", ")}; Edit and Write refuse them. Never write there another way (shell, Python)${proxyTools.includes("mode_switch") ? "; if the request needs it, call `mcp__opencode_proxy__mode_switch`" : ""}.`,
        ]
      : []),
    ...(proxyTools.includes("schedule_prompt")
      ? [
          "- To do something later, use `mcp__opencode_proxy__schedule_prompt`; OpenCode keeps it across restarts. Claude Code's own cron and wakeup tools are off.",
        ]
      : []),
    ...(proxyTools.length > 0
      ? [
          "",
          "OpenCode-only tools are MCP tools named `mcp__opencode_proxy__<name>`. Load one with ToolSearch (`select:mcp__opencode_proxy__<name>`) if it is deferred, and always call it by its full name.",
          ...(replaced.length > 0 ? [replacedToolsText(replaced)] : []),
        ]
      : []),
    ...(proxyTools.includes("task") ? ["", SUBAGENT_DISPATCH_HINT] : []),
    ...(proxyTools.includes("question") ? ["", QUESTION_PROXY_HINT] : []),
    ...(proxyTools.includes("mode_switch") ? ["", MODE_SWITCH_PROXY_HINT] : []),
  ].join("\n")
}

/**
 * Sent once with the first message to a new process whose command replaces Claude's built-ins.
 * After a mid-chat command switch the model reuses the built-ins it called earlier, which the CLI
 * now refuses with "Continue without it"; the system prompt note alone did not stop that.
 */
export function replacedToolsTurnNote(replaced: string[]): string {
  const natives = replaced.flatMap((id) => CLAUDE_NATIVE_TOOLS[id]?.[0] ?? [])
  return `[oc: ${replacedToolsText(replaced)} This includes Claude Code's own ${natives.join(", ")} used earlier in this conversation: they no longer run.]`
}

function replacedToolsText(replaced: string[]) {
  const names = replaced.map((name) => `mcp__opencode_proxy__${name}`)
  return `This command limits ${replaced.join(", ")}, so Claude Code's own versions are off this turn and these replace them: ${names.map((name) => `\`${name}\``).join(", ")}. Load them up front with ToolSearch \`select:${names.join(",")}\`. Do not do their job through a shell (Python, sed, heredocs): that skips the command's rules.`
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
