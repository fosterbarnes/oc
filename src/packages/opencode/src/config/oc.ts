import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
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
  claudeAccountNames?: Record<string, string>
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
    return JSON.parse(raw.replace(/^\s*\/\/.*$/gm, "")) as Settings
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
        const settings = await read()
        return write({
          ...settings,
          server: { ...settings.server, startOnWindowsUserStart: undefined, startAtLogin: parsed },
        })
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
  const settings = await read()
  return write({ ...settings, [key]: parsed })
}

export async function write<T extends object>(next: T) {
  const file = filePath()
  const temporary = `${file}.tmp-${process.pid}`
  await fs.mkdir(path.dirname(file), { recursive: true })
  try {
    await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    await fs.rename(temporary, file)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
  return next
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
