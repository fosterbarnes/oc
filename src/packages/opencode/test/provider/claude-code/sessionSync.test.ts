import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { LanguageModelV3CallOptions, LanguageModelV3Prompt } from "@ai-sdk/provider"
import { Global } from "@opencode-ai/core/global"
import { createClaudeCode } from "@/provider/claude-code/index.js"
import {
  deleteActiveProcessAndWait,
  deleteClaudeSessionId,
  forkClaudeSessions,
  getClaudeSessionId,
  markClaudeSessionLost,
  MAX_CLAUDE_SESSION_ENTRIES,
  sessionKey,
} from "@/provider/claude-code/sessionManager.js"
import { appendExchangeText, currentExchangeHash, forgetSessionExchanges } from "@/provider/claude-code/sessionSync.js"

// Fake CLI: resumes the id it is given (a new one on fork), numbers its
// assistant uuids per process, and logs every argv so tests can read spawns.
const FAKE_CLI = `#!/usr/bin/env node
const fs = require("node:fs")
const path = require("node:path")
const readline = require("node:readline")
const argv = process.argv.slice(2)
if (argv.includes("--version")) { console.log("2.1.285"); process.exit(0) }
fs.appendFileSync(path.join(process.cwd(), "args.log"), JSON.stringify(argv) + "\\n")
const resume = argv[argv.indexOf("--resume") + 1]
const base = argv.includes("--resume") ? resume : "s-" + process.pid
const sid = argv.includes("--fork-session") ? "fork-" + process.pid : base
let n = 0
const emit = (message) => console.log(JSON.stringify(message))
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (JSON.parse(line).type !== "user") return
  n++
  emit({ type: "system", subtype: "init", session_id: sid })
  emit({ type: "assistant", session_id: sid, uuid: sid + "-a" + n, message: {
    role: "assistant", stop_reason: "end_turn",
    content: [{ type: "text", text: "answer " + n + " effort " + process.env.CLAUDE_CODE_EFFORT_LEVEL }],
  } })
  emit({ type: "result", subtype: "success", session_id: sid, is_error: false,
    usage: { input_tokens: 1, output_tokens: 1 } })
})
`

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  // Newest first, so a fork's process exits before its origin removes the shared cwd.
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

