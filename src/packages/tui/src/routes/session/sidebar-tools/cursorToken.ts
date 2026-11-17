// Cursor session token for usage: an owner-only file in oc's data folder, next to auth.json, so
// config sync and config backups never carry it.
import fs from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"

export function cursorSessionSecretPath(dataDirectory = Global.Path.data): string {
  return path.join(dataDirectory, "cursor-session")
}

export function readCursorSessionToken(filePath = cursorSessionSecretPath()): string | undefined {
  try {
    const token = fs.readFileSync(filePath, "utf8").trim()
    return token !== "" ? token : undefined
  } catch {
    return undefined
  }
}

export function writeCursorSessionToken(token: string, filePath = cursorSessionSecretPath()): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  // Owner-only from creation; Windows ignores the mode.
  fs.writeFileSync(temporary, `${token.trim()}\n`, { encoding: "utf8", mode: 0o600 })
  fs.renameSync(temporary, filePath)
}

export function clearCursorSessionToken(filePath = cursorSessionSecretPath()): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // Missing secrets file is already clear.
  }
}
