import { expect, test } from "bun:test"
import { chmod, readFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import type { LanguageModelV3CallOptions, LanguageModelV3StreamPart } from "@ai-sdk/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { createClaudeCode } from "@/provider/claude-code/index"
import { ClaudeCodeLanguageModel } from "@/provider/claude-code/claudeCodeLanguageModel"
import { createProxyMcpServer, proxyToolResult } from "@/provider/claude-code/proxyMcp"
import { DEFAULT_PROXY_TOOLS } from "@/provider/claude-code/proxyToolDefs"
import { disallowedToolFlags, filterProxyByModelTools } from "@/provider/claude-code/proxyToolSelection"
import { toolCatalogHash } from "@/provider/claude-code/spawnPlanning"
import { hostToolExecutors } from "@/provider/claude-code/shared"
import {
  deleteActiveProcessAndWait,
  deleteClaudeSessionId,
  getActiveProcess,
  sessionKey,
} from "@/provider/claude-code/sessionManager"
import {
  queuePendingProxyCall,
  getPendingProxyCalls,
  resolvePendingProxyCallById,
} from "@/provider/claude-code/proxyBroker"
import { tmpdir } from "../../fixture/fixture"

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="

function attachment(mime: string, data = png): SessionV1.FilePart {
  return {
    type: "file",
    id: PartID.ascending(),
    messageID: MessageID.ascending(),
    sessionID: SessionID.make("ses_attachment"),
    mime,
    url: `data:${mime};base64,${data}`,
  }
}

async function drain(stream: ReadableStream<LanguageModelV3StreamPart>) {
  const reader = stream.getReader()
  const events: LanguageModelV3StreamPart[] = []
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) return events
      events.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }
}

test("Claude Code's native tools are never proxied or turned off by the defaults", () => {
  const names = filterProxyByModelTools(DEFAULT_PROXY_TOOLS, undefined).map((tool) => tool.name)
  for (const native of ["read", "glob", "grep", "bash", "write", "edit", "webfetch", "compress"]) {
    expect(names).not.toContain(native)
  }
  expect(disallowedToolFlags(DEFAULT_PROXY_TOOLS)).toEqual(["Agent", "Task", "TaskOutput", "AskUserQuestion"])
})
test("catalog identity ignores object key order but tracks capabilities and policy", () => {
  const config = { provider: "claude-code", cliPath: "claude", proxyTools: ["Read"] }
  const tools = [{ name: "read", description: "read", inputSchema: { type: "object", properties: {} } }]
  const hash = toolCatalogHash(config, tools)
  expect(toolCatalogHash(config, [{ ...tools[0], inputSchema: { properties: {}, type: "object" } }])).toBe(hash)
  expect(toolCatalogHash(config, [])).not.toBe(hash)
  expect(toolCatalogHash(config, [{ ...tools[0], description: "changed" }])).not.toBe(hash)
  expect(toolCatalogHash({ ...config, extraDisallowedTools: ["Read"] }, tools)).not.toBe(hash)
  expect(toolCatalogHash(config, tools, true)).not.toBe(hash)
})

test("image bytes reach the MCP client, and unsupported attachments fail explicitly", async () => {
  const result = proxyToolResult({ output: "Image read successfully", attachments: [attachment("image/png")] })
  const server = await createProxyMcpServer([{ name: "read", description: "", inputSchema: {} }])
  server.calls.on("call", (call) => call.resolve(result))
  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${server.authToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read", arguments: {} } }),
    })
    expect(await response.text()).toEqual(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [
            { type: "text", text: "Image read successfully" },
            { type: "image", data: png, mimeType: "image/png" },
          ],
          isError: false,
        },
      }),
    )
    expect(
      proxyToolResult({ output: "PDF read successfully", attachments: [attachment("application/pdf", "JVBERi0=")] }),
    ).toMatchObject({ kind: "error", message: expect.stringContaining("PDF content was not delivered") })
    expect(
      proxyToolResult({ output: "image", attachments: [attachment("image/png", "a".repeat(5 * 1024 * 1024 + 1))] }),
    ).toMatchObject({ kind: "error" })
  } finally {
    await server.close()
  }
})

