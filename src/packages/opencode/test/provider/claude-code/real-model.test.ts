// claudeTestFlow.md (repo root) against the real Claude model: one chat through steps 0-8, the
// way the user runs it by hand. Opt-in only, it spends real tokens. Run from a plain PowerShell
// (not inside a Claude session, whose CLAUDE_* variables would reach the child):
//   $env:OC_REAL_MODEL = "1"; $env:CLAUDE_CODE_OAUTH_TOKEN = "<from `claude setup-token`>"
//   bun test test/provider/claude-code/real-model.test.ts
// (.scripts\claudeRealFlow.ps1 checks the token first and does this.)
// OC_REAL_MODEL_ID picks the model (default claude-sonnet-5-5), OC_REAL_SWITCH_MODEL_ID the step 7
// model (default claude-haiku-5-5). OC_REAL_ONLY=7 runs just step 7 after a one-turn setup and a
// restart, for a few cents. Checks are soft: each lands in claudeFlowReport-<time>.md at the repo
// root with tokens, cost, and oddities. Only harness failures (a timeout, a dead server) and a
// usage-limit or login refusal, which stops the run, fail the test. Strict asserts live in
// fake-model.test.ts. Step 1 leaves out the flow's skill and MCP items: the isolated home has neither.
import { describe } from "bun:test"
import path from "node:path"
import { Deferred, Effect, Fiber } from "effect"
import { cliIt } from "../../lib/cli-process"
import { pollWithTimeout } from "../../lib/effect"
import { openChat, outsideProfile } from "./chat-fixture"
import { childrenSince, flowReport, ownSince, stepRunner, texts, toolSummary, tools, usage } from "./flowReport"

const enabled = process.env.OC_REAL_MODEL === "1"
const only7 = process.env.OC_REAL_ONLY === "7"
const cliPath = process.env.CLAUDE_CLI_PATH ?? Bun.which("claude")
const modelID = process.env.OC_REAL_MODEL_ID ?? "claude-sonnet-5-5"
const switchModelID = process.env.OC_REAL_SWITCH_MODEL_ID ?? "claude-haiku-5-5"
const repoRoot = path.resolve(import.meta.dir, "../../../../../..")
const RULE = "Build test inputs from what the real caller sends. A test that uses a shape production never sends proves nothing."

describe.skipIf(!enabled || !cliPath || !only7)("Claude Code provider against the real model, step 7 only", () => {
  cliIt.live(
    "claudeTestFlow step 7 writes a report",
    (fixture) =>
      Effect.gen(function* () {
        requireRealAuth()
        const report = yield* reportOnExit()
        const root = yield* outsideProfile
        yield* Effect.promise(() => seedProject(root))
        yield* Effect.promise(() => Bun.write(path.join(root, "work", "ocToolCheck.txt"), "hello from claude, edited\n"))
        const chat = yield* openChat(fixture, { root, real: true, modelID })
        const step = stepRunner(report)
        yield* step("6 setup", chat, (_since, prompt) =>
          prompt("Remember for later: the codeword is PELICAN-77. Reply with just: noted").pipe(Effect.asVoid),
        )
        chat.server.kill()
        yield* Effect.promise(() => chat.server.exited)
        const resumed = yield* openChat(fixture, { root, real: true, modelID, resume: chat.sessionID })
        yield* switchModelStep(step, report, resumed)
      }),
    15 * 60_000,
  )
})

