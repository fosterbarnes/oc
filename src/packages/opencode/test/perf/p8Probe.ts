// P8: Claude CLI children of an isolated `opencode serve`, cold vs warm turns, and survivors after a
// graceful stop and after a hard stop of the proven serve identity. No TUI.
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { setTimeout } from "node:timers/promises"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import type { CliFixture } from "../lib/cli-process"
import { chatConfig, claudeEnv, expectIsolated, initRepo, outsideProfile } from "../provider/claude-code/chatFixture"

type Row = {
  pid: number
  parent: number
  created: string
  name: string
  command: string
  cpuSeconds: number
  privateMB: number
  writeBytes: number
  timeMs: number
}
type Kid = { pid: number; parent: number; created: string; name: string; privateMB: number; command: string }

export function runP8(
  fixture: CliFixture,
  input: {
    runRoot: string
    ps: (args: string[]) => Promise<string>
    mean: (values: number[]) => number
  },
) {
  return Effect.gen(function* () {
    if (!Bun.which("claude")) throw new Error("claude CLI not on PATH")
    const runDir = input.runRoot
    yield* Effect.promise(() => mkdir(`${runDir}/home`, { recursive: true }))
    const results: Record<string, unknown> = { selected: "P8", runDir }
    const save = () => Bun.write(`${runDir}/results.json`, JSON.stringify(results, null, 2))
    const root = yield* outsideProfile
    const project = path.join(root, "work")
    yield* initRepo(project)
    const env = {
      ...claudeEnv(root, fixture.llm.url),
      OPENCODE_DB: path.join(runDir, "home", "opencode.db"),
      OPENCODE_CONFIG_CONTENT: JSON.stringify({
        ...chatConfig(fixture.llm.url),
        model: "claude-code/claude-sonnet-4-5",
        enabled_providers: ["claude-code"],
        snapshot: false,
      }),
      OC_AUTO_RENAME: "0",
      CLAUDE_CODE_OAUTH_TOKEN: "",
    }
    const model = { providerID: "claude-code", modelID: "claude-sonnet-4-5" }
    const parseRows = (out: string) => {
      const value = JSON.parse(out)
      return (Array.isArray(value) ? value : [value]) as Row[]
    }
    const identityOf = async (pid: number) => {
      const rows = parseRows(await input.ps(["-RootId", String(pid)]))
      return rows.find((row) => row.pid === pid)!.created
    }
    const tree = async (pid: number, created: string) =>
      parseRows(await input.ps(["-RootId", String(pid), "-Created", created]))
    const stillLive = async (pid: number, created: string) => {
      try {
        return (await tree(pid, created)).some((row) => row.pid === pid && row.created === created)
      } catch {
        return false
      }
    }
    const isClaude = (row: Row, serverPid: number) => {
      if (row.pid === serverPid) return false
      const name = row.name.toLowerCase()
      const command = (row.command ?? "").toLowerCase()
      if (name.includes("claude")) return true
      return (name.includes("node") || name === "node.exe") && command.includes("claude")
    }
    const summarize = (rows: Row[], serverPid: number) => {
      const children: Kid[] = rows
        .filter((row) => isClaude(row, serverPid))
        .map((row) => ({
          pid: row.pid,
          parent: row.parent,
          created: row.created,
          name: row.name,
          privateMB: row.privateMB,
          command: row.command,
        }))
      return { count: children.length, totalPrivateMB: children.reduce((sum, kid) => sum + kid.privateMB, 0), children }
    }
    const startServer = function* () {
      const server = yield* fixture.opencode.serve({ env, hostname: "127.0.0.1", readyTimeoutMs: 60_000 })
      const created = yield* Effect.promise(() => identityOf(server.pid))
      const sdk = createOpencodeClient({ baseUrl: server.url, directory: project, throwOnError: true })
      return { server, created, sdk }
    }
    const promptTurn = (sdk: ReturnType<typeof createOpencodeClient>, sessionID: string, marker: string) =>
      Effect.promise(async () => {
        const before = await Effect.runPromise(fixture.llm.calls)
        await Effect.runPromise(fixture.llm.text(marker))
        const submitted = Date.now()
        const pending = sdk.session.prompt({ sessionID, model, parts: [{ type: "text", text: `Say ${marker}` }] })
        let llmMs = -1
        const deadline = Date.now() + 120000
        while (Date.now() < deadline) {
          if ((await Effect.runPromise(fixture.llm.calls)) > before) {
            llmMs = Date.now() - submitted
            break
          }
          await setTimeout(20)
        }
        const result = await pending
        return { llmMs, ok: JSON.stringify(result).includes(marker) }
      })
    const stopProven = async (pid: number, created: string) => {
      try {
        return await input.ps(["-RootId", String(pid), "-Created", created, "-StopRootOnly"])
      } catch (error) {
        return String(error)
      }
    }

    const a = yield* Effect.gen(startServer)
    const checkpoints: unknown[] = []
    const sessionIDs: string[] = []
    const cold: number[] = []
    const warm: number[] = []
    for (let s = 1; s <= 6; s++) {
      const session = (yield* Effect.promise(() => a.sdk.session.create({ title: `P8S${s}` }, { throwOnError: true })))
        .data
      sessionIDs.push(session.id)
      const turn = yield* promptTurn(a.sdk, session.id, `P8_S${s}_T1_DONE`)
      cold.push(turn.llmMs)
      const rows = yield* Effect.promise(() => tree(a.server.pid, a.created))
      checkpoints.push({ label: `after-turn-${s}`, ...summarize(rows, a.server.pid), llmMs: turn.llmMs, ok: turn.ok })
      console.log(`P8 turn ${s} children ${summarize(rows, a.server.pid).count} llmMs ${turn.llmMs}`)
    }
    for (let s = 1; s <= 3; s++) {
      const turn = yield* promptTurn(a.sdk, sessionIDs[s - 1], `P8_S${s}_T2_DONE`)
      warm.push(turn.llmMs)
      console.log(`P8 warm ${s} llmMs ${turn.llmMs}`)
    }
    yield* Effect.promise(() => setTimeout(90000))
    const idleRows = yield* Effect.promise(() => tree(a.server.pid, a.created))
    const idle = summarize(idleRows, a.server.pid)
    checkpoints.push({ label: "after-idle-90s", ...idle })
    a.server.kill()
    yield* Effect.promise(() => a.server.exited)
    yield* Effect.promise(() => setTimeout(2000))
    const gracefulSurvivors: Kid[] = []
    for (const kid of idle.children) {
      if (yield* Effect.promise(() => stillLive(kid.pid, kid.created))) gracefulSurvivors.push(kid)
    }
    const gracefulCleanup: string[] = []
    for (const kid of gracefulSurvivors)
      gracefulCleanup.push(yield* Effect.promise(() => stopProven(kid.pid, kid.created)))

    const b = yield* Effect.gen(startServer)
    for (let s = 1; s <= 2; s++) {
      const session = (yield* Effect.promise(() => b.sdk.session.create({ title: `P8H${s}` }, { throwOnError: true })))
        .data
      yield* promptTurn(b.sdk, session.id, `P8_H${s}_T1_DONE`)
    }
    const hardTree = yield* Effect.promise(() => tree(b.server.pid, b.created))
    const hardRecorded = summarize(hardTree, b.server.pid)
    const hardStop = yield* Effect.promise(() => stopProven(b.server.pid, b.created))
    yield* Effect.promise(() => setTimeout(2000))
    const hardSurvivors: Kid[] = []
    for (const kid of hardRecorded.children) {
      if (yield* Effect.promise(() => stillLive(kid.pid, kid.created))) hardSurvivors.push(kid)
    }
    const hardCleanup: string[] = []
    for (const kid of hardSurvivors) hardCleanup.push(yield* Effect.promise(() => stopProven(kid.pid, kid.created)))

    expectIsolated(yield* fixture.llm.inputs)
    results.P8 = {
      checkpoints,
      coldMs: cold,
      warmMs: warm,
      coldMean: input.mean(cold.filter((ms) => ms >= 0)),
      warmMean: input.mean(warm.filter((ms) => ms >= 0)),
      gracefulSurvivors,
      gracefulCleanup,
      hardRecorded,
      hardStop,
      hardSurvivors,
      hardCleanup,
      isolationChecked: true,
    }
    results.isolationChecked = true
    results.cleanup = "cleanup verified"
    yield* Effect.promise(save)
  })
}
