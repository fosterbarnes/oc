import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import { EventEmitter } from "node:events"
import { log } from "./logger.js"
import { pluginTmpDir } from "./tmp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { HostToolResult } from "./shared.js"
import { DEFAULT_PROXY_TOOLS, TASK_BATCH_TOOL_NAME, taskBatchInputError, type ProxyToolDef } from "./proxyToolDefs.js"
import {
  armProxyDeadline,
  buildProxyTimeoutError,
  PROXY_NO_DEADLINE_MS,
  resolveProxyCallTimeoutMs,
  resolveProxyClientCeilingMs,
  type ProxyDeadline,
} from "./proxyDeadline.js"

/**
 * Minimal MCP HTTP server embedded in-process. Exposes a set of "proxy"
 * tools (Bash, Edit, Write, etc.) that Claude CLI calls when its built-in
 * equivalents are disabled via --disallowedTools. Our handler blocks until
 * an external broker resolves the call, then responds to Claude.
 *
 * Wire protocol: JSON-RPC 2.0 over plain HTTP POST to `/mcp`. Protocol
 * methods (`initialize`, `tools/list`) and calls answered in-process get a
 * single JSON reply. A broker-backed `tools/call` can block for as long as
 * opencode takes to run the tool, so its reply is streamed: SSE when the
 * client accepts it, otherwise a chunked JSON body whose headers go out at
 * once and which carries keepalive whitespace until the result is ready
 * (see `openEventStream` / `openJsonStream`).
 */

export interface ProxyMcpServer {
  url: string
  serverName: string
  tools: ProxyToolDef[]
  /** Per-server bearer secret. Minted on start, handed to Claude via the
   * `headers` block of the generated MCP config, and required on every
   * request. Exposed so callers (and tests) can authenticate; MUST NOT be
   * logged or placed in the URL. */
  authToken: string
  /** Fires when Claude invokes one of our proxy tools. The handler resolves
   * the returned pending call once a result is available. */
  calls: EventEmitter
  /**
   * Write `--mcp-config <path>`-compatible scratch file and return its path.
   * Deferred by default: Claude loads each tool through ToolSearch when needed.
   * `alwaysLoad: true` (command-permission spawns) includes every schema up front.
   */
  configPath(): string
  /**
   * Ids of the `tools/call` requests this server is still holding open.
   * Read-only. An entry leaves this list only when its promise settles, so
   * it is the direct evidence that a lifecycle event released the HTTP side
   * of a call and not just the broker's entry for it.
   */
  pendingCallIds(): string[]
  close(): Promise<void>
}

/**
 * Liveness of the HTTP reply channel behind one proxy call. Shared by
 * reference between proxy-mcp (which flips `closed` when Claude's request
 * goes away) and the broker / language model (which read it before
 * answering), so the two never need to import each other.
 */
export interface ProxyCallChannel {
  closed: boolean
}

export interface ProxyToolCall {
  id: string
  toolName: string
  input: Record<string, unknown>
  resolve: (result: ProxyToolResult) => void
  reject: (err: Error) => void
  /** Absent for calls built by hand in tests; treated as open. */
  channel?: ProxyCallChannel
  signal?: AbortSignal
}

/**
 * Keep unanswered HTTP calls active independently of the tool deadline.
 * A held call timed out before delivery on CLI 2.1.258; with immediate
 * headers and these comments, the same 390-second hold completed. The same
 * cadence drives the whitespace keepalive of a JSON-only reply: both must
 * stay well under the ~300 s header/body timers in the CLI's HTTP client.
 */
export const PROXY_KEEPALIVE_MS = 15_000

/** True when the client advertised `text/event-stream` in Accept. */
export function acceptsEventStream(acceptHeader: unknown): boolean {
  return typeof acceptHeader === "string" && acceptHeader.toLowerCase().includes("text/event-stream")
}

export type ProxyToolResult =
  | { kind: "text"; text: string; isError?: boolean; content?: CallToolResult["content"] }
  | { kind: "error"; message: string }

