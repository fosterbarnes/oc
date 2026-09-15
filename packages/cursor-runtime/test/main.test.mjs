import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { createServer } from "node:net"
import http from "node:http"
import http2 from "node:http2"
import crypto from "node:crypto"
import path from "node:path"
import { PassThrough } from "node:stream"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { forwardData } from "../main.mjs"

const MAIN_PATH = fileURLToPath(new URL("../main.mjs", import.meta.url))

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      if (addr && typeof addr === "object") {
        const port = addr.port
        srv.close(() => resolve(port))
      } else reject(new Error("no address"))
    })
    srv.on("error", reject)
  })
}

async function getTwoPorts() {
  const a = await getFreePort()
  let b = await getFreePort()
  while (b === a) b = await getFreePort()
  return [a, b]
}

function spawnSidecar({ healthPort, h2Port, token }) {
  const child = spawn(process.execPath, [MAIN_PATH], {
    env: {
      ...process.env,
      CURSOR_H2_HEALTH_PORT: String(healthPort),
      CURSOR_H2_PROXY_PORT: String(h2Port),
      CURSOR_H2_CONTROL_TOKEN: token,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  return child
}

async function waitForHealth({ healthPort, token, timeout = 5000 }) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${healthPort}/health`, {
        headers: { "x-opencursor-control-token": token },
        signal: AbortSignal.timeout(1000),
      })
      if (res.ok) return res
    } catch {}
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`health not ready on ${healthPort}`)
}

async function waitForShutdown({ healthPort, token, timeout = 2000 }) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${healthPort}/health`, {
        headers: { "x-opencursor-control-token": token },
        signal: AbortSignal.timeout(500),
      })
    } catch {
      return
    }
    await new Promise((r) => setTimeout(r, 100))
  }
}

test("forwardData preserves ordered data and closes the destination", async () => {
  const source = new PassThrough()
  const destination = new PassThrough()
  const chunks = []
  destination.on("data", (chunk) => chunks.push(chunk))
  forwardData(source, destination, { end: true })

  const ended = once(destination, "end")
  source.end(Buffer.from("cursor"))
  await ended

  assert.equal(Buffer.concat(chunks).toString(), "cursor")
})

