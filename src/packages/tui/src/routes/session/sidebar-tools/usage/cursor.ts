import os from "node:os"
import path from "node:path"
import {
  clampUsagePercent,
  fetchUsageResponse,
  readAuthContent,
  usageFailureMetadata,
  UsageRequestError,
  type UsageOptions,
} from "./fetch"
import { compactResetDate } from "./format"
import type { UsageProbeMetadata, UsageWindow } from "./snapshot"

const CURSOR_USAGE_URL = "https://cursor.com/api/usage-summary"

export type CursorUsage =
  | {
      ok: true
      monthly: UsageWindow & { apiUsedPercent: number | null }
      fetchedAt?: number
      metadata?: UsageProbeMetadata
    }
  | {
      ok: false
      reason?: "need-token" | "reauthenticate"
      metadata?: UsageProbeMetadata
    }

export function cursorDbPath({
  platform = process.platform,
  env = process.env,
  homeDir = os.homedir(),
}: {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  homeDir?: string
} = {}): string {
  const database = path.join("User", "globalStorage", "state.vscdb")
  if (platform === "win32")
    return path.join(env.APPDATA ?? path.join(homeDir, "AppData", "Roaming"), "Cursor", database)
  if (platform === "darwin") return path.join(homeDir, "Library", "Application Support", "Cursor", database)
  return path.join(env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"), "Cursor", database)
}

async function readCursorAccessToken(dbPath: string): Promise<string | undefined> {
  try {
    const sqlite = await import("node:sqlite")
    const db = new sqlite.DatabaseSync(dbPath, { readOnly: true })
    try {
      const row = db.prepare("SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'").get() as
        | { value?: unknown }
        | undefined
      const value = row?.value
      if (typeof value === "string") return value
      if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8")
      return undefined
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

export function cursorSessionCookie(value: string): string | undefined {
  const token = value.trim()
  if (!token) return undefined
  const decoded = token.includes("%3A%3A") ? token.replaceAll("%3A%3A", "::") : token
  const separator = decoded.indexOf("::")
  const jwt = separator === -1 ? decoded : decoded.slice(separator + 2)
  const parts = jwt.split(".")
  if (parts.length !== 3) return undefined
  const payload = parts[1]
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(parts[1].length / 4) * 4, "=")
  let sub: unknown
  try {
    sub = (JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as { sub?: unknown }).sub
  } catch {
    return undefined
  }
  if (typeof sub !== "string" || sub.trim() === "") return undefined
  return `${encodeURIComponent(sub)}%3A%3A${jwt}`
}

function parseCursorPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return clampUsagePercent(value)
}

function parseCursorUsageResponse(
  value: unknown,
  receiptMs: number,
  accountSource: UsageProbeMetadata["accountSource"],
): CursorUsage {
  if (!value || typeof value !== "object") return { ok: false }
  const body = value as {
    billingCycleEnd?: unknown
    isUnlimited?: unknown
    individualUsage?: unknown
  }
  // billingCycleStart is the start of the current cycle, not its reset, so it never stands in for the reset.
  const resetAt = typeof body.billingCycleEnd === "string" ? new Date(body.billingCycleEnd) : undefined
  if (!resetAt || Number.isNaN(resetAt.valueOf())) return { ok: false }
  const plan =
    body.individualUsage && typeof body.individualUsage === "object"
      ? (body.individualUsage as { plan?: unknown }).plan
      : undefined
  if (!plan || typeof plan !== "object") return { ok: false }
  const window = plan as {
    used?: unknown
    limit?: unknown
    autoPercentUsed?: unknown
    apiPercentUsed?: unknown
    totalPercentUsed?: unknown
  }
  const usedPercent =
    body.isUnlimited === true
      ? null
      : (parseCursorPercent(window.autoPercentUsed) ??
        (typeof window.used === "number" &&
        Number.isFinite(window.used) &&
        typeof window.limit === "number" &&
        Number.isFinite(window.limit) &&
        window.limit > 0
          ? clampUsagePercent((window.used / window.limit) * 100)
          : parseCursorPercent(typeof window.totalPercentUsed === "number" && window.totalPercentUsed <= 1
            ? window.totalPercentUsed * 100 : window.totalPercentUsed)))
  if (usedPercent === null && body.isUnlimited !== true) return { ok: false }
  return {
    ok: true,
    fetchedAt: receiptMs,
    monthly: {
      usedPercent,
      apiUsedPercent: parseCursorPercent(window.apiPercentUsed),
      resetAt: compactResetDate(resetAt),
      resetMs: resetAt.valueOf(),
      minutes: null,
      fetchedAt: receiptMs,
    },
    ...(accountSource ? { metadata: { accountSource } } : {}),
  }
}

async function readCursorOpenCodeCredential(
  options: UsageOptions,
): Promise<{ token: string } | { unavailable: "need-token" | "reauthenticate" } | undefined> {
  try {
    const raw = await readAuthContent(options)
    const cursor = (JSON.parse(raw) as { cursor?: Record<string, unknown> }).cursor
    if (!cursor || typeof cursor !== "object") return undefined
    if (
      cursor.type === "oauth" &&
      typeof cursor.access === "string" &&
      cursor.access.trim() !== ""
    ) {
      return { token: cursor.access.trim() }
    }
    if (cursor.type === "api" && typeof cursor.key === "string" && cursor.key.trim() !== "") {
      const key = cursor.key.trim()
      if (key.startsWith("crsr_")) return { unavailable: "need-token" }
      if (cursorSessionCookie(key)) return { token: key }
      return { unavailable: "need-token" }
    }
    return { unavailable: "reauthenticate" }
  } catch {
    return undefined
  }
}

export async function probeCursorUsage(options: UsageOptions = {}): Promise<CursorUsage> {
  const openCode = await readCursorOpenCodeCredential(options)
  if (openCode && "unavailable" in openCode)
    return { ok: false, reason: openCode.unavailable, metadata: { accountSource: "opencode" } }

  const openCodeToken = openCode?.token
  const pastedToken = options.cursorSessionToken?.trim()
  const desktopToken = openCodeToken || pastedToken
    ? undefined
    : await readCursorAccessToken(options.cursorDbPath ?? cursorDbPath({ env: options.env, homeDir: options.homeDir }))

  const token = openCodeToken ?? pastedToken ?? desktopToken
  const accountSource: UsageProbeMetadata["accountSource"] | undefined = openCodeToken
    ? "opencode"
    : pastedToken
      ? "cookie"
      : desktopToken
        ? "desktop"
        : undefined

  if (!token) return { ok: false, reason: "need-token" }
  const cookie = cursorSessionCookie(token)
  if (!cookie) return { ok: false, reason: "need-token" }

  try {
    const fetched = await fetchUsageResponse(options, CURSOR_USAGE_URL, {
      Cookie: `WorkosCursorSessionToken=${cookie}`,
      accept: "application/json",
    })
    return parseCursorUsageResponse(fetched.body, fetched.receiptMs, accountSource)
  } catch (error) {
    const metadata = usageFailureMetadata(error)
    if (error instanceof UsageRequestError && (error.status === 401 || error.status === 403)) {
      return { ok: false, reason: "reauthenticate", metadata: { ...metadata, accountSource } }
    }
    return { ok: false, metadata: { ...metadata, accountSource } }
  }
}