export function proxyToolResult(result: HostToolResult): ProxyToolResult {
  if (!result.attachments?.length) return { kind: "text", text: result.output }
  const content: CallToolResult["content"] = [{ type: "text", text: result.output }]
  for (const attachment of result.attachments) {
    // Claude CLI saves MCP PDF blobs to disk without exposing the document to the model.
    if (attachment.mime === "application/pdf")
      return {
        kind: "error",
        message: "Claude Code cannot read PDF attachments returned by MCP tools. PDF content was not delivered.",
      }
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(attachment.mime))
      return { kind: "error", message: `Claude Code cannot receive attachment type ${attachment.mime}.` }
    const prefix = `data:${attachment.mime};base64,`
    if (!attachment.url.startsWith(prefix))
      return { kind: "error", message: "Tool attachment must be a base64 data URL." }
    const data = attachment.url.slice(prefix.length)
    if (!data || Buffer.byteLength(data) > 5 * 1024 * 1024)
      return { kind: "error", message: "Tool image attachment is empty or exceeds the 5 MB delivery limit." }
    content.push({ type: "image", data, mimeType: attachment.mime })
  }
  return { kind: "text", text: result.output, content }
}

export const SERVER_CLOSED_MESSAGE = "proxy MCP server closed"

/** Rejections that fire on normal lifecycle transitions: AFK-permission
 * timeouts, orphan rejections at turn boundaries, stream aborts, and server
 * close while its owning Claude process exits or is replaced. None are
 * user-actionable - file-log them at NOTICE. Anything else stays WARN so
 * genuine bugs remain visible in the TUI. */
export function isExpectedCleanupError(message: string): boolean {
  return (
    (message.includes("timed out after") && message.includes("waiting for opencode to resolve")) ||
    message.includes("rejecting as orphaned") ||
    message.includes("was orphaned by a new user turn") ||
    message.includes("stream was aborted") ||
    message.includes("connection closed before its result") ||
    message.includes("Provider stream closed before proxy calls completed") ||
    message.includes(SERVER_CLOSED_MESSAGE)
  )
}

const PROTOCOL_VERSION = "2024-11-05"
const SERVER_NAME = "opencode_proxy"
export const PROXY_TOOL_PREFIX = `mcp__${SERVER_NAME}__`

