// Cursor session token for usage: kept in its own owner-only file, migrated out of config.json.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { readJsonFile, writeJsonObject } from "./settings"

function cursorSettingsPath(homeDirectory: string): string {
  return path.join(homeDirectory, ".config", "openSidebar", "config.json")
}

export function cursorSessionSecretPath(homeDirectory = os.homedir()): string {
  return path.join(homeDirectory, ".config", "openSidebar", "cursor-session")
}

function configCursorSessionToken(homeDirectory: string): string | undefined {
  const value = readJsonFile(cursorSettingsPath(homeDirectory))
  if (!value || typeof value !== "object") return undefined
  const token = (value as { cursorSessionToken?: unknown }).cursorSessionToken
  return typeof token === "string" && token.trim() !== "" ? token.trim() : undefined
}

function stripCursorSessionTokenFromConfig(homeDirectory: string): void {
  const filePath = cursorSettingsPath(homeDirectory)
  const existing = readJsonFile(filePath)
  if (!existing || typeof existing !== "object" || !("cursorSessionToken" in existing)) return
  const settings = { ...(existing as Record<string, unknown>) }
  delete settings.cursorSessionToken
  writeJsonObject(filePath, settings)
}

function readCursorSessionSecret(homeDirectory: string): string | undefined {
  try {
    const token = fs.readFileSync(cursorSessionSecretPath(homeDirectory), "utf8").trim()
    return token !== "" ? token : undefined
  } catch {
    return undefined
  }
}

function writeCursorSessionSecret(homeDirectory: string, token: string): void {
  const filePath = cursorSessionSecretPath(homeDirectory)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  fs.writeFileSync(temporary, `${token}\n`, "utf8")
  fs.renameSync(temporary, filePath)
  try {
    fs.chmodSync(filePath, 0o600)
  } catch {
    // Owner-only mode is best-effort on Windows.
  }
}

function migrateCursorSessionToken(homeDirectory: string): void {
  const fromConfig = configCursorSessionToken(homeDirectory)
  if (fromConfig && !readCursorSessionSecret(homeDirectory)) writeCursorSessionSecret(homeDirectory, fromConfig)
  stripCursorSessionTokenFromConfig(homeDirectory)
}

export function readCursorSessionToken(homeDirectory = os.homedir()): string | undefined {
  migrateCursorSessionToken(homeDirectory)
  return readCursorSessionSecret(homeDirectory) ?? configCursorSessionToken(homeDirectory)
}

export function writeCursorSessionToken(homeDirectory: string, token: string): void {
  writeCursorSessionSecret(homeDirectory, token.trim())
  stripCursorSessionTokenFromConfig(homeDirectory)
}

export function clearCursorSessionToken(homeDirectory = os.homedir()): void {
  try {
    fs.unlinkSync(cursorSessionSecretPath(homeDirectory))
  } catch {
    // Missing secrets file is already clear.
  }
  stripCursorSessionTokenFromConfig(homeDirectory)
}
