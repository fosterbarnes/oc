/**
 * Account-bound quota observations from live provider responses.
 *
 * Plain module state, no Effect services: provider stream callbacks (Claude
 * turnStream, Codex fetch/WebSocket wrappers) run outside Effect fibers and
 * record here synchronously. A publisher registered from an Effect scope
 * (session/llm run, which owns both bridge and events) forwards each stored
 * observation onto the legacy event transport; the GET `/provider/usage`
 * handler reads the same map for mount/reconnect rehydration.
 *
 * Bounded by account count: one entry per provider/account pair, oldest
 * evicted past the cap. No disk, no daemon.
 */

import type { ProviderUsage } from "@opencode-ai/core/provider-usage"

export type UsageWindow = ProviderUsage.Info["windows"][number]
export type UsageObservation = ProviderUsage.Info
export type IncomingWindow = Omit<UsageWindow, "observedAt">
export type IncomingObservation = Omit<UsageObservation, "windows"> & { readonly windows: readonly IncomingWindow[] }

/** Process-wide entries; the whole point is sharing across project instances. */
const entries = new Map<string, UsageObservation>()
const MAX_ENTRIES = 64

function isValidPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
}

function keyOf(providerID: string, accountID: string): string {
  return `${providerID}|${accountID}`
}

/**
 * Merge one observation: known windows update in place with the new reading,
 * unknown siblings keep their original values and observed times. Returns the
 * stored snapshot, or undefined when nothing valid arrived.
 */
export function recordObservation(input: IncomingObservation): UsageObservation | undefined {
  if (!input.providerID || !input.accountID || !Number.isFinite(input.observedAt)) return undefined
  const seen = new Set<string>()
  const fresh: UsageWindow[] = []
  const key = keyOf(input.providerID, input.accountID)
  const previous = entries.get(key)
  for (const window of input.windows) {
    if (!window.id || seen.has(window.id) || !isValidPercent(window.usedPercent)) continue
    const old = previous?.windows.find((item) => item.id === window.id)
    if (old && old.observedAt > input.observedAt) continue
    seen.add(window.id)
    fresh.push({
      id: window.id, usedPercent: window.usedPercent, observedAt: input.observedAt,
      ...(window.resetMs !== undefined && Number.isFinite(new Date(window.resetMs).valueOf())
        ? { resetMs: window.resetMs } : {}),
      ...(window.minutes !== undefined && Number.isInteger(window.minutes) && window.minutes > 0
        ? { minutes: window.minutes } : {}),
    })
  }
  if (fresh.length === 0) return undefined
  const stored: UsageObservation = {
    providerID: input.providerID,
    accountID: input.accountID,
    observedAt: Math.max(input.observedAt, previous?.observedAt ?? 0),
    windows: [...(previous?.windows.filter((window) => !seen.has(window.id)) ?? []), ...fresh],
  }
  // Refresh recency without growing the map past its bound.
  entries.delete(key)
  entries.set(key, stored)
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next()
    if (oldest.done) break
    entries.delete(oldest.value)
  }
  return stored
}

/** Mount/reconnect snapshot: one Info-shaped entry per provider/account, sorted. */
export function getUsageSnapshot(): UsageObservation[] {
  return [...entries.values()].sort(
    (a, b) => a.providerID.localeCompare(b.providerID) || a.accountID.localeCompare(b.accountID),
  )
}

export type UsagePublisher = (observation: UsageObservation) => void

let publisher: UsagePublisher | undefined

/** Registered from an Effect scope that owns a bridge; plain callbacks stay sync. */
export function setUsagePublisher(next: UsagePublisher | undefined) {
  publisher = next
  return () => { if (publisher === next) publisher = undefined }
}

/** Record, then forward the stored snapshot when a publisher is registered. */
export function reportUsageObservation(input: IncomingObservation): UsageObservation | undefined {
  const stored = recordObservation(input)
  if (!stored || !publisher) return stored
  try {
    publisher(stored)
  } catch {
    // A quota hook must never break the turn it observes.
  }
  return stored
}

/** Test-only. */
export function _resetUsageObservations(): void {
  entries.clear()
}