test("disconnect cancels the broker call and prevents late settlement", async () => {
  const key = randomUUID()
  const server = await createProxyMcpServer([{ name: "read", description: "", inputSchema: {} }])
  const received = Promise.withResolvers<{ id: string; signal: AbortSignal }>()
  server.calls.on("call", (call) => {
    if (!call.signal) throw new Error("Call has no cancellation signal")
    queuePendingProxyCall(key, call)
    received.resolve({ id: call.id, signal: call.signal })
  })
  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${server.authToken}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "read", arguments: {} } }),
    })
    const call = await received.promise
    const aborted = Promise.withResolvers<void>()
    call.signal.addEventListener("abort", () => aborted.resolve(), { once: true })
    await response.body?.cancel()
    await aborted.promise
    expect(getPendingProxyCalls(key)).toEqual([])
    expect(resolvePendingProxyCallById(call.id, { kind: "text", text: "late" })).toBe(false)
  } finally {
    await server.close()
  }
}, 10_000)

async function fakeCli(directory: string) {
  const filename = path.join(directory, "claude.cjs")
  await Bun.write(
    filename,
    `#!/usr/bin/env node
const fs = require("node:fs")
const readline = require("node:readline")
if (process.argv.includes("--version")) { console.log("2.1.283"); process.exit(0) }
const args = process.argv.slice(2)
const config = args.includes("--mcp-config") ? JSON.parse(fs.readFileSync(args[args.indexOf("--mcp-config") + 1], "utf8")) : null
const proxy = config?.mcpServers.opencode_proxy
const SESSION = "${randomUUID()}"
const emit = (message) => console.log(JSON.stringify({ session_id: SESSION, ...message }))
const event = (message) => emit({ type: "stream_event", event: message })
readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  const input = JSON.parse(line)
  if (input.type === "control_request") { emit({ type: "result", subtype: "success" }); return }
  emit({ type: "system", subtype: "init" })
  if (input.message?.content?.[0]?.text === "Plan tasks.") {
    // Claude Code 2.1.285: one TaskCreate/TaskUpdate per change, the whole list saved on disk.
    const dir = require("node:path").join(process.cwd(), ".claudeConfig", "tasks", SESSION)
    fs.mkdirSync(dir, { recursive: true })
    const calls = [["TaskCreate", { subject: "First" }], ["TaskCreate", { subject: "Second" }], ["TaskUpdate", { taskId: "1", status: "completed" }]]
    calls.forEach(([name, toolInput], index) => {
      const id = "toolu_task_" + index
      event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name, id } })
      event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(toolInput) } })
      event({ type: "content_block_stop", index: 0 })
      emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "ok" }] } })
    })
    fs.writeFileSync(require("node:path").join(dir, "1.json"), JSON.stringify({ id: "1", subject: "First", status: "completed" }))
    fs.writeFileSync(require("node:path").join(dir, "2.json"), JSON.stringify({ id: "2", subject: "Second", status: "pending" }))
    event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "planned" } })
    event({ type: "content_block_stop", index: 0 })
    emit({ type: "result", subtype: "success", is_error: false })
    return
  }
  if (input.message?.content?.[0]?.text === "Track this.") {    // A burst of two updates, as Claude Code sends one call per change.
    for (const status of ["pending", "in_progress"]) {
      const todo = { todos: [{ content: "Check the mirror", status, activeForm: "Checking" }] }
      const id = "toolu_todo_" + status
      event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "TodoWrite", id } })
      event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify(todo) } })
      event({ type: "content_block_stop", index: 0 })
      emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: "Todos updated" }] } })
    }
    event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "tracked" } })
    event({ type: "content_block_stop", index: 0 })
    emit({ type: "result", subtype: "success", is_error: false })
    return
  }
  if (input.message?.content?.[0]?.text === "/compact") {
    emit({ type: "system", subtype: "status", status: "compacting" })
    emit({ type: "system", subtype: "compact_boundary", compact_metadata: { trigger: "manual", pre_tokens: 100, post_tokens: 10 } })
    emit({ type: "user", isReplay: true, message: { role: "user", content: "SUMMARY OF EARLIER WORK" } })
    emit({ type: "user", isReplay: true, message: { role: "user", content: "<local-command-stdout>Compacted </local-command-stdout>" } })
    emit({ type: "result", subtype: "success", is_error: false, num_turns: 0 })
    return
  }
  if (proxy) {
    const request = async (method, params) => {
      const response = await fetch(proxy.url, { method: "POST", headers: { "Content-Type": "application/json", ...proxy.headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })
      return (await response.json()).result
    }
    const catalog = await request("tools/list")
    for (const tool of catalog.tools) {
      const id = "tool_" + tool.name
      event({ type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "mcp__opencode_proxy__" + tool.name, id } })
      event({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } })
      event({ type: "content_block_stop", index: 0 })
      emit({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "mcp__opencode_proxy__" + tool.name, id, input: {} }] } })
      const result = await request("tools/call", { name: tool.name, arguments: {} })
      emit({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: result.content, is_error: result.isError }] } })
    }
  }
  event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "done" } })
  event({ type: "content_block_stop", index: 0 })
  emit({ type: "result", subtype: "success", is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })
})
`,
  )
  if (process.platform !== "win32") await chmod(filename, 0o755)
  return filename
}

