import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Wildcard } from "@opencode-ai/core/util/wildcard"
import type { Agent } from "./agent"

// Cursor's read-only subagents (SubagentArgs.readonly). The Cursor provider marks the tool call by id,
// so no tool argument can set or clear it. The task tool puts the marker rule in the child's session
// snapshot; every turn of that session (session/prompt.ts) then appends `readonlySubagentRules` last.
const READONLY_MARKER = "oc_readonly_subagent"
export const READONLY_MARKER_RULE: PermissionV1.Rule = { permission: READONLY_MARKER, pattern: "*", action: "deny" }
const READONLY_TOOLS = ["read", "grep", "glob", "list", "websearch", "webfetch", "external_directory"]
const _readonlyCalls = new Set<string>()

export function markReadonlySubagentCall(callID: string) {
  _readonlyCalls.add(callID)
}

/** True once for a call the Cursor provider marked read-only. */
export function takeReadonlySubagentCall(callID: string | undefined) {
  return callID !== undefined && _readonlyCalls.delete(callID)
}

export function isReadonlySubagent(permission: PermissionV1.Ruleset | undefined) {
  return permission?.some((rule) => rule.permission === READONLY_MARKER) ?? false
}

/**
 * Rules to append last for a read-only child: deny every tool, including unknown and MCP ones, then
 * replay `prior` (every rule the child's turn already has, in order) for the read tools only, so they
 * keep exactly their earlier decision and are never upgraded.
 */
export function readonlySubagentRules(prior: PermissionV1.Ruleset): PermissionV1.Rule[] {
  return [
    { permission: "*", pattern: "*", action: "deny" },
    // `Permission.disabled` hides these only for a rule naming them, so `*` alone leaves them listed.
    { permission: "session_complete", pattern: "*", action: "deny" },
    { permission: "session_failed", pattern: "*", action: "deny" },
    ...READONLY_TOOLS.flatMap((tool): PermissionV1.Rule[] => [
      { permission: tool, pattern: "*", action: "ask" },
      ...prior.filter((rule) => Wildcard.match(tool, rule.permission)).map((rule) => ({ ...rule, permission: tool })),
    ]),
    // MCP resource tools ask under `read` (session/tools.ts); MCP stays blocked.
    { permission: "read", pattern: "mcp:*", action: "deny" },
  ]
}

/**
 * Build the `permission` ruleset for a subagent's session when it's spawned
 * via the task tool. Combines:
 *
 * 1. The parent session's deny rules and external_directory rules.
 *    Parent agent restrictions only govern that agent; the subagent's own
 *    permissions determine its capabilities.
 * 2. Default `todowrite` and `task` denies if the subagent's own ruleset
 *    doesn't already permit them.
 */
export function deriveSubagentSessionPermission(input: {
  parentSessionPermission: PermissionV1.Ruleset
  subagent: Agent.Info
}): PermissionV1.Ruleset {
  const canTask = input.subagent.permission.some((rule) => rule.permission === "task")
  const canTodo = input.subagent.permission.some((rule) => rule.permission === "todowrite")
  return [
    ...input.parentSessionPermission.filter(
      (rule) => rule.permission === "external_directory" || rule.action === "deny",
    ),
    ...(canTodo ? [] : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(canTask ? [] : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
  ]
}

/**
 * Turn a session's switched-off subagents (`metadata.disabledSubagents`, written by the TUI; "*" = all) into
 * `task` denies. Kept in metadata rather than the session's permission because that ruleset is append-only,
 * so switching an agent back on could not drop its deny.
 */
export function disabledSubagentRules(metadata: Record<string, unknown> | undefined): PermissionV1.Ruleset {
  const names = metadata?.disabledSubagents
  if (!Array.isArray(names)) return []
  return names
    .filter((name): name is string => typeof name === "string")
    .map((name) => ({ permission: "task", pattern: name, action: "deny" as const }))
}
