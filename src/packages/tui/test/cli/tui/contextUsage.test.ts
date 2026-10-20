import { expect, test } from "bun:test"
import type { AssistantMessage, Message, Provider } from "@opencode-ai/sdk/v2"
import { contextUsage } from "../../../src/util/contextUsage"
import { formatSubagentUsage, subagentLabel } from "../../../src/util/session"

const assistant = (output: number, modelID = "sonnet", variant?: string): AssistantMessage => ({
  id: `msg_${output}`,
  sessionID: "ses_child",
  role: "assistant",
  time: { created: 1 },
  parentID: "msg_user",
  modelID,
  providerID: "anthropic",
  mode: "general",
  agent: "general",
  path: { cwd: "C:/repo", root: "C:/repo" },
  cost: 0,
  tokens: { input: 1_000, output, reasoning: 0, cache: { read: 8_000, write: 1_000 } },
  variant,
})

// Only the fields contextUsage reads; the full Provider shape is large.
const providers = [
  { id: "anthropic", models: { sonnet: { limit: { context: 200_000, output: 64_000 } } } },
] as unknown as Provider[]

test("uses the last assistant reply with output and its model's context limit", () => {
  const messages: Message[] = [assistant(10_000, "sonnet", "low"), assistant(0)]
  expect(contextUsage(messages, providers)).toEqual({ tokens: 20_000, percent: 10, modelID: "sonnet", variant: "low" })
})

test("leaves percent undefined for a model without a known limit", () => {
  expect(contextUsage([assistant(10_000, "unknown")], providers)).toEqual({
    tokens: 20_000,
    percent: undefined,
    modelID: "unknown",
    variant: undefined,
  })
})

test("returns nothing before any assistant output", () => {
  expect(contextUsage([assistant(0)], providers)).toBeUndefined()
})

test("labels a child session from the task tool title", () => {
  expect(subagentLabel("Find callers (@explore subagent)")).toBe("Explore")
  expect(subagentLabel("Child session - 2026-10-18T00:00:00.000Z")).toBe("Subagent")
})

test("formats a lone subagent's usage line", () => {
  const base = { label: "General", modelID: "gpt-5.6-sol", tokens: 10_300 }
  expect(formatSubagentUsage({ ...base, variant: "low", percent: 10 })).toBe("↳General-gpt-5.6-sol-Low 10.3K (10%)")
  expect(formatSubagentUsage({ ...base, percent: 10 })).toBe("↳General-gpt-5.6-sol 10.3K (10%)")
  expect(formatSubagentUsage(base)).toBe("↳General-gpt-5.6-sol 10.3K")
  expect(formatSubagentUsage({ ...base, modelID: "claude-opus-5-5", variant: "high" })).toBe(
    "↳General-claude-opus-5.5-High 10.3K",
  )
})
