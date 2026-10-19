// TypeSafe System One client for the jev_* tools. Ported from jev-code
// (github.com/FrancoisChastel/jev-code @ 051b492, MIT) so oc calls the API in-process
// instead of spawning one jev MCP server per instance.

type Env = Record<string, string | undefined>
type JsonObject = { [key: string]: unknown }

export type Text = string | unknown[] | JsonObject | null
export type Question =
  | { type: "noul"; instructions: Text; criteria?: { true?: Text; false?: Text } | null }
  | { type: "choice"; instructions: Text; criteria: Record<string, Text> }
  | { type: "score"; instructions: Text; criteria: Text[] }
export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities?: Record<string, number>; confidence: number }
export type SystemOneRequest = {
  state: string | readonly unknown[] | JsonObject
  questions: Record<string, Question>
  model?: string
}
export type SystemOneReply = {
  model: string
  answers: Record<string, Answer | undefined>
  usage?: { input_tokens: number; output_tokens: number }
}

const DEFAULT_BASE_URL = "https://api.typesafe.ai"
const DEFAULT_MODEL = "jev-latest"
const TIMEOUT_MS = 30_000
const MAX_RETRIES = 2
const MAX_RETRY_AFTER_MS = 30_000
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504, 529])

export function apiKey(env: Env = process.env) {
  return env.TYPESAFE_API_KEY?.trim() || undefined
}

/** `POST /v1/systemone`, retrying rate limits, timeouts, and transient server errors. */
export async function systemOne(
  request: SystemOneRequest,
  signal?: AbortSignal,
  env: Env = process.env,
): Promise<SystemOneReply> {
  const key = apiKey(env)
  if (!key) throw new Error("TYPESAFE_API_KEY is not set. Create a key at https://console.typesafe.ai/keys.")
  const url = `${(env.TYPESAFE_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "")}/v1/systemone`
  const body = JSON.stringify({ model: env.TYPESAFE_DEFAULT_MODEL?.trim() || DEFAULT_MODEL, ...request })
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    const outcome = await send(url, key, body, signal)
    if (outcome.ok) return outcome.response
    if (!outcome.retryable || attempt >= MAX_RETRIES) throw outcome.error
    await Bun.sleep(outcome.retryAfterMs ?? Math.min(8_000, 500 * 2 ** attempt))
  }
}

async function send(url: string, key: string, body: string, signal: AbortSignal | undefined) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch((error: unknown) => {
    if (signal?.aborted) throw error
    const message = timeout.aborted
      ? `Jev request timed out after ${TIMEOUT_MS} ms.`
      : `Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`
    return new Error(message)
  })
  if (response instanceof Error) return { ok: false as const, retryable: true, error: response }

  const requestID = response.headers.get("x-typesafe-request-id")
  const text = await response.text()
  const parsed = parseJson(text)
  if (response.ok) {
    if (!isRecord(parsed) || !isRecord(parsed.answers)) throw new Error("Jev API returned a body without answers.")
    return { ok: true as const, response: parsed as SystemOneReply }
  }
  return {
    ok: false as const,
    retryable: RETRYABLE.has(response.status),
    retryAfterMs: retryAfterMs(response.headers),
    error: new Error(
      `Jev API error ${response.status}${requestID ? ` (request ${requestID})` : ""}: ${summarize(parsed, text)}`,
    ),
  }
}

/** Honour `retry-after-ms` or `retry-after` (seconds), capped so a bad header cannot stall the call. */
function retryAfterMs(headers: Headers) {
  const ms = Number(headers.get("retry-after-ms") ?? Number.NaN)
  if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, MAX_RETRY_AFTER_MS)
  const seconds = Number(headers.get("retry-after") ?? Number.NaN)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
  return undefined
}

function summarize(parsed: unknown, text: string) {
  const candidate = isRecord(parsed) ? (parsed.message ?? parsed.error ?? parsed.detail) : undefined
  if (typeof candidate === "string") return candidate
  if (candidate && typeof candidate === "object") return JSON.stringify(candidate).slice(0, 300)
  return text.slice(0, 300) || "empty response body"
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