describe.skipIf(!enabled || !cliPath || only7)("Claude Code provider against the real model", () => {
  cliIt.live(
    "claudeTestFlow steps 0-8 write a report",
    (fixture) =>
      Effect.gen(function* () {
        requireRealAuth()
        const report = yield* reportOnExit()
        const root = yield* outsideProfile
        yield* Effect.promise(() => seedProject(root))
        const chat = yield* openChat(fixture, { root, real: true, modelID })
        const step = stepRunner(report)

        yield* step("0 instructions", chat, (since, prompt) =>
          Effect.gen(function* () {
            yield* prompt("Without reading any files, quote the rule in your instructions about test inputs and the real caller.")
            const turn = yield* ownSince(chat, since)
            report.check("quotes the CLAUDE.md rule", texts(turn).includes("real caller"), texts(turn))
            report.check("no tool rows", tools(turn).length === 0, tools(turn).join(", "))
          }),
        )

        yield* step("1 tools", chat, (since, prompt) =>
          Effect.gen(function* () {
            const done = yield* Deferred.make<void>()
            const turn = yield* prompt(STEP_1).pipe(Effect.ensuring(Deferred.succeed(done, undefined)), Effect.forkScoped)
            const question = yield* pollWithTimeout(
              Effect.gen(function* () {
                const pending = (yield* Effect.promise(() => chat.sdk.question.list())).data?.at(0)
                if (pending) return pending
                return (yield* Deferred.isDone(done)) ? null : undefined
              }),
              "step 1 never asked or finished",
              "10 minutes",
            )
            if (question) yield* Effect.promise(() => chat.sdk.question.reply({ requestID: question.id, answers: [["No"]] }))
            yield* Fiber.join(turn)
            const messages = yield* ownSince(chat, since)
            const file = Bun.file(path.join(chat.project, "ocToolCheck.txt"))
            const content = (yield* Effect.promise(() => file.exists())) ? yield* Effect.promise(() => file.text()) : "(missing)"
            report.check("question form answered No", question !== null, question?.questions[0]?.question ?? "no question")
            report.check("ocToolCheck.txt edited", content.trim() === "hello from claude, edited", content)
            report.check("native tool rows", ["read", "bash"].every((tool) => tools(messages).includes(tool)), tools(messages).join(", "))
            const todos = (yield* Effect.promise(() => chat.sdk.session.todo({ sessionID: chat.sessionID }))).data ?? []
            report.check("todo list mirrored", todos.length > 0, todos.map((todo) => `${todo.status}: ${todo.content}`).join("; "))
          }),
        )

        yield* step("2 subagents", chat, (since, prompt) =>
          Effect.gen(function* () {
            yield* prompt(
              "What's the codeword? Then run two explore subagents at the same time: one counts .ps1 files in this repo, one counts .md files.",
            )
            const answer = texts(yield* ownSince(chat, since))
            report.check("codeword", answer.includes("PELICAN-77"), answer)
            const children = yield* childrenSince(chat, since)
            report.check("two subagents", children.length === 2, `${children.length} child sessions`)
            const spans = children.map((messages) => [
              Math.min(...messages.map((message) => message.info.time.created)),
              Math.max(...messages.map((message) => (message.info.role === "assistant" && message.info.time.completed) || 0)),
            ])
            const overlap = spans.length === 2 && Math.max(spans[0][0], spans[1][0]) < Math.min(spans[0][1], spans[1][1])
            report.check("subagents overlapped", overlap, JSON.stringify(spans.map(([start, end]) => [start - since, end - since])))
          }),
        )

        yield* step("3 interrupt", chat, (since, prompt) =>
          Effect.gen(function* () {
            const done = yield* Deferred.make<void>()
            const turn = yield* prompt("Read every file in the repo one at a time and summarize each.")
              .pipe(Effect.ensuring(Deferred.succeed(done, undefined)), Effect.forkScoped)
            const reached = yield* pollWithTimeout(
              Effect.gen(function* () {
                if (tools(yield* ownSince(chat, since)).length >= 2) return true
                return (yield* Deferred.isDone(done)) ? false : undefined
              }),
              "step 3 never ran two tools",
              "5 minutes",
            )
            yield* Effect.promise(() => chat.sdk.session.abort({ sessionID: chat.sessionID }))
            yield* Fiber.join(turn)
            report.check("aborted after two tool rows", reached, reached ? "" : "turn finished before two tools")
            const after = Date.now()
            yield* prompt("Ignore that. What's the codeword?")
            const messages = yield* ownSince(chat, since)
            const aborted = messages.some((message) => message.info.role === "assistant" && message.info.error?.name === "MessageAbortedError")
            report.check("turn shows interrupted", aborted, "")
            const answer = texts(yield* ownSince(chat, after))
            report.check("codeword after interrupt", answer.includes("PELICAN-77"), answer)
            report.check("no leftover summary", answer.length < 400, `${answer.length} chars`)
          }),
        )

        yield* step("4 compact", chat, (since, prompt, accept) =>
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              chat.sdk.session.summarize({ sessionID: chat.sessionID, providerID: "claude-code", modelID }),
            )
            const summary = (yield* ownSince(chat, since)).find((message) => message.info.role === "assistant" && message.info.summary)
            if (summary) yield* accept(summary)
            const summaryText = texts(summary ? [summary] : [])
            const failed = (summary?.info.role === "assistant" && summary.info.error) || summaryText.startsWith("Error during compaction")
            report.check("Claude Code summary under Compacted", summaryText.length > 0 && !failed, summaryText.slice(0, 200))
            const after = Date.now()
            yield* prompt("What's the codeword, and what does ocToolCheck.txt say right now?")
            const answer = texts(yield* ownSince(chat, after))
            report.check("codeword and file after compact", answer.includes("PELICAN-77") && answer.includes("hello from claude, edited"), answer)
          }),
        )

        yield* step("5 revert", chat, (since, prompt) =>
          Effect.gen(function* () {
            const reverted = yield* prompt("The new codeword is OSPREY-12.")
            yield* Effect.promise(() =>
              chat.sdk.session.revert({ sessionID: chat.sessionID, messageID: reverted.data!.info.parentID }),
            )
            const after = Date.now()
            yield* prompt(
              `What's the codeword? Then make a todo list with two items, "check revert" and "check todos", and mark the first one done.`,
            )
            const answer = texts(yield* ownSince(chat, after))
            report.check("codeword is PELICAN-77 again", answer.includes("PELICAN-77") && !answer.includes("OSPREY-12"), answer)
            const todos = (yield* Effect.promise(() => chat.sdk.session.todo({ sessionID: chat.sessionID }))).data ?? []
            const status = (name: string) => todos.find((todo) => todo.content.toLowerCase().includes(name))?.status
            report.check(
              "todos after rewind",
              status("check revert") === "completed" && status("check todos") === "pending",
              todos.map((todo) => `${todo.status}: ${todo.content}`).join("; "),
            )
            report.check("rewound notice", JSON.stringify(yield* ownSince(chat, since)).includes("Claude conversation rewound"), "optional")
          }),
        )

        chat.server.kill()
        yield* Effect.promise(() => chat.server.exited)
        const resumed = yield* openChat(fixture, { root, real: true, modelID, resume: chat.sessionID })

        yield* step("6 restart", resumed, (since, prompt) =>
          Effect.gen(function* () {
            yield* prompt("Codeword?")
            const answer = texts(yield* ownSince(resumed, since))
            report.check("codeword after restart", answer.includes("PELICAN-77"), answer)
          }),
        )

        yield* switchModelStep(step, report, resumed)

        yield* step("8 cache", resumed, (since, prompt) =>
          Effect.gen(function* () {
            yield* prompt("Codeword?")
            const second = Date.now()
            yield* prompt("Codeword?")
            const first = usage(yield* ownSince(resumed, since).pipe(Effect.map((all) => all.filter((message) => message.info.time.created < second))))
            const repeat = usage(yield* ownSince(resumed, second))
            report.check("codeword twice", texts(yield* ownSince(resumed, since)).split("PELICAN-77").length > 2, "")
            report.check(
              "second turn reads from cache",
              repeat.cacheRead > 0 && repeat.cacheWrite < repeat.cacheRead,
              `first: read ${first.cacheRead} write ${first.cacheWrite}; second: read ${repeat.cacheRead} write ${repeat.cacheWrite}`,
            )
          }),
        )
      }),
    60 * 60_000,
  )
})

