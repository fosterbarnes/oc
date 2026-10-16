// Opt-in performance probes (OC_PERF_PROBE=1, Windows only). Each metric drives oc from source
// against TestLLMServer and samples CPU, private memory, and IO writes from CIM. Run through
// run.ps1 in this folder; README.md lists the metrics and the isolation and cleanup rules.
import { afterAll, describe } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { setTimeout } from "node:timers/promises"
import { Effect } from "effect"
import { cliIt, hostEnv, isolatedEnv } from "../lib/cli-process"
import { raw, reply } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"
import { claudeEnv, expectIsolated, initRepo, outsideProfile } from "../provider/claude-code/chatFixture"
import { runP8 } from "./p8Probe"
import { runP9 } from "./p9Probe"

const opencodeRoot = path.resolve(import.meta.dir, "../..")
const selected = process.env.OC_PERF_METRIC ?? "all"
// Runs stay outside the profile: each holds ~1,300 bun cache files, and profile temp slows logon.
const out = (process.env.OC_PERF_OUT ?? "C:\\ocTestTmp\\ocPerfRuns").replaceAll("\\", "/")
const runRoot = `${out}/run-${Date.now()}-${selected}`
const startRun = () =>
  Effect.promise(async () => {
    await mkdir(runRoot, { recursive: true })
    await Bun.write(`${out}/latest.txt`, runRoot)
  })

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
const ps = async (args: string[]) => {
  const proc = Bun.spawn(
    ["pwsh", "-NoProfile", "-NonInteractive", "-File", path.join(import.meta.dir, "processTree.ps1"), ...args],
    { env: hostEnv(), stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (code !== 0) throw new Error(`processTree ${code}: ${stderr}`)
  return stdout.trim()
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length
// Starts its timer when the fake model awaits it, not when the reply is queued.
const later = (ms: number): PromiseLike<void> => ({ then: (resolve, reject) => setTimeout(ms).then(resolve, reject) })
const roleChunk = { id: "chatcmpl-test", object: "chat.completion.chunk", choices: [{ delta: { role: "assistant" } }] }
const parallelTools = (calls: { name: string; input: unknown }[]) => {
  const tail: unknown[] = []
  calls.forEach((call, index) => {
    const id = `call_${index + 1}`
    tail.push({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      choices: [
        { delta: { tool_calls: [{ index, id, type: "function", function: { name: call.name, arguments: "" } }] } },
      ],
    })
    tail.push({
      id: "chatcmpl-test",
      object: "chat.completion.chunk",
      choices: [{ delta: { tool_calls: [{ index, function: { arguments: JSON.stringify(call.input) } }] } }],
    })
  })
  tail.push({
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    choices: [{ delta: {}, finish_reason: "tool_calls" }],
  })
  return raw({ head: [roleChunk], tail })
}
const tally = async (file: string, start: number, end: number, field: string) => {
  if (!(await Bun.file(file).exists())) return { count: 0, perSec: 0, by: {} as Record<string, number> }
  const rows = (await Bun.file(file).text())
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((row) => row.time >= start && row.time <= end)
  const by: Record<string, number> = {}
  for (const row of rows) {
    const key = String(row[field] ?? "unknown")
    by[key] = (by[key] ?? 0) + 1
  }
  return { count: rows.length, perSec: rows.length / Math.max(0.001, (end - start) / 1000), by }
}
const fileBytes = async (target: string) => {
  try {
    return (await Bun.file(target).stat()).size
  } catch {
    return 0
  }
}
const treeBytes = async (root: string) => {
  try {
    await readdir(root)
  } catch {
    return 0
  }
  let total = 0
  for await (const file of new Bun.Glob("**/*").scan({ cwd: root, onlyFiles: true, dot: true })) {
    total += await fileBytes(path.join(root, file))
  }
  return total
}
const summarizeTurns = (
  turns: {
    dbDelta: number
    snapshotDelta: number
    logDelta: number
    gitSpawns: number
    llmMs: number
    walEnd: number
  }[],
) => ({
  n: turns.length,
  dbDeltaMean: mean(turns.map((t) => t.dbDelta)),
  snapshotDeltaMean: mean(turns.map((t) => t.snapshotDelta)),
  logDeltaMean: mean(turns.map((t) => t.logDelta)),
  gitSpawnsMean: mean(turns.map((t) => t.gitSpawns)),
  llmMsMean: mean(turns.map((t) => t.llmMs)),
  walEnd: turns.at(-1)?.walEnd,
})

describe.skipIf(process.env.OC_PERF_PROBE !== "1" || process.platform !== "win32")("oc performance probes", () => {
  afterAll(async () => {
    if (selected === "P3") {
      const plain = await Bun.file(`${runRoot}/plain/results.json`).json()
      const code = await Bun.file(`${runRoot}/code/results.json`).json()
      await Bun.write(
        `${runRoot}/results.json`,
        JSON.stringify(
          {
            selected,
            runDir: runRoot,
            runs: { plain: `${runRoot}/plain`, code: `${runRoot}/code` },
            P3: [...plain.P3, ...code.P3],
            "P3-plain": plain["P3-plain"],
            "P3-code": code["P3-code"],
            cleanup:
              plain.cleanup === "cleanup verified" && code.cleanup === "cleanup verified"
                ? "cleanup verified"
                : "cleanup incomplete",
            isolationChecked: plain.isolationChecked && code.isolationChecked,
          },
          null,
          2,
        ),
      )
    }
    if (selected === "P7") {
      const on = await Bun.file(`${runRoot}/on/results.json`).json()
      const off = await Bun.file(`${runRoot}/off/results.json`).json()
      await Bun.write(
        `${runRoot}/results.json`,
        JSON.stringify(
          {
            selected,
            runDir: runRoot,
            runs: { on: `${runRoot}/on`, off: `${runRoot}/off` },
            "P7-on": on.P7,
            "P7-off": off.P7,
            cleanup:
              on.cleanup === "cleanup verified" && off.cleanup === "cleanup verified"
                ? "cleanup verified"
                : "cleanup incomplete",
            isolationChecked: on.isolationChecked && off.isolationChecked,
          },
          null,
          2,
        ),
      )
    }
  })

  if (selected === "P8")
    cliIt.live(
      "P8 claude server children",
      (fixture) => startRun().pipe(Effect.andThen(runP8(fixture, { runRoot, ps, mean }))),
      900000,
    )
  if (selected === "P9")
    cliIt.live(
      "P9 resident server memory",
      (fixture) => startRun().pipe(Effect.andThen(runP9(fixture, { runRoot, ps }))),
      900000,
    )
  for (const streamVariant of selected === "P8" || selected === "P9"
    ? []
    : selected === "P3"
      ? ["plain", "code"]
      : selected === "P7"
        ? ["on", "off"]
        : [""])
    cliIt.live(
      `sandbox performance probe ${streamVariant}`,
      (fixture) =>
        Effect.gen(function* () {
          yield* startRun()
          const runDir = streamVariant ? `${runRoot}/${streamVariant}` : runRoot
          yield* Effect.promise(() => mkdir(runDir, { recursive: true }))
          const results: Record<string, unknown> = { selected, runDir }
          const save = () => Bun.write(`${runDir}/results.json`, JSON.stringify(results, null, 2))
          const root = yield* outsideProfile
          const project = path.join(root, "work")
          yield* initRepo(project)
          if (selected === "P7") {
            yield* Effect.promise(async () => {
              for (let i = 0; i < 2000; i++) {
                const folder = path.join(project, `d${Math.floor(i / 50)}`, `s${i % 5}`)
                await mkdir(folder, { recursive: true })
                await Bun.write(path.join(folder, `f${i}.txt`), `file ${i}\n${"line\n".repeat(4)}`)
              }
              const runGit = async (args: string[]) => {
                const proc = Bun.spawn(["git", "-C", project, ...args], { stdout: "pipe", stderr: "pipe" })
                const code = await proc.exited
                if (code !== 0) throw new Error(`git ${args.join(" ")} failed: ${code}`)
              }
              await runGit(["add", "-A"])
              await runGit(["-c", "user.email=p7@ocperf", "-c", "user.name=p7", "commit", "-m", "p7 seed"])
            })
          }
          // Runtime artifacts stay in the run directory; only the git project sits under outsideProfile.
          const home = `${runDir}/home`
          yield* Effect.promise(() => mkdir(home, { recursive: true }))
          const socket = `${runDir}/wezterm.sock`
          let paced = false
          let delayToolChunks = 0
          let sentChunks = 0
          let firstChunk = 0
          let lastChunk = 0
          const llmHits: number[] = []
          const proxy = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            idleTimeout: 255,
            async fetch(req) {
              const url = new URL(req.url)
              if (req.method !== "GET") llmHits.push(Date.now())
              const upstream = await fetch(`${fixture.llm.url.replace(/\/v1$/, "")}${url.pathname}`, {
                method: req.method,
                headers: req.headers,
                body: await req.text(),
                signal: req.signal,
              })
              if (!paced && !delayToolChunks)
                return new Response(upstream.body, { status: upstream.status, headers: upstream.headers })
              const text = await upstream.text()
              const frames = text.split("\n\n").filter(Boolean)
              return new Response(
                new ReadableStream({
                  async start(controller) {
                    try {
                      for (const frame of frames) {
                        if (paced && frame.includes('"content":')) {
                          await setTimeout(20)
                          firstChunk ||= Date.now()
                          lastChunk = Date.now()
                          sentChunks++
                        }
                        if (delayToolChunks && frame.includes("tool_calls")) await setTimeout(delayToolChunks)
                        controller.enqueue(new TextEncoder().encode(frame + "\n\n"))
                      }
                      controller.close()
                    } catch (error) {
                      controller.error(error)
                    }
                  },
                }),
                { headers: { "content-type": "text/event-stream" } },
              )
            },
          })
          yield* Effect.addFinalizer(() => Effect.sync(() => proxy.stop(true)))
          const config = {
            ...testProviderConfig(`http://127.0.0.1:${proxy.port}/v1`),
            model: "test/test-model",
            enabled_providers: ["test"],
            snapshot: selected === "P7" ? streamVariant === "on" : false,
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
          const memoryProbe = selected === "P1" || selected === "P2"
          const kitEntry = selected === "P4" || selected === "P6" || selected === "P7"
          const paneEnv = {
            ...isolatedEnv(home, JSON.stringify(config)),
            ...claudeEnv(home, fixture.llm.url),
            USERPROFILE: home,
            APPDATA: `${home}/AppData/Roaming`,
            LOCALAPPDATA: `${home}/AppData/Local`,
            OPENCODE_DB: `${home}/opencode.db`,
            XDG_RUNTIME_DIR: `${home}/runtime`,
            OPENCODE_SHOW_TTFD: "1",
            OC_AUTO_RENAME: "0",
            OC_FLAVOR: "native",
            OPENCODE_DISABLE_CONFIG_INSTALL: "1",
            OPENCODE_SERVER_PASSWORD: "",
            OPENCODE_SERVER_USERNAME: "",
            ...(memoryProbe && { OC_PERF_LOG_DIR: runDir, OC_PERF_INJECT_PRELOAD: "1" }),
            ...(selected === "P4" && { OC_PERF_LOG_DIR: runDir, OC_PERF_SPINNER: "1" }),
            ...(selected === "P6" && { OC_PERF_LOG_DIR: runDir, OC_PERF_EVENTS: "1" }),
            ...(selected === "P7" && { OC_PERF_LOG_DIR: runDir, OC_PERF_GIT: "1", OC_PERF_INJECT_PRELOAD: "1" }),
          }
          const cliEnv = {
            ...Object.fromEntries(
              Object.entries(hostEnv()).filter(
                ([key]) => key !== "WEZTERM_PANE" && key !== "CLAUDE_CODE_OAUTH_TOKEN" && !key.startsWith("XDG_"),
              ),
            ),
            ...paneEnv,
            WEZTERM_UNIX_SOCKET: socket,
          }
          const lua = `${runDir}/wezterm.lua`
          yield* Effect.promise(() =>
            Bun.write(
              lua,
              [
                "return {",
                `unix_domains = {{ name = 'ocPerfProbe', socket_path = [[${socket}]] }},`,
                "initial_cols = 160, initial_rows = 40, exit_behavior = 'Hold',",
                "set_environment_variables = {",
                ...Object.entries(paneEnv).map(
                  ([key, value]) => `[${JSON.stringify(key)}] = ${JSON.stringify(value)},`,
                ),
                "},",
                "}",
              ].join("\n"),
            ),
          )
          const started = Date.now()
          const entry = memoryProbe
            ? path.join(import.meta.dir, "instrumentedEntry.ts")
            : kitEntry
              ? path.join(import.meta.dir, "probeEntry.ts")
              : "src/index.ts"
          const mux = Bun.spawn(
            [
              Bun.which("wezterm-mux-server")!,
              "--config-file",
              lua,
              "--cwd",
              project,
              "--",
              "bun",
              "run",
              "--cwd",
              opencodeRoot,
              entry,
              project,
            ],
            {
              env: cliEnv,
              stdout: Bun.file(`${runDir}/mux.stdout.log`),
              stderr: Bun.file(`${runDir}/mux.stderr.log`),
              stdin: "ignore",
            },
          )
          let identity = ""
          yield* Effect.addFinalizer(() =>
            Effect.promise(async () => {
              try {
                if (!identity) throw new Error("Mux identity unavailable; left processes untouched")
                const cleanup = await ps(["-RootId", String(mux.pid), "-Created", identity, "-Cleanup"])
                await Bun.write(`${runDir}/cleanup.log`, cleanup)
                results.cleanup = cleanup
              } catch (error) {
                results.cleanupError = String(error)
                await Bun.write(`${runDir}/cleanup.log`, String(error))
                throw error
              } finally {
                await save()
              }
            }),
          )
          const snapshot = async () => {
            const parsed = JSON.parse(
              await ps(["-RootId", String(mux.pid), ...(identity ? ["-Created", identity] : [])]),
            )
            const rows: Row[] = Array.isArray(parsed) ? parsed : [parsed]
            identity ||= rows.find((row) => row.pid === mux.pid)!.created
            return rows
          }
          yield* Effect.promise(snapshot)
          const wez = async (args: string[]) => {
            const proc = Bun.spawn(["wezterm", "--config-file", lua, "cli", "--no-auto-start", ...args], {
              env: cliEnv,
              stdout: "pipe",
              stderr: "pipe",
            })
            const [stdout, stderr, code] = await Promise.all([
              new Response(proc.stdout).text(),
              new Response(proc.stderr).text(),
              proc.exited,
            ])
            if (code !== 0) throw new Error(`wezterm ${code}: ${stderr}`)
            return stdout
          }
          let pane = ""
          const screen = () => wez(["get-text", "--pane-id", pane])
          const wait = async (label: string, predicate: (text: string) => boolean, timeout = 60000) => {
            const deadline = Date.now() + timeout
            let last = ""
            do {
              last = await screen()
              if (predicate(last)) return last
              await setTimeout(250)
            } while (Date.now() < deadline)
            await Bun.write(`${runDir}/failed-screen.txt`, last)
            throw new Error(`Timeout: ${label}`)
          }
          const readyDeadline = Date.now() + 30000
          while (!pane && Date.now() < readyDeadline) {
            const list = yield* Effect.promise(() => wez(["list", "--format", "json"]).catch(() => "[]"))
            pane = String(JSON.parse(list)[0]?.pane_id ?? "")
            if (!pane) yield* Effect.promise(() => setTimeout(250))
          }
          if (!pane) throw new Error("Mux pane never appeared")
          // M6 snapshot is targeted at launch +5 seconds, before waiting for Home readiness.
          yield* Effect.promise(() => setTimeout(Math.max(0, started + 5000 - Date.now())))
          const at5 = yield* Effect.promise(snapshot)
          results.M6 = { snapshotAtSeconds: (Date.now() - started) / 1000, processes: at5 }
          const startupScreen = yield* Effect.promise(screen)
          yield* Effect.promise(() => Bun.write(`${runDir}/startup-screen.txt`, startupScreen))
          const homeScreen = yield* Effect.promise(() =>
            wait("Home ready", (text) => text.includes("Ask anything"), selected === "P7" ? 180000 : 60000),
          )
          results.M6 = {
            ...(results.M6 as object),
            readyWallSeconds: (Date.now() - started) / 1000,
            ttfd: homeScreen.match(/.{0,30}(?:first draw|TTFD|ttfd|\d+ms).{0,40}/g),
          }
          yield* Effect.promise(() => Bun.write(`${runDir}/home-screen.txt`, homeScreen))
          results.topology = yield* Effect.promise(snapshot)
          yield* Effect.promise(save)
          console.log(`READY ${runDir}`)
          const type = (text: string) => wez(["send-text", "--pane-id", pane, "--no-paste", text])
          const slash = async (name: string) => {
            await type(`/${name}`)
            await wait(`${name} autocomplete`, (text) => text.includes(`/${name}:(oc)`))
            await type("\r")
          }
          const turn = async (n: number) => {
            await Effect.runPromise(fixture.llm.text(`PERF_REPLY_${n}_DONE`))
            await type(`Short performance turn ${n}\r`)
            await wait(`turn ${n}`, (text) => text.includes(`PERF_REPLY_${n}_DONE`) && !/esc\s+interrupt/.test(text))
          }
          const memoryLogs = async () => {
            const files = (await readdir(runDir)).filter((name) => /^mem-\d+-\d+\.jsonl$/.test(name))
            return Promise.all(
              files.map(async (name) => ({
                name,
                rows: (await Bun.file(`${runDir}/${name}`).text())
                  .trim()
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => JSON.parse(line)),
              })),
            )
          }
          const checkpoint = async (label: string) => {
            const files = await memoryLogs()
            if (
              !files.some((file) =>
                file.rows.some(
                  (row) => row.kind === "boot" && String(row.main).replaceAll("\\", "/").includes("/tui/worker"),
                ),
              )
            )
              throw new Error("No instrumented server worker; cannot attribute memory")
            await Bun.write(`${runDir}/checkpoint.json`, JSON.stringify({ label }))
            const deadline = Date.now() + 20000
            do {
              const logs = await memoryLogs()
              const points = logs.flatMap((file) =>
                file.rows.filter((row) => row.kind === "checkpoint" && row.label === label),
              )
              if (points.length >= files.length) {
                await Bun.write(
                  `${runDir}/${label}-memory.json`,
                  JSON.stringify(
                    {
                      points,
                      workers: logs.flatMap((file) =>
                        file.rows.filter((row) => row.kind === "boot" || row.kind.startsWith("worker")),
                      ),
                    },
                    null,
                    2,
                  ),
                )
                return points
              }
              await setTimeout(100)
            } while (Date.now() < deadline)
            throw new Error(`Memory checkpoint never reached every instrumented thread: ${label}`)
          }
          const sample = async (metric: string, durationMs: number, done?: () => boolean) => {
            const samples: Row[][] = []
            const begin = Date.now()
            samples.push(await snapshot())
            while (Date.now() - begin < durationMs && !done?.()) {
              await setTimeout(Math.max(0, begin + samples.length * 2000 - Date.now()))
              samples.push(await snapshot())
            }
            await Bun.write(`${runDir}/${metric}-samples.json`, JSON.stringify(samples, null, 2))
            const ids = [...new Set(samples.flat().map((row) => row.pid))]
            const summaries = ids.map((pid) => {
              const rows = samples.flatMap((sample) => sample.filter((row) => row.pid === pid))
              const intervals = rows.slice(1).map((row, i) => ({
                cpu: ((row.cpuSeconds - rows[i].cpuSeconds) / ((row.timeMs - rows[i].timeMs) / 1000)) * 100,
                writes: (row.writeBytes - rows[i].writeBytes) / ((row.timeMs - rows[i].timeMs) / 1000),
              }))
              return {
                pid,
                name: rows[0].name,
                command: rows[0].command,
                samples: rows.length,
                cpuMean: mean(intervals.map((x) => x.cpu)),
                cpuPeak: Math.max(...intervals.map((x) => x.cpu)),
                privateMean: mean(rows.map((x) => x.privateMB)),
                privatePeak: Math.max(...rows.map((x) => x.privateMB)),
                writeMean: mean(intervals.map((x) => x.writes)),
                writePeak: Math.max(...intervals.map((x) => x.writes)),
              }
            })
            results[metric] = { elapsedSeconds: (Date.now() - begin) / 1000, processes: summaries }
            await save()
            console.log(`${metric} measured`)
          }
          if (selected === "P1") {
            results.P1 = { startup: yield* Effect.promise(() => checkpoint("P1-startup")) }
            yield* Effect.promise(save)
            for (let n = 1; n <= 25; n++) yield* Effect.promise(() => turn(n))
            results.P1 = { ...(results.P1 as object), after25: yield* Effect.promise(() => checkpoint("P1-after25")) }
            results.memoryThreads = yield* Effect.promise(memoryLogs)
            expectIsolated(yield* fixture.llm.inputs)
            results.isolationChecked = true
            yield* Effect.promise(save)
            return
          }
          // P2 never completed: pane navigation between sessions failed twice (see README.md).
          if (selected === "P2") {
            const titles = Array.from({ length: 5 }, (_, i) => `PROBESESSION${i + 1}`)
            const toolFile = `${runDir}/toolOutput.txt`
            yield* Effect.promise(() =>
              Bun.write(
                toolFile,
                Array.from(
                  { length: 250 },
                  (_, i) => `${String(i).padStart(4, "0")} ${"sample output ".repeat(6)}\n`,
                ).join(""),
              ),
            )
            for (let s = 1; s <= 5; s++) {
              if (s > 1) {
                yield* Effect.promise(() => slash("new"))
                yield* Effect.promise(() => wait("new session", (text) => text.includes("Ask anything")))
              }
              for (let n = 1; n <= 15; n++) {
                if (n % 5 === 0) yield* fixture.llm.tool("read", { filePath: toolFile })
                yield* Effect.promise(() => turn(s * 100 + n))
              }
              yield* Effect.promise(() => slash("title"))
              yield* Effect.promise(() => wait("rename dialog", (text) => text.includes("Rename Session")))
              yield* Effect.promise(() => type(`\x15${titles[s - 1]}\r`))
              yield* Effect.promise(() =>
                wait("renamed", (text) => text.includes(titles[s - 1]) && !text.includes("Rename Session")),
              )
              console.log(`P2 seeded ${s}`)
            }
            const database = new Database(`${home}/opencode.db`, { readonly: true })
            results.seeded = database
              .query(
                "select s.id, s.title, count(m.id) as messages from session s left join message m on m.session_id = s.id group by s.id",
              )
              .all()
            results.toolOutputs = database
              .query(
                "select length(json_extract(data, '$.state.output')) as chars from part where json_extract(data, '$.type') = 'tool'",
              )
              .all()
            database.close()
            const curve = [{ switches: 0, memory: yield* Effect.promise(() => checkpoint("P2-switch0")) }]
            results.P2 = curve
            yield* Effect.promise(save)
            for (let n = 1; n <= 30; n++) {
              const s = ((n - 1) % 5) + 1
              const title = titles[s - 1]
              yield* Effect.promise(() => slash("sessions"))
              yield* Effect.promise(() => wait("session list", (text) => text.includes("Sessions")))
              yield* Effect.promise(() => type(title))
              yield* Effect.promise(() =>
                wait("filtered session", (text) => {
                  const left = text
                    .split("\n")
                    .map((line) => line.slice(0, 118))
                    .join("\n")
                  return (
                    left.includes(title) &&
                    !titles.filter((value) => value !== title).some((value) => left.includes(value))
                  )
                }),
              )
              yield* Effect.promise(() => type("\r"))
              yield* Effect.promise(() =>
                wait(
                  "switched session",
                  (text) =>
                    !text.includes("Sessions") &&
                    text.includes(title) &&
                    text.includes(`PERF_REPLY_${s * 100 + 15}_DONE`),
                ),
              )
              if (n % 10 === 0) {
                curve.push({ switches: n, memory: yield* Effect.promise(() => checkpoint(`P2-switch${n}`)) })
                yield* Effect.promise(save)
                console.log(`P2 ${n} switches`)
              }
            }
            results.memoryThreads = yield* Effect.promise(memoryLogs)
            expectIsolated(yield* fixture.llm.inputs)
            results.isolationChecked = true
            yield* Effect.promise(save)
            return
          }
          if (selected === "P3") {
            const block =
              "```typescript\n" +
              Array.from(
                { length: 100 },
                (_, i) => `const item${i} = { count: ${i}, name: \"example\", active: true };\n`,
              ).join("") +
              "```\n\n"
            const prose =
              "This paragraph describes a small application and the work it performs. The application reads a local file and prepares a useful result. Each operation finishes before the next one begins.\n\n"
            results.P3 = []
            yield* Effect.promise(() => turn(0))
            const marker = streamVariant === "plain" ? "P3PLAINCOMPLETE" : "P3CODECOMPLETE"
            const payload =
              streamVariant === "plain"
                ? prose.repeat(Math.ceil(200000 / prose.length)).slice(0, 200000)
                : block.repeat(Math.floor(200000 / block.length)).padEnd(200000, " ")
            const text = payload + `\n${marker}\n`
            const response = reply()
            for (let i = 0; i < text.length; i += 400) response.text(text.slice(i, i + 400))
            yield* fixture.llm.push(response.stop())
            sentChunks = 0
            firstChunk = 0
            lastChunk = 0
            paced = true
            let complete = false
            let completedAt = 0
            const start = Date.now()
            yield* Effect.promise(() => type(`Stream the ${streamVariant} reply\r`))
            const completion = wait(
              `${streamVariant} stream completion`,
              (shown) => shown.includes(marker) && !/esc\s+interrupt/.test(shown),
              180000,
            ).then(() => {
              completedAt = Date.now()
              complete = true
            })
            yield* Effect.promise(() => sample(`P3-${streamVariant}`, 180000, () => complete))
            yield* Effect.promise(() => completion)
            ;(results.P3 as unknown[]).push({
              variant: streamVariant,
              bytes: Buffer.byteLength(text),
              codeBlockBytes: streamVariant === "code" ? Buffer.byteLength(block) : 0,
              chunks: sentChunks,
              chunkRate: (sentChunks - 1) / ((lastChunk - firstChunk) / 1000),
              wallSeconds: (completedAt - start) / 1000,
            })
            paced = false
            yield* Effect.promise(save)
            expectIsolated(yield* fixture.llm.inputs)
            results.isolationChecked = true
            yield* Effect.promise(save)
            return
          }
          if (selected === "P4") {
            const glyphs = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
            const spinnerRows = (text: string) =>
              text.split("\n").filter((line) => glyphs.some((g) => line.includes(g))).length
            const capture = async (label: string) => {
              const text = await screen()
              await Bun.write(`${runDir}/${label}-screen.txt`, text)
              return {
                spinnerRows: spinnerRows(text),
                pings: [61, 62, 63, 64].filter((n) => text.includes(`ping -n ${n}`)),
                permissionPrompt: text.includes("Permission required"),
                doomLoop: text.includes("Continue after repeated"),
              }
            }
            const ping = (n: number) => ({ command: `ping -n ${n} 127.0.0.1`, timeout: 120000 })
            const measureWindow = async (label: string) => {
              const begin = Date.now()
              await sample(label, 45000)
              const end = Date.now()
              const log = await tally(`${runDir}/spinner-wakes.jsonl`, begin, end, "kind")
              const seconds = Math.max(0.001, (end - begin) / 1000)
              return { wakesPerSec: (log.by.tick ?? 0) / seconds, framesPerSec: (log.by.frame ?? 0) / seconds, log }
            }
            const release = Promise.withResolvers<void>()
            yield* fixture.llm.push(reply().wait(release.promise).text("P4A_RELEASED").stop())
            yield* Effect.promise(() => type("Hold this stream open\r"))
            yield* Effect.promise(() => wait("P4 busy", (text) => /esc\s+interrupt/.test(text)))
            const aScreen = yield* Effect.promise(() => capture("P4-a"))
            const a = yield* Effect.promise(() => measureWindow("P4-a"))
            results["P4-a"] = { ...(results["P4-a"] as object), ...a, screen: aScreen }
            release.resolve()
            yield* Effect.promise(() =>
              wait("P4a complete", (text) => text.includes("P4A_RELEASED") && !/esc\s+interrupt/.test(text)),
            )
            yield* fixture.llm.push(reply().tool("bash", ping(61)))
            yield* fixture.llm.push(reply().text("P4B_DONE").stop())
            yield* Effect.promise(() => type("Run one blocking tool\r"))
            yield* Effect.promise(() =>
              wait("P4 one tool", (text) => /esc\s+interrupt/.test(text) && text.includes("ping -n 61")),
            )
            const bScreen = yield* Effect.promise(() => capture("P4-b"))
            const b = yield* Effect.promise(() => measureWindow("P4-b"))
            results["P4-b"] = { ...(results["P4-b"] as object), ...b, screen: bScreen }
            yield* Effect.promise(() =>
              wait("P4b complete", (text) => text.includes("P4B_DONE") && !/esc\s+interrupt/.test(text), 90000),
            )
            delayToolChunks = 300
            yield* fixture.llm.push(parallelTools([61, 62, 63, 64].map((n) => ({ name: "bash", input: ping(n) }))))
            yield* fixture.llm.push(reply().text("P4C_DONE").stop())
            yield* Effect.promise(() => type("Run four blocking tools\r"))
            yield* Effect.promise(() =>
              wait(
                "P4 four tools",
                (text) =>
                  [61, 62, 63, 64].every((n) => text.includes(`ping -n ${n}`)) &&
                  !text.includes("Permission required") &&
                  !text.includes("Continue after repeated"),
                120000,
              ),
            )
            const cScreen = yield* Effect.promise(() => capture("P4-c"))
            delayToolChunks = 0
            const c = yield* Effect.promise(() => measureWindow("P4-c"))
            results["P4-c"] = { ...(results["P4-c"] as object), ...c, screen: cScreen }
            expectIsolated(yield* fixture.llm.inputs)
            results.isolationChecked = true
            yield* Effect.promise(save)
            return
          }
          if (selected === "P7") {
            const dbPath = `${home}/opencode.db`
            const snapRoot = `${home}/.local/share/opencode/snapshot`
            const logRoot = `${home}/.local/share/opencode/log`
            const readTarget = path.join(project, "d0", "s0", "f0.txt").replaceAll("\\", "/")
            const sizes = async () => ({
              db: (await fileBytes(dbPath)) + (await fileBytes(`${dbPath}-wal`)) + (await fileBytes(`${dbPath}-shm`)),
              wal: await fileBytes(`${dbPath}-wal`),
              snapshot: await treeBytes(snapRoot),
              log: await treeBytes(logRoot),
            })
            const gitBetween = async (start: number, end: number) =>
              (await tally(`${runDir}/git-spawn.jsonl`, start, end, "kind")).count
            const measurePhase = (kind: string, count: number, withRead: boolean) =>
              Effect.promise(async () => {
                const turns: {
                  n: number
                  dbDelta: number
                  snapshotDelta: number
                  logDelta: number
                  gitSpawns: number
                  llmMs: number
                  walEnd: number
                }[] = []
                for (let n = 1; n <= count; n++) {
                  const before = await sizes()
                  const marker = `P7_${streamVariant}_${kind}_${n}_DONE`
                  if (withRead) await Effect.runPromise(fixture.llm.tool("read", { path: readTarget }))
                  await Effect.runPromise(fixture.llm.text(marker))
                  const submitted = Date.now()
                  await type(`P7 ${kind} turn ${n}\r`)
                  await wait(
                    `P7 ${kind} ${n}`,
                    (text) => text.includes(marker) && !/esc\s+interrupt/.test(text),
                    180000,
                  )
                  const done = Date.now()
                  const after = await sizes()
                  const hit = llmHits.find((time) => time >= submitted)
                  turns.push({
                    n,
                    dbDelta: after.db - before.db,
                    snapshotDelta: after.snapshot - before.snapshot,
                    logDelta: after.log - before.log,
                    gitSpawns: await gitBetween(submitted, done),
                    llmMs: hit === undefined ? -1 : hit - submitted,
                    walEnd: after.wal,
                  })
                  console.log(`P7 ${streamVariant} ${kind} ${n}`)
                }
                return turns
              })
            const textTurns = yield* measurePhase("text", 20, false)
            const readTurns = streamVariant === "on" ? yield* measurePhase("read", 10, true) : []
            const tracked = yield* Effect.promise(async () => {
              const proc = Bun.spawn(["git", "-C", project, "ls-files"], { stdout: "pipe", stderr: "pipe" })
              const listed = await new Response(proc.stdout).text()
              await proc.exited
              return listed.split(/\r?\n/).filter(Boolean).length
            })
            results.P7 = {
              variant: streamVariant,
              snapshot: streamVariant === "on",
              trackedFiles: tracked,
              text: { turns: textTurns, summary: summarizeTurns(textTurns) },
              read: { turns: readTurns, summary: readTurns.length ? summarizeTurns(readTurns) : null },
            }
            expectIsolated(yield* fixture.llm.inputs)
            results.isolationChecked = true
            yield* Effect.promise(save)
            return
          }
          if (selected === "P6") {
            const readme = `${project}/probe-read.txt`
            yield* Effect.promise(() => Bun.write(readme, "probe read target\n".repeat(40)))
            const parent = (hit: { body: Record<string, unknown> }) =>
              JSON.stringify(hit.body).includes("Launch four subagents")
            const child = (n: number) => (hit: { body: Record<string, unknown> }) =>
              JSON.stringify(hit.body).includes(`CHILD${n} explore`)
            yield* fixture.llm.pushMatch(
              parent,
              parallelTools(
                Array.from({ length: 4 }, (_, i) => ({
                  name: "task",
                  input: {
                    description: `Child ${i + 1} work`,
                    prompt: `CHILD${i + 1} explore the project with glob and read over a minute`,
                    subagent_type: "explore",
                  },
                })),
              ),
            )
            for (let n = 1; n <= 4; n++) {
              yield* fixture.llm.pushMatch(
                child(n),
                reply().wait(later(12000)).tool("glob", { pattern: "*", limit: 20 }),
              )
              yield* fixture.llm.pushMatch(child(n), reply().wait(later(12000)).tool("read", { path: readme }))
              yield* fixture.llm.pushMatch(
                child(n),
                reply().wait(later(12000)).tool("glob", { pattern: "*.txt", limit: 20 }),
              )
              yield* fixture.llm.pushMatch(child(n), reply().wait(later(12000)).tool("read", { path: readme }))
              yield* fixture.llm.pushMatch(child(n), reply().wait(later(12000)).text(`CHILD${n}_DONE`).stop())
            }
            yield* fixture.llm.pushMatch(parent, reply().text("P6_TASKS_DONE").stop())
            yield* Effect.promise(() => type("Launch four subagents in parallel\r"))
            yield* Effect.promise(() => wait("P6 busy", (text) => /esc\s+interrupt/.test(text), 120000))
            let complete = false
            const start = Date.now()
            const completion = wait(
              "P6 tasks done",
              (text) => text.includes("P6_TASKS_DONE") && !/esc\s+interrupt/.test(text),
              180000,
            ).then(() => {
              complete = true
            })
            yield* Effect.promise(() => sample("P6", 90000, () => complete))
            yield* Effect.promise(() => completion.catch(() => undefined))
            const end = Date.now()
            const wanted = [
              "message.updated",
              "message.part.updated",
              "message.part.delta",
              "session.updated",
              "session.status",
            ]
            const events = yield* Effect.promise(() => tally(`${runDir}/sse-events.jsonl`, start, end, "type"))
            results.P6 = {
              ...(results.P6 as object),
              wallSeconds: (end - start) / 1000,
              complete,
              eventsPerSec: Object.fromEntries(
                wanted.map((type) => [type, (events.by[type] ?? 0) / Math.max(0.001, (end - start) / 1000)]),
              ),
              events,
            }
            expectIsolated(yield* fixture.llm.inputs)
            results.isolationChecked = true
            yield* Effect.promise(save)
            return
          }
          if (selected === "M6") return
          if (selected !== "M4") {
            for (let n = 1; n <= 10; n++) yield* Effect.promise(() => turn(n))
            const idleScreen = yield* Effect.promise(screen)
            yield* Effect.promise(() => Bun.write(`${runDir}/session-screen.txt`, idleScreen))
            if (!idleScreen.split("\n").some((line) => line.slice(118).trim())) throw new Error("Sidebar not visible")
          }
          if (selected === "all" || selected === "M1") yield* Effect.promise(() => sample("M1", 60000))
          if (selected === "all" || selected === "M2") {
            const release = Promise.withResolvers<void>()
            yield* fixture.llm.push(reply().wait(release.promise).text("BUSY_RELEASED").stop())
            yield* Effect.promise(() => type("Hold this stream open\r"))
            yield* Effect.promise(() => wait("busy", (text) => /esc\s+interrupt/.test(text)))
            yield* Effect.promise(() => sample("M2", 60000))
            release.resolve()
            yield* Effect.promise(() =>
              wait("busy complete", (text) => text.includes("BUSY_RELEASED") && !/esc\s+interrupt/.test(text)),
            )
          }
          if (selected === "all" || selected === "M3") {
            const markdown =
              "## Performance section\n\nSome markdown text with **bold** and `inline code`.\n\n```typescript\nconst value = 42\nconsole.log(value)\n```\n\n"
                .repeat(1600)
                .slice(0, 200000) + "\nPERF_STREAM_DONE\n"
            const response = reply()
            for (let i = 0; i < markdown.length; i += 400) response.text(markdown.slice(i, i + 400))
            yield* fixture.llm.push(response.stop())
            paced = true
            const start = Date.now()
            yield* Effect.promise(() => type("Stream the large markdown reply\r"))
            let complete = false
            let completedAt = 0
            const completion = wait(
              "stream complete",
              (text) => text.includes("PERF_STREAM_DONE") && !/esc\s+interrupt/.test(text),
              180000,
            ).then(() => {
              completedAt = Date.now()
              complete = true
            })
            yield* Effect.promise(() => sample("M3", 180000, () => complete))
            yield* Effect.promise(() => completion)
            results.streaming = {
              bytes: Buffer.byteLength(markdown),
              chunks: sentChunks,
              chunkRate: (sentChunks - 1) / ((lastChunk - firstChunk) / 1000),
              wallSeconds: (completedAt - start) / 1000,
              firstChunk,
              lastChunk,
            }
            paced = false
            yield* Effect.promise(save)
          }
          if (selected === "all" || selected === "M4") {
            if (selected === "all") {
              yield* Effect.promise(() => slash("new"))
              yield* Effect.promise(() => wait("fresh growth session", (text) => text.includes("Ask anything")))
            }
            const growth: unknown[] = []
            const start = Date.now()
            let growthComplete = false
            const sampling = sample("M4", 600000, () => growthComplete)
            for (let n = 1; n <= 150; n++) {
              yield* Effect.promise(() => turn(n))
              if (n % 25 === 0) {
                growth.push({ turns: n, processes: yield* Effect.promise(snapshot) })
                results.growth = growth
                yield* Effect.promise(save)
                console.log(`M4 ${n} turns`)
              }
            }
            growthComplete = true
            yield* Effect.promise(() => sampling)
            results.M4Growth = { wallSeconds: (Date.now() - start) / 1000, growth }
          }
          expectIsolated(yield* fixture.llm.inputs)
          results.isolationChecked = true
          results.M5 = "Skipped optional metric"
          yield* Effect.promise(save)
        }),
      selected === "P7" ? 1200000 : 900000,
    )
})
