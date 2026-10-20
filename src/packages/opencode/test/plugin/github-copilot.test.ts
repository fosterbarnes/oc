import { expect, test } from "bun:test"
import type { Hooks } from "@opencode-ai/plugin"
import { CopilotAuthPlugin, copilotBaseURL, copilotEntitlementError } from "@/plugin/github-copilot/copilot"

type ChatHeaders = NonNullable<Hooks["chat.headers"]>

async function hook(session: { parentID?: string } = {}) {
  const hooks = await CopilotAuthPlugin({
    directory: "",
    project: {} as never,
    worktree: "",
    experimental_workspace: { register() {} },
    serverUrl: new URL("http://localhost"),
    $: {} as never,
    client: {
      session: {
        message: async () => ({ data: { parts: [] } }),
        get: async () => ({ data: session }),
      },
    } as never,
  })
  return hooks["chat.headers"]!
}

function input(sessionID: string, providerID: string, npm: string) {
  return {
    sessionID,
    agent: "build",
    model: { providerID, api: { npm } },
    message: { id: "msg_test", sessionID },
  } as Parameters<ChatHeaders>[0]
}

test.each([
  ["github-copilot", "@ai-sdk/github-copilot"],
  ["github-copilot", "@ai-sdk/anthropic"],
  ["github-copilot-enterprise", "@ai-sdk/github-copilot"],
  ["github-copilot-enterprise", "@ai-sdk/anthropic"],
])("uses the session ID for %s interaction headers with %s", async (providerID, npm) => {
  const headers = await hook()
  for (const sessionID of ["ses_one", "ses_one", "ses_two"]) {
    const output = { headers: { "x-existing": "preserved" } }
    await headers(input(sessionID, providerID, npm), output)
    expect(output.headers).toMatchObject({
      "X-Interaction-Id": sessionID,
      "x-existing": "preserved",
    })
  }
})

test("does not add interaction headers to other providers", async () => {
  const headers = await hook()
  const output = { headers: { "x-existing": "preserved" } }
  await headers(input("ses_one", "openai", "@ai-sdk/openai"), output)
  expect(output.headers).toEqual({ "x-existing": "preserved" })
})

test("uses the parent session ID as the interaction ID for child sessions", async () => {
  const headers = await hook({ parentID: "ses_parent" })
  const output = { headers: {} as Record<string, string> }
  await headers(input("ses_child", "github-copilot", "@ai-sdk/github-copilot"), output)
  expect(output.headers).toMatchObject({ "X-Interaction-Id": "ses_parent", "x-initiator": "agent" })
})

test("prefers the account-specific Copilot API endpoint", () => {
  expect(
    copilotBaseURL({
      enterpriseUrl: "company.ghe.com",
      apiEndpoint: "https://api.business.githubcopilot.com",
    }),
  ).toBe("https://api.business.githubcopilot.com")
  expect(copilotBaseURL({ enterpriseUrl: "company.ghe.com" })).toBe("https://copilot-api.company.ghe.com")
  expect(copilotBaseURL()).toBe("https://api.githubcopilot.com")
})

test("rejects accounts without Copilot chat access", () => {
  expect(copilotEntitlementError({ chat_enabled: false, can_signup_for_limited: true })).toContain("Copilot Free")
  expect(copilotEntitlementError({ chat_enabled: false, can_signup_for_limited: false })).toContain(
    "subscription or a seat",
  )
  expect(copilotEntitlementError({ chat_enabled: false })).toContain("subscription or a seat")
})

test("only blocks on an explicit entitlement denial", () => {
  expect(copilotEntitlementError({ chat_enabled: true })).toBeUndefined()
  expect(copilotEntitlementError({ chat_enabled: true, can_signup_for_limited: true })).toBeUndefined()
  expect(copilotEntitlementError({})).toBeUndefined()
})
