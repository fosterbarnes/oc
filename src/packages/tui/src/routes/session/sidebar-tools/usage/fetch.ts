import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { UsageProbeMetadata } from "./snapshot"

const REQUEST_TIMEOUT_MS = 15_000

/** Shared probe inputs; tests override paths, env, clock, and fetch. */
export type UsageOptions = {
  authPath?: string
  cursorSessionToken?: string
  cursorDbPath?: string
  claudeCredentialsPath?: string
  claudeUsageCachePath?: string
  /** oc.json `claudeAccountNames`, for pooled account names. */
  claudeNames?: Record<string, string>
  env?: NodeJS.ProcessEnv
  homeDir?: string
  fetchImpl?: (input: URL | RequestInfo, init?: RequestInit) => Promise<Response>
  nowMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export class UsageRequestError extends Error {
  readonly status: number
  readonly retryAt?: number

  constructor(status: number, retryAt?: number) {
    super(`Usage request failed with status ${status}.`)
    this.status = status
    this.retryAt = retryAt
  }
}

export function resolveAuthPath({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
}: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): string {
  if (env.OPENCODE_AUTH_PATH) return env.OPENCODE_AUTH_PATH
  if (platform === "win32")
    return path.join(env.LOCALAPPDATA ?? path.join(homeDir, "AppData", "Local"), "opencode", "auth.json")
  if (platform === "darwin") return path.join(homeDir, "Library", "Application Support", "opencode", "auth.json")
  return path.join(env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share"), "opencode", "auth.json")
}

export function clampUsagePercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function usageFailureMetadata(error: unknown): UsageProbeMetadata | undefined {
  if (!(error instanceof UsageRequestError)) return undefined
  return {
    status: error.status,
    ...(error.retryAt === undefined ? {} : { retryAt: error.retryAt }),
  }
}

function parseRetryAfter(header: string | null, receiptMs: number): number | undefined {
  if (!header) return undefined
  const trimmed = header.trim()
  if (!trimmed) return undefined
  const seconds = Number(trimmed)
  if (Number.isFinite(seconds) && seconds >= 0) return receiptMs + seconds * 1000
  const date = Date.parse(trimmed)
  if (!Number.isNaN(date)) return date
  return undefined
}

export async function fetchUsageResponse(
  options: UsageOptions,
  url: string,
  headers: Record<string, string>,
): Promise<{ body: unknown; receiptMs: number }> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)])
      : AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
  })
  const receiptMs = options.nowMs ?? Date.now()
  if (!response.ok)
    throw new UsageRequestError(response.status, parseRetryAfter(response.headers.get("Retry-After"), receiptMs))
  return { body: await response.json(), receiptMs }
}

export async function readAuthContent(options: UsageOptions): Promise<string> {
  if (options.env?.OPENCODE_AUTH_CONTENT) return options.env.OPENCODE_AUTH_CONTENT
  if (!options.authPath && !options.env && process.env.OPENCODE_AUTH_CONTENT) return process.env.OPENCODE_AUTH_CONTENT
  const authPaths = options.authPath
    ? [options.authPath]
    : [
        resolveAuthPath({ env: options.env, homeDir: options.homeDir }),
        path.join(options.homeDir ?? os.homedir(), ".local", "share", "opencode", "auth.json"),
      ]
  for (const authPath of [...new Set(authPaths)]) {
    try {
      return await readFile(authPath, "utf8")
    } catch {
      continue
    }
  }
  throw new Error("auth file not found")
}