export async function createProxyMcpServer(
  tools: ProxyToolDef[] = DEFAULT_PROXY_TOOLS,
  timeoutOverrides?: Record<string, number>,
  options: {
    /** Keepalive cadence for streamed replies; a test seam, defaults to `PROXY_KEEPALIVE_MS`. */
    keepaliveMs?: number
    /**
     * When true, the generated MCP config sets `alwaysLoad` so Claude includes
     * this server's tool schemas without ToolSearch. Command-permission turns
     * only: `--tools ""` strips built-ins (and ToolSearch), and native tools
     * must stay off so oc's permission rules cannot be bypassed.
     */
    alwaysLoad?: boolean
  } = {},
): Promise<ProxyMcpServer> {
  const calls = new EventEmitter()
  const pending = new Map<string, ProxyToolCall>()
  const keepaliveMs = options.keepaliveMs ?? PROXY_KEEPALIVE_MS
  const alwaysLoad = options.alwaysLoad === true

  // Per-server bearer secret (256 bits). This endpoint executes Bash/Edit/
  // Write through opencode's executor, so an unauthenticated caller on
  // loopback would have arbitrary command execution. The token lives only
  // in this process and in the 0600 MCP config file Claude reads; it is
  // deliberately kept out of the URL, because query strings leak into logs
  // and process listings.
  const authToken = randomBytes(32).toString("hex")
  const expectedAuth = Buffer.from(`Bearer ${authToken}`)
  // The exact authority we hand to Claude. Set once the ephemeral port is
  // known; compared against the Host header to defeat DNS rebinding.
  let boundAuthority = ""

  function authOk(req: IncomingMessage): boolean {
    const got = req.headers.authorization
    if (typeof got !== "string") return false
    const candidate = Buffer.from(got)
    // timingSafeEqual throws on length mismatch, so length-check first.
    // Length is not secret (the token is fixed-width).
    if (candidate.length !== expectedAuth.length) return false
    return timingSafeEqual(candidate, expectedAuth)
  }

  /**
   * Reject a request without leaving the connection usable.
   *
   * Ending the response alone is not enough. A peer can declare a large
   * Content-Length, send a single byte, take the rejection, and leave the
   * request still arriving - and `server.close()` does not reap connections
   * that are still sending, so a shutdown would hang behind it. Node's
   * default whole-request timeout is five minutes, which is five minutes of
   * a socket held by an unauthenticated caller.
   *
   * `Connection: close` tells Node to close once the response is flushed;
   * destroying the socket on `finish` covers the case where the peer never
   * finishes its body.
   */
  function reject(req: IncomingMessage, res: ServerResponse, statusCode: number, reason: string): void {
    // Every guard below is a measured property of the client we spawn, not a
    // guarantee about future ones. If a later Claude CLI starts sending an
    // Origin header, or a different Content-Type, every proxy call would
    // 403/415 with no other symptom than tools mysteriously not working - so
    // say why, here, once per rejected request. Header VALUES are omitted:
    // this line must never carry the bearer token.
    log.notice("proxyMcp rejected a request", {
      statusCode,
      reason,
      method: req.method,
      hasAuthorization: typeof req.headers.authorization === "string",
    })
    res.statusCode = statusCode
    res.setHeader("Connection", "close")
    res.on("finish", () => {
      req.socket?.destroy()
    })
    res.end()
  }

  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
      reject(req, res, 404, "not a POST to /mcp")
      return
    }
    // Everything below runs BEFORE readBody: an unauthenticated peer must
    // not be able to stream an unbounded body into memory.
    //
    // DNS rebinding: a browser rebound onto this port via an attacker
    // hostname sends that hostname in Host, never the loopback authority we
    // generated. This does NOT block a page posting directly to
    // 127.0.0.1:<port> - such a request carries exactly the expected Host -
    // so it is a rebinding defense specifically, not a browser defense. The
    // Origin and Content-Type guards below, and the token, cover that case.
    if (req.headers.host !== boundAuthority) {
      reject(req, res, 403, "host header is not the bound authority")
      return
    }
    // Claude Code 2.1.226 sends no Origin on MCP requests (verified). The MCP
    // transport spec obliges SERVERS to validate Origin; it does not oblige
    // clients to omit it, so this is a measured property of the client we
    // spawn rather than a guarantee about all conforming clients.
    if (req.headers.origin !== undefined) {
      reject(req, res, 403, "origin header present")
      return
    }
    // Requiring application/json forces a CORS preflight for cross-origin
    // callers (which then fails), closing the text/plain "simple request"
    // bypass that would otherwise allow blind cross-site POSTs.
    const contentType = String(req.headers["content-type"] ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase()
    if (contentType !== "application/json") {
      reject(req, res, 415, "content-type is not application/json")
      return
    }
    if (!authOk(req)) {
      reject(req, res, 401, "missing or invalid bearer token")
      return
    }
    // Hoist the request id and method so the catch block can echo them
    // in error responses. Without this, a broker rejection (timeout /
    // orphan) on a tools/call lands in the catch with no visible id, and
    // the response goes back with `id: null` which Claude CLI cannot
    // match to the original request. The method is also needed because
    // tools/call errors must be returned as MCP results with isError
    // (not JSON-RPC errors) or Claude CLI rejects them as a "malformed
    // result that failed schema validation" (seen live 2026-07-04).
    let requestId: number | string | null = null
    let requestMethod: string | null = null
    // Hoisted for the same reason: once a streamed reply's headers are out,
    // an error must travel down that stream instead of through writeJson
    // (which would try to set headers again and throw inside the catch).
    let reply: ReplyStream | null = null
    try {
      const body = await readBody(req)
      const request = JSON.parse(body) as {
        jsonrpc?: string
        id?: number | string | null
        method?: string
        params?: Record<string, unknown>
      }
      requestId = request?.id ?? null
      requestMethod = typeof request?.method === "string" ? request.method : null

      if (request?.jsonrpc !== "2.0" || typeof request.method !== "string") {
        writeJson(res, {
          jsonrpc: "2.0",
          id: requestId,
          error: { code: -32600, message: "Invalid request" },
        })
        return
      }

      log.debug("proxyMcp request", {
        method: request.method,
        id: request.id,
      })

      if (request.method === "initialize") {
        writeJson(res, {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: {
              name: SERVER_NAME,
              version: "0.1.0",
            },
          },
        })
        return
      }

      if (request.method === "notifications/initialized") {
        res.statusCode = 204
        res.end()
        return
      }

      if (request.method === "tools/list") {
        writeJson(res, {
          jsonrpc: "2.0",
          id: requestId,
          result: {
            tools: tools.map((t) => ({
              name: t.name,
              description: t.description,
              inputSchema: t.inputSchema,
            })),
          },
        })
        return
      }

      if (request.method === "tools/call") {
        const params = request.params ?? {}
        const toolName = String(params.name ?? "")
        const input = (params.arguments ?? {}) as Record<string, unknown>

        if (!tools.some((t) => t.name === toolName)) {
          // tools/call failures MUST be MCP results with isError, never
          // JSON-RPC error envelopes: Claude CLI validates every tools/call
          // response against the MCP result schema and rejects JSON-RPC
          // errors as malformed (@jknlsn, seen live 2026-07-04).
          writeJson(res, {
            jsonrpc: "2.0",
            id: requestId,
            result: {
              content: [{ type: "text", text: `Unknown proxy tool: ${toolName}` }],
              isError: true,
            },
          })
          return
        }

        if (toolName === TASK_BATCH_TOOL_NAME) {
          const problem = taskBatchInputError(input)
          if (problem) {
            // Same rule as the unknown-tool path: an MCP result with isError,
            // never a JSON-RPC error envelope.
            writeToolCallResult(res, requestId, { kind: "error", message: problem })
            return
          }
        }

        const callId = randomUUID()
        log.info("proxyMcp tool call received", {
          callId,
          toolName,
          hasInput: input != null,
          sse: acceptsEventStream(req.headers.accept),
        })

        // Broker-backed calls can block for as long as a subagent runs. The
        // reply is streamed either way so the client's own HTTP timers never
        // fire on a silent connection: SSE when the client accepts it
        // (headers and a comment now, keepalive comments, the JSON-RPC result
        // as the final event), otherwise a chunked JSON body whose headers go
        // out now and which carries keepalive whitespace until the result.
        // Every guard above has already run, so nothing is flushed for an
        // unauthenticated peer, an unknown tool, or a rejected batch.
        const channel: ProxyCallChannel = { closed: false }
        const cancellation = new AbortController()
        reply = acceptsEventStream(req.headers.accept)
          ? openEventStream(res, keepaliveMs)
          : openJsonStream(res, keepaliveMs)
        res.once("close", () => {
          reply?.stop()
          if (res.writableFinished) return
          channel.closed = true
          pending.get(callId)?.reject(new Error(`Proxy tool '${toolName}' connection closed before its result`))
          log.notice("proxyMcp client closed a tool call before its result", {
            callId,
            toolName,
          })
        })

        let timer: ProxyDeadline | null = null
        const result = await new Promise<ProxyToolResult>((resolve, reject) => {
          const entry: ProxyToolCall = {
            id: callId,
            toolName,
            input,
            resolve,
            reject: (error) => {
              cancellation.abort(error)
              reject(error)
            },
            channel,
            signal: cancellation.signal,
          }
          pending.set(callId, entry)
          const deadlineMs = resolveProxyCallTimeoutMs(toolName, input, timeoutOverrides)
          // No deadline means no timer at all: `setTimeout(fn, 0)` would
          // reject the call on the next tick. The broker applies the same
          // rule to the same resolved value, so the two layers agree.
          if (deadlineMs > PROXY_NO_DEADLINE_MS) {
            // A permission prompt still open in opencode extends it; see
            // `ProxyDeadlineGuard`. The broker logs that, not this layer.
            timer = armProxyDeadline({
              callId,
              toolName,
              deadlineMs,
              onExpire: () => {
                if (!pending.has(callId)) return
                pending.delete(callId)
                log.notice("proxyMcp tool call timed out", {
                  callId,
                  toolName,
                  deadlineMs,
                })
                entry.reject(buildProxyTimeoutError(toolName, deadlineMs))
              },
            })
          }
          calls.emit("call", entry)
        }).finally(() => {
          timer?.cancel()
          pending.delete(callId)
        })

        if (channel.closed) {
          // Late results are discarded without another execution or delivery path.
          log.notice("proxyMcp dropping result for a closed tool call", {
            callId,
            toolName,
          })
          return
        }
        writeToolCallResult(res, requestId, result, reply)
        return
      }

      writeJson(res, {
        jsonrpc: "2.0",
        id: requestId,
        error: { code: -32601, message: `Unknown method: ${request.method}` },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const logFn = isExpectedCleanupError(errorMessage) ? log.notice : log.warn
      logFn("proxyMcp error handling request", {
        error: errorMessage,
      })
      // Broker rejections (timeouts, orphans, server close) surface here for
      // tools/call requests. Same rule as above: respond with an MCP result
      // carrying isError, never a JSON-RPC error envelope, or Claude CLI
      // rejects the response as schema-invalid.
      if (requestMethod === "tools/call") {
        try {
          writeToolCallResult(res, requestId, { kind: "error", message: errorMessage }, reply)
        } catch {
          try {
            res.statusCode = 500
            res.end()
          } catch {}
        }
        return
      }
      try {
        // tools/call already returned above with an MCP result; anything
        // reaching here is a protocol-level method (initialize, tools/list)
        // where a JSON-RPC error is the correct shape.
        writeJson(res, {
          jsonrpc: "2.0",
          id: requestId,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal error",
          },
        })
      } catch {
        try {
          res.statusCode = 500
          res.end()
        } catch {}
      }
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject)
      resolve()
    })
  })

  const addr = server.address() as AddressInfo | null
  if (!addr) {
    server.close()
    throw new Error("Failed to bind proxy MCP server")
  }

  boundAuthority = `127.0.0.1:${addr.port}`
  const url = `http://${boundAuthority}/mcp`

  // NOTE: authToken is deliberately absent from this line and every other
  // log call. The plugin log is written to disk and echoed to the TUI in
  // debug mode; a leaked token there would defeat the whole mechanism.
  log.info("proxyMcp server started", {
    url,
    tools: tools.map((t) => t.name),
  })

  let configFile: string | undefined

  const api: ProxyMcpServer = {
    url,
    serverName: SERVER_NAME,
    tools,
    authToken,
    calls,
    configPath() {
      if (configFile) return configFile
      const body = JSON.stringify(
        {
          mcpServers: {
            [SERVER_NAME]: {
              type: "http",
              url,
              // Claude CLI replays these headers on every request to this
              // server, which is what lets the handler above reject anyone
              // who did not read this 0600 file.
              headers: { Authorization: `Bearer ${authToken}` },
              timeout: resolveProxyClientCeilingMs(timeoutOverrides),
              ...(alwaysLoad ? { alwaysLoad: true } : {}),
            },
          },
        },
        null,
        2,
      )
      const hash = createHash("sha256").update(body).digest("hex").slice(0, 12)
      const outPath = join(pluginTmpDir(), `proxy-${hash}.json`)
      writeFileSync(outPath, body, { encoding: "utf8", mode: 0o600 })
      configFile = outPath
      return outPath
    },
    pendingCallIds() {
      return [...pending.keys()]
    },
    async close() {
      for (const entry of pending.values()) {
        entry.reject(new Error(SERVER_CLOSED_MESSAGE))
      }
      pending.clear()
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
      if (configFile) {
        try {
          unlinkSync(configFile)
        } catch {}
      }
      configFile = undefined
    },
  }

  return api
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")))
    req.on("error", reject)
  })
}

