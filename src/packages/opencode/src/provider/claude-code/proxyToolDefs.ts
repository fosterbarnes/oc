/**
 * The static proxy tool definitions Claude sees, the notes that steer the
 * model toward them, and the `task_batch` fan-out helpers.
 */
import type { ProxyToolResult } from "./proxyMcp.js"

export interface ProxyToolDef {
  /** Raw name as seen by Claude once proxied: the MCP exposed tool name. */
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * Disambiguation appended to the `task` proxy def (both the static
 * fallback and the live overlay). Models routinely resolve opencode's
 * "call the task tool with subagent: X" mention hint to Claude Code's
 * native TaskCreate (a todo tool) - creating a todo, dispatching nothing,
 * and then narrating a successful dispatch. Others burn turns grepping
 * config files to verify a subagent exists before daring to call it.
 * Both failure modes are addressed here, at the tool the model reads.
 */
export const TASK_PROXY_NOTE =
  "This and task_batch are the ONLY tools that dispatch opencode subagents" +
  " (including user @-mentions). Claude Code's built-in TaskCreate/TaskUpdate" +
  " manage a local todo list and cannot dispatch subagents. Do not search" +
  " config files to verify a subagent type exists: invalid types fail fast" +
  " with a clear error. Foreground calls block until the subagent finishes;" +
  " set `background` to request opencode's background execution mode. For" +
  " two or more independent subagents in one response use task_batch, not" +
  " several task calls: those run one after another. Task calls have no" +
  " proxy deadline by default: the call waits for the subagent to finish" +
  " (a positive proxyToolTimeoutMs override adds a deadline)."

/**
 * `task_batch`: one MCP call that opencode runs as N parallel `task` calls.
 *
 * Design and first implementation by Joseph Roberts (@broskees) on his fork
 * (68ed142), absorbed here with credit. The limitation it works around is
 * measured, not assumed: Claude Code emits several `mcp__opencode_proxy__*`
 * tool_use blocks in one assistant message but sends the MCP requests one at
 * a time, each only after the previous result (2026-09-06, haiku, two
 * 8-second bash calls: second request arrived 7 ms after the first resolved).
 * So "call task twice" is serial by construction, and the only way to get two
 * subagents running at once is a single proxy call that the plugin fans out
 * inside one opencode tool boundary, where opencode executes tool calls
 * concurrently. The children are ordinary `task` calls with ids derived from
 * the parent (`taskBatchChildToolCallId`), and their results are gathered
 * back onto the parent id (`formatTaskBatchResults`) before the CLI sees it.
 */
export const TASK_BATCH_TOOL_NAME = "task_batch"

export const TASK_BATCH_PROXY_NOTE =
  "Use this instead of several task calls in one response: Claude Code runs" +
  " MCP tool calls one at a time, so separate task calls run serially even" +
  " when emitted together, while one task_batch call fans them out as" +
  " parallel opencode task calls. Each task takes the same fields as the" +
  " task tool. Results come back in task order, each labelled. Like task it" +
  " has no proxy deadline by default (a positive proxyToolTimeoutMs override" +
  " adds one)."

export const TASK_INPUT_REQUIRED = ["description", "prompt", "subagent_type"]

/** Why a `task_batch` input is unusable, or null when it is fine. */
export function taskBatchInputError(input: Record<string, unknown> | undefined): string | null {
  const tasks = input?.tasks
  if (!Array.isArray(tasks) || tasks.length < 2) {
    return "task_batch requires a `tasks` array with at least two items; use `task` for one subagent"
  }
  for (const [index, task] of tasks.entries()) {
    if (task === null || typeof task !== "object" || Array.isArray(task)) {
      return `task_batch tasks[${index}] must be an object`
    }
    const item = task as Record<string, unknown>
    for (const field of TASK_INPUT_REQUIRED) {
      if (typeof item[field] !== "string") {
        return `task_batch tasks[${index}].${field} must be a string`
      }
    }
  }
  return null
}

/** The batch's task inputs, or [] when the input never passed validation. */
export function taskBatchTasks(input: Record<string, unknown> | undefined): Record<string, unknown>[] {
  if (taskBatchInputError(input)) return []
  return input!.tasks as Record<string, unknown>[]
}

/**
 * Child ids stay derivable from the parent so the next turn can find every
 * child's `tool-result` without extra state. Only `[A-Za-z0-9_-]`: AI SDK
 * bridges normalise other characters and the round trip would not match.
 */
export function taskBatchChildToolCallId(parentToolCallId: string, index: number): string {
  return `${parentToolCallId}_task_${index}`
}

/**
 * One readable result for the parent call. Children are labelled in task
 * order; a child opencode did not answer is said so rather than dropped,
 * since a silent gap would read as a subagent that never ran.
 */
export function formatTaskBatchResults(
  children: Array<{ task: Record<string, unknown>; result: ProxyToolResult | null }>,
): ProxyToolResult {
  const total = children.length
  const sections = children.map(({ task, result }, index) => {
    const label = typeof task.description === "string" ? task.description : `task ${index + 1}`
    const agent = typeof task.subagent_type === "string" ? ` (${task.subagent_type})` : ""
    const header = `## task ${index + 1} of ${total}: ${label}${agent}`
    if (!result) return `${header}\n[missing] opencode returned no result for this task in the batch`
    if (result.kind === "error") return `${header}\n[error] ${result.message}`
    return `${header}\n${result.isError ? "[error] " : ""}${result.text}`
  })
  const failed = children.some(({ result }) => !result || result.kind === "error" || result.isError)
  return { kind: "text", text: sections.join("\n\n"), ...(failed ? { isError: true } : {}) }
}

const AGENT_TYPES_HEADING = "Available agent types"

/** Longest per-agent blurb we keep; enough to choose, short enough to survive. */
const AGENT_BLURB_LIMIT = 140

/**
 * Disambiguation appended to the `question` proxy def. Claude Code ships
 * a built-in `AskUserQuestion` that, when proxied, is disabled via
 * `--disallowedTools`; without an explicit hand-off note models keep
 * reaching for the disabled built-in or fall back to plain text. This
 * states that the proxy is the structured-questions path and summarises
 * the answer shape so the model can act on the result without a second
 * round-trip.
 */
export const QUESTION_PROXY_NOTE =
  "This routes structured questions through opencode's native `question`" +
  " tool, which renders a TUI form with the options you provide and" +
  " blocks until the operator answers. Claude Code's built-in" +
  " AskUserQuestion is disabled in this environment; this proxy is the" +
  " ONLY way to ask the operator for a decision or clarification." +
  " Answers come back as arrays of selected labels (set `multiple: true`" +
  " to allow more than one). If the operator dismisses the form the call" +
  " returns an error - treat that as 'no answer' and stop, do not guess." +
  " Question calls get a 30-minute proxy deadline by default (configurable" +
  " via proxyToolTimeoutMs); for long-AFK scenarios prefer fewer," +
  " high-signal questions."

/**
 * Pull *only* the agent-type list out of opencode's live `task` description.
 *
 * jknlsn's original overlaid the whole live description (2.8 KB here) in front
 * of the static def. Live check 2026-07-26 showed that backfires: Claude Code
 * truncates long MCP tool descriptions, and opencode puts the agent list at
 * the *end* (char 2306 of 2858), so the one part the model needs is exactly
 * what gets cut - haiku then guessed `general-purpose`, `default`, and
 * `code-reviewer` (Claude Code's own agent names) and every dispatch failed
 * with "Unknown agent type". So: keep the list, drop opencode's preamble
 * (generic delegation advice the model already has), trim each blurb, and let
 * the caller put it first.
 *
 * Returns undefined when the description carries no parsable list, so callers
 * leave the static def alone.
 */
export function extractAgentTypeList(liveDescription: string | undefined): string | undefined {
  const live = liveDescription?.trim()
  if (!live) return undefined
  const start = live.indexOf(AGENT_TYPES_HEADING)
  if (start === -1) return undefined
  const entries: string[] = []
  for (const raw of live.slice(start).split("\n")) {
    const match = /^-\s*([^:]+):\s*(.+)$/.exec(raw.trim())
    if (!match) continue
    const name = match[1].trim()
    const blurb = match[2].trim()
    entries.push(
      `- ${name}: ${blurb.length > AGENT_BLURB_LIMIT ? `${blurb.slice(0, AGENT_BLURB_LIMIT).trimEnd()}...` : blurb}`,
    )
  }
  if (entries.length === 0) return undefined
  return `Valid subagent_type values, from opencode's live registry - anything else fails:\n${entries.join("\n")}`
}

/**
 * Front-load opencode's live agent-type list onto the static `task` proxy def
 * so the model picks a real `subagent_type` instead of guessing a Claude Code
 * name. First, not last: see `extractAgentTypeList` for why position matters.
 * No-op when no list can be extracted (SDK client missing, older opencode) or
 * the `task` def is not among the tools.
 */
export function overlayTaskProxyDescription(
  tools: ProxyToolDef[],
  liveDescription: string | undefined,
): ProxyToolDef[] {
  const agentTypes = extractAgentTypeList(liveDescription)
  if (!agentTypes) return tools
  return tools.map((t) =>
    t.name === "task" || t.name === TASK_BATCH_TOOL_NAME
      ? { ...t, description: `${agentTypes}\n\n${t.description}` }
      : t,
  )
}

/**
 * Overlay opencode's live `question` tool description onto the static
 * proxy def, then append the disambiguation note. No-op when the live
 * description is unavailable (older opencode, SDK client missing) - the
 * static def + note stands. Mirrors `overlayTaskProxyDescription`.
 */
export function overlayQuestionProxyDescription(
  tools: ProxyToolDef[],
  liveDescription: string | undefined,
): ProxyToolDef[] {
  const live = liveDescription?.trim()
  if (!live) return tools
  return tools.map((t) => (t.name === "question" ? { ...t, description: `${live}\n\n${QUESTION_PROXY_NOTE}` } : t))
}

/**
 * Version gate for the `question` proxy. opencode added a built-in
 * `question` tool (registry id `question`) - on older builds that entry
 * is absent and a forwarded `mcp__opencode_proxy__question` call would
 * resolve to `:gear: invalid` in opencode. Drop the def silently when the
 * live registry does not contain it so the model never sees a dead tool.
 */
export function filterQuestionProxyByOpencodeSupport(
  tools: ProxyToolDef[],
  opencodeHasQuestion: boolean,
): ProxyToolDef[] {
  if (opencodeHasQuestion) return tools
  return tools.filter((t) => t.name !== "question")
}

/** Input fields of one `task`, shared with each `task_batch` item. */
export const TASK_INPUT_PROPERTIES = {
  description: {
    type: "string",
    description: "A short (3-5 words) description of the task",
  },
  prompt: {
    type: "string",
    description: "The task for the agent to perform",
  },
  subagent_type: {
    type: "string",
    description: "The type of specialized agent to use for this task",
  },
  task_id: {
    type: "string",
    description:
      "Set this only if you mean to resume a previous task: pass the" +
      " prior task_id to continue the same subagent session instead of" +
      " creating a fresh one.",
  },
  command: {
    type: "string",
    description: "The command that triggered this task",
  },
  model: {
    type: "string",
    description:
      "Model for this task only, as provider/model or provider/model#variant. Set only when the user asks for a" +
      " specific model; omit it to use the agent's own model.",
  },
  background: {
    type: "boolean",
    description: "Run the task in the background when supported by opencode",
  },
}

// oc-only tools. Claude Code's native file, shell and web tools are not proxied.
export const DEFAULT_PROXY_TOOLS: ProxyToolDef[] = [
  {
    name: "task",
    description:
      "Launch an opencode subagent to handle a complex multi-step task" +
      " autonomously. Routed through opencode's task tool so subagent" +
      " orchestration, permission, and lifecycle are handled by opencode." +
      " Use `subagent_type` to pick which configured subagent runs (e.g." +
      " `build`, `general`, `explore`, or any custom subagent declared in" +
      " opencode.json). " +
      TASK_PROXY_NOTE,
    inputSchema: {
      type: "object",
      properties: TASK_INPUT_PROPERTIES,
      required: TASK_INPUT_REQUIRED,
    },
  },
  {
    name: TASK_BATCH_TOOL_NAME,
    description:
      "Launch two or more independent opencode subagents at the same time and" +
      " get all their results back together. Put one ordinary task input in" +
      " `tasks` for each subagent. " +
      TASK_BATCH_PROXY_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          minItems: 2,
          description: "Independent subagent tasks to run concurrently",
          items: {
            type: "object",
            properties: TASK_INPUT_PROPERTIES,
            required: TASK_INPUT_REQUIRED,
          },
        },
      },
      required: ["tasks"],
    },
  },
  {
    name: "question",
    description:
      "Ask the operator structured questions with options and receive" +
      " their answers back. Routed through opencode's native `question`" +
      " tool so the prompt renders as a real TUI form (with options and a" +
      " custom-answer field) instead of a plain text turn. Use this when" +
      " you need a decision, clarification, or preference from the" +
      " operator mid-task. " +
      QUESTION_PROXY_NOTE,
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "Questions to ask.",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "Complete question.",
              },
              header: {
                type: "string",
                description: "Very short label (max 30 chars).",
              },
              options: {
                type: "array",
                description: "Available choices.",
                items: {
                  type: "object",
                  properties: {
                    label: {
                      type: "string",
                      description: "Display text (1-5 words, concise).",
                    },
                    description: {
                      type: "string",
                      description: "Explanation of choice.",
                    },
                  },
                  required: ["label", "description"],
                },
              },
              multiple: {
                type: "boolean",
                description: "Allow selecting multiple choices. Defaults to false.",
              },
            },
            required: ["question", "header", "options"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "session_tail",
    description:
      "Read recent messages from the current OpenCode session. Use only when this Claude session is missing turns that are on screen.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many recent messages to return. Default 20, max 50." },
        before: { type: "string", description: "Return messages before this OpenCode message id." },
      },
    },
  },
  {
    name: "run_after_turn",
    description:
      "Queue an executable or .ps1 script after this turn through oc's run_after_turn permission." +
      " Use only when explicitly requested by the user. Call it last, then end your turn with a short reply.",
    inputSchema: {
      type: "object",
      properties: {
        exe: { type: "string", description: "Absolute path to the executable or .ps1 script" },
        args: {
          type: "array",
          items: { type: "string" },
          description: "Arguments for the executable",
        },
      },
      required: ["exe"],
    },
  },
  {
    name: "time",
    description: "Returns the user's current local date, time, and UTC offset.",
    inputSchema: { type: "object", properties: {} },
  },
]
