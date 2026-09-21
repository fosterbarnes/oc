import { describe, expect, test, beforeAll } from "bun:test"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { CursorPlugin } from "../../src/plugin/cursor"
import { CURSOR_COMPACTION_OPTION, CURSOR_PROVIDER_ID } from "../../src/provider/cursor/shared"

type ChatParams = NonNullable<Hooks["chat.params"]>

function input(agent: string, providerID = CURSOR_PROVIDER_ID) {
  return {
    agent,
    model: { providerID },
  } as Parameters<ChatParams>[0]
}

function output() {
  return {
    temperature: undefined,
    topP: undefined,
    topK: undefined,
    maxOutputTokens: 32_000,
    options: {},
  } as Parameters<ChatParams>[1]
}

describe("CursorPlugin compaction chat.params", () => {
  let hook: ChatParams

  beforeAll(async () => {
    hook = (await CursorPlugin({} as PluginInput))["chat.params"]!
  })

  test("sets opencodeCompaction for cursor compaction and not for title or build", async () => {
    const compaction = output()
    await hook(input("compaction"), compaction)
    expect(compaction.options[CURSOR_COMPACTION_OPTION]).toBe(true)

    const title = output()
    await hook(input("title"), title)
    expect(title.options[CURSOR_COMPACTION_OPTION]).toBeUndefined()

    const build = output()
    await hook(input("build"), build)
    expect(build.options[CURSOR_COMPACTION_OPTION]).toBeUndefined()
  })

  test("does not mark other providers", async () => {
    const params = output()
    await hook(input("compaction", "openai"), params)
    expect(params.options[CURSOR_COMPACTION_OPTION]).toBeUndefined()
  })
})
