import { describe, expect, test, beforeAll } from "bun:test"
import type { Hooks, PluginInput } from "@opencode-ai/plugin"
import { CursorPlugin } from "../../src/plugin/cursor"
import { CURSOR_COMPACTION_OPTION, CURSOR_PROVIDER_ID } from "../../src/provider/cursor/shared"
import { clearSessionDirectories, getSessionDirectory } from "../../src/provider/cursor/sessionDirectory"

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
  } as unknown as Parameters<ChatParams>[1]
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

describe("CursorPlugin session directory", () => {
  test("session events record directories and remove only the deleted session", async () => {
    const plugin = await CursorPlugin({} as PluginInput)
    const hook = plugin.event!
    type EventArg = Parameters<NonNullable<Hooks["event"]>>[0]
    const created = {
      event: { type: "session.created", properties: { info: { id: "ses_dir_1", directory: "/proj/a" } } },
    } as unknown as EventArg
    await hook(created)
    expect(getSessionDirectory("ses_dir_1")).toBe("/proj/a")
    const updated = {
      event: { type: "session.updated", properties: { info: { id: "ses_dir_1", directory: "/proj/b" } } },
    } as unknown as EventArg
    await hook(updated)
    expect(getSessionDirectory("ses_dir_1")).toBe("/proj/b")
    await hook({
      event: { type: "session.created", properties: { info: { id: "ses_dir_2", directory: "/proj/c" } } },
    } as unknown as EventArg)
    await hook({
      event: { type: "session.deleted", properties: { info: { id: "ses_dir_1" } } },
    } as unknown as EventArg)
    expect(getSessionDirectory("ses_dir_1")).toBeUndefined()
    expect(getSessionDirectory("ses_dir_2")).toBe("/proj/c")
    clearSessionDirectories()
    expect(getSessionDirectory("ses_dir_1")).toBeUndefined()
  })
})