test("command-permission turns alwaysLoad proxy tools and name them in the prompt", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  hostToolExecutors.set(session, async (name) => ({ output: name, title: name, metadata: {} }))
  const model = new ClaudeCodeLanguageModel(`cmd-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
  })
  try {
    await drain(
      (
        await model.doStream({
          prompt: [{ role: "user", content: [{ type: "text", text: "Read files." }] }],
          tools: ["read", "edit", "grep", "bash"].map((name) => ({
            type: "function" as const,
            name,
            description: name,
            inputSchema: { type: "object", properties: {} },
          })),
          providerOptions: {
            "claude-code": {
              opencodeSessionID: session,
              opencodeAgent: "build",
              opencodeCommandPermission: "true",
            },
          },
        })
      ).stream,
    )
    const args = getActiveProcess(key)?.cliArgs
    expect(args).toEqual(expect.arrayContaining(["--tools", "", "--strict-mcp-config"]))
    const mcp = JSON.parse(await readFile(args![args!.indexOf("--mcp-config") + 1], "utf8"))
    expect(mcp.mcpServers.opencode_proxy.alwaysLoad).toBe(true)
    const prompt = await readFile(args![args!.indexOf("--append-system-prompt-file") + 1], "utf8")
    expect(prompt).toContain("built-in file, shell and web tools are off this turn")
    expect(prompt).toContain("read, edit, grep, bash")
    expect(prompt).not.toContain("ToolSearch")
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

test("oc-only proxies execute once, refresh between turns, and leave native tools on", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const modelID = `oc-only-${randomUUID()}`
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const calls: string[] = []
  let deny = false
  hostToolExecutors.set(session, async (name) => {
    calls.push(name)
    return {
      output: `result ${name}`,
      title: name,
      metadata: {},
      ...(deny ? { denied: new Error("Denied by user") } : {}),
    }
  })
  const model = new ClaudeCodeLanguageModel(modelID, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    proxyTools: ["session_tail"],
    strictMcpConfig: true,
    autoContinueIncompleteTurns: false,
  })
  const options: LanguageModelV3CallOptions = {
    prompt: [{ role: "user", content: [{ type: "text", text: "Run tools." }] }],
    tools: ["session_tail", "read", "glob", "grep", "bash", "edit", "write", "webfetch", "todowrite"].map((name) => ({
      type: "function",
      name,
      description: name,
      inputSchema: { type: "object", properties: {} },
    })),
    providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
  }
  try {
    const first = await model.doStream(options)
    const events = await drain(first.stream)
    expect(calls).toEqual(["session_tail"])
    expect(events.filter((event) => event.type === "tool-call")).toHaveLength(1)
    expect(events.filter((event) => event.type === "tool-result")).toHaveLength(1)
    const process = getActiveProcess(key)
    expect(process).toBeDefined()
    expect(process?.cliArgs).not.toContain("--disallowedTools")
    expect(process?.proxyServer?.tools.map((tool) => tool.name)).toEqual(["session_tail"])
    const continued = {
      ...options,
      prompt: [
        ...options.prompt,
        { role: "assistant" as const, content: [{ type: "text" as const, text: "done" }] },
        ...options.prompt,
      ],
    }
    const second = await model.doStream(continued)
    await drain(second.stream)
    expect(getActiveProcess(key)).toBe(process)
    expect(calls).toHaveLength(2)
    const restricted = await model.doStream({
      ...continued,
      tools: options.tools?.filter((tool) => tool.name === "read"),
    })
    await drain(restricted.stream)
    expect(getActiveProcess(key)).not.toBe(process)
    expect(getActiveProcess(key)?.cliArgs).toContain("--resume")
    expect(getActiveProcess(key)?.proxyServer).toBeNull()
    // An agent given only `read` gets no native tool that edits, runs or fetches.
    expect(getActiveProcess(key)?.cliArgs).toEqual(
      expect.arrayContaining(["--disallowedTools", "Bash", "Edit", "Write", "WebFetch"]),
    )
    expect(getActiveProcess(key)?.cliArgs).not.toContain("Read")
    expect(calls).toHaveLength(2)
    const textOnly = await model.doStream({ ...continued, tools: [] })
    await drain(textOnly.stream)
    expect(getActiveProcess(key)?.cliArgs).toEqual(expect.arrayContaining(["--resume", "--tools", "", "*"]))
    expect(getActiveProcess(key)?.proxyServer).toBeNull()
    expect(calls).toHaveLength(2)
    deny = true
    const denied = await model.doStream(continued)
    await drain(denied.stream)
    expect(calls.slice(2)).toEqual(["session_tail"])
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)
test("cancelling the provider stream aborts its running host call", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const modelID = `cancel-${randomUUID()}`
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const started = Promise.withResolvers<AbortSignal>()
  const stopped = Promise.withResolvers<void>()
  const calls: string[] = []
  hostToolExecutors.set(session, async (name, _input, _callID, signal) => {
    if (!signal) throw new Error("Host call has no cancellation signal")
    calls.push(name)
    started.resolve(signal)
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
    stopped.resolve()
    return { output: "cancelled", metadata: {} }
  })
  const model = new ClaudeCodeLanguageModel(modelID, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    proxyTools: ["session_tail"],
    strictMcpConfig: true,
    autoContinueIncompleteTurns: false,
  })
  try {
    const response = await model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Read." }] }],
      tools: [{ type: "function", name: "session_tail", inputSchema: { type: "object", properties: {} } }],
      providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
    })
    const signal = await started.promise
    await response.stream.cancel()
    await stopped.promise
    expect(signal.aborted).toBe(true)
    expect(calls).toEqual(["session_tail"])
    expect(getPendingProxyCalls(key)).toEqual([])
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 15_000)

test("tool-less requests have no execution authority and get only the agent prompt", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const model = new ClaudeCodeLanguageModel(`text-only-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    skipPermissions: true,
    permissionMode: "bypassPermissions",
    autoContinueIncompleteTurns: false,
  })
  try {
    const agentPrompt = `AGENT_PROMPT_${session}`
    const response = await model.doStream({
      prompt: [
        { role: "system", content: "OC SYSTEM BLOCK" },
        { role: "user", content: [{ type: "text", text: "Summarize the provided conversation." }] },
      ],
      tools: [],
      providerOptions: {
        "claude-code": { opencodeSessionID: session, opencodeAgent: "build", opencodeAgentPrompt: agentPrompt },
      },
    })
    await drain(response.stream)
    const args = getActiveProcess(key)?.cliArgs
    expect(args).toEqual(
      expect.arrayContaining([
        "--tools",
        "",
        "--disallowedTools",
        "*",
        "--strict-mcp-config",
        "--append-system-prompt-file",
      ]),
    )
    expect(args).not.toContain("--dangerously-skip-permissions")
    expect(args).not.toContain("--permission-mode")
    expect(args).not.toContain("--mcp-config")
    const prompt = await readFile(args![args!.indexOf("--append-system-prompt-file") + 1], "utf8")
    expect(prompt).toContain(agentPrompt)
    expect(prompt).not.toContain("OC SYSTEM BLOCK")
    expect(prompt).not.toContain("mcp__opencode_proxy__")
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

test("a chat whose only earlier message got no reply starts fresh without a lost-conversation notice", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const model = new ClaudeCodeLanguageModel(`fresh-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
  })
  try {
    // `opencode session` writes this no-reply message before the first real prompt.
    const events = await drain(
      (
        await model.doStream({
          prompt: [
            { role: "user", content: [{ type: "text", text: `Working directory initialized: ${directory.path}` }] },
            { role: "user", content: [{ type: "text", text: "Hello." }] },
          ],
          tools: [],
          providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
        })
      ).stream,
    )
    const text = events.flatMap((event) => (event.type === "text-delta" ? [event.delta] : [])).join("")
    expect(text).not.toContain("Claude conversation lost")
    expect(text).toContain("done")
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

// Claude Code already answered its own TodoWrite. oc's todowrite only mirrors
// the list, so it must run in the stream and never come back as an oc tool turn.
test("a turn's TodoWrite calls become one in-stream, provider-executed todowrite at its end", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const calls: { name: string; input: Record<string, unknown> }[] = []
  hostToolExecutors.set(session, async (name, input) => {
    calls.push({ name, input })
    return { output: "1 todo", title: "1 todo", metadata: { todos: input.todos } }
  })
  const model = new ClaudeCodeLanguageModel(`todo-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
  })
  try {
    const events = await drain(
      (
        await model.doStream({
          prompt: [{ role: "user", content: [{ type: "text", text: "Track this." }] }],
          tools: [{ type: "function", name: "todowrite", inputSchema: { type: "object", properties: {} } }],
          providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
        })
      ).stream,
    )
    // Only the turn's newest list is mirrored.
    expect(calls.map((call) => call.name)).toEqual(["todowrite"])
    expect(calls[0].input.todos).toEqual([
      expect.objectContaining({ content: "Check the mirror", status: "in_progress" }),
    ])
    const toolCalls = events.filter((event) => event.type === "tool-call")
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0]).toMatchObject({ toolName: "todowrite", providerExecuted: true })
    expect(events.filter((event) => event.type === "tool-input-start")).toHaveLength(1)
    const result = events.find((event) => event.type === "tool-result")
    expect(result).toMatchObject({ toolName: "todowrite", providerExecuted: true })
    // The result arrives before the finish, so oc never sees an unanswered call.
    expect(events.findIndex((event) => event.type === "tool-result")).toBeLessThan(
      events.findIndex((event) => event.type === "finish"),
    )
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

