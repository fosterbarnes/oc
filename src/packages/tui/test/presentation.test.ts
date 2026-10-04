import { describe, expect, test } from "bun:test"
import { sessionEpilogue } from "../src/util/presentation"

describe("session epilogue", () => {
  test("marks completed sessions without changing raw titles", () => {
    expect(sessionEpilogue({ title: "Deploy", sessionComplete: true })).toContain("\u2713 Deploy")
    expect(sessionEpilogue({ title: "Deploy", sessionComplete: false })).not.toContain("\u2713")
  })

  test("marks failed sessions and gives failure precedence", () => {
    expect(sessionEpilogue({ title: "Deploy", sessionFailed: true })).toContain("\u2717 Deploy")
    expect(sessionEpilogue({ title: "Deploy", sessionComplete: true, sessionFailed: true })).toContain("\u2717 Deploy")
  })
})
