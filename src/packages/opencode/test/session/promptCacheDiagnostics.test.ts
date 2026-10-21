import { describe, expect, test } from "bun:test"
import { jsonSchema, tool as aiTool, type ModelMessage } from "ai"
import { PromptCacheDiagnostics } from "@/session/llm/promptCacheDiagnostics"

const read = aiTool({ description: "Read a file", inputSchema: jsonSchema({ type: "object", properties: {} }) })
const request = {
  providerID: "test",
  modelID: "test",
  system: ["System"],
  messages: [{ role: "user", content: "First" }] as ModelMessage[],
  tools: { read },
  params: { temperature: 0.2 },
  options: {},
}
const compare = (current: Parameters<typeof PromptCacheDiagnostics.snapshot>[0]) =>
  PromptCacheDiagnostics.compare(PromptCacheDiagnostics.snapshot(request), PromptCacheDiagnostics.snapshot(current))

describe("PromptCacheDiagnostics", () => {
  test("distinguishes initial and stable requests", () => {
    const snapshot = PromptCacheDiagnostics.snapshot(request)
    expect(PromptCacheDiagnostics.compare(undefined, snapshot)).toEqual({ status: "initial" })
    expect(PromptCacheDiagnostics.compare(snapshot, snapshot)).toEqual({ status: "stable", messages: 1 })
  })

  test("recognizes append-only history", () => {
    const current = { ...request, messages: [...request.messages, { role: "assistant", content: "Second" }] }
    expect(compare(current as typeof request)).toEqual({
      status: "append-only",
      previousMessages: 1,
      currentMessages: 2,
    })
  })

  test("detects cache-sensitive setting changes", () => {
    expect(compare({ ...request, params: { temperature: 0.5 } })).toEqual({
      status: "changed",
      component: "settings",
      index: 0,
      label: "model settings",
    })
  })

  test("finds the first changed prefix component", () => {
    const changed = aiTool({
      description: "Read one file",
      inputSchema: jsonSchema({ type: "object", properties: {} }),
    })
    expect(compare({ ...request, tools: { read: changed } })).toEqual({
      status: "changed",
      component: "tools",
      index: 0,
      label: "read",
    })
    expect(compare({ ...request, messages: [{ role: "user", content: "Edited" }] })).toEqual({
      status: "changed",
      component: "messages",
      index: 0,
      label: "user[0]",
    })
  })

  test("treats appended tools as a prefix change", () => {
    const write = aiTool({ description: "Write a file", inputSchema: jsonSchema({ type: "object", properties: {} }) })
    expect(compare({ ...request, tools: { read, write } })).toEqual({
      status: "changed",
      component: "tools",
      index: 1,
      label: "write",
    })
  })
})
