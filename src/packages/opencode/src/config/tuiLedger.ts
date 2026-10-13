export * as TuiLedger from "./tuiLedger"

import fs from "node:fs/promises"
import path from "node:path"
import { Global } from "@opencode-ai/core/global"

export type Record = {
  pid: number
  instance: string
  executable: string
  startedAt: number
  created?: string
  paneID?: string
  // The session this TUI shows and its working directory, rewritten on route change; revive reopens the tab from them.
  sessionID?: string
  directory?: string
}
export type Process = { pid: number; parentPid: number; executable: string; startedAt: number; created?: string }

export function sameIdentity(identity: { pid?: number; executable?: string; created?: string }, live: Process) {
  return (
    identity.pid === live.pid &&
    typeof identity.created === "string" &&
    /^\d+$/.test(identity.created) &&
    typeof identity.executable === "string" &&
    identity.executable !== "" &&
    identity.created === live.created &&
    sameExecutable(identity.executable, live.executable)
  )
}

const _LIST_COMMAND = [
  "pwsh",
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "$ErrorActionPreference = 'Stop'; ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -gt 0 -and $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parentPid = [int]$_.ParentProcessId; executable = [string]$_.ExecutablePath; startedAt = ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds(); created = $_.CreationDate.ToFileTimeUtc().ToString() } }) -Compress",
]

// Blocks the event loop for the whole pwsh run (~0.4s); use listProcessesAsync while anything animates.
export function listProcesses(): Process[] {
  if (process.platform !== "win32") return []
  const result = Bun.spawnSync(_LIST_COMMAND, { stdout: "pipe", stderr: "pipe", windowsHide: true })
  if (result.exitCode !== 0) throw new Error(`Failed to list processes: ${result.stderr.toString()}`)
  return parseProcesses(result.stdout.toString())
}

// Spawns in `spawnWorker` because even an async spawn blocks the main thread on the first pwsh
// launch per process (~0.4s), freezing the launcher intro.
export async function listProcessesAsync(): Promise<Process[]> {
  if (process.platform !== "win32") return []
  const run = _spawnQueue.then(() => spawnOffThread(_LIST_COMMAND))
  _spawnQueue = run.then(
    () => undefined,
    () => undefined,
  )
  const result = await run
  if (result.exitCode !== 0) throw new Error(`Failed to list processes: ${result.stderr}`)
  return parseProcesses(result.stdout)
}

declare global {
  const OPENCODE_SPAWN_WORKER_PATH: string
}

type SpawnResult = { exitCode: number; stdout: string; stderr: string }
let _spawnWorker: Worker | undefined
let _spawnQueue: Promise<unknown> = Promise.resolve()

// One request at a time (callers queue on `_spawnQueue`); the unref'd worker never keeps oc alive.
function spawnOffThread(command: string[]) {
  const worker = (_spawnWorker ??= createSpawnWorker())
  return new Promise<SpawnResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<SpawnResult>) => resolve(event.data)
    worker.onerror = (event) => reject(new Error(`Spawn worker failed: ${event.message}`))
    worker.postMessage(command)
  })
}

function createSpawnWorker() {
  const file =
    typeof OPENCODE_SPAWN_WORKER_PATH !== "undefined"
      ? OPENCODE_SPAWN_WORKER_PATH
      : new URL("./spawnWorker.ts", import.meta.url)
  return new Worker(file, { ref: false })
}

// The shared TUI rewrites its ledger on navigation. Keep the CLI's CIM stamp separately.
export async function register(directory: string, pid = process.pid, processes = listProcesses()) {
  const identity = processes.find((item) => item.pid === pid)
  if (!identity?.created) throw new Error(`TUI process identity unavailable: ${pid}`)
  const root = path.join(directory, "oc-tuis")
  await fs.mkdir(root, { recursive: true })
  await remove(directory, pid)
  await fs.writeFile(path.join(root, `${pid}.identity.json`), JSON.stringify(identity))
}

export function sameExecutable(left: string, right: string) {
  return (
    Global.resolveExecutablePath(left).replaceAll("\\", "/").toLowerCase() ===
    Global.resolveExecutablePath(right).replaceAll("\\", "/").toLowerCase()
  )
}

