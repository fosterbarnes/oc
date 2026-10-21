import { describe, expect, test } from "bun:test"
import { isDefaultTitle, sessionCost, sessionDescendants } from "../../src/util/session"

describe("util.session", () => {
  test("recognizes generated parent and child titles", () => {
    expect(isDefaultTitle("New session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("Child session - 2026-06-06T12:34:56.789Z")).toBeTrue()
    expect(isDefaultTitle("New session - custom")).toBeFalse()
  })

  test("limits descendants to the selected subagent branch", () => {
    const sessions = [
      { id: "root" },
      { id: "child-a", parentID: "root" },
      { id: "grandchild-a", parentID: "child-a" },
      { id: "child-b", parentID: "root" },
      { id: "grandchild-b", parentID: "child-b" },
    ]

    expect(sessionDescendants(sessions, "root").map((session) => session.id)).toEqual([
      "child-a",
      "grandchild-a",
      "child-b",
      "grandchild-b",
    ])
    expect(sessionDescendants(sessions, "child-a").map((session) => session.id)).toEqual(["grandchild-a"])
  })

  test("does not revisit sessions while collecting a descendant cycle", () => {
    const sessions = [
      { id: "root", parentID: "child" },
      { id: "child", parentID: "root" },
    ]

    expect(sessionDescendants(sessions, "root").map((session) => session.id)).toEqual(["child"])
  })

  test("totals family cost for roots and keeps subagent cost scoped", () => {
    const sessions = [
      { id: "root", cost: 1 },
      { id: "child", parentID: "root", cost: 2 },
      { id: "grandchild", parentID: "child", cost: 3 },
      { id: "other", cost: 10 },
    ]
    const get = (id: string) => sessions.find((session) => session.id === id)
    const children = (id: string) => sessions.filter((session) => session.parentID === id)

    expect(sessionCost(get("root"), children)).toBe(6)
    expect(sessionCost(get("child"), children)).toBe(2)
    expect(sessionCost(get("grandchild"), children)).toBe(3)
    expect(sessionCost(undefined, children)).toBe(0)
  })
})
