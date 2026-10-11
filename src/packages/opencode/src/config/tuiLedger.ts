export * as TuiLedger from "./tuiLedger"

import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"

export type Record = {
  pid: number
  instance: string
  executable: string
  startedAt: number
  paneID?: string
  // The session this TUI shows and its working directory, rewritten on route change; revive reopens the tab from them.
  sessionID?: string
  directory?: string
}
export type Process = { pid: number; parentPid: number; executable: string; startedAt: number }

export function sameExecutable(left: string, right: string) {
  return Global.resolveExecutablePath(left).replaceAll("\\", "/").toLowerCase() ===
    Global.resolveExecutablePath(right).replaceAll("\\", "/").toLowerCase()
}

export function parseProcesses(text: string): Process[] {
  const input: unknown = JSON.parse(text)
  if (!Array.isArray(input) || !input.every((item: unknown) =>
    typeof item === "object" && item !== null &&
    "pid" in item && typeof item.pid === "number" && Number.isInteger(item.pid) && item.pid > 0 &&
    "parentPid" in item && typeof item.parentPid === "number" && Number.isInteger(item.parentPid) &&
    "executable" in item && typeof item.executable === "string" &&
    "startedAt" in item && typeof item.startedAt === "number" && Number.isFinite(item.startedAt))) {
    throw new Error("Invalid oc process list")
  }
  return input as Process[]
}

export async function remove(directory: string, pid: number) {
  await fs.rm(path.join(directory, "oc-tuis", `${pid}.json`), { force: true })
}

export async function read(directory: string, processes: Process[]) {
  const root = path.join(directory, "oc-tuis")
  const files = await fs.readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const records = await Promise.all(files.filter((file) => /^\d+\.json$/.test(file)).map(async (file) => {
    const record: unknown = await Bun.file(path.join(root, file)).json().catch(() => undefined)
    if (
      typeof record === "object" && record !== null &&
      "pid" in record && typeof record.pid === "number" && Number.isInteger(record.pid) && record.pid > 0 &&
      file === `${record.pid}.json` &&
      "instance" in record && typeof record.instance === "string" &&
      "executable" in record && typeof record.executable === "string" &&
      "startedAt" in record && typeof record.startedAt === "number" &&
      (!("paneID" in record) || typeof record.paneID === "string" && /^\d+$/.test(record.paneID)) &&
      (!("sessionID" in record) || typeof record.sessionID === "string" && record.sessionID !== "") &&
      (!("directory" in record) || typeof record.directory === "string" && record.directory !== "") &&
      processes.some((item) => item.pid === record.pid &&
        Math.abs(item.startedAt - (record.startedAt as number)) <= 5000 &&
        sameExecutable(item.executable, record.executable as string))
    ) return record as Record
    await fs.rm(path.join(root, file), { force: true })
    return undefined
  }))
  return records.filter((record) => record !== undefined)
}

export function select(records: Record[], processes: Process[], instance: string, executable: string, selfPid: number) {
  const owned = records.filter((record) => record.instance === instance && sameExecutable(record.executable, executable))
  const pids = new Set<number>()
  for (const record of owned) {
    const process = processes.find((item) => item.pid === record.pid &&
      Math.abs(item.startedAt - record.startedAt) <= 5000 && sameExecutable(item.executable, record.executable))
    if (!process || process.pid === selfPid) continue
    pids.add(process.pid)
    const parent = processes.find((item) => item.pid === process.parentPid)
    if (!parent || parent.pid === selfPid || parent.startedAt > process.startedAt) continue
    if (sameExecutable(parent.executable, executable)) pids.add(parent.pid)
  }
  return [...pids]
}
