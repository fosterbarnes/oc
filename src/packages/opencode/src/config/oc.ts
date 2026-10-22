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
  "serverStartOnWindowsUserStart",
  // `ask`: a Claude turn that hits a usage limit asks which account to continue on. Unset = `auto`.
  "claudeFailover",
] as const

export type Key = (typeof keys)[number]
export type Value = string | boolean
export type Settings = Partial<Record<Key, Value>> & {
  executable?: string
  server?: { hostname?: string; port?: number; startOnWindowsUserStart?: boolean }
  // `path`: exe or .ps1 that replaces built-in /revive-no-install. `launcher`: what the restarted terminal runs.
  // `build`: source build behind /revive (Revive.parseBuild); `false` = never build; unset = ask on first /revive.
  revive?: { path?: string; launcher?: unknown; build?: unknown }
  intro?: { background?: "terminal" | "black" }
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
  if (key === "serverStartOnWindowsUserStart") {
    if (typeof parsed !== "boolean") throw new Error("serverStartOnWindowsUserStart must be true or false")
    return Startup.update(
      parsed,
      async () => {
        const settings = await read()
        return write({ ...settings, server: { ...settings.server, startOnWindowsUserStart: parsed } })
      },
      startup,
    )
  }
  if (key === "claudeFailover" && parsed !== "auto" && parsed !== "ask") {
    throw new Error("claudeFailover must be auto or ask")
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

export { writeSidebar, nextProjectTitle } from "@opencode-ai/core/util/ocSession"

export * as OcConfig from "./oc"
