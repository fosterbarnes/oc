import { expect, test } from "bun:test"
import { extractHostSubagentCatalog, resolveCursorSubagentType } from "@/provider/cursor/protocol/subagents.js"

const description = [
  "Launch a new agent.",
  "Available agent types and the tools they have access to:",
  'For an agent that lists reasoning levels, pass subagent_type as "<agent>:<level>".',
  "- general: General-purpose agent.",
  "- worker: reasoning low|high. Worker blurb",
].join("\n")

const catalog = extractHostSubagentCatalog([{ name: "task", description, inputSchema: {} }] as never)

test("an agent with reasoning levels becomes one <agent>:<level> catalog item per listed level", () => {
  expect(catalog.complete).toBe(true)
  expect(catalog.agents).toEqual([
    { name: "general", description: "General-purpose agent." },
    { name: "worker:low", description: "Worker blurb" },
    { name: "worker:high", description: "Worker blurb" },
  ])
})

test("a listed <agent>:<level> resolves to itself; an unknown one is passed through, never to general", () => {
  expect(resolveCursorSubagentType("worker:high", catalog)).toBe("worker:high")
  expect(resolveCursorSubagentType("worker:typo", catalog)).toBe("worker:typo")
  expect(resolveCursorSubagentType("generalPurpose", catalog)).toBe("general")
})