// `sharedCwd` puts a second chat (a fork) in the first one's project, which removes it.
function fixture(conversation: string, sharedCwd?: string) {
  const cwd = sharedCwd ?? mkdtempSync(path.join(tmpdir(), "opencode-session-sync-"))
  const cliPath = path.join(cwd, "fake-claude.cjs")
  writeFileSync(cliPath, FAKE_CLI, { mode: 0o755 })
  const provider = createClaudeCode({
    cwd,
    cliPath,
    proxyTools: [],
    autoContinueIncompleteTurns: false,
    turnStats: false,
  })
  const key = sessionKey(cwd, `tools::${conversation}::context=${JSON.stringify(["claude-code"])}`)
  cleanups.push(async () => {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
    if (!sharedCwd) rmSync(cwd, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  })

  async function send(prompt: LanguageModelV3Prompt, effort = "high") {
    const options: LanguageModelV3CallOptions = {
      prompt,
      tools: [{ type: "function", name: "read", inputSchema: { type: "object" } }],
      providerOptions: {
        "claude-code": { opencodeSessionID: conversation, opencodeAgent: "build", reasoningEffort: effort },
      },
    }
    const response = await provider.languageModel("claude-haiku-4-5").doStream(options)
    const reader = response.stream.getReader()
    let text = ""
    while (true) {
      const next = await reader.read()
      if (next.done) return text
      if (next.value.type === "error") throw next.value.error
      if (next.value.type === "text-delta") text += next.value.delta
    }
  }

  const spawns = () =>
    readFileSync(path.join(cwd, "args.log"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[])

  return { cwd, key, send, spawns }
}

const user = (text: string) => ({ role: "user" as const, content: [{ type: "text" as const, text }] })
const assistant = (text: string) => ({ role: "assistant" as const, content: [{ type: "text" as const, text }] })

test("an effort change resumes the same conversation in a new process", async () => {
  const chat = fixture("effort-change")
  const first = await chat.send([user("first")], "high")
  const sessionId = getClaudeSessionId(chat.key) ?? ""
  expect(sessionId).not.toBe("")
  const second = await chat.send([user("first"), assistant(first), user("second")], "low")
  expect(second).toContain("effort low")
  expect(getClaudeSessionId(chat.key)).toBe(sessionId)
  const spawns = chat.spawns()
  expect(spawns).toHaveLength(2)
  expect(spawns[1]).toContain("--resume")
  expect(spawns[1][spawns[1].indexOf("--resume") + 1]).toBe(sessionId)
  expect(spawns[1]).not.toContain("--resume-session-at")
})

test("a reverted exchange rewinds the CLI to the last shared one", async () => {
  const chat = fixture("revert")
  const first = await chat.send([user("first")])
  const sessionId = getClaudeSessionId(chat.key) ?? ""
  expect(sessionId).not.toBe("")
  const second = await chat.send([user("first"), assistant(first), user("second")])
  expect(second).not.toContain("rewound")
  expect(chat.spawns()).toHaveLength(1)
  const third = await chat.send([user("first"), assistant(first), user("third")])
  expect(third).toContain("Claude conversation rewound")
  const rewind = chat.spawns()[1]
  expect(rewind[rewind.indexOf("--resume") + 1]).toBe(sessionId)
  expect(rewind[rewind.indexOf("--resume-session-at") + 1]).toBe(`${sessionId}-a1`)
  expect(rewind).toContain("--fork-session")
})

test("a full fork branches the Claude conversation and the original keeps its own", async () => {
  const origin = fixture("fork-origin")
  const first = await origin.send([user("first")])
  const second = await origin.send([user("first"), assistant(first), user("second")])
  const sessionId = getClaudeSessionId(origin.key) ?? ""
  forkClaudeSessions("fork-origin", "fork-full")
  const fork = fixture("fork-full", origin.cwd)
  const history = [user("first"), assistant(first), user("second"), assistant(second)]

  const reply = await fork.send([...history, user("in fork")])
  expect(reply).not.toContain("Claude conversation lost")
  const spawn = fork.spawns().at(-1)!
  expect(spawn[spawn.indexOf("--resume") + 1]).toBe(sessionId)
  expect(spawn).toContain("--fork-session")
  expect(spawn).not.toContain("--resume-session-at")
  expect(getClaudeSessionId(fork.key)).toStartWith("fork-")

  // The original resumes its own transcript, never a branch.
  await deleteActiveProcessAndWait(origin.key)
  await origin.send([...history, user("in origin")])
  const resumed = origin.spawns().at(-1)!
  expect(resumed[resumed.indexOf("--resume") + 1]).toBe(sessionId)
  expect(resumed).not.toContain("--fork-session")
  expect(getClaudeSessionId(origin.key)).toBe(sessionId)
})

test("a fork from an earlier message rewinds its branch to the fork point", async () => {
  const origin = fixture("fork-partial-origin")
  const first = await origin.send([user("first")])
  await origin.send([user("first"), assistant(first), user("second")])
  const sessionId = getClaudeSessionId(origin.key) ?? ""
  forkClaudeSessions("fork-partial-origin", "fork-partial")
  const fork = fixture("fork-partial", origin.cwd)

  await fork.send([user("first"), assistant(first), user("instead")])
  const spawn = fork.spawns().at(-1)!
  expect(spawn[spawn.indexOf("--resume") + 1]).toBe(sessionId)
  expect(spawn[spawn.indexOf("--resume-session-at") + 1]).toBe(`${sessionId}-a1`)
  expect(spawn).toContain("--fork-session")
})

test("a lost conversation is announced and never resumed silently", async () => {
  const chat = fixture("lost")
  const first = await chat.send([user("first")])
  // Real losses come with the process already gone (exit, crash, eviction).
  await deleteActiveProcessAndWait(chat.key)
  markClaudeSessionLost(chat.key, "test loss")
  const second = await chat.send([user("first"), assistant(first), user("second")])
  expect(second).toContain("Claude conversation lost:** test loss")
  expect(chat.spawns()[1]).not.toContain("--resume")
})

test("conversations are saved to the data dir", async () => {
  const chat = fixture("persist")
  await chat.send([user("first")])
  const saved = JSON.parse(readFileSync(path.join(Global.Path.data, "claude-code", "sessions.json"), "utf8"))
  expect(saved[chat.key].sessionId).toBe(getClaudeSessionId(chat.key))
  expect(saved[chat.key].anchors).toHaveLength(1)
})

// Same key shape the provider builds: `<cwd>::<scope>::<session>::context=[...]`.
const exchangeKey = (session: string) => sessionKey("C:/project", `tools::${session}::context=["claude-code"]`)
const emptyExchange = () => currentExchangeHash(exchangeKey("ses_exchange_never_used"))

test("a deleted session's exchanges are forgotten and other sessions keep theirs", () => {
  const deleted = exchangeKey("ses_exchange_deleted")
  const kept = exchangeKey("ses_exchange_kept")
  appendExchangeText(deleted, "reply")
  appendExchangeText(kept, "reply")
  const keptHash = currentExchangeHash(kept)
  expect(currentExchangeHash(deleted)).not.toBe(emptyExchange())

  forgetSessionExchanges("ses_exchange_deleted")

  expect(currentExchangeHash(deleted)).toBe(emptyExchange())
  expect(currentExchangeHash(kept)).toBe(keptHash)
})

test("exchanges are capped like the conversation records", () => {
  const keys = Array.from({ length: MAX_CLAUDE_SESSION_ENTRIES + 1 }, (_, index) =>
    exchangeKey(`ses_exchange_${index}`),
  )
  for (const key of keys) appendExchangeText(key, "reply")

  expect(currentExchangeHash(keys[0])).toBe(emptyExchange())
  expect(currentExchangeHash(keys.at(-1)!)).not.toBe(emptyExchange())
})
