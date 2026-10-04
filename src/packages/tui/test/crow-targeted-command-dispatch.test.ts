import { describe, expect, test } from "bun:test"
import {
  acceptsCrowTargetedCommand,
  crowRemoteSessionScopedCommands,
  handleCrowTargetedCommandExecute,
  mostRecentRootSessionID,
  readCrowSessionHandleFromEnv,
} from "../src/app"

const selfHandle = "11111111-1111-4111-8111-111111111111"
const siblingHandle = "22222222-2222-4222-8222-222222222222"
const expectedSession = "ses_expected01"
const otherSession = "ses_other00001"

const sessions = [
  { id: "ses_old0000001", parentID: undefined, time: { updated: 1 } },
  { id: "ses_recent0001", parentID: undefined, time: { updated: 99 } },
  { id: "ses_child00001", parentID: "ses_recent0001", time: { updated: 100 } },
]

describe("Crow targeted command dispatch", () => {
  test("validates CROW_SESSION_HANDLE as a hyphenated Guid", () => {
    expect(readCrowSessionHandleFromEnv(selfHandle)).toBe(selfHandle)
    expect(readCrowSessionHandleFromEnv("not-a-crow-handle")).toBeUndefined()
    expect(readCrowSessionHandleFromEnv(undefined)).toBeUndefined()
  })

  test("mostRecentRootSessionID uses root session recency ordering", () => {
    expect(mostRecentRootSessionID(sessions)).toBe("ses_recent0001")
  })

  test("wrong handle is a no-op", () => {
    const dispatched: string[] = []
    handleCrowTargetedCommandExecute({
      selfHandle,
      properties: {
        command: "session.list",
        crowSessionHandle: siblingHandle,
        expectedOpenCodeSessionID: expectedSession,
      },
      route: { type: "session", sessionID: expectedSession },
      sessions,
      dispatchCommand: (command) => dispatched.push(command),
      navigateToSession: () => dispatched.push("navigate"),
    })
    expect(dispatched).toEqual([])
  })

  test("stale expected session blocks session-scoped commands", () => {
    expect(
      acceptsCrowTargetedCommand({
        selfHandle,
        eventHandle: selfHandle,
        command: "session.compact",
        expectedOpenCodeSessionID: expectedSession,
        route: { type: "session", sessionID: otherSession },
      }),
    ).toBe(false)

    const dispatched: string[] = []
    handleCrowTargetedCommandExecute({
      selfHandle,
      properties: {
        command: "session.compact",
        crowSessionHandle: selfHandle,
        expectedOpenCodeSessionID: expectedSession,
      },
      route: { type: "session", sessionID: otherSession },
      sessions,
      dispatchCommand: (command) => dispatched.push(command),
      navigateToSession: () => dispatched.push("navigate"),
    })
    expect(dispatched).toEqual([])
  })

  test("home-safe commands dispatch without matching the route session", () => {
    const dispatched: string[] = []
    handleCrowTargetedCommandExecute({
      selfHandle,
      properties: {
        command: "session.list",
        crowSessionHandle: selfHandle,
        expectedOpenCodeSessionID: expectedSession,
      },
      route: { type: "home" },
      sessions,
      dispatchCommand: (command) => dispatched.push(command),
      navigateToSession: () => dispatched.push("navigate"),
    })
    expect(dispatched).toEqual(["session.list"])
  })

  test("session-scoped commands dispatch when the route session matches", () => {
    const dispatched: string[] = []
    handleCrowTargetedCommandExecute({
      selfHandle,
      properties: {
        command: "agent.cycle",
        crowSessionHandle: selfHandle,
        expectedOpenCodeSessionID: expectedSession,
      },
      route: { type: "session", sessionID: expectedSession },
      sessions,
      dispatchCommand: (command) => dispatched.push(command),
      navigateToSession: () => dispatched.push("navigate"),
    })
    expect(dispatched).toEqual(["agent.cycle"])
    expect(crowRemoteSessionScopedCommands.has("agent.cycle")).toBe(true)
  })

  test("session.most_recent navigates directly to the newest root session", () => {
    const dispatched: string[] = []
    handleCrowTargetedCommandExecute({
      selfHandle,
      properties: {
        command: "session.most_recent",
        crowSessionHandle: selfHandle,
        expectedOpenCodeSessionID: expectedSession,
      },
      route: { type: "home" },
      sessions,
      dispatchCommand: (command) => dispatched.push(command),
      navigateToSession: (sessionID) => dispatched.push(`navigate:${sessionID}`),
    })
    expect(dispatched).toEqual(["navigate:ses_recent0001"])
  })

  test("sibling target isolation keeps scoped commands on the matching handle only", () => {
    expect(
      acceptsCrowTargetedCommand({
        selfHandle,
        eventHandle: siblingHandle,
        command: "variant.cycle",
        expectedOpenCodeSessionID: expectedSession,
        route: { type: "session", sessionID: expectedSession },
      }),
    ).toBe(false)
  })

  test("targeted dispatch no-ops when CROW_SESSION_HANDLE is missing or invalid", () => {
    const dispatched: string[] = []
    handleCrowTargetedCommandExecute({
      selfHandle: undefined,
      properties: {
        command: "session.list",
        crowSessionHandle: selfHandle,
        expectedOpenCodeSessionID: expectedSession,
      },
      route: { type: "home" },
      sessions,
      dispatchCommand: (command) => dispatched.push(command),
      navigateToSession: () => dispatched.push("navigate"),
    })
    expect(dispatched).toEqual([])
  })
})