/** Stable Codex account identity: OAuth account id, else the provider itself. Never a token. */
export function openaiAccountId(accountId: string | undefined): string {
  return accountId && accountId.length > 0 ? accountId : "openai"
}

function headerValue(headers: Headers | Record<string, string>, name: string): string | undefined {
  if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name) ?? undefined
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && typeof value === "string" && value.length > 0) return value
  }
  return undefined
}

function parsePercent(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return isValidPercent(parsed) ? parsed : undefined
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function parseNonNegativeNumber(value: string | undefined): number | undefined {
  if (value === undefined || !value.trim()) return undefined
  const parsed = Number(value)
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function codexScopeWindows(
  scope: string,
  usedPercent: number | undefined,
  minutes: number | undefined,
  resetAfterSeconds: number | undefined,
  nowMs: number,
  resetAt?: number,
): IncomingWindow | undefined {
  if (usedPercent === undefined) return undefined
  const resetMs = resetAt !== undefined ? (resetAt < 1e12 ? resetAt * 1000 : resetAt) :
    resetAfterSeconds !== undefined ? nowMs + resetAfterSeconds * 1000 : undefined
  return {
    id: scope, usedPercent,
    ...(minutes !== undefined ? { minutes } : {}),
    ...(resetMs !== undefined && Number.isFinite(new Date(resetMs).valueOf()) ? { resetMs } : {}),
  }
}

/**
 * Codex quota response headers (`x-codex-primary/secondary-used-percent`,
 * `-window-minutes`, `-reset-after-seconds`; shapes from codex-rs
 * rate_limits). Headers only: the body is never touched. Absent or malformed
 * headers yield no windows, preserving endpoint refresh.
 */
export function parseCodexQuotaHeaders(
  headers: Headers | Record<string, string>,
  nowMs = Date.now(),
): IncomingWindow[] {
  const windows: IncomingWindow[] = []
  for (const scope of ["primary", "secondary"]) {
    const window = codexScopeWindows(
      scope,
      parsePercent(headerValue(headers, `x-codex-${scope}-used-percent`)),
      parsePositiveInt(headerValue(headers, `x-codex-${scope}-window-minutes`)),
      parseNonNegativeNumber(headerValue(headers, `x-codex-${scope}-reset-after-seconds`)),
      nowMs,
      parseNonNegativeNumber(headerValue(headers, `x-codex-${scope}-reset-at`)),
    )
    if (window) windows.push(window)
  }
  return windows
}

function recordField(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function numericField(scope: Record<string, unknown>, name: string): number | undefined {
  const value = scope[name]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function codexEventScopeWindows(
  scope: string,
  value: unknown,
  nowMs: number,
): IncomingWindow | undefined {
  const fields = recordField(value)
  if (!fields) return undefined
  const usedPercent = numericField(fields, "used_percent")
  if (!isValidPercent(usedPercent)) return undefined
  const minutes = numericField(fields, "window_minutes")
  const resetAt = numericField(fields, "reset_at")
  return codexScopeWindows(
    scope,
    usedPercent,
    minutes !== undefined && Number.isInteger(minutes) && minutes > 0 ? minutes : undefined,
    undefined,
    nowMs,
    resetAt !== undefined && resetAt >= 0 ? resetAt : undefined,
  )
}

/**
 * Codex WebSocket `codex.rate_limits` event (`primary`/`secondary` scopes).
 * Unknown shapes yield no windows; the stream itself is untouched.
 */
export function parseCodexRateLimitsEvent(event: unknown, nowMs = Date.now()): IncomingWindow[] {
  const fields = recordField(event)
  if (!fields || fields.type !== "codex.rate_limits") return []
  const limit = fields.metered_limit_name ?? fields.limit_name
  if (limit !== undefined && limit !== "codex") return []
  const limits = recordField(fields.rate_limits)
  if (!limits) return []
  const windows: IncomingWindow[] = []
  for (const scope of ["primary", "secondary"]) {
    const window = codexEventScopeWindows(scope, limits[scope], nowMs)
    if (window) windows.push(window)
  }
  return windows
}

export * as UsageObservations from "./usage-observations"
