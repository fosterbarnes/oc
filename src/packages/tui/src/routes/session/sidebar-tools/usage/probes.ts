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

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage"
const GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage"
const OPENROUTER_URL = "https://openrouter.ai/api/v1/key"

export type OpenAIUsage =
  | {
      ok: true
      accountID?: string
      primary: UsageWindow
      secondary: UsageWindow
      fetchedAt?: number
      metadata?: UsageProbeMetadata
    }
  | {
      ok: false
      accountID?: string
      reason?: "reauthenticate"
      metadata?: UsageProbeMetadata
    }

export type OpenCodeGoUsage =
  | {
      ok: true
      weekly: UsageWindow
      monthly: UsageWindow | null
      fetchedAt?: number
      metadata?: UsageProbeMetadata
    }
  | {
      ok: false
      metadata?: UsageProbeMetadata
    }

export type OpenRouterUsage =
  | {
      ok: true
      usedPercent: number
      remainingPercent: number
      usedUsd: number
      limitUsd: number
      fetchedAt?: number
      metadata?: UsageProbeMetadata
    }
  | {
      ok: false
      metadata?: UsageProbeMetadata
    }

function resetTimestamp(resetAt: unknown, resetAfterSeconds: unknown, nowMs: number): number | null {
  const timestamp =
    typeof resetAt === "number" && Number.isFinite(resetAt)
      ? resetAt
      : typeof resetAfterSeconds === "number" && Number.isFinite(resetAfterSeconds) && resetAfterSeconds >= 0
        ? nowMs / 1000 + resetAfterSeconds
        : null
  if (timestamp === null) return null
  const ms = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
  return Number.isNaN(new Date(ms).valueOf()) ? null : ms
}

function windowFromUsage(value: unknown, receiptMs: number): UsageWindow | null {
  if (!value || typeof value !== "object") return null
  const window = value as {
    used_percent?: unknown
    reset_at?: unknown
    reset_after_seconds?: unknown
    limit_window_seconds?: unknown
  }
  if (typeof window.used_percent !== "number" || !Number.isFinite(window.used_percent)) return null
  const usedPercent = clampUsagePercent(window.used_percent)
  const minutes = typeof window.limit_window_seconds === "number" ? Math.round(window.limit_window_seconds / 60) : null
  const resetMs = resetTimestamp(window.reset_at, window.reset_after_seconds, receiptMs)
  return {
    usedPercent,
    resetAt: resetMs === null ? null : compactResetDate(new Date(resetMs)),
    resetMs,
    minutes,
    fetchedAt: receiptMs,
  }
}

function parseUsageResponse(value: unknown, receiptMs: number): OpenAIUsage {
  if (!value || typeof value !== "object") return errorResult()
  const body = value as { rate_limit?: { primary_window?: unknown; secondary_window?: unknown } }
  const primary = windowFromUsage(body.rate_limit?.primary_window, receiptMs)
  const secondary = windowFromUsage(body.rate_limit?.secondary_window, receiptMs) ?? {
    usedPercent: null,
    resetAt: null,
    resetMs: null,
    minutes: null,
  }
  if (!primary) return errorResult()
  return {
    ok: true,
    primary,
    secondary,
  }
}

function usageHeaders(credentials: { access: string; accountId?: string }) {
  return {
    Authorization: `Bearer ${credentials.access}`,
    accept: "application/json",
    ...(credentials.accountId ? { "chatgpt-account-id": credentials.accountId } : {}),
  }
}

function errorResult(): OpenAIUsage {
  return { ok: false }
}

function goErrorResult(): OpenCodeGoUsage {
  return { ok: false }
}

function openRouterErrorResult(): OpenRouterUsage {
  return { ok: false }
}

export async function probeOpenAIUsage(options: UsageOptions = {}): Promise<OpenAIUsage> {
  const nowMs = options.nowMs ?? Date.now()
  let credentials: { access: string; accountId?: string }
  try {
    const raw = await readAuthContent(options)
    const openai = (JSON.parse(raw) as { openai?: { access?: unknown; accountId?: unknown; expires?: unknown } }).openai
    const accountID = typeof openai?.accountId === "string" ? openai.accountId : undefined
    if (typeof openai?.expires === "number" && Number.isFinite(openai.expires) && openai.expires <= nowMs) {
      return { ok: false, reason: "reauthenticate", ...(accountID ? { accountID } : {}) }
    }
    if (typeof openai?.access !== "string" || openai.access.trim() === "") return errorResult()
    credentials = {
      access: openai.access,
      accountId: typeof openai.accountId === "string" ? openai.accountId : undefined,
    }
  } catch {
    return errorResult()
  }

  try {
    const fetched = await fetchUsageResponse(options, USAGE_URL, usageHeaders(credentials))
    const parsed = parseUsageResponse(fetched.body, fetched.receiptMs)
    return parsed.ok ? { ...parsed, accountID: credentials.accountId, fetchedAt: fetched.receiptMs } : parsed
  } catch (error) {
    const metadata = usageFailureMetadata(error)
    if (error instanceof UsageRequestError && error.status === 401) {
      return { ok: false, reason: "reauthenticate", ...(metadata ? { metadata } : {}),
        ...(credentials.accountId ? { accountID: credentials.accountId } : {}) }
    }
    return { ok: false, ...(metadata ? { metadata } : {}),
      ...(credentials.accountId ? { accountID: credentials.accountId } : {}) }
  }
}

