// @ts-nocheck
// WIP: ported from opencode-claude-code-plugin, which never typechecked its tests; type them as Phase 3 rewrites land.
/**
 * Process lifetime as opencode sees it, and the events that end a proxied
 * call. The plugin listens to the `claude` process, the stream and the
 * protocol instead of inferring failure from elapsed time, so a `task` call
 * has no deadline; these tests pin the events that release a call instead,
 * and for each one they check BOTH registries a call lives in: the proxy
 * server's open HTTP request (`pendingCallIds`) and the broker's entry
 * (`getPendingProxyCalls`). With no deadline, an entry either of those
 * forgets to drop would be permanent.
 *
 *   - the next user message in the chat (a call the previous turn left
 *     pending is orphaned, and the CLI is told so),
 *   - an abort, after content and while opencode is running the tool
 *     (the CLI is interrupted and its parked request is answered),
 *   - the child exiting, mid-turn or between turns,
 *   - the session being deleted in opencode,
 *   - opencode itself exiting (`test-session-manager.ts`, `killAllActiveProcesses`).
 *
 * A normal result completing a call is pinned in `test-proxy-task.ts`, and
 * the late-result recovery for a CLI that hung up on its own request in the
 * same file; nothing here changes either.
 *
 * Usage:
 *   npx tsx --test test-process-lifecycle.ts
 */
import assert from "node:assert/strict"
import { test } from "node:test"
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { EventEmitter } from "node:events"
import type { ChildProcess } from "node:child_process"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"

import { claudeCodeServer, createClaudeCode, extractDeletedSessionId } from "@/provider/claude-code/index.js"
import {
  createProxyMcpServer,
  SERVER_CLOSED_MESSAGE,
  type ProxyMcpServer,
  type ProxyToolCall,
} from "@/provider/claude-code/proxy-mcp.js"
import { DEFAULT_PROXY_TOOLS } from "@/provider/claude-code/proxy-tool-defs.js"
import { _setProxyDeadlineRecheckMs } from "@/provider/claude-code/proxy-deadline.js"
import { getPendingProxyCalls, onPendingProxyCall, queuePendingProxyCall } from "@/provider/claude-code/proxy-broker.js"
import { setOpencodeClient } from "@/provider/claude-code/runtime-status.js"
import {
  deleteActiveProcess,
  deleteActiveProcessAndWait,
  deleteClaudeSessionId,
  getActiveProcess,
  getClaudeSessionId,
  isIdleProcessEvictionScheduled,
  isTurnInFlight,
  sessionKey,
  setActiveProcess,
  setClaudeSessionId,
  hasActiveProcess,
  type ActiveProcess,
} from "@/provider/claude-code/session-manager.js"

test("extractDeletedSessionId reads the deleted session's own record and nothing else", () => {
  const deleted = { type: "session.deleted", properties: { info: { id: "ses_gone" } } }
  assert.equal(extractDeletedSessionId(deleted), "ses_gone")
  // opencode wraps the bus payload; both shapes are accepted.
  assert.equal(extractDeletedSessionId({ payload: deleted }), "ses_gone")
  assert.equal(extractDeletedSessionId({ type: "session.updated", properties: { info: { id: "ses_x" } } }), undefined)
  assert.equal(extractDeletedSessionId({ type: "session.deleted", properties: { sessionID: "ses_x" } }), undefined)
  assert.equal(extractDeletedSessionId({ type: "session.deleted", properties: { info: { id: "" } } }), undefined)
  assert.equal(extractDeletedSessionId(undefined), undefined)
})

function fakeProcess(onKill: () => void, opencodeSessionID?: string): ActiveProcess {
  const proc = new EventEmitter() as ChildProcess
  Object.assign(proc, {
    exitCode: null,
    signalCode: null,
    kill() {
      onKill()
      Object.defineProperty(proc, "exitCode", { configurable: true, value: 0 })
      proc.emit("exit", 0, null)
      return true
    },
  })
  return { proc, lineEmitter: new EventEmitter(), proxyServer: null, opencodeSessionID }
}

const TASK_INPUT = { description: "Check the flow", prompt: "Verify it.", subagent_type: "general" }

