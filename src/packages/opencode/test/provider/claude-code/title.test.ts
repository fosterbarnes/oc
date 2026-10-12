import { describe, expect, test } from "bun:test"
import { isTitleRequest, requestScope, synthesizeTitle, isNamingAgent } from "@/provider/claude-code/title"
import { resolveTurnContext } from "@/provider/claude-code/turn-context"

function options(agent?: string, tools?: unknown) {
  return {
    prompt: [
      {
        role: "user",
        content: [{ type: "text", text: "Write a handoff for a new session continuing this work." }],
      },
    ],
    ...(tools !== undefined ? { tools } : {}),
    ...(agent !== undefined ? { providerOptions: { "claude-code": { opencodeAgent: agent } } } : {}),
  } as any
}

function config(hostApi: string) {
  return { hostApi, provider: "claude-code" } as any
}

const TOOLS = [{ type: "function", name: "read", description: "Read a file", inputSchema: {} }]

describe("claude title detection", () => {
  test("tool-less naming-agent requests synthesize", () => {
    for (const agent of ["title", "rename", "project-copy-name"])
      expect(isTitleRequest(config("v1"), "no-tools", options(agent))).toBe(true)
  })

  test("a tool-less session-agent turn is a normal request", () => {
    // A context-limit handoff summary runs under the session agent with tools
    // denied. It must reach the model; only naming agents synthesize.
    expect(isTitleRequest(config("v1"), "no-tools", options("build"))).toBe(false)
    expect(requestScope(options("build"))).toBe("no-tools")
  })

  test("an unknown agent keeps the legacy stub", () => {
    expect(isTitleRequest(config("v1"), "no-tools", options())).toBe(true)
  })

  test("tooled turns are never titles on v1", () => {
    expect(isTitleRequest(config("v1"), "tools", options("build", TOOLS))).toBe(false)
    expect(isTitleRequest(config("v1"), "tools", options("title", TOOLS))).toBe(false)
  })

  test("v2 still keys on the title agent", () => {
    expect(isTitleRequest(config("v2"), "tools", options("title", TOOLS))).toBe(true)
    expect(isTitleRequest(config("v2"), "tools", options("build", TOOLS))).toBe(false)
    expect(isTitleRequest(config("v2"), "no-tools", options("build"))).toBe(false)
  })

  test("synthesizeTitle strips the handoff prompt to a title", () => {
    // Documents why the stub must never serve a summary turn.
    expect(synthesizeTitle(options("build").prompt)).toBe("Write Handoff New Session Continuing Work")
  })

  test("naming agents are title, rename, and project-copy-name", () => {
    expect(isNamingAgent("title")).toBe(true)
    expect(isNamingAgent("rename")).toBe(true)
    expect(isNamingAgent("project-copy-name")).toBe(true)
    expect(isNamingAgent("build")).toBe(false)
    expect(isNamingAgent(undefined)).toBe(false)
  })
})

describe("cli conversation continuity", () => {
  const turn = (agent?: string, tools?: unknown) =>
    resolveTurnContext(config("v1"), "claude-sonnet-4-5", {
      ...options(agent, tools),
      providerOptions: {
        "claude-code": {
          ...(agent !== undefined ? { opencodeAgent: agent } : {}),
          opencodeSessionID: "default",
        },
      },
    } as any)

  test("a tool-less session-agent turn keeps the chat conversation", async () => {
    // A denied handoff summary must resume the live conversation instead of a
    // fresh key that stalls waiting for operator confirmation.
    const handoff = await turn("build")
    expect(handoff.sessionKey).toContain("tools::")
    const titled = await turn("title")
    expect(titled.sessionKey).toContain("no-tools::")
  })

  test("compaction and unknown agents keep their keys", async () => {
    expect((await turn("compaction")).sessionKey).toContain("tools::")
    expect((await turn(undefined)).sessionKey).toContain("no-tools::")
    expect((await turn("build", TOOLS)).sessionKey).toContain("tools::")
  })
})