/**
 * The single exit for every `tools/call`, broker-backed or intercepted.
 * Success and failure share one MCP result envelope: a JSON-RPC error for
 * `kind: "error"` was rejected by Claude CLI as a "malformed result that
 * failed schema validation", so tool failures must surface as
 * `isError: true` instead.
 */
function writeToolCallResult(
  res: ServerResponse,
  requestId: unknown,
  result: ProxyToolResult,
  reply: ReplyStream | null = null,
): void {
  const text = result.kind === "error" ? result.message : result.text
  const isError = result.kind === "error" || result.isError === true
  const envelope = {
    jsonrpc: "2.0",
    id: requestId ?? null,
    result: {
      content: result.kind === "text" && result.content ? result.content : [{ type: "text", text }],
      isError,
    },
  }
  if (reply) {
    reply.finish(envelope)
    return
  }
  writeJson(res, envelope)
}

/**
 * An in-flight streamed reply whose headers are already on the wire.
 * `finish` writes the JSON-RPC response and ends the body; `stop` only
 * cancels the keepalive, for when the client went away first.
 */
interface ReplyStream {
  finish(envelope: unknown): void
  stop(): void
}

/**
 * Write `ping` every `keepaliveMs` until stopped or the response is gone.
 * Never keeps the host process alive on its own.
 */
