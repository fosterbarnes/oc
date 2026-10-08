import { expect } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { cliIt } from "../lib/cli-process"
import { testProviderConfig } from "../lib/test-provider"

cliIt.live("oc bootstrap marks automatic titles but respects explicit titles without model calls", (fixture) =>
  Effect.gen(function* () {
    const project = path.join(fixture.home, "work")
    yield* Effect.promise(() => Bun.$`git init -q ${project}`.quiet())
    const env = {
      OPENCODE_DB: path.join(fixture.home, "opencode.db"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...testProviderConfig(fixture.llm.url), enabled_providers: ["test"], model: "test/test-model",
      }),
    }
    const automatic = yield* fixture.opencode.spawn(["session", "bootstrap", project], { env })
    fixture.opencode.expectExit(automatic, 0)
    const custom = yield* fixture.opencode.spawn(["session", "bootstrap", project, "--title", "My title"], { env })
    fixture.opencode.expectExit(custom, 0)
    const server = yield* fixture.opencode.serve({ env })
    const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
    const sessions = (yield* Effect.promise(() => sdk.session.list(undefined, { throwOnError: true }))).data
    expect(sessions).toHaveLength(2)
    expect(sessions.find((session) => session.title === "work")?.metadata).toEqual({
      ocAutoRename: { state: "pending", title: "work" },
    })
    expect(sessions.find((session) => session.title === "My title")?.metadata?.ocAutoRename).toBeUndefined()
    expect(yield* fixture.llm.calls).toBe(0)
  }), 90_000,
)
