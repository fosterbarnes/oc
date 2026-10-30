import { isRecord } from "@/util/record"
import { DEFAULT_ACCOUNT } from "../accounts.js"
import { buildWarmupEnv, cliRunner, warmupConfigDir, warmupCwd, type ChildTracker, type CliRunResult } from "./cli"

export const AUTH_PROBE_TIMEOUT_MS = 15_000
export const INVENTORY_TTL_MS = 60_000

export interface InventoryProbe {
  id: string
  status: "connected" | "signed-out" | "unknown"
}

function parseAuthStatus(stdout: string): InventoryProbe["status"] {
  let body: unknown
  try {
    body = JSON.parse(stdout)
  } catch {
    return "unknown"
  }
  if (!isRecord(body)) return "unknown"
  if (body.loggedIn !== true) return "signed-out"
  // Accept authenticated claude.ai subscription accounts, not API-key or
  // third-party-provider authentication.
  if (body.authMethod === "claude.ai" && (body.apiProvider === "firstParty" || body.apiProvider === undefined))
    return "connected"
  return "unknown"
}

async function probeAccount(
  cliPath: string,
  accountID: string,
  timeoutMs = AUTH_PROBE_TIMEOUT_MS,
  signal?: AbortSignal,
  tracker?: ChildTracker,
): Promise<InventoryProbe> {
  const configDir = warmupConfigDir(accountID)
  const env = buildWarmupEnv(accountID === DEFAULT_ACCOUNT ? undefined : accountID)
  env.CLAUDE_CONFIG_DIR = configDir
  let result: CliRunResult
  try {
    // Raw argv: the runner alone resolves the launcher via cliCommand, so a
    // configured bun/node launcher is never wrapped twice.
    // --json is explicit though default: the installed `auth status --help`
    // lists it, and explicit output selection survives default changes.
    result = await cliRunner()({
      cliPath,
      args: ["auth", "status", "--json"],
      env,
      cwd: warmupCwd(),
      timeoutMs,
      signal,
      tracker,
    })
  } catch {
    return { id: accountID, status: "unknown" }
  }
  // Never log full auth-status output; it can carry account email addresses.
  if (result.timedOut || result.code === null) return { id: accountID, status: "unknown" }
  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.toLowerCase()
    if (/not logged in|login|unauthenticated|no auth/.test(output)) return { id: accountID, status: "signed-out" }
    if (result.stdout.trim()) return { id: accountID, status: parseAuthStatus(result.stdout) }
    return { id: accountID, status: "unknown" }
  }
  return { id: accountID, status: parseAuthStatus(result.stdout) }
}

let inventoryProbeOverride:
  | ((cliPath: string, accountID: string, signal?: AbortSignal) => Promise<InventoryProbe>)
  | null = null

export function _setInventoryProbe(
  probe: ((cliPath: string, accountID: string, signal?: AbortSignal) => Promise<InventoryProbe>) | null,
): void {
  inventoryProbeOverride = probe
  inventoryCache.clear()
  inflightInventory.clear()
}

interface InventorySnapshot {
  at: number
  connectedIds: string[]
  error?: string
}

const inventoryCache = new Map<string, InventorySnapshot>()
const inflightInventory = new Map<string, Promise<InventorySnapshot>>()
// Per-account last-known presence: connected logins stay until a probe
// conclusively signs them out; unknown never flips another account.
const lastKnownPresence = new Map<string, boolean>()

/** Drop cached inventories after a sign-in or sign-out, so warm-up sees the change at once. */
export function forgetInventory(): void {
  inventoryCache.clear()
}

export function _resetInventoryForTests(): void {
  inventoryCache.clear()
  inflightInventory.clear()
  lastKnownPresence.clear()
  inventoryProbeOverride = null
}

function inventoryKey(cliPath: string, candidates: string[]): string {
  return `${cliPath}\n${[...candidates].sort().join("\n")}`
}

async function probeAll(
  cliPath: string,
  candidates: string[],
  signal?: AbortSignal,
  tracker?: ChildTracker,
): Promise<InventorySnapshot> {
  const probe =
    inventoryProbeOverride ??
    ((path: string, id: string, probeSignal?: AbortSignal, probeTracker?: ChildTracker) =>
      probeAccount(path, id, AUTH_PROBE_TIMEOUT_MS, probeSignal, probeTracker))
  const now = Date.now()
  const results = await Promise.all(candidates.map((id) => probe(cliPath, id, signal, tracker)))
  // Per-account merge: connected logins retain/add, conclusively signed-out
  // logins are removed, and an unknown probe keeps only that account's own
  // prior status. A stale whole-list fallback would both hide newly
  // connected accounts and resurrect signed-out ones.
  let unknown = 0
  for (const result of results) {
    if (result.status === "connected") lastKnownPresence.set(result.id, true)
    else if (result.status === "signed-out") lastKnownPresence.delete(result.id)
    else unknown += 1
  }
  for (const [id] of lastKnownPresence) {
    if (!candidates.includes(id)) lastKnownPresence.delete(id)
  }
  const connectedIds = candidates.filter((id) => lastKnownPresence.get(id) === true)
  if (!unknown) return { at: now, connectedIds }
  // Preserve last-known presence during a transient probe error and surface
  // the error; unknown is not signed out.
  return {
    at: now,
    connectedIds,
    error: `could not verify ${unknown} account${unknown === 1 ? "" : "s"}; showing last known accounts`,
  }
}

// Candidate directories come from the existing account-pool normalization,
// which always supplies a materialized default when nothing is configured,
// so candidate count is not connected-account count. Results are cached
// briefly per cliPath + candidate set and in-flight probes are shared per
// key: a changed config starts fresh instead of reusing a stale inventory.
// The palette never blocks on a fresh probe.
export function listConnected(input: {
  cliPath: string
  candidates: string[]
  now?: number
  signal?: AbortSignal
  tracker?: ChildTracker
}): Promise<InventorySnapshot> {
  if (input.signal?.aborted) return Promise.reject(input.signal.reason ?? new Error("Aborted"))
  const key = inventoryKey(input.cliPath, input.candidates)
  const now = input.now ?? Date.now()
  const cached = inventoryCache.get(key)
  if (cached && now - cached.at < INVENTORY_TTL_MS) return Promise.resolve(cached)
  const inflight = inflightInventory.get(key)
  if (inflight) return inflight
  const pending = probeAll(input.cliPath, input.candidates, input.signal, input.tracker).then((snapshot) => {
    inventoryCache.set(key, snapshot)
    if (inflightInventory.get(key) === pending) inflightInventory.delete(key)
    return snapshot
  })
  inflightInventory.set(key, pending)
  return pending
}

// Fresh per-account recheck immediately before sending: true only for a
// currently connected subscription login. Unknown (timeout, unparseable,
// unexpected method) is not signed out, but it is not sendable either.
export async function verifyAccountConnected(
  cliPath: string,
  accountID: string,
  signal?: AbortSignal,
  tracker?: ChildTracker,
): Promise<boolean> {
  return (await probeAccount(cliPath, accountID, AUTH_PROBE_TIMEOUT_MS, signal, tracker)).status === "connected"
}