export function parseProcesses(text: string): Process[] {
  const input: unknown = JSON.parse(text)
  if (
    !Array.isArray(input) ||
    !input.every(
      (item: unknown) =>
        typeof item === "object" &&
        item !== null &&
        "pid" in item &&
        typeof item.pid === "number" &&
        Number.isInteger(item.pid) &&
        item.pid > 0 &&
        "parentPid" in item &&
        typeof item.parentPid === "number" &&
        Number.isInteger(item.parentPid) &&
        "executable" in item &&
        typeof item.executable === "string" &&
        "startedAt" in item &&
        typeof item.startedAt === "number" &&
        Number.isFinite(item.startedAt) &&
        (!("created" in item) || (typeof item.created === "string" && /^\d+$/.test(item.created))),
    )
  ) {
    throw new Error("Invalid oc process list")
  }
  return input as Process[]
}

export async function remove(directory: string, pid: number) {
  await fs.rm(path.join(directory, "oc-tuis", `${pid}.json`), { force: true })
  await fs.rm(path.join(directory, "oc-tuis", `${pid}.identity.json`), { force: true })
}

export async function read(directory: string, processes: Process[]) {
  const root = path.join(directory, "oc-tuis")
  const files = await fs.readdir(root).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return []
    throw error
  })
  const records = await Promise.all(
    files
      .filter((file) => /^\d+\.json$/.test(file))
      .map(async (file) => {
        const record: unknown = await Bun.file(path.join(root, file))
          .json()
          .catch(() => undefined)
        if (
          typeof record === "object" &&
          record !== null &&
          "pid" in record &&
          typeof record.pid === "number" &&
          (!processes.some((item) => item.pid === record.pid) ||
            ("instance" in record && record.instance !== Global.Path.app) ||
            ("executable" in record &&
              typeof record.executable === "string" &&
              !sameExecutable(record.executable, Global.resolveExecutablePath())))
        )
          return undefined
        const identity = (await Bun.file(path.join(root, file.replace(".json", ".identity.json")))
          .json()
          .catch(() => undefined)) as Process | undefined
        if (
          typeof record === "object" &&
          record !== null &&
          "pid" in record &&
          typeof record.pid === "number" &&
          Number.isInteger(record.pid) &&
          record.pid > 0 &&
          file === `${record.pid}.json` &&
          "instance" in record &&
          typeof record.instance === "string" &&
          "executable" in record &&
          typeof record.executable === "string" &&
          "startedAt" in record &&
          typeof record.startedAt === "number" &&
          (!("paneID" in record) || (typeof record.paneID === "string" && /^\d+$/.test(record.paneID))) &&
          (!("sessionID" in record) || (typeof record.sessionID === "string" && record.sessionID !== "")) &&
          (!("directory" in record) || (typeof record.directory === "string" && record.directory !== "")) &&
          identity?.pid === record.pid &&
          typeof identity.executable === "string" &&
          sameExecutable(identity.executable, record.executable as string) &&
          processes.some((item) => sameIdentity(identity, item))
        )
          return { ...record, created: identity.created } as Record
        throw new Error(`TUI ledger identity unavailable or changed: ${file}`)
      }),
  )
  return records.filter((record) => record !== undefined)
}

export function select(records: Record[], processes: Process[], instance: string, executable: string, selfPid: number) {
  const owned = records.filter(
    (record) => record.instance === instance && sameExecutable(record.executable, executable),
  )
  const pids = new Set<number>()
  for (const record of owned) {
    const process = processes.find((item) => sameIdentity(record, item))
    if (!process || process.pid === selfPid) continue
    pids.add(process.pid)
    const parent = processes.find((item) => item.pid === process.parentPid)
    if (
      !parent ||
      parent.pid === selfPid ||
      !parent.created ||
      !process.created ||
      BigInt(parent.created) > BigInt(process.created)
    )
      continue
    if (sameExecutable(parent.executable, executable)) pids.add(parent.pid)
  }
  return [...pids]
}