test("health requires per-process control token", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token = crypto.randomUUID()
  const child = spawnSidecar({ healthPort, h2Port, token })
  let stderr = ""
  child.stderr.on("data", (c) => (stderr += c.toString()))
  try {
    await waitForHealth({ healthPort, token })
    // without token -> 401
    const noToken = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(noToken.status, 401)
    // stamp still present on 401 for discovery
    assert.ok(noToken.headers.get("x-opencursor-proxy-stamp"))

    // wrong token -> 401
    const wrong = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      headers: { "x-opencursor-control-token": "wrong-token" },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(wrong.status, 401)

    // correct token -> 200
    const ok = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      headers: { "x-opencursor-control-token": token },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(ok.status, 200)
    assert.equal(await ok.text(), "ok\n")
    assert.ok(ok.headers.get("x-opencursor-proxy-stamp"))
    assert.equal(ok.headers.get("x-opencursor-flow-window"), String(4 * 1024 * 1024))

    // root path also requires token
    const rootNo = await fetch(`http://127.0.0.1:${healthPort}/`, {
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(rootNo.status, 401)
    const rootOk = await fetch(`http://127.0.0.1:${healthPort}/`, {
      headers: { "x-opencursor-control-token": token },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(rootOk.status, 200)

    // normal logs must not expose token
    assert.equal(stderr.includes(token), false)
  } finally {
    child.kill()
    await new Promise((r) => setTimeout(r, 200))
  }
})

test("shutdown requires token and actually terminates", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token = crypto.randomUUID()
  const child = spawnSidecar({ healthPort, h2Port, token })
  try {
    await waitForHealth({ healthPort, token })

    // without token -> 401, still alive
    const noToken = await fetch(`http://127.0.0.1:${healthPort}/shutdown`, {
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(noToken.status, 401)
    const stillOk = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      headers: { "x-opencursor-control-token": token },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(stillOk.status, 200)

    // wrong token -> 401
    const wrong = await fetch(`http://127.0.0.1:${healthPort}/shutdown`, {
      headers: { "x-opencursor-control-token": "bad" },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(wrong.status, 401)

    // correct token -> 200 and shutdown
    const ok = await fetch(`http://127.0.0.1:${healthPort}/shutdown`, {
      headers: { "x-opencursor-control-token": token },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(ok.status, 200)
    // wait for process exit
    await once(child, "exit")
    assert.notEqual(child.exitCode, null)
    // further fetch should fail (connection refused)
    await assert.rejects(
      fetch(`http://127.0.0.1:${healthPort}/health`, {
        headers: { "x-opencursor-control-token": token },
        signal: AbortSignal.timeout(500),
      }),
    )
  } finally {
    try {
      child.kill()
    } catch {}
  }
})

test("concurrent health requests remain coalesced and all succeed with token", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token = crypto.randomUUID()
  const child = spawnSidecar({ healthPort, h2Port, token })
  try {
    await waitForHealth({ healthPort, token })
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`http://127.0.0.1:${healthPort}/health`, {
          headers: { "x-opencursor-control-token": token },
          signal: AbortSignal.timeout(1000),
        }).then((r) => r.status),
      ),
    )
    assert.ok(results.every((s) => s === 200))
  } finally {
    child.kill()
    await new Promise((r) => setTimeout(r, 200))
  }
})

test("fixed-port conflict prevents second sidecar from binding", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token1 = crypto.randomUUID()
  const token2 = crypto.randomUUID()
  const child1 = spawnSidecar({ healthPort, h2Port, token: token1 })
  try {
    await waitForHealth({ healthPort, token: token1 })
    // second sidecar on same ports should fail to listen and exit
    const child2 = spawnSidecar({ healthPort, h2Port, token: token2 })
    let exited = false
    child2.on("exit", () => (exited = true))
    // wait a bit for second to fail
    await new Promise((r) => setTimeout(r, 1500))
    // child2 should have exited with error, child1 still healthy with its own token
    const health1 = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      headers: { "x-opencursor-control-token": token1 },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(health1.status, 200)
    // health with token2 should be 401 (foreign owner)
    const health2 = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      headers: { "x-opencursor-control-token": token2 },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(health2.status, 401)
    // child2 should have exited (or be killed)
    if (!exited) child2.kill()
    await new Promise((r) => setTimeout(r, 200))
  } finally {
    child1.kill()
    await new Promise((r) => setTimeout(r, 200))
  }
})

test("stale process replacement remains possible via authenticated shutdown", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token = crypto.randomUUID()
  const child1 = spawnSidecar({ healthPort, h2Port, token })
  try {
    await waitForHealth({ healthPort, token })
    const stamp1 = (
      await fetch(`http://127.0.0.1:${healthPort}/health`, {
        headers: { "x-opencursor-control-token": token },
        signal: AbortSignal.timeout(1000),
      })
    ).headers.get("x-opencursor-proxy-stamp")
    assert.ok(stamp1)

    // shutdown old with same token (simulates stale replacement where supervisor retains token)
    const shut = await fetch(`http://127.0.0.1:${healthPort}/shutdown`, {
      headers: { "x-opencursor-control-token": token },
      signal: AbortSignal.timeout(1000),
    })
    assert.equal(shut.status, 200)
    await once(child1, "exit")

    // new sidecar on same ports should now start successfully with same token
    const child2 = spawnSidecar({ healthPort, h2Port, token })
    try {
      await waitForHealth({ healthPort, token })
      const stamp2 = (
        await fetch(`http://127.0.0.1:${healthPort}/health`, {
          headers: { "x-opencursor-control-token": token },
          signal: AbortSignal.timeout(1000),
        })
      ).headers.get("x-opencursor-proxy-stamp")
      assert.ok(stamp2)
      // stamps may be equal (same file mtime) but health succeeds
      assert.equal(typeof stamp2, "string")
    } finally {
      child2.kill()
      await new Promise((r) => setTimeout(r, 200))
    }
  } finally {
    try {
      child1.kill()
    } catch {}
  }
})

test("h2 forwarding retains strict https://*.cursor.sh origin validation", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token = crypto.randomUUID()
  const child = spawnSidecar({ healthPort, h2Port, token })
  try {
    await waitForHealth({ healthPort, token })
    // invalid origins should be rejected with 400
    const invalidOrigins = [
      "http://api2.cursor.sh",
      "https://evil.com",
      "https://cursor.sh.evil.com",
      "https://api2.cursor.sh.evil.com",
      "https://sub.cursor.sh@evil.com",
      "ftp://api2.cursor.sh",
      "",
    ]
    for (const origin of invalidOrigins) {
      const client = http2.connect(`http://127.0.0.1:${h2Port}`)
      await new Promise((resolve, reject) => {
        client.on("error", reject)
        client.on("connect", resolve)
      })
      const req = client.request({
        ":method": "POST",
        ":path": "/",
        "x-cursor-h2-origin": origin,
      })
      const status = await new Promise((resolve) => {
        req.on("response", (headers) => resolve(headers[":status"]))
        req.on("error", () => resolve(500))
      })
      assert.equal(status, 400, `origin ${origin} should be 400`)
      client.close()
      req.destroy()
    }

    // valid cursor.sh origin should not be 400 (it will be 502 due to no upstream, but not 400)
    const client = http2.connect(`http://127.0.0.1:${h2Port}`)
    await new Promise((resolve, reject) => {
      client.on("error", reject)
      client.on("connect", resolve)
    })
    const req = client.request({
      ":method": "POST",
      ":path": "/",
      "x-cursor-h2-origin": "https://api2.cursor.sh",
    })
    const status = await new Promise((resolve) => {
      req.on("response", (headers) => resolve(headers[":status"]))
      // expect either 502 or stream error, but not 400
      req.on("error", () => resolve(502))
      setTimeout(() => resolve(502), 2000)
    })
    assert.notEqual(status, 400)
    client.close()
    req.destroy()
  } finally {
    child.kill()
    await new Promise((r) => setTimeout(r, 200))
  }
})

test("current 9418/9419 data behavior stays compatible: h2 does not require control token", async () => {
  const [healthPort, h2Port] = await getTwoPorts()
  const token = crypto.randomUUID()
  const child = spawnSidecar({ healthPort, h2Port, token })
  try {
    await waitForHealth({ healthPort, token })
    // h2 request without control token should still be processed (origin validation only)
    const client = http2.connect(`http://127.0.0.1:${h2Port}`)
    await new Promise((resolve, reject) => {
      client.on("error", reject)
      client.on("connect", resolve)
    })
    const req = client.request({
      ":method": "POST",
      ":path": "/",
      "x-cursor-h2-origin": "https://api2.cursor.sh",
      // no control token header
    })
    const status = await new Promise((resolve) => {
      req.on("response", (headers) => resolve(headers[":status"]))
      req.on("error", () => resolve(502))
      setTimeout(() => resolve(502), 2000)
    })
    // should not be 401
    assert.notEqual(status, 401)
    client.close()
    req.destroy()
  } finally {
    child.kill()
    await new Promise((r) => setTimeout(r, 200))
  }
})
