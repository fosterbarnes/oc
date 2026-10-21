import path from "path"
import { mkdirSync, watch, type FSWatcher } from "node:fs"
import { rename, rm } from "node:fs/promises"
import { Session } from "node:inspector"
import { writeHeapSnapshot } from "node:v8"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
const MINUTE = 60_000
const LIMIT = 2 * 1024 * 1024 * 1024

let timer: Timer | undefined
let watcher: FSWatcher | undefined
let lock = false
let armed = true

export type RequestKind = "heap" | "cpu"

const busy = new Set<RequestKind>()

// Windows has no SIGUSR1/SIGPROF, so `oc debug profile <pid>` asks a running process for a heap
// snapshot or CPU profile by dropping `<pid>.<kind>` here. The file body is the CPU profile length
// in seconds. The target deletes the file when it picks the request up.
export const requestDir = () => path.join(Global.Path.state, "diag")

export const requestFile = (pid: number, kind: RequestKind) => path.join(requestDir(), `${pid}.${kind}`)

// Returns whether the target picked the request up within `wait` ms. The rename makes the request
// appear with its body in one watcher event.
export async function request(pid: number, kind: RequestKind, seconds: number, wait = 5_000) {
  const file = requestFile(pid, kind)
  mkdirSync(requestDir(), { recursive: true })
  await Bun.write(`${file}.tmp`, String(seconds))
  await rename(`${file}.tmp`, file)
  const deadline = Date.now() + wait
  while (Date.now() < deadline) {
    if (!(await Bun.file(file).exists())) return true
    await Bun.sleep(100)
  }
  await rm(file, { force: true })
  return false
}

export function start() {
  watchRequests()
  if (!Flag.OPENCODE_AUTO_HEAP_SNAPSHOT) return
  if (timer) return

  const run = async () => {
    if (lock) return

    const stat = process.memoryUsage()
    if (stat.rss <= LIMIT) {
      armed = true
      return
    }
    if (!armed) return

    lock = true
    armed = false
    await Promise.resolve()
      .then(() => writeHeapSnapshot(output("heap", "heapsnapshot")))
      .catch(() => {})

    lock = false
  }

  timer = setInterval(() => {
    void run()
  }, MINUTE)
  timer.unref?.()
}

export function stop() {
  watcher?.close()
  watcher = undefined
}

function watchRequests() {
  if (watcher) return
  mkdirSync(requestDir(), { recursive: true })
  watcher = watch(requestDir(), (_event, name) => {
    if (name !== `${process.pid}.heap` && name !== `${process.pid}.cpu`) return
    void handle(name.endsWith(".heap") ? "heap" : "cpu")
  })
  watcher.unref()
}

// The watcher fires several events per request (write, then our own delete), so one capture per kind
// runs at a time. A request that arrives mid-capture stays on disk and the requester reports it busy.
async function handle(kind: RequestKind) {
  if (busy.has(kind)) return
  busy.add(kind)
  const file = requestFile(process.pid, kind)
  const body = await Bun.file(file)
    .text()
    .catch(() => undefined)
  if (body === undefined) {
    busy.delete(kind)
    return
  }
  await rm(file, { force: true })
  const seconds = Number(body)
  const capture =
    kind === "heap"
      ? Promise.resolve().then(() => writeHeapSnapshot(output("heap", "heapsnapshot")))
      : captureCpuProfile(output("cpu", "cpuprofile"), Number.isFinite(seconds) && seconds > 0 ? seconds : 10)
  await capture
    .catch((error: unknown) =>
      Bun.write(output(kind, "error.txt"), error instanceof Error ? (error.stack ?? error.message) : String(error)),
    )
    .finally(() => busy.delete(kind))
}

function output(prefix: string, ext: string) {
  return path.join(Global.Path.log, `${prefix}-${process.pid}-${new Date().toISOString().replace(/[:.]/g, "")}.${ext}`)
}

async function captureCpuProfile(file: string, seconds: number) {
  const session = new Session()
  session.connect()
  const post = (method: "Profiler.enable" | "Profiler.start") =>
    new Promise<void>((resolve, reject) => session.post(method, (error) => (error ? reject(error) : resolve())))
  await post("Profiler.enable")
  await post("Profiler.start")
  await Bun.sleep(seconds * 1000)
  const profile = await new Promise<object>((resolve, reject) =>
    session.post("Profiler.stop", (error, result) => (error ? reject(error) : resolve(result.profile))),
  ).finally(() => session.disconnect())
  await Bun.write(file, JSON.stringify(profile))
}

export * as Heap from "./heap"
