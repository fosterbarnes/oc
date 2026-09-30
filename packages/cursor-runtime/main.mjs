/**
 * Local HTTP/2 reverse proxy so OpenCode (Bun on Windows) can reach Cursor
 * AWS agent hosts. Bun's TLS/H2 client fails those handshakes; Node's works.
 *
 * Listens on OS-assigned 127.0.0.1 ports (env overrides for tests):
 *   HTTP/1.1 health and h2c (cleartext HTTP/2) from OpenCode.
 * Once listening, prints one JSON line to stdout: {"health":port,"h2":port}.
 * Each OpenCode process owns its own proxy; it exits when that parent dies.
 *
 * Upstream is taken only from x-cursor-h2-origin (must be https://*.cursor.sh).
 *
 * Run streams are bidi Connect/HTTP2. Duplex `.pipe()` plus the 64KB default
 * window stalls OpenCode with `backpressure did not drain after 5000ms`.
 * Keep FLOW_WINDOW and forwardData; do not restore `.pipe()`.
 * Never pause the h2c readable: that withholds WINDOW_UPDATE and the vendor
 * waitForDrain (5s) kills the Run even when Cursor is only slow to accept.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import http2 from "node:http2";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const HEALTH_PORT = Number(process.env.CURSOR_H2_HEALTH_PORT || 0);
export const H2_PORT = Number(process.env.CURSOR_H2_PROXY_PORT || 0);
const HOST = "127.0.0.1";
const ALLOWED_ORIGIN = /^https:\/\/([a-z0-9-]+\.)+cursor\.sh$/i;
export const FLOW_WINDOW = 4 * 1024 * 1024;
export const MAX_FORWARD_QUEUE_BYTES = FLOW_WINDOW;
export const CONTROL_TOKEN_HEADER = "x-opencursor-control-token";
export const CONTROL_TOKEN = (() => {
  const t = process.env.CURSOR_H2_CONTROL_TOKEN?.trim();
  if (t) return t;
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
})();
const PROXY_FILE = fileURLToPath(import.meta.url);
export const SOURCE_STAMP = String(fs.statSync(PROXY_FILE).mtimeMs);
const H2_SETTINGS = { initialWindowSize: FLOW_WINDOW };

const upstreamSessions = new Map();

function applyFlowWindow(session) {
  try {
    session.setLocalWindowSize(FLOW_WINDOW);
  } catch {
    /* session already closed */
  }
}

export function forwardData(src, dest, { end }) {
  const pending = [];
  let waiting = false;
  let srcEnded = false;
  let pendingBytes = 0;
  let closed = false;

  function cleanup() {
    dest.off("drain", flush);
    dest.off("error", onDestError);
    dest.off("close", onDestClose);
    src.off("data", onData);
    src.off("error", onSrcError);
    if (end) src.off("end", onEnd);
  }

  function terminate(error) {
    if (closed) return;
    closed = true;
    pending.length = 0;
    pendingBytes = 0;
    cleanup();
    if (!src.destroyed) src.destroy();
    if (!dest.destroyed) dest.destroy(error);
  }

  function flush() {
    if (closed) return;
    waiting = false;
    while (pending.length > 0) {
      if (dest.destroyed || dest.closed) {
        terminate();
        return;
      }
      const chunk = pending.shift();
      pendingBytes -= chunk.byteLength ?? chunk.length;
      if (!dest.write(chunk)) {
        waiting = true;
        return;
      }
    }
    if (end && srcEnded && !dest.destroyed && !dest.closed) {
      closed = true;
      cleanup();
      dest.end();
    }
  }

  function onData(chunk) {
    if (closed || dest.destroyed || dest.closed) return;
    if (waiting) {
      const bytes = chunk.byteLength ?? chunk.length;
      if (pendingBytes + bytes > MAX_FORWARD_QUEUE_BYTES) {
        terminate(new Error(`forward queue exceeded ${MAX_FORWARD_QUEUE_BYTES} bytes`));
        return;
      }
      pending.push(chunk);
      pendingBytes += bytes;
      return;
    }
    if (!dest.write(chunk)) waiting = true;
  }

  function onEnd() {
    srcEnded = true;
    if (!waiting) flush();
  }

  function onSrcError(error) {
    terminate(error);
  }

  function onDestError(error) {
    terminate(error);
  }

  function onDestClose() {
    terminate();
  }

  dest.on("drain", flush);
  dest.on("error", onDestError);
  dest.on("close", onDestClose);
  src.on("data", onData);
  src.on("error", onSrcError);
  if (end) src.on("end", onEnd);
}

