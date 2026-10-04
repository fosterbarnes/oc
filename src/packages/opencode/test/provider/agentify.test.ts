import { afterEach, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ensureStarted, providerInfo, resetForTest, started, stop, wrapFetch } from "../../src/provider/agentify"

const tmp = path.join(os.tmpdir(), "opencode-agentify-test")

afterEach(async () => {
  await stop().catch(() => {})
  resetForTest()
})

async function writeFakeRuntime() {
  await fs.mkdir(tmp, { recursive: true })
  const entry = path.join(tmp, "fake-runtime.mjs")
  await fs.writeFile(
    entry,
    `
import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
const token = process.env.AGENTIFY_RUNTIME_TOKEN
const port = Number(process.env.AGENTIFY_RUNTIME_PORT)
let completions = 0
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  const auth = String(req.headers.authorization || '')
  if (auth !== 'Bearer ' + token) {
    res.writeHead(401)
    res.end(JSON.stringify({ error: 'unauthorized' }))
    return
  }
  if (url.pathname === '/v1/models') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ data: [{ id: 'chatgpt-web' }, { id: 'claude-web' }] }))
    return
  }
  if (url.pathname === '/show' || url.pathname === '/ensure-ready' || url.pathname === '/shutdown') {
    let raw = ''
    for await (const chunk of req) raw += chunk
    await fs.writeFile(path.join(process.env.AGENTIFY_RUNTIME_STATE_DIR, 'preflight.json'), raw)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
    if (url.pathname === '/shutdown') queueMicrotask(() => process.exit(0))
    return
  }
  if (url.pathname === '/v1/chat/completions') {
    completions += 1
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: 'chatcmpl-test',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok-' + completions }, finish_reason: 'stop' }]
    }))
    return
  }
  res.writeHead(404)
  res.end('{}')
})
server.listen(port, '127.0.0.1')
`,
  )
  return entry
}

test("static web metadata does not start the child", () => {
  expect(started()).toBe(false)
  expect(providerInfo().models["chatgpt-web"].api.url).toBe("http://127.0.0.1/v1")
  expect(providerInfo().models["chatgpt-web"].capabilities.toolcall).toBe(false)
  expect(providerInfo().models["claude-web"].name).toBe("Claude Web")
  expect(started()).toBe(false)
})

test("lazy startup coalesces and forwards a completion", async () => {
  process.env.OPENCODE_AGENTIFY_RUNTIME_ENTRY = await writeFakeRuntime()
  process.env.AGENTIFY_RUNTIME_STATE_DIR = path.join(tmp, "state")
  const first = ensureStarted()
  const second = ensureStarted()
  const a = await first
  const b = await second
  expect(a.port).toBe(b.port)
  expect(started()).toBe(true)
  const fetchFn = wrapFetch(fetch)
  const res = await fetchFn("http://127.0.0.1:1/v1/chat/completions", {
    method: "POST",
    headers: { "x-session-affinity": "session-1" },
    body: JSON.stringify({ model: "chatgpt-web", messages: [{ role: "user", content: "hi" }] }),
  })
  const body = await res.json()
  expect(body.choices[0].message.content).toBe("ok-1")
  expect(JSON.parse(await fs.readFile(path.join(tmp, "state", "preflight.json"), "utf8"))).toMatchObject({
    key: "opencode:chatgpt:session-1",
    timeoutMs: 1_800_000,
  })

  const claude = await fetchFn("http://127.0.0.1:1/v1/chat/completions", {
    method: "POST",
    headers: { "x-session-affinity": "session-claude" },
    body: JSON.stringify({ model: "claude-web", messages: [{ role: "user", content: "hi" }] }),
  })
  await claude.json()
  expect(JSON.parse(await fs.readFile(path.join(tmp, "state", "preflight.json"), "utf8"))).toMatchObject({
    key: "opencode:claude:session-claude",
  })
})

test("child exit allows a later restart", async () => {
  process.env.OPENCODE_AGENTIFY_RUNTIME_ENTRY = await writeFakeRuntime()
  process.env.AGENTIFY_RUNTIME_STATE_DIR = path.join(tmp, "state2")
  const conn = await ensureStarted()
  expect(conn.port).toBeGreaterThan(0)
  await stop()
  resetForTest()
  const again = await ensureStarted()
  expect(again.port).toBeGreaterThan(0)
})
