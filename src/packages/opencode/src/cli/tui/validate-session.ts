import { createOpencodeClient } from "@opencode-ai/sdk/v2"
import { SessionID } from "@/session/schema"
import { Schema } from "effect"

const decodeSessionID = Schema.decodeUnknownSync(SessionID)

// Fail before entering the TUI: an unreachable server or rejected auth would otherwise show as
// reconnect churn inside it.
export async function validateServer(input: { url: string; fetch?: typeof fetch; headers?: RequestInit["headers"] }) {
  const response = await (input.fetch ?? fetch)(new URL("/api/health", input.url), {
    headers: input.headers,
    signal: AbortSignal.timeout(5_000),
  }).catch((cause: unknown) => {
    throw new Error(`Could not reach server at ${input.url}`, { cause })
  })
  if (response.status === 401) {
    throw new Error(
      input.headers
        ? `Server at ${input.url} rejected the password`
        : `Server at ${input.url} requires a password; pass --password or set OPENCODE_SERVER_PASSWORD`,
    )
  }
  if (!response.ok) throw new Error(`Server at ${input.url} responded with status ${response.status}`)
}

export async function validateSession(input: {
  url: string
  sessionID?: string
  directory?: string
  fetch?: typeof fetch
  headers?: RequestInit["headers"]
}) {
  if (!input.sessionID) return

  let sessionID: SessionID
  try {
    sessionID = decodeSessionID(input.sessionID)
  } catch (error) {
    throw new Error(`Invalid session ID: ${error instanceof Error ? error.message : "unknown error"}`, { cause: error })
  }

  await createOpencodeClient({
    baseUrl: input.url,
    directory: input.directory,
    fetch: input.fetch,
    headers: input.headers,
  }).session.get({ sessionID }, { throwOnError: true })
}
