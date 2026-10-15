const CROW_SESSION_HANDLE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function readCrowSessionHandleFromEnv(raw = process.env.CROW_SESSION_HANDLE) {
  const value = raw?.trim()
  if (!value || !CROW_SESSION_HANDLE_PATTERN.test(value)) return undefined
  return value.toLowerCase()
}

export const validatedCrowSessionHandle = readCrowSessionHandleFromEnv()

/** Commands that require the TUI route session to match expectedOpenCodeSessionID. */
export const crowRemoteSessionScopedCommands = new Set([
  "session.rename",
  "session.compact",
  "session.complete.toggle",
  "session.failed.toggle",
  "agent.cycle",
  "variant.cycle",
  "session.sidebar.toggle",
])

export function mostRecentRootSessionID(
  sessions: ReadonlyArray<{ id: string; parentID?: string; time: { updated: number } }>,
) {
  return sessions
    .filter((session) => session.parentID === undefined)
    .toSorted((left, right) => right.time.updated - left.time.updated)[0]?.id
}

type CrowRouteData =
  | { type: "home" }
  | { type: "session"; sessionID: string }
  | { type: "plugin"; id: string; data?: unknown }

export function acceptsCrowTargetedCommand(input: {
  selfHandle: string | undefined
  eventHandle: string
  command: string
  expectedOpenCodeSessionID: string
  route: CrowRouteData
}) {
  if (!input.selfHandle) return false
  if (input.eventHandle.toLowerCase() !== input.selfHandle) return false
  if (input.command === "session.most_recent") return true
  if (!crowRemoteSessionScopedCommands.has(input.command)) return true
  if (input.route.type !== "session") return false
  return input.route.sessionID === input.expectedOpenCodeSessionID
}

export function handleCrowTargetedCommandExecute(input: {
  selfHandle: string | undefined
  properties: {
    command: string
    crowSessionHandle: string
    expectedOpenCodeSessionID: string
  }
  route: CrowRouteData
  sessions: ReadonlyArray<{ id: string; parentID?: string; time: { updated: number } }>
  dispatchCommand: (command: string) => void
  navigateToSession: (sessionID: string) => void
}) {
  if (
    !acceptsCrowTargetedCommand({
      selfHandle: input.selfHandle,
      eventHandle: input.properties.crowSessionHandle,
      command: input.properties.command,
      expectedOpenCodeSessionID: input.properties.expectedOpenCodeSessionID,
      route: input.route,
    })
  ) {
    return
  }
  if (input.properties.command === "session.most_recent") {
    const sessionID = mostRecentRootSessionID(input.sessions)
    if (!sessionID) return
    input.navigateToSession(sessionID)
    return
  }
  input.dispatchCommand(input.properties.command)
}
