// One oc-owned cua-driver child (https://cua.ai/docs/cua-driver) shared by every session in this
// process, spoken to over MCP stdio. Only the cua_* tools (tool/cua.ts) use it. On Windows
// `cua-driver mcp` is the full runtime and exits on stdin EOF, so it never outlives oc.
import os from "node:os"
import path from "node:path"
import { existsSync } from "node:fs"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  CallToolResultSchema,
  ErrorCode,
  McpError,
  type CallToolResult,
  type Tool as McpTool,
} from "@modelcontextprotocol/sdk/types.js"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

const MIN_VERSION = "0.35.2"
const CALL_TIMEOUT_MS = 120_000
// Longer than the driver's own 5-minute session expiry, so stopping loses nothing still usable.
const IDLE_STOP_MS = 10 * 60_000
const STDERR_TAIL_CHARS = 4_000

type Connection = { client: Client; tools: Map<string, McpTool> }

let resolvedPath: string | null | undefined
let connection: Connection | undefined
let starting: Promise<Connection> | undefined
let inFlight = 0
let idleTimer: ReturnType<typeof setTimeout> | undefined

/** `CUA_DRIVER_PATH`, then PATH, then the default Windows install. Read once; a new install needs a restart. */
export function driverPath() {
  resolvedPath ??= resolvePath() ?? null
  return resolvedPath ?? undefined
}

/** The driver's tool list, starting the driver if needed. */
export async function tools() {
  const current = await ensure()
  if (inFlight === 0) armIdleStop()
  return current.tools
}

/**
 * Call a driver tool as the oc session's own named driver session, so sessions never share element
 * tokens, snapshot diffs, or the agent cursor. An idle-expired name is revived once.
 */
export async function call(sessionID: string, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
  inFlight++
  clearTimeout(idleTimer)
  try {
    const current = await ensure()
    const session = `oc-${sessionID.slice(-8)}`
    // Not every tool takes `session` (list_sessions rejects unknown properties).
    const accepts = current.tools.get(tool)?.inputSchema.properties?.session !== undefined
    const send = () => request(current, tool, accepts ? { ...args, session } : args, signal)
    const result = await send()
    if (!sessionEnded(result)) return result
    await request(current, "start_session", { session }, signal)
    return send()
  } finally {
    inFlight--
    if (inFlight === 0) armIdleStop()
  }
}

/** Close stdin, then the SDK escalates to SIGTERM and SIGKILL after 2 s each. */
export async function stopCuaDriver() {
  clearTimeout(idleTimer)
  const current = connection
  connection = undefined
  await current?.client.close()
}

function armIdleStop() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => void stopCuaDriver(), IDLE_STOP_MS).unref()
}

function ensure() {
  if (connection) return Promise.resolve(connection)
  starting ??= connect().finally(() => {
    starting = undefined
  })
  return starting
}

async function connect() {
  const command = driverPath()
  if (!command)
    throw new Error(
      "cua-driver is not installed. See https://cua.ai/docs/cua-driver/quickstart or set CUA_DRIVER_PATH.",
    )
  const transport = new StdioClientTransport({
    command,
    args: ["mcp"],
    cwd: os.homedir(),
    // The whole environment, so the user's CUA_DRIVER_* settings (permission mode, policy file) apply.
    env: { ...process.env } as Record<string, string>,
    stderr: "pipe",
  })
  // Drained so a chatty driver never blocks on a full pipe; the tail explains start failures.
  let stderr = ""
  transport.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-STDERR_TAIL_CHARS)
  })
  const client = new Client({ name: "oc", version: InstallationVersion })
  await client.connect(transport).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`cua-driver failed to start: ${message}${stderr.trim() ? `\n${stderr.trim()}` : ""}`)
  })
  const version = client.getServerVersion()?.version ?? "0.0.0"
  if (Bun.semver.order(version, MIN_VERSION) < 0) {
    await client.close()
    throw new Error(`cua-driver ${version} is older than ${MIN_VERSION}. Update it with \`cua-driver update --apply\`.`)
  }
  const next = { client, tools: await listTools(client) }
  client.onclose = () => {
    if (connection?.client === client) connection = undefined
  }
  connection = next
  return next
}

async function listTools(client: Client) {
  const all: McpTool[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined)
    all.push(...page.tools)
    cursor = page.nextCursor
  } while (cursor)
  return new Map(all.map((tool) => [tool.name, tool]))
}

async function request(current: Connection, tool: string, args: Record<string, unknown>, signal?: AbortSignal) {
  return current.client
    .callTool({ name: tool, arguments: args }, CallToolResultSchema, {
      signal,
      timeout: CALL_TIMEOUT_MS,
      resetTimeoutOnProgress: true,
    })
    .catch(async (error: unknown) => {
      // The SDK reports an abort with the timeout code too; only a real timeout means the driver is stuck.
      if (signal?.aborted || !(error instanceof McpError) || error.code !== ErrorCode.RequestTimeout) throw error
      if (connection === current) await stopCuaDriver()
      throw new Error(
        `cua-driver did not answer in ${CALL_TIMEOUT_MS / 1000} s and was restarted. Observe the window again before acting.`,
      )
    }) as Promise<CallToolResult>
}

// Refusals arrive as `{ status: "refused", refusal: { code, message } }`.
function sessionEnded(result: CallToolResult) {
  const refusal = (result.structuredContent as { refusal?: { code?: unknown } } | undefined)?.refusal
  return result.isError === true && refusal?.code === "session_ended"
}

function resolvePath() {
  const override = process.env.CUA_DRIVER_PATH?.trim()
  if (override) return override
  const found = Bun.which("cua-driver")
  if (found) return found
  const local = process.env.LOCALAPPDATA
  const installed = local && path.join(local, "Programs", "Cua", "cua-driver", "bin", "cua-driver.exe")
  return installed && existsSync(installed) ? installed : undefined
}

export * as CuaDriver from "./cuaDriver"