/** A real `tools/call` for `task`, authenticated, that stays open until released. */
function parkTaskRequest(server: ProxyMcpServer): Promise<any> {
  return fetch(server.url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${server.authToken}` },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "parked", method: "tools/call",
      params: { name: "task", arguments: TASK_INPUT },
    }),
  }).then((response) => response.json())
}

test("the event hook releases a deleted session's processes and parked calls, and leaves every other session alone", async () => {
  const hooks = await claudeCodeServer({ directory: process.cwd() })
  assert.ok(hooks.event, "the plugin subscribes to bus events")
  const stamp = Date.now()
  const cwd = `/tmp/lifecycle-${stamp}`
  const keyFor = (session: string) =>
    sessionKey(cwd, `tools::${session}::context=["claude-code"]`)
  const killed: string[] = []
  const gone = keyFor("ses_gone")
  const kept = keyFor("ses_kept")
  const shared = keyFor("default")
  // The deleted chat's CLI is parked in a real `task` request on a real
  // proxy server, wired to the broker the way the language model wires it.
  const server = await createProxyMcpServer(DEFAULT_PROXY_TOOLS.filter((t) => t.name === "task"))
  server.calls.on("call", (call: ProxyToolCall) => queuePendingProxyCall(gone, call))
  const goneProcess = fakeProcess(() => killed.push(gone), "ses_gone")
  goneProcess.proxyServer = server
  setActiveProcess(gone, goneProcess)
  setActiveProcess(kept, fakeProcess(() => killed.push(kept), "ses_kept"))
  setActiveProcess(shared, fakeProcess(() => killed.push(shared)))
  setClaudeSessionId(gone, "claude-gone")
  setClaudeSessionId(kept, "claude-kept")
  const queued = new Promise<void>((resolve) => server.calls.once("call", () => resolve()))
  const request = parkTaskRequest(server)
  await queued
  assert.equal(server.pendingCallIds().length, 1)
  assert.equal(getPendingProxyCalls(gone).length, 1)
  try {
    await hooks.event!({ event: { type: "session.updated", properties: { info: { id: "ses_gone" } } } })
    assert.deepEqual(killed, [], "only a deletion releases anything")
    assert.equal(server.pendingCallIds().length, 1)

    await hooks.event!({ event: { type: "session.deleted", properties: { info: { id: "ses_gone" } } } })
    assert.deepEqual(killed, [gone])
    assert.equal(getActiveProcess(gone), undefined)
    assert.equal(getClaudeSessionId(gone), undefined, "a deleted session never resumes")
    assert.equal(getPendingProxyCalls(gone).length, 0, "broker entry released")
    const answer = await request
    assert.equal(answer.result.isError, true)
    assert.equal(answer.result.content[0].text, SERVER_CLOSED_MESSAGE)
    assert.deepEqual(server.pendingCallIds(), [], "HTTP entry released")
    assert.ok(getActiveProcess(kept))
    assert.equal(getClaudeSessionId(kept), "claude-kept")
    assert.ok(getActiveProcess(shared), "the shared default bucket is never matched")

    // The session id "default" is the fallback affinity, not a session.
    await hooks.event!({ event: { type: "session.deleted", properties: { info: { id: "default" } } } })
    assert.ok(getActiveProcess(shared))
  } finally {
    for (const key of [gone, kept, shared]) {
      deleteActiveProcess(key)
      deleteClaudeSessionId(key)
    }
    await server.close()
  }
})

/** A stand-in headless `claude` that answers one turn and stays alive. */
function fakeAnsweringCli(): { cwd: string; cliPath: string } {
  const cwd = mkdtempSync(join(tmpdir(), "opencode-lifecycle-"))
  const cliPath = join(cwd, "fake-claude.cjs")
  writeFileSync(
    cliPath,
    `#!/usr/bin/env node
const readline = require("node:readline")
if (process.argv.includes("--version")) { process.stdout.write("2.1.258\\n"); process.exit(0) }
if (process.argv.includes("--help")) { process.stdout.write("Usage: claude [options]\\n"); process.exit(0) }
readline.createInterface({ input: process.stdin }).on("line", () => {
  const session_id = "fake-session"
  process.stdout.write(JSON.stringify({ type: "system", subtype: "init", session_id }) + "\\n")
  process.stdout.write(JSON.stringify({
    type: "assistant", session_id,
    message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "done" }] },
  }) + "\\n")
  process.stdout.write(JSON.stringify({
    type: "result", subtype: "success", session_id, is_error: false, duration_ms: 1, num_turns: 1,
    usage: { input_tokens: 1, output_tokens: 1 },
  }) + "\\n")
})
`,
  )
  chmodSync(cliPath, 0o755)
  return { cwd, cliPath }
}

async function completeOneTurn(settings: { idleProcessTimeoutMs?: number }) {
  const fake = fakeAnsweringCli()
  const modelId = `claude-test-idle-${settings.idleProcessTimeoutMs ?? "default"}`
  const sk = sessionKey(fake.cwd, `tools::default::context=["claude-code"]`)
  try {
    const model = createClaudeCode({
      cliPath: fake.cliPath,
      cwd: fake.cwd,
      proxyTools: [],
      autoContinueIncompleteTurns: false,
      ...settings,
    }).languageModel(modelId)
    const response = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Say done." }] }],
      tools: [{ type: "function", name: "bash", description: "Run", inputSchema: { type: "object", properties: {} } }],
    } as any)
    const parts: any[] = []
    for await (const part of response.stream) parts.push(part)
    assert.equal(parts.find((part) => part.type === "finish")?.finishReason.unified, "stop")
    // Read-only: `getActiveProcess` counts as reuse and would disarm the timer.
    assert.ok(
      hasActiveProcess(sk),
      "the worker is retained for the next turn",
    )
    return isIdleProcessEvictionScheduled(sk)
  } finally {
    await deleteActiveProcessAndWait(sk)
    deleteClaudeSessionId(sk)
    rmSync(fake.cwd, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

// The timer is armed by a completed turn, which is the caller-facing
// boundary: it is armed only when the option is set, and never for 0 or unset.
test("a completed turn arms idle eviction only when idleProcessTimeoutMs is set", async () => {
  assert.equal(await completeOneTurn({}), false)
  assert.equal(await completeOneTurn({ idleProcessTimeoutMs: 0 }), false)
  assert.equal(await completeOneTurn({ idleProcessTimeoutMs: 900_000 }), true)
})

// --- what ends a proxied call --------------------------------------------------

/**
 * A stand-in `claude` that, on its first turn, narrates, issues one `task`
 * proxy call over HTTP and then parks inside it like the real CLI does. It
 * records what happens to that HTTP call, answers an `interrupt` control
 * request with the CLI's own error result, answers a later user envelope
 * with a fresh reply, and in the `exit-*` modes dies while the call is open.
 */
function parkedTaskCli(mode: "park" | "exit-mid-turn" | "exit-between-turns") {
  const cwd = mkdtempSync(join(tmpdir(), "opencode-lifecycle-task-"))
  const cliPath = join(cwd, "fake-claude.cjs")
  const eventsPath = join(cwd, "events.jsonl")
  writeFileSync(
    cliPath,
    `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")
