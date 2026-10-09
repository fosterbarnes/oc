import { expect } from "bun:test"
import path from "node:path"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { cliIt } from "./lib/cli-process"
import { testProviderConfig } from "./lib/test-provider"
import { initRepo } from "./provider/claude-code/chat-fixture"

cliIt.live("command path rules persist on messages, block expansion and markers, and expire on the next turn", (fixture) =>
  Effect.gen(function* () {
    const project = path.join(fixture.home, "work")
    const plans = path.join(fixture.home, "plans")
    yield* initRepo(project)
    const markerFile = path.join(project, "marker.txt")
    yield* Effect.promise(() => Bun.write(path.join(fixture.home, ".config", "opencode", "markers.json"), JSON.stringify({
      enabled: true,
      commands: { escape: { mode: "inline", ask: false, run: [process.execPath, "-e", `Bun.write(${JSON.stringify(markerFile)}, 'escaped')`] } },
    })))
    const restriction = { "*": "deny", read: "allow", external_directory: "allow", edit: { "*": "deny", [`${plans.replaceAll("\\", "/")}/**/*.md`]: "allow" } }
    const env = {
      OPENCODE_DB: path.join(fixture.home, "opencode.db"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...testProviderConfig(fixture.llm.url), shell: process.platform === "win32" ? "pwsh" : "/bin/sh",
        command: {
          plain: { template: "Consider the task" },
          spit: { template: "Discuss plans", permission: restriction },
          scalar: { template: "Discuss", permission: { write: "deny", bash: "deny" } },
        },
      }),
    }
    const server = yield* fixture.opencode.serve({ env })
    const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
    const created = yield* Effect.promise(() => sdk.session.create({ title: "Command permission flow" }))
    const sessionID = created.data!.id
    const allowed = path.join(plans, "nested", "note.md")
    const forbidden = path.join(project, "outside.md")
    yield* fixture.llm.tool("write", { filePath: allowed, content: "plan" })
    yield* fixture.llm.tool("write", { filePath: forbidden, content: "forbidden" })
    yield* fixture.llm.text("$" + "#escape")
    const command = yield* Effect.promise(() => sdk.session.command({ sessionID, command: "plain", additionalCommands: ["spit"], arguments: "", model: "test/test-model" }))
    expect(JSON.stringify(command.data)).toContain("escape: denied")
    expect(yield* Effect.promise(() => Bun.file(allowed).text())).toBe("plan")
    expect(yield* Effect.promise(() => Bun.file(forbidden).exists())).toBe(false)
    expect(yield* Effect.promise(() => Bun.file(markerFile).exists())).toBe(false)
    const history = yield* Effect.promise(() => sdk.session.messages({ sessionID }))
    expect(history.data![0].info).toMatchObject({
      permission: [
        { permission: "*", pattern: "*", action: "deny" },
        { permission: "read", pattern: "*", action: "allow" },
        { permission: "external_directory", pattern: "*", action: "allow" },
        { permission: "edit", pattern: "*", action: "deny" },
        { permission: "edit", pattern: `${plans.replaceAll("\\", "/")}/**/*.md`, action: "allow" },
      ],
    })
    expect((yield* Effect.promise(() => sdk.session.get({ sessionID }))).data!.permission ?? []).toEqual([])
    const before = yield* fixture.llm.calls
    const expansion = yield* Effect.promise(() => sdk.session.command({
      sessionID, command: "spit", arguments: "!`echo expansion`", model: "test/test-model",
    }, { throwOnError: false }))
    expect(expansion.error).toBeDefined()
    expect(yield* fixture.llm.calls).toBe(before)
    yield* fixture.llm.text("scalar done")
    yield* Effect.promise(() => sdk.session.command({ sessionID, command: "scalar", arguments: "", model: "test/test-model" }))
    const inputs = yield* fixture.llm.inputs
    expect(JSON.stringify(inputs.at(-1)?.tools)).not.toContain('"name":"write"')
    server.kill()
    yield* Effect.promise(() => server.exited)
    const restarted = yield* fixture.opencode.serve({ env })
    const reopened = createOpencodeClient({ baseUrl: restarted.url, directory: project, throwOnError: true })
    const reloaded = yield* Effect.promise(() => reopened.session.messages({ sessionID }))
    expect(reloaded.data![0].info).toMatchObject({ permission: expect.any(Array) })
    yield* fixture.llm.tool("write", { filePath: forbidden, content: "next turn" })
    yield* fixture.llm.text("done")
    yield* Effect.promise(() => reopened.session.prompt({
      sessionID, model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Implement now" }],
    }))
    expect(yield* Effect.promise(() => Bun.file(forbidden).text())).toBe("next turn")
    const nextHistory = yield* Effect.promise(() => reopened.session.messages({ sessionID }))
    expect(nextHistory.data!.findLast((message) => message.info.role === "user")!.info).not.toHaveProperty("permission")
  }),
  90_000,
)
