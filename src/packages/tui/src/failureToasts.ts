// Which plugin and MCP failures get an error toast (upstream 70853b1e5b, 2dcfc89fab). The sidebar
// plugin row and /mcps still show live state; this only announces each failure once.
import type { McpStatus, PluginStatus } from "@opencode-ai/sdk/v2"
import type { ErrorDetails } from "./component/dialog-error-details"

export type ComponentFailure = ErrorDetails & { key: string }

export function mcpFailures(status: Record<string, McpStatus>): ComponentFailure[] {
  return Object.entries(status).flatMap(([name, item]) =>
    item.status === "failed"
      ? [
          {
            key: `${name}\n${item.error}`,
            title: `MCP server failed: ${name}`,
            error: item.error,
            context: `Configuration: mcp.${name} (opencode.jsonc)`,
          },
        ]
      : [],
  )
}

export function serverPluginFailures(list: PluginStatus[]): ComponentFailure[] {
  return list.flatMap((item) =>
    item.status === "failed"
      ? [
          {
            key: `${item.target}\n${item.error ?? ""}`,
            title: `Plugin failed: ${item.name}`,
            error: item.error ?? "Unknown plugin error",
            context: `Runtime: server\nSource: ${item.spec}`,
          },
        ]
      : [],
  )
}

/** Shows each failure once per scope; one that clears and comes back is shown again. */
export function createFailureAnnouncer(show: (failure: ComponentFailure) => void) {
  const seen = new Map<string, Set<string>>()
  return (scope: string, failures: ComponentFailure[]) => {
    const previous = seen.get(scope) ?? new Set<string>()
    for (const failure of failures) if (!previous.has(failure.key)) show(failure)
    seen.set(scope, new Set(failures.map((failure) => failure.key)))
  }
}
