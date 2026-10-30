import { lstatSync, mkdirSync, statSync, symlinkSync } from "node:fs"
import path from "node:path"
import { DEFAULT_ACCOUNT, canonicalAccountId, expandHome, forgetAccount, poolAccountIds } from "./accounts.js"
import { buildWarmupEnv, cliRunner, warmupCwd } from "./warmup/cli"

// Account manager behind the TUI's `Claude accounts` dialog: account folders, their shared links, and
// CLI auth. Pool membership itself is the claude-code `accounts` provider option.

/** Items every account shares with `~/.claude`; same list as `$_CLAUDE_SHARED` in the PowerShell profile. */
const SHARED = ["CLAUDE.md", "settings.json", "commands", "skills", "plans"]
const AUTH_TIMEOUT_MS = 15_000

const sameDir = (id: string) => {
  const canonical = canonicalAccountId(id)
  return process.platform === "win32" ? canonical.toLowerCase() : canonical
}

/** The lowest free slot among `~/.claude`, `~/.claude2`, ...; a folder left behind by a removal is reused. */
export function nextAccountEntry(accounts: string[]): string {
  const used = new Set(poolAccountIds(accounts).map(sameDir))
  for (let n = 1; ; n++) {
    const entry = n === 1 ? "~/.claude" : `~/.claude${n}`
    if (!used.has(sameDir(poolAccountIds([entry])[0]!))) return entry
  }
}

/** Create an account folder with junctions (folders) and symlinks (files) to the shared `~/.claude` items. */
export function createAccountDir(entry: string): void {
  const dir = path.resolve(expandHome(entry))
  const source = path.resolve(expandHome("~/.claude"))
  mkdirSync(dir, { recursive: true })
  if (sameDir(dir) === sameDir(source)) return
  for (const item of SHARED) {
    const target = path.join(source, item)
    const link = path.join(dir, item)
    const stat = statSync(target, { throwIfNoEntry: false })
    if (!stat || lstatSync(link, { throwIfNoEntry: false })) continue
    try {
      symlinkSync(target, link, stat.isDirectory() ? "junction" : "file")
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error
      throw new Error(`Cannot link ${link}: Windows file symlinks need Developer Mode turned on`, { cause: error })
    }
  }
}

// The default account keeps the inherited environment, never CLAUDE_CONFIG_DIR=~/.claude: with it set,
// the CLI reads ~/.claude/.claude.json instead of the default account's ~/.claude.json.
function runAuth(cliPath: string, id: string, args: string[]) {
  return cliRunner()({
    cliPath,
    args: ["auth", ...args],
    env: buildWarmupEnv(id === DEFAULT_ACCOUNT ? undefined : id),
    cwd: warmupCwd(),
    timeoutMs: AUTH_TIMEOUT_MS,
  })
}

export interface AuthStatus {
  /** `undefined` when the CLI could not be asked (missing, timed out, unreadable output). */
  loggedIn?: boolean
  email?: string
  plan?: string
}

/** `claude auth status` for one pool account. Never log the output: it carries email addresses. */
export async function authStatus(cliPath: string, id: string): Promise<AuthStatus> {
  const result = await runAuth(cliPath, id, ["status", "--json"])
  if (result.timedOut || result.code === null) return {}
  let body: { loggedIn?: unknown; email?: unknown; subscriptionType?: unknown }
  try {
    body = JSON.parse(result.stdout)
  } catch {
    return {}
  }
  if (body.loggedIn !== true) return { loggedIn: false }
  return {
    loggedIn: true,
    ...(typeof body.email === "string" ? { email: body.email } : {}),
    ...(typeof body.subscriptionType === "string" ? { plan: body.subscriptionType } : {}),
  }
}

/** `claude auth logout` for one pool account, then forget its limits, pins, and usage cache. */
export async function signOut(cliPath: string, id: string): Promise<void> {
  const result = await runAuth(cliPath, id, ["logout"])
  if (result.timedOut) throw new Error("claude auth logout timed out")
  if (result.code !== 0)
    throw new Error(`claude auth logout failed: ${result.stderr.trim() || `exit code ${result.code}`}`)
  forgetAccount(id)
}