if (process.argv.includes("--version")) { process.stdout.write("2.1.258\\n"); process.exit(0) }
if (process.argv.includes("--help")) { process.stdout.write("Usage: claude [options]\\n"); process.exit(0) }
const args = process.argv.slice(2)
let proxyUrl, proxyHeaders = {}
const configIndex = args.indexOf("--mcp-config")
if (configIndex >= 0) {
  for (let index = configIndex + 1; index < args.length && !args[index].startsWith("--"); index++) {
    try {
      const entry = JSON.parse(fs.readFileSync(args[index], "utf8")).mcpServers?.opencode_proxy
      proxyUrl = entry?.url ?? proxyUrl
      proxyHeaders = entry?.headers ?? proxyHeaders
    } catch {}
  }
}
if (!proxyUrl) { process.stderr.write("missing opencode proxy URL\\n"); process.exit(2) }
const mode = ${JSON.stringify(mode)}
const session_id = "fake-session"
const record = (event) => fs.appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify(event) + "\\n")
const emit = (message) => process.stdout.write(JSON.stringify(message) + "\\n")
const result = (extra) => emit({
  type: "result", subtype: "success", session_id, is_error: false, duration_ms: 1, num_turns: 1,
  usage: { input_tokens: 1, output_tokens: 1 }, ...extra,
})
let handled = false
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const envelope = JSON.parse(line)
  if (envelope.type === "control_request" && envelope.request?.subtype === "interrupt") {
    record({ type: "interrupt" })
    result({ subtype: "error_during_execution", is_error: true, result: "interrupted" })
    return
  }
  if (envelope.type !== "user") return
  if (handled) {
    record({ type: "input", envelope })
    emit({ type: "assistant", session_id, message: { role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: "second answer" }] } })
    result({})
    return
  }
  handled = true
  emit({ type: "system", subtype: "init", session_id })
  emit({
    type: "assistant", session_id,
    message: {
      role: "assistant", stop_reason: "tool_use",
      content: [
        { type: "text", text: "Delegating." },
        { type: "tool_use", id: "claude-proxy-task", name: "mcp__opencode_proxy__task", input: ${JSON.stringify(TASK_INPUT)} },
      ],
    },
  })
  fetch(proxyUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...proxyHeaders },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "task", arguments: ${JSON.stringify(TASK_INPUT)} } }),
  })
    .then((response) => response.json())
    .then((body) => record({ type: "http", body }))
    .catch((error) => record({ type: "http-error", message: error.message }))
  if (mode === "exit-mid-turn") setTimeout(() => process.exit(0), 30)
  if (mode === "exit-between-turns") setTimeout(() => process.exit(0), 300)
})
`,
  )
  chmodSync(cliPath, 0o755)
  const events = () =>
    existsSync(eventsPath)
      ? readFileSync(eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))
      : []
  return { cwd, cliPath, events }
}

const TASK_TOOL = { type: "function", name: "task", description: "Delegate", inputSchema: { type: "object", properties: {} } }

function firstTurn(text = "Delegate the check."): LanguageModelV3CallOptions {
  return { prompt: [{ role: "user", content: [{ type: "text", text }] }], tools: [TASK_TOOL] } as any
}

/** The chat continues with a fresh user message instead of a tool result. */
function nextUserTurn(): LanguageModelV3CallOptions {
  return {
    prompt: [
      { role: "user", content: [{ type: "text", text: "Delegate the check." }] },
      { role: "assistant", content: [{ type: "text", text: "Delegating." }] },
      { role: "user", content: [{ type: "text", text: "Never mind, answer directly." }] },
    ],
    tools: [TASK_TOOL],
  } as any
}

async function collect(stream: ReadableStream<LanguageModelV3StreamPart>, limitMs = 8_000) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      (async () => {
        const parts: LanguageModelV3StreamPart[] = []
        for await (const part of stream) parts.push(part)
        return parts
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`stream did not finish within ${limitMs}ms`)), limitMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function eventually(description: string, ready: () => boolean, limitMs = 5_000) {
  const deadline = Date.now() + limitMs
  while (!ready()) {
    assert.ok(Date.now() < deadline, `timed out waiting for ${description}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function brokerCall(sk: string) {
  return new Promise<void>((resolve) => {
    const off = onPendingProxyCall(sk, () => { off(); resolve() })
  })
}