test("disabled todos skip native mirrors and retire the enabled Claude process", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const calls: string[] = []
  hostToolExecutors.set(session, async (name) => {
    calls.push(name)
    return { output: "ok", metadata: {} }
  })
  const model = new ClaudeCodeLanguageModel(`todo-toggle-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
  })
  const turn = (text: string, enabled: boolean) =>
    model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text }] }],
      tools: (enabled ? ["read", "todowrite"] : ["read"]).map((name) => ({
        type: "function",
        name,
        inputSchema: { type: "object", properties: {} },
      })),
      providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
    })
  try {
    await drain((await turn("Track this.", true)).stream)
    const enabled = getActiveProcess(key)
    expect(calls).toEqual(["todowrite"])
    expect(enabled?.cliArgs).not.toContain("TodoWrite")

    for (const text of ["Track this.", "Plan tasks."]) {
      const events = await drain((await turn(text, false)).stream)
      expect(
        events.some(
          (event) => event.type === "tool-call" || event.type === "tool-input-start" || event.type === "tool-result",
        ),
      ).toBe(false)
      expect(events.at(-1)).toMatchObject({ type: "finish" })
      expect(calls).toEqual(["todowrite"])
    }
    expect(getActiveProcess(key)).not.toBe(enabled)
    expect(getActiveProcess(key)?.cliArgs).toEqual(
      expect.arrayContaining(["--disallowedTools", "TodoWrite", "TaskCreate", "TaskUpdate", "TaskGet", "TaskList"]),
    )
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

// TaskCreate/TaskUpdate change one item per call; the whole list is the one
// Claude Code saved, mirrored once at the turn's end.
test("task tool turns mirror Claude Code's saved task list once, and a missing list is skipped", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const calls: Record<string, unknown>[] = []
  hostToolExecutors.set(session, async (_name, input) => {
    calls.push(input)
    return { output: "2 todos", title: "2 todos", metadata: { todos: input.todos } }
  })
  const model = () =>
    new ClaudeCodeLanguageModel(`tasks-${randomUUID()}`, {
      provider: "claude-code",
      cliPath,
      cwd: directory.path,
      autoContinueIncompleteTurns: false,
    })
  const cliPath = await fakeCli(directory.path)
  const turn = () =>
    model().doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Plan tasks." }] }],
      tools: [{ type: "function", name: "todowrite", inputSchema: { type: "object", properties: {} } }],
      providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
    })
  try {
    // The provider reads the spawning pool account's saved task list; with no
    // accounts configured that is `process.env.CLAUDE_CONFIG_DIR`.
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = path.join(directory.path, ".claudeConfig")
    let events: LanguageModelV3StreamPart[]
    try {
      events = await drain((await turn()).stream)
    } finally {
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    expect(calls).toEqual([
      {
        todos: [
          { id: "1", content: "First", status: "completed", priority: "medium" },
          { id: "2", content: "Second", status: "pending", priority: "medium" },
        ],
      },
    ])
    expect(events.filter((event) => event.type === "tool-call")).toHaveLength(1)
    expect(events.find((event) => event.type === "tool-call")).toMatchObject({
      toolName: "todowrite",
      providerExecuted: true,
    })

    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
    process.env.CLAUDE_CONFIG_DIR = path.join(directory.path, "noSuchConfig")
    let missing: LanguageModelV3StreamPart[]
    try {
      missing = await drain((await turn()).stream)
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR
    }
    expect(calls).toHaveLength(1)
    expect(missing.some((event) => event.type === "tool-call")).toBe(false)
    expect(missing.at(-1)).toMatchObject({ type: "finish" })
  } finally {
    hostToolExecutors.delete(session)
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)

test("a compaction turn runs /compact in the live conversation and never spawns a second process", async () => {
  await using directory = await tmpdir()
  const session = randomUUID()
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const model = new ClaudeCodeLanguageModel(`compact-${randomUUID()}`, {
    provider: "claude-code",
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
  })
  // As oc sends them: a chat turn carries the agent's tools, a compaction turn carries none.
  const turn = (agent: string) =>
    model.doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "A LONG TRANSCRIPT oc would have pasted" }] }],
      tools:
        agent === "compaction"
          ? undefined
          : [{ type: "function", name: "read", inputSchema: { type: "object", properties: {} } }],
      providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: agent } },
    })
  const text = (events: LanguageModelV3StreamPart[]) =>
    events.flatMap((event) => (event.type === "text-delta" ? [event.delta] : [])).join("")
  try {
    const nothing = await drain((await turn("compaction")).stream)
    expect(text(nothing)).toContain("no Claude Code conversation to compact")
    expect(getActiveProcess(key)).toBeUndefined()

    await drain((await turn("build")).stream)
    const conversation = getActiveProcess(key)
    expect(conversation).toBeDefined()
    const compacted = await drain((await turn("compaction")).stream)
    expect(getActiveProcess(key)).toBe(conversation)
    expect(text(compacted)).toContain("SUMMARY OF EARLIER WORK")
    expect(text(compacted)).not.toContain("<local-command-stdout>")
    expect(compacted.some((event) => event.type === "tool-call")).toBe(false)
    const finish = compacted.find((event) => event.type === "finish")
    expect(finish?.type === "finish" ? finish.usage.outputTokens.total : undefined).toBe(10)
  } finally {
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)
test("retired interactive settings cannot select a native-tool transport", async () => {
  await using directory = await tmpdir()
  const previous = process.env.CLAUDE_CODE_INTERACTIVE_TRANSPORT
  process.env.CLAUDE_CODE_INTERACTIVE_TRANSPORT = "1"
  const session = randomUUID()
  const modelID = `headless-${randomUUID()}`
  const key = sessionKey(directory.path, `tools::${session}::context=["claude-code"]`)
  const provider = createClaudeCode({
    cliPath: await fakeCli(directory.path),
    cwd: directory.path,
    autoContinueIncompleteTurns: false,
    interactive: true,
    interactiveBypass: true,
    interactiveAllowTools: ["Bash", "Write"],
  } as any)
  try {
    const response = await provider.languageModel(modelID).doStream({
      prompt: [{ role: "user", content: [{ type: "text", text: "Stay headless." }] }],
      tools: [],
      providerOptions: { "claude-code": { opencodeSessionID: session, opencodeAgent: "build" } },
    })
    await drain(response.stream)
    const args = getActiveProcess(key)?.cliArgs ?? []
    expect(args).toContain("--print")
    expect(args).toContain("stream-json")
    expect(args).toEqual(expect.arrayContaining(["--tools", "", "--disallowedTools", "*"]))
    expect(args.join(" ")).not.toContain("--permission-mode")
  } finally {
    if (previous === undefined) delete process.env.CLAUDE_CODE_INTERACTIVE_TRANSPORT
    else process.env.CLAUDE_CODE_INTERACTIVE_TRANSPORT = previous
    await deleteActiveProcessAndWait(key)
    deleteClaudeSessionId(key)
  }
}, 20_000)