function startKeepalive(res: ServerResponse, keepaliveMs: number, ping: string): () => void {
  let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
    if (res.writableEnded || res.destroyed) {
      stop()
      return
    }
    res.write(ping)
  }, keepaliveMs)
  timer.unref?.()
  const stop = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }
  return stop
}

/**
 * SSE reply: the JSON-RPC response goes out as the single `message` event,
 * which is what the MCP Streamable HTTP client expects for a request
 * answered over SSE.
 */
function openEventStream(res: ServerResponse, keepaliveMs: number): ReplyStream {
  res.statusCode = 200
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()
  // Start the response body without waiting for the tool result.
  res.write(": open\n\n")
  const stop = startKeepalive(res, keepaliveMs, ": keepalive\n\n")
  return {
    stop,
    finish(envelope) {
      stop()
      if (res.writableEnded || res.destroyed) return
      res.end(`event: message\ndata: ${JSON.stringify(envelope)}\n\n`)
    },
  }
}

/**
 * JSON reply for a client that did not ask for SSE (@broskees' 68ed142,
 * adapted). Headers are flushed at once, which stops the client's header
 * timer, and whitespace is written on the keepalive cadence, which stops its
 * body timer. There is no `Content-Length`, so the body is chunked, and the
 * envelope is written last: whitespace before a JSON value is insignificant
 * (RFC 8259), so the whole body still parses as the one JSON-RPC response,
 * on success and on error alike.
 */
function openJsonStream(res: ServerResponse, keepaliveMs: number): ReplyStream {
  res.statusCode = 200
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.flushHeaders()
  const stop = startKeepalive(res, keepaliveMs, " ")
  return {
    stop,
    finish(envelope) {
      stop()
      if (res.writableEnded || res.destroyed) return
      res.end(JSON.stringify(envelope))
    },
  }
}

function writeJson(res: ServerResponse, body: unknown): void {
  if (res.destroyed || res.writableEnded) return
  const payload = JSON.stringify(body)
  res.statusCode = 200
  res.setHeader("Content-Type", "application/json")
  res.setHeader("Content-Length", Buffer.byteLength(payload).toString())
  res.end(payload)
}