const STEP_1 = `Remember for later: the codeword is PELICAN-77.

Now do these in order, in one turn, and keep each result short:
1. List the top-level files here, then read the first 10 lines of README.md.
2. Search the repo for "TODO" and tell me how many files contain it.
3. Create ocToolCheck.txt with the line "hello from claude", then edit it to say "hello from claude, edited".
4. Run a shell command that prints the current directory and the PowerShell version.
5. Keep a todo list of these 6 steps and update it as you go.
6. Ask me a multiple-choice question: "Should I delete ocToolCheck.txt?" with options Yes and No, and do what I pick.

At the end, list which tool you used for each step.`

// A report written to the repo root when the scope closes, however the run ends.
const reportOnExit = () =>
  Effect.gen(function* () {
    const report = flowReport({ modelID, switchModelID })
    yield* Effect.addFinalizer(() => Effect.promise(() => {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")
      return report.write(path.join(repoRoot, `claudeFlowReport-${stamp}.md`))
    }))
    return report
  })

// Step 7, after a restart: a new model keeps the conversation and can still use tools. The
// deletion detail names each tool call, so a model claim without a working tool shows.
const switchModelStep = (
  step: ReturnType<typeof stepRunner>,
  report: ReturnType<typeof flowReport>,
  chat: Parameters<typeof ownSince>[0],
) =>
  step("7 switch model", chat, (since, prompt) =>
    Effect.gen(function* () {
      // A fresh BunFile per check: one BunFile caches its exists() answer (Bun 1.4.1), which made
      // a real deletion read as "present" in reports 202610080413 through 202610080455.
      const exists = Effect.promise(() => Bun.file(path.join(chat.project, "ocToolCheck.txt")).exists())
      const existed = yield* exists
      yield* prompt("Still remember the codeword? Also delete ocToolCheck.txt.", { modelID: switchModelID })
      const turn = yield* ownSince(chat, since)
      const answer = texts(turn)
      report.check(`codeword on ${switchModelID}`, answer.includes("PELICAN-77"), answer)
      const gone = !(yield* exists)
      report.check(
        "ocToolCheck.txt deleted",
        existed && gone,
        `before: ${existed ? "present" : "missing"}, after: ${gone ? "gone" : "present"}; tools: ${toolSummary(turn) || "none"}`,
      )
      if (gone) return
      // The CLI's own record of each tool result (its transcript in CLAUDE_CONFIG_DIR, next to the
      // project), which carries more than oc's tool row.
      const transcripts = path.join(chat.project, "..", "claude", "projects")
      for (const result of yield* Effect.promise(() => cliToolResults(transcripts, since)))
        report.oddity(`cli tool result: ${result}`)
    }),
  )

