import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"
import { isRecord } from "@/util/record"
import { emailKey } from "./synced"

// This machine's Claude config folder -> account email, learned from `claude auth status`
// probes (inventory.ts). Folder names map to different accounts on each machine, so synced
// account info is keyed by email and resolved through this map. Persisted so names and
// schedules resolve before the first probe after a restart.

type Status = "connected" | "signed-out" | "unknown"

let fileOverride: string | null | undefined
let map: Map<string, string> | undefined

function file(): string | null {
  if (fileOverride !== undefined) return fileOverride
  if (process.env.BUN_TEST != null) return null
  return path.join(Global.Path.data, "claude-code", "identities.json")
}

function key(dir: string): string {
  return process.platform === "win32" ? dir.toLowerCase() : dir
}

function load(): Map<string, string> {
  if (map) return map
  map = new Map()
  const target = file()
  if (!target) return map
  try {
    const raw = JSON.parse(readFileSync(target, "utf8")) as unknown
    if (isRecord(raw)) {
      for (const [dir, email] of Object.entries(raw)) if (typeof email === "string") map.set(key(dir), email)
    }
  } catch {
    // Missing or unreadable: learn again from the next probe.
  }
  return map
}

function persist(): void {
  const target = file()
  if (!target || !map) return
  try {
    mkdirSync(path.dirname(target), { recursive: true })
    const tmp = `${target}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(map)), "utf8")
    try {
      renameSync(tmp, target)
    } catch (error) {
      rmSync(tmp, { force: true })
      throw error
    }
  } catch {
    // Best effort: the in-memory map still serves this process.
  }
}

/** The email signed in to `dir`, as of the last conclusive probe. */
export function emailOf(dir: string): string | undefined {
  return load().get(key(dir))
}

/** The first of `dirs` signed in to `email`. */
export function dirOf(email: string, dirs: readonly string[]): string | undefined {
  const wanted = emailKey(email)
  return dirs.find((dir) => emailOf(dir) === wanted)
}

/** Records a probe: connected with an email sets it, signed out forgets it, unknown keeps it. */
export function noteProbe(dir: string, status: Status, email?: string): void {
  const current = load()
  const k = key(dir)
  if (status === "connected" && email) {
    const next = emailKey(email)
    if (current.get(k) === next) return
    current.set(k, next)
  } else if (status === "signed-out") {
    if (!current.delete(k)) return
  } else return
  persist()
}

export function forgetIdentity(dir: string): void {
  if (load().delete(key(dir))) persist()
}

export function _resetIdentities(target?: string | null): void {
  fileOverride = target
  map = undefined
}
