import { describe, expect, test } from "bun:test"
import {
  awaitingInput,
  createDialogSessionListQuery,
  loadDialogSessionList,
  orderAwaitingInputFirst,
} from "../../src/component/dialog-session-list"

describe("dialog session list", () => {
  test("requests root sessions for the default browse list", () => {
    expect(createDialogSessionListQuery({})).toEqual({
      roots: true,
      limit: 100,
    })
  })

  test("requests root sessions for search results", () => {
    expect(createDialogSessionListQuery({ search: " deploy " })).toEqual({
      roots: true,
      limit: 30,
      search: "deploy",
    })
  })

  test("passes each status through browse and search while All omits it", () => {
    for (const status of ["unmarked", "in_progress", "complete", "failed"] as const) {
      expect(createDialogSessionListQuery({ status })).toEqual({ roots: true, limit: 100, status })
      expect(createDialogSessionListQuery({ search: " deploy ", status })).toEqual({
        roots: true,
        limit: 30,
        search: "deploy",
        status,
      })
    }
    expect(createDialogSessionListQuery({ search: " ", status: undefined })).toEqual({ roots: true, limit: 100 })
  })

  test("keeps the local pinned filter out of server queries", () => {
    expect(createDialogSessionListQuery({ status: "pinned" })).toEqual({ roots: true, limit: 100 })
    expect(createDialogSessionListQuery({ search: " deploy ", status: "pinned" })).toEqual({
      roots: true,
      limit: 30,
      search: "deploy",
    })
  })

  test("a successful empty filtered result is not a fallback failure", async () => {
    expect(
      await loadDialogSessionList({
        status: "failed",
        list: async (query) => {
          expect(query).toEqual({ roots: true, limit: 100, status: "failed" })
          return { data: [] }
        },
      }),
    ).toEqual([])
  })

  test("keeps the cache usable while the root request is pending", async () => {
    let resolve!: (result: { data: string[] }) => void
    const pending = loadDialogSessionList<string>({
      list: () => new Promise((done) => (resolve = done)),
    })

    expect(await Promise.race([pending, Promise.resolve("pending")])).toBe("pending")
    resolve({ data: ["root"] })
    expect(await pending).toEqual(["root"])
  })

  test("falls back when the root request returns an error response", async () => {
    expect(await loadDialogSessionList({ list: async () => ({}) })).toBeUndefined()
  })

  test("falls back when the root request rejects", async () => {
    expect(
      await loadDialogSessionList({
        list: () => Promise.reject(new Error("offline")),
      }),
    ).toBeUndefined()
  })

  test("a session is awaiting input when it has a permission or question request", () => {
    expect(awaitingInput("a", { permission: { a: [{}] }, question: {} })).toBe(true)
    expect(awaitingInput("a", { permission: {}, question: { a: [{}] } })).toBe(true)
    expect(awaitingInput("a", { permission: { a: [] }, question: { a: [] } })).toBe(false)
    expect(awaitingInput("a", { permission: {}, question: {} })).toBe(false)
  })

  test("moves awaiting-input sessions to the front and keeps the order of each group", () => {
    const pending = { permission: { c: [{}] }, question: { f: [{}] } }
    expect(orderAwaitingInputFirst(["a", "b", "c", "d", "e", "f"], pending)).toEqual(["c", "f", "a", "b", "d", "e"])
  })

  test("leaves the order unchanged when nothing is awaiting input", () => {
    expect(orderAwaitingInputFirst(["a", "b"], { permission: {}, question: {} })).toEqual(["a", "b"])
  })
})
