import fs from "fs/promises"
import path from "path"
import { applyEdits, modify } from "jsonc-parser"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { OcItems } from "@opencode-ai/core/util/ocItems"
import { OcJson } from "@opencode-ai/core/util/ocJson"
import { Startup } from "./startup"

export const keys = [
  "ocDir",
  "homeDir",
  "homeDirSort",
  "sessionModel",
  "sessionAgent",
  "serverStartAtLogin",
  // `ask`: a Claude turn that hits a usage limit asks which account to continue on. Unset = `auto`.
  "claudeFailover",
  // With claude-code `apiAccount` set and every account limited: `ask` (unset), `always`, or `off`.
  "claudeApiRollover",
] as const

export type Key = (typeof keys)[number]
export type Value = string | boolean
export type Settings = Partial<Record<Key, Value>> & {
  executable?: string
  // `startOnWindowsUserStart`: old name of `startAtLogin`, read as a fallback and dropped on write.
  server?: { hostname?: string; port?: number; startAtLogin?: boolean; startOnWindowsUserStart?: boolean }
  // `path`: exe or .ps1 that replaces built-in /revive-no-install. `launcher`: what the restarted terminal runs.
  // `build`: source build behind /revive (Revive.parseBuild); `false` = never build; unset = ask on first /revive.
  revive?: { path?: string; launcher?: unknown; build?: unknown }
  intro?: { background?: "terminal" | "black" }
  // Claude account labels keyed by the `accounts` entry as written (`"~/.claude2": "Pro"`); accounts.ts.
  // Machine-only: the server derives it from `claudeAccounts` (folders map to different accounts per machine).
  claudeAccountNames?: Record<string, string>
  // Synced Claude account info keyed by lowercased email: friendly name and warm-up schedule. No
  // credentials. provider/claude-code/warmup/synced.ts.
  claudeAccounts?: Record<string, ClaudeAccountEntry>
  // Tailnet config sync for this machine (server/syncPeer.ts, core util/ocSync.ts). `exclude`: picker
  // tree keys (id prefixes, item ids, `tag:<name>`). Written by the TUI `/sync` dialog.
  sync?: { enabled?: boolean; exclude?: string[] }
  // /mirror (core util/ocMirror.ts): what the other machine does with its own changes, whether to
  // revive it afterwards, and how to reach each tailnet host (`auto`, `tailscale`, or an ssh destination).
  mirror?: { dirty?: string; revive?: string; hosts?: Record<string, { ssh?: string }> }
}

export type ClaudeAccountEntry = {
  name?: string
  warmup?: { enabled: boolean; schedule: unknown; updatedAt?: number }
}

export function defaultServerPort() {
  return 4096
}

export function filePath() {
  return path.join(Global.Path.config, "oc.json")
}

async function readFile(file: string) {
  try {
    const raw = await fs.readFile(file, "utf8")
    return OcJson.read<Settings>(raw, file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

export async function read() {
  const file = filePath()
  try {
    return await readFile(file)
  } catch (error) {
    throw new Error(`Failed to read ${file}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    })
  }
}

export async function update(key: Key, value: string, startup?: Parameters<typeof Startup.update>[2]) {
  const parsed: Value = value === "true" ? true : value === "false" ? false : value
  if (key === "serverStartAtLogin") {
    if (typeof parsed !== "boolean") throw new Error("serverStartAtLogin must be true or false")
    return Startup.update(
      parsed,
      async () => {
        await edit((settings) => ({
          server: { ...settings.server, startOnWindowsUserStart: undefined, startAtLogin: parsed },
        }))
      },
      startup,
    )
  }
  if (key === "claudeFailover" && parsed !== "auto" && parsed !== "ask") {
    throw new Error("claudeFailover must be auto or ask")
  }
  if (key === "claudeApiRollover" && parsed !== "ask" && parsed !== "always" && parsed !== "off") {
    throw new Error("claudeApiRollover must be ask, always or off")
  }
  return edit(() => ({ [key]: parsed }))
}

// Locked read-modify-write: re-reads oc.json under the shared oc.json lock (sync applies hold it
// too), lets `change` return the top-level keys to set (`undefined` removes one), and edits only
// those keys in the text, so comments and other keys stay as they are. No change, no write.
export async function edit(change: (current: Settings) => Partial<Settings> | undefined): Promise<Settings> {
  const file = filePath()
  return Flock.withLock(OcItems.OC_CONFIG_LOCK, async () => {
    const text = await fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "{}\n"
      throw error
    })
    const current = OcJson.read<Settings>(text, file)
    const patch = change(current)
    if (!patch) return current
    let next = text
    for (const [key, value] of Object.entries(patch)) {
      next = applyEdits(next, modify(next, [key], value, { formattingOptions: { insertSpaces: true, tabSize: 2 } }))
    }
    if (next !== text) await replace(file, next)
    return { ...current, ...patch }
  })
}

async function replace(file: string, content: string) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.writeFile(temporary, content, "utf8")
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

export const PALETTE_NEW_SESSION_OC = "New session (oc)"

export function resolvePaletteLaunch(title: string) {
  if (title.trim() === PALETTE_NEW_SESSION_OC) return "pick-home-dir" as const
  throw new Error(`Palette entry not found: ${title.trim()}`)
}

export function executablePath(execPath = process.execPath) {
  return Global.resolveExecutablePath(execPath)
}

export { nextProjectTitle } from "@opencode-ai/core/util/ocSession"

export * as OcConfig from "./oc"