function goWindow(value: unknown, minutes: number, receiptMs: number): UsageWindow | null {
  if (!value || typeof value !== "object") return null
  const window = value as { percent?: unknown; resetsAt?: unknown }
  if (typeof window.percent !== "number" || !Number.isFinite(window.percent)) return null
  if (typeof window.resetsAt !== "string") return null
  const reset = new Date(window.resetsAt)
  if (Number.isNaN(reset.valueOf())) return null
  return {
    usedPercent: clampUsagePercent(window.percent),
    resetAt: compactResetDate(reset),
    resetMs: reset.valueOf(),
    minutes,
    fetchedAt: receiptMs,
  }
}

function parseGoUsageResponse(value: unknown, receiptMs: number): OpenCodeGoUsage {
  if (!value || typeof value !== "object") return goErrorResult()
  const usage = (value as { usage?: unknown }).usage
  if (!usage || typeof usage !== "object") return goErrorResult()
  const windows = usage as { weekly?: unknown; monthly?: unknown }
  const weekly = goWindow(windows.weekly, 7 * 24 * 60, receiptMs)
  if (!weekly) return goErrorResult()
  return {
    ok: true,
    weekly,
    monthly: goWindow(windows.monthly, 30 * 24 * 60, receiptMs),
  }
}

export async function probeOpenCodeGoUsage(options: UsageOptions = {}): Promise<OpenCodeGoUsage> {
  let key: string
  try {
    const raw = await readAuthContent(options)
    const credential = (JSON.parse(raw) as { "opencode-go"?: { key?: unknown } })["opencode-go"]
    if (typeof credential?.key !== "string" || credential.key.trim() === "") return goErrorResult()
    key = credential.key
  } catch {
    return goErrorResult()
  }

  try {
    const fetched = await fetchUsageResponse(options, GO_USAGE_URL, {
      Authorization: `Bearer ${key}`,
      accept: "application/json",
    })
    const parsed = parseGoUsageResponse(fetched.body, fetched.receiptMs)
    return parsed.ok ? { ...parsed, fetchedAt: fetched.receiptMs } : parsed
  } catch (error) {
    const metadata = usageFailureMetadata(error)
    return metadata ? { ok: false, metadata } : goErrorResult()
  }
}

function parseOpenRouterResponse(value: unknown): OpenRouterUsage {
  if (!value || typeof value !== "object") return openRouterErrorResult()
  const data = (value as { data?: { limit?: unknown; limit_remaining?: unknown } }).data
  if (!data || typeof data !== "object") return openRouterErrorResult()
  const { limit, limit_remaining } = data
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return openRouterErrorResult()
  if (typeof limit_remaining !== "number" || !Number.isFinite(limit_remaining)) return openRouterErrorResult()
  const remaining = Math.max(0, Math.min(limit, limit_remaining))
  const usedUsd = limit - remaining
  return {
    ok: true,
    usedPercent: clampUsagePercent((usedUsd / limit) * 100),
    remainingPercent: clampUsagePercent((remaining / limit) * 100),
    usedUsd,
    limitUsd: limit,
  }
}

export async function probeOpenRouterUsage(options: UsageOptions = {}): Promise<OpenRouterUsage> {
  let key: string | undefined
  const env = options.env ?? (options.authPath ? {} : process.env)
  if (typeof env.OPENROUTER_API_KEY === "string" && env.OPENROUTER_API_KEY.trim() !== "") {
    key = env.OPENROUTER_API_KEY.trim()
  } else {
    try {
      const raw = await readAuthContent(options)
      const credential = (JSON.parse(raw) as { openrouter?: { key?: unknown } }).openrouter
      if (typeof credential?.key === "string" && credential.key.trim() !== "") key = credential.key.trim()
    } catch {
      key = undefined
    }
  }
  if (!key) return openRouterErrorResult()

  try {
    const fetched = await fetchUsageResponse(options, OPENROUTER_URL, {
      Authorization: `Bearer ${key}`,
      accept: "application/json",
    })
    const parsed = parseOpenRouterResponse(fetched.body)
    return parsed.ok ? { ...parsed, fetchedAt: fetched.receiptMs } : parsed
  } catch (error) {
    const metadata = usageFailureMetadata(error)
    return metadata ? { ok: false, metadata } : openRouterErrorResult()
  }
}