function allowedOrigin(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ALLOWED_ORIGIN.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!/^([a-z0-9-]+\.)+cursor\.sh$/i.test(url.hostname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getUpstream(origin) {
  const existing = upstreamSessions.get(origin);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const session = http2.connect(origin, { settings: H2_SETTINGS });
  applyFlowWindow(session);
  session.on("connect", () => applyFlowWindow(session));
  session.on("error", () => {
    if (upstreamSessions.get(origin) === session) upstreamSessions.delete(origin);
  });
  session.on("close", () => {
    if (upstreamSessions.get(origin) === session) upstreamSessions.delete(origin);
  });
  session.on("goaway", () => {
    if (upstreamSessions.get(origin) === session) upstreamSessions.delete(origin);
  });
  upstreamSessions.set(origin, session);
  return session;
}

function copyHeaders(headers) {
  const out = { ...headers };
  delete out["x-cursor-h2-origin"];
  return out;
}

function requestPath(url) {
  if (typeof url !== "string" || url.length === 0) return "/";
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

function healthHeaders() {
  return {
    "content-type": "text/plain",
    "x-opencursor-proxy-stamp": SOURCE_STAMP,
    "x-opencursor-flow-window": String(FLOW_WINDOW),
  };
}

export function isAuthorized(req) {
  const token = req.headers[CONTROL_TOKEN_HEADER];
  return typeof token === "string" && token === CONTROL_TOKEN;
}

export const healthServer = http.createServer((req, res) => {
  const pathname = requestPath(req.url);
  if (pathname === "/shutdown") {
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end();
      return;
    }
    if (!isAuthorized(req)) {
      res.writeHead(401, { "x-opencursor-proxy-stamp": SOURCE_STAMP });
      res.end();
      return;
    }
    res.writeHead(200, healthHeaders());
    res.end("ok\n");
    setImmediate(() => shutdown());
    return;
  }
  if (pathname === "/health" || pathname === "/") {
    if (!isAuthorized(req)) {
      res.writeHead(401, { "x-opencursor-proxy-stamp": SOURCE_STAMP });
      res.end();
      return;
    }
    res.writeHead(200, healthHeaders());
    res.end("ok\n");
    return;
  }
  res.writeHead(404);
  res.end();
});

export const h2Server = http2.createServer({ settings: H2_SETTINGS });
h2Server.on("session", (session) => {
  applyFlowWindow(session);
  session.on("error", () => {});
});
h2Server.on("stream", (stream, headers) => {
  const origin = allowedOrigin(headers["x-cursor-h2-origin"]);
  if (!origin) {
    stream.respond({ ":status": 400 });
    stream.end("missing or invalid x-cursor-h2-origin");
    return;
  }
  let upstream;
  try {
    upstream = getUpstream(origin);
  } catch (err) {
    stream.respond({ ":status": 502 });
    stream.end(String(err));
    return;
  }
  const url = new URL(origin);
  const fwd = copyHeaders(headers);
  fwd[":authority"] = url.host;
  fwd[":scheme"] = "https";
  let upStream;
  try {
    upStream = upstream.request(fwd);
  } catch (err) {
    stream.respond({ ":status": 502 });
    stream.end(String(err));
    return;
  }
  upStream.on("error", (err) => {
    if (!stream.destroyed) stream.destroy(err);
  });
  stream.on("error", (err) => {
    if (!upStream.destroyed) upStream.destroy(err);
  });
  let trailersSent = false;
  const sendTrailers = (trailers = {}) => {
    if (trailersSent || stream.destroyed || stream.closed) return;
    trailersSent = true;
    try {
      stream.sendTrailers(trailers);
    } catch {
      try {
        stream.close();
      } catch {
        /* already closed */
      }
    }
  };
  upStream.on("response", (upHeaders) => {
    try {
      stream.respond(upHeaders, { waitForTrailers: true });
    } catch {
      /* already closed */
    }
  });
  upStream.on("trailers", (trailers) => sendTrailers(trailers));
  upStream.on("end", () => sendTrailers());
  forwardData(stream, upStream, { end: true });
  forwardData(upStream, stream, { end: false });
});

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
}

let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const session of upstreamSessions.values()) {
    try {
      session.close();
    } catch {
      /* already closed */
    }
  }
  upstreamSessions.clear();
  healthServer.close();
  h2Server.close();
  process.exit(0);
}

export async function start() {
  await listen(healthServer, HEALTH_PORT);
  await listen(h2Server, H2_PORT);
  const ports = { health: healthServer.address().port, h2: h2Server.address().port };
  process.stdout.write(`${JSON.stringify(ports)}\n`);
  console.error(`OpenCode Cursor proxy health http://${HOST}:${ports.health}/health`);
  console.error(`OpenCode Cursor proxy h2c   http://${HOST}:${ports.h2}`);
  // Parent crashes skip its exit hook; poll so orphans do not linger.
  setInterval(() => {
    try {
      process.kill(process.ppid, 0);
    } catch {
      shutdown();
    }
  }, 2000).unref();
  for (const origin of [
    "https://api2.cursor.sh",
    "https://agentn.us.api5.cursor.sh",
    "https://agentn.global.api5.cursor.sh",
  ]) {
    try {
      getUpstream(origin);
    } catch {
      /* warmup is best-effort */
    }
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(PROXY_FILE);
if (isMain) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
