// P9: resident server memory and MCP children per project directory. Isolated `opencode serve` on
// the fake model with one stub stdio MCP server (mcpStub.ts); six git projects, idle, session
// deletes, and an instance dispose. No TUI.
import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { setTimeout } from "node:timers/promises"
import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { Effect } from "effect"
import { isolatedEnv, type CliFixture } from "../lib/cli-process"
import { testProviderConfig } from "../lib/test-provider"
import { expectIsolated, initRepo, outsideProfile } from "../provider/claude-code/chatFixture"

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

export function runP9(
  fixture: CliFixture,
  input: {
    runRoot: string
    ps: (args: string[]) => Promise<string>
  },
) {
  return Effect.gen(function* () {
    const runDir = input.runRoot
    const home = path.join(runDir, "home")
    yield* Effect.promise(() => mkdir(home, { recursive: true }))
    const results: Record<string, unknown> = { selected: "P9", runDir }
    const save = () => Bun.write(`${runDir}/results.json`, JSON.stringify(results, null, 2))
    const root = yield* outsideProfile
    const dirs: string[] = []
    for (let i = 1; i <= 6; i++) {
      const dir = path.join(root, `p9d${i}`)
      yield* initRepo(dir)
      yield* Effect.promise(() => Bun.write(path.join(dir, "README.txt"), `p9 dir ${i}\n`))
      dirs.push(dir)
    }
    // serve runs with cwd = fixture home, so this bunfig loads the memory preload into serve only.
    const preload = path.join(import.meta.dir, "memoryPreloadP9.ts").replaceAll("\\", "/")
    yield* Effect.promise(() =>
      Bun.write(path.join(fixture.home, "bunfig.toml"), `preload = [${JSON.stringify(preload)}]\n`),
    )
    const bun = Bun.which("bun") ?? process.execPath
    const config = {
      ...testProviderConfig(fixture.llm.url),
      model: "test/test-model",
      enabled_providers: ["test"],
      snapshot: false,
      lsp: false,
      mcp: {
        p9stub: {
          type: "local",
          command: [bun, path.join(import.meta.dir, "mcpStub.ts")],
          enabled: true,
        },
      },
      permission: {
        "*": "allow",
        read: "allow",
        glob: "allow",
        bash: "allow",
        task: "allow",
        doom_loop: "allow",
        external_directory: "allow",
      },
    }
    const env = {
      ...isolatedEnv(home, JSON.stringify(config)),
      USERPROFILE: home,
      APPDATA: `${home}/AppData/Roaming`,
      LOCALAPPDATA: `${home}/AppData/Local`,
      OPENCODE_DB: path.join(home, "opencode.db"),
      OC_AUTO_RENAME: "0",
      OC_PERF_LOG_DIR: runDir,
    }
    const model = { providerID: "test", modelID: "test-model" }
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
    const stopProven = async (pid: number, created: string) => {
      try {
        return await input.ps(["-RootId", String(pid), "-Created", created, "-StopRootOnly"])
      } catch (error) {
        return String(error)
      }
    }
    const isMcp = (row: Row) => {
      const command = (row.command ?? "").toLowerCase()
      const name = row.name.toLowerCase()
      return (
        command.includes("mcpstub") || command.includes("p9-mcp") || command.includes("p9stub") || name.includes("mcp")
      )
    }
    const kid = (row: Row): Kid => ({
      pid: row.pid,
      parent: row.parent,
      created: row.created,
      name: row.name,
      privateMB: row.privateMB,
      command: row.command,
    })
    const readHeap = async (label: string) => {
      const files = (await readdir(runDir)).filter((file) => file.startsWith("mem-") && file.endsWith(".jsonl"))
      const hits: { heapUsedMB: number; rssMB: number; pid: number; threadId: number; isMainThread: boolean }[] = []
      for (const file of files) {
        const lines = (await Bun.file(path.join(runDir, file)).text()).trim().split("\n").filter(Boolean)
        for (const line of lines.reverse()) {
          const row = JSON.parse(line) as {
            kind?: string
            label?: string
            pid: number
            threadId: number
            isMainThread?: boolean
            memory?: { heapUsed?: number; rss?: number }
          }
          if (row.kind === "checkpoint" && row.label === label && row.memory?.heapUsed != null) {
            hits.push({
              heapUsedMB: row.memory.heapUsed / 1048576,
              rssMB: (row.memory.rss ?? 0) / 1048576,
              pid: row.pid,
              threadId: row.threadId,
              isMainThread: row.isMainThread === true,
            })
            break
          }
        }
      }
      const main = hits.find((hit) => hit.isMainThread) ?? hits[0]
      return { heapUsedMB: main?.heapUsedMB ?? null, rssMB: main?.rssMB ?? null, isolates: hits }
    }
    const snapshot = async (label: string, serverPid: number, created: string) => {
      await Bun.write(`${runDir}/checkpoint.json`, JSON.stringify({ label }))
      await setTimeout(6500)
      const rows = await tree(serverPid, created)
      const server = rows.find((row) => row.pid === serverPid)
      const children = rows.filter((row) => row.pid !== serverPid)
      const mcp = children.filter(isMcp).map(kid)
      const other = children.filter((row) => !isMcp(row)).map(kid)
      const heap = await readHeap(label)
      return {
        label,
        privateMB: server?.privateMB ?? null,
        heapUsedMB: heap.heapUsedMB,
        rssMB: heap.rssMB,
        heapIsolates: heap.isolates,
        mcpCount: mcp.length,
        mcp,
        otherCount: other.length,
        other,
      }
    }

    const server = yield* fixture.opencode.serve({ env, hostname: "127.0.0.1", readyTimeoutMs: 60_000 })
    const created = yield* Effect.promise(() => identityOf(server.pid))
    const sdks = dirs.map((directory) => createOpencodeClient({ baseUrl: server.url, directory, throwOnError: true }))
    const sessionByDir: string[][] = dirs.map(() => [])
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

    const checkpoints: unknown[] = []
    for (let i = 0; i < dirs.length; i++) {
      const sdk = sdks[i]
      const session = (yield* Effect.promise(() =>
        sdk.session.create({ title: `P9D${i + 1}` }, { throwOnError: true }),
      )).data
      sessionByDir[i].push(session.id)
      yield* Effect.promise(async () => {
        const deadline = Date.now() + 30000
        while (Date.now() < deadline) {
          const status = (await sdk.mcp.status()).data as Record<string, { status?: string }>
          if (status?.p9stub?.status === "connected") return
          await setTimeout(200)
        }
      })
      for (let t = 1; t <= 3; t++) {
        yield* promptTurn(sdk, session.id, `P9_D${i + 1}_T${t}_DONE`)
      }
      const snap = yield* Effect.promise(() => snapshot(`after-dir-${i + 1}`, server.pid, created))
      checkpoints.push(snap)
      console.log(`P9 dir ${i + 1} privateMB ${snap.privateMB} mcp ${snap.mcpCount} other ${snap.otherCount}`)
    }

    yield* Effect.promise(() => setTimeout(120000))
    const idle = yield* Effect.promise(() => snapshot("after-idle-120s", server.pid, created))
    checkpoints.push(idle)

    for (let i = 0; i < 3; i++) {
      const sdk = sdks[i]
      const listed = ((yield* Effect.promise(() => sdk.session.list())).data ?? []) as { id: string }[]
      for (const session of listed) {
        yield* Effect.promise(() => sdk.session.delete({ sessionID: session.id }))
      }
    }
    yield* Effect.promise(() => setTimeout(2000))
    const afterDeletes = yield* Effect.promise(() => snapshot("after-deletes", server.pid, created))
    checkpoints.push(afterDeletes)

    const disposeDir = dirs[3]
    const disposeBefore = idle.mcp.concat(afterDeletes.mcp)
    const disposeResult = yield* Effect.promise(async () => {
      try {
        const result = await sdks[3].instance.dispose({ directory: disposeDir })
        return { ok: true, data: result.data }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    })
    yield* Effect.promise(() => setTimeout(3000))
    const afterDispose = yield* Effect.promise(() => snapshot("after-dispose-dir-4", server.pid, created))
    const mcpGone = afterDeletes.mcp.filter(
      (child) => !afterDispose.mcp.some((live) => live.pid === child.pid && live.created === child.created),
    )
    checkpoints.push({ ...afterDispose, disposeResult, mcpReleased: mcpGone, disposeBeforeCount: disposeBefore.length })

    expectIsolated(yield* fixture.llm.inputs)
    const recorded = [...afterDispose.mcp, ...afterDispose.other]
    server.kill()
    yield* Effect.promise(() => server.exited)
    yield* Effect.promise(() => setTimeout(2000))
    const leftovers: Kid[] = []
    for (const child of recorded) {
      if (yield* Effect.promise(() => stillLive(child.pid, child.created))) leftovers.push(child)
    }
    const leftoverCleanup: string[] = []
    for (const child of leftovers)
      leftoverCleanup.push(yield* Effect.promise(() => stopProven(child.pid, child.created)))
    results.P9 = {
      checkpoints,
      disposeResult,
      leftovers,
      leftoverCleanup,
      isolationChecked: true,
    }
    results.isolationChecked = true
    results.cleanup = leftovers.length === 0 ? "cleanup verified" : leftoverCleanup.join("\n")
    yield* Effect.promise(save)
  })
}