type Ctx = {
  model: ReturnType<ReturnType<typeof createClaudeCode>["languageModel"]>
  sk: string
  events: () => any[]
  /** The proxy server behind the parked call: captured while the process is
   * still registered, so its HTTP side can be checked after it is gone. */
  server: () => ProxyMcpServer
}

async function withParkedTaskCli(
  mode: Parameters<typeof parkedTaskCli>[0],
  run: (ctx: Ctx) => Promise<void>,
  // The affinity these turns run under. `default` is the no-affinity
  // fallback, so a test that needs opencode's session status must name a
  // real session and send it as the `opencodeSessionID` provider option.
  session = "default",
  settings: Record<string, unknown> = {},
) {
  const fake = parkedTaskCli(mode)
  const modelId = `claude-test-lifecycle-${mode}`
  const sk = sessionKey(fake.cwd, `tools::${session}::context=["claude-code"]`)
  let captured: ProxyMcpServer | undefined
  try {
    const model = createClaudeCode({
      cliPath: fake.cliPath,
      cwd: fake.cwd,
      proxyTools: ["Task"],
      autoContinueIncompleteTurns: false,
      ...settings,
    }).languageModel(modelId)
    await run({
      model,
      sk,
      events: fake.events,
      server: () => {
        captured ??= getActiveProcess(sk)?.proxyServer ?? undefined
        assert.ok(captured, "a proxy server is attached to the spawned process")
        return captured
      },
    })
  } finally {
    await deleteActiveProcessAndWait(sk)
    deleteClaudeSessionId(sk)
    rmSync(fake.cwd, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
  }
}

const textOf = (parts: LanguageModelV3StreamPart[]) =>
  parts.filter((part) => part.type === "text-delta").map((part: any) => part.delta).join("")

/** Both registries empty, and the CLI's parked request answered with `pattern`. */
async function assertReleased(ctx: Ctx, pattern: RegExp) {
  await eventually("the broker entry to be released", () => getPendingProxyCalls(ctx.sk).length === 0)
  await eventually("the HTTP entry to be released", () => ctx.server().pendingCallIds().length === 0)
  await eventually("the CLI to record its answered HTTP call", () => ctx.events().some((event) => event.type === "http"))
  const http = ctx.events().find((event) => event.type === "http")
  assert.equal(http.body.result.isError, true)
  assert.match(http.body.result.content[0].text, pattern)
}

