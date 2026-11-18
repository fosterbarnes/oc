import { isRecord } from "@/util/record"
import type { LastAttempt } from "./store"

// Cross-machine warm-up view, served by the tailnet sync listener (server/syncPeer.ts,
// `/oc-sync/warmup`) and fetched by the scheduler only when a slot is due. Same-Tailscale-user
// peers only, and only while `oc:claudeAccounts` syncs (the same audience that receives oc.json).

export interface PeerView {
  /** Tailnet host name of the machine the view came from. */
  host: string
  /** Emails signed in on that machine. */
  connected: string[]
  /** Recent claims per email (occurrence instant -> claim time). */
  claims: Record<string, Record<string, number>>
  /** Latest outcome per email. */
  last: Record<string, LastAttempt>
}

export interface PeerSource {
  /** This machine's tailnet host name (ranks it against peers). */
  self(): Promise<string>
  /** Views from live peers; failures and older builds are left out. Empty when sync is off. */
  views(): Promise<PeerView[]>
}

let provider: (() => Promise<Omit<PeerView, "host">>) | undefined

/** The warm-up loop registers how to describe this machine; unset means the route answers 404. */
export function setLocalViewProvider(next: typeof provider): void {
  provider = next
}

export function localView(): Promise<Omit<PeerView, "host">> | undefined {
  return provider?.()
}

export function parsePeerView(host: string, raw: unknown): PeerView | undefined {
  if (!isRecord(raw) || !Array.isArray(raw.connected) || !isRecord(raw.claims)) return undefined
  const claims: PeerView["claims"] = {}
  for (const [email, value] of Object.entries(raw.claims)) {
    if (!isRecord(value)) continue
    claims[email] = Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, number] => Number.isFinite(entry[1])),
    )
  }
  const last: PeerView["last"] = {}
  if (isRecord(raw.last)) {
    for (const [email, value] of Object.entries(raw.last)) {
      if (
        isRecord(value) &&
        typeof value.scheduledAt === "number" &&
        typeof value.attemptedAt === "number" &&
        typeof value.outcome === "string"
      )
        last[email] = { ...(value as unknown as LastAttempt), host: typeof value.host === "string" ? value.host : host }
    }
  }
  return {
    host,
    connected: raw.connected.filter((email): email is string => typeof email === "string"),
    claims,
    last,
  }
}