async function cliToolResults(dir: string, since: number) {
  const files = await Array.fromAsync(new Bun.Glob("**/*.jsonl").scan({ cwd: dir, absolute: true }))
  const lines = (await Promise.all(files.map((file) => Bun.file(file).text()))).flatMap((text) => text.split("\n"))
  return lines.flatMap((line) => {
    if (!line.includes('"toolUseResult"')) return []
    const entry = JSON.parse(line) as { timestamp?: string; toolUseResult?: unknown }
    return entry.timestamp && Date.parse(entry.timestamp) >= since ? [JSON.stringify(entry.toolUseResult).slice(0, 500)] : []
  })
}

// The flow's CLAUDE.md rule (user level, through CLAUDE_CONFIG_DIR) and a small repo for the
// tool steps to list, grep, and read.
async function seedProject(root: string) {
  const work = path.join(root, "work")
  await Promise.all([
    Bun.write(path.join(root, "claude", "CLAUDE.md"), `# Rules\n\n- ${RULE}\n`),
    Bun.write(path.join(work, "README.md"), Array.from({ length: 15 }, (_, line) => `README line ${line + 1}`).join("\n")),
    Bun.write(path.join(work, "notes.md"), "TODO: write more notes\n"),
    Bun.write(path.join(work, "build.ps1"), "# TODO: real build\nWrite-Output 'build'\n"),
    Bun.write(path.join(work, "check.ps1"), "Write-Output 'check'\n"),
  ])
}

// The setup token keeps the run off the real ~/.claude login. A base URL or API key from the
// shell would send the run somewhere else or bill it differently.
function requireRealAuth() {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) throw new Error("set CLAUDE_CODE_OAUTH_TOKEN (claude setup-token) first")
  const stray = ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"].filter((key) => process.env[key])
  if (stray.length) throw new Error(`unset ${stray.join(", ")} before a real-model run`)
}
