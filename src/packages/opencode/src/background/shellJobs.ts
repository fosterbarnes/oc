import { randomBytes } from "node:crypto"
import { createWriteStream, type WriteStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { Context, Effect, Fiber, Layer, Schedule, Scope, Stream } from "effect"
import type * as PlatformError from "effect/PlatformError"
import type { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner, type ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import stripAnsi from "strip-ansi"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Global } from "@opencode-ai/core/global"
import { ProcessTree } from "@opencode-ai/core/util/processTree"
import { InstanceState } from "@/effect/instance-state"

export type Status = "running" | "exited" | "killed" | "timed_out" | "interrupted"

// Persisted as meta.json next to out.log and err.log. `owner` is the oc process that started the job;
// `ownerCreated` is its CIM creation time (Windows only), which tells it apart from a later process
// that reused the PID.
export type Info = {
  id: string
  sessionID: string
  command: string
  cwd: string
  owner: number
  ownerCreated?: string
  status: Status
  pid?: number
  exitCode?: number | null
  startedAt: number
  endedAt?: number
  outLog: string
  errLog: string
}

export type Update = { info: Info; output: string }

export type StartInput = {
  sessionID: string
  /** Command text shown in status listings. */
  command: string
  spawn: ChildProcess.Command
  cwd: string
  timeoutMs?: number
  /** Called on a throttled timer while the job runs, and once more after it ends. */
  watch?: (update: Update) => Effect.Effect<void>
  /** Called once when the job exits on its own or times out. Not called for kills, shutdown, or session removal. */
  onExit?: (info: Info) => Effect.Effect<void>
}

export interface Interface {
  readonly start: (input: StartInput) => Effect.Effect<Info, PlatformError.PlatformError>
  readonly list: (sessionID: string) => Effect.Effect<Info[]>
  readonly get: (sessionID: string, id: string) => Effect.Effect<Info | undefined>
  readonly kill: (sessionID: string, id: string) => Effect.Effect<Info | undefined>
  readonly removeSession: (sessionID: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ShellJobs") {}

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const TAIL_BYTES = 128 * 1024
const JOB_ID = /^bg_[A-Za-z0-9]+$/
const KILL_GRACE = "3 seconds"
const FLUSH_GRACE = "1 second"

type Job = {
  info: Info
  handle: ChildProcessHandle
  out: WriteStream
  err: WriteStream
}

function root() {
  return path.join(Global.Path.state, "shellJobs")
}

function sessionDir(sessionID: string) {
  return path.join(root(), sessionID)
}

function jobDir(sessionID: string, id: string) {
  return path.join(sessionDir(sessionID), id)
}

function metaFile(dir: string) {
  return path.join(dir, "meta.json")
}

async function readInfo(dir: string): Promise<Info | undefined> {
  return fs.readFile(metaFile(dir), "utf8").then(
    (text) => {
      // A half-written or edited meta.json must not block recovery or listing of the other jobs.
      try {
        return JSON.parse(text) as Info
      } catch {
        return undefined
      }
    },
    () => undefined,
  )
}

// A failed write means the job folder was removed (session deleted); the job then has nothing to persist.
async function writeInfo(info: Info) {
  await fs.writeFile(metaFile(path.dirname(info.outLog)), JSON.stringify(info, null, 2), "utf8").catch(() => undefined)
}

function processAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// CIM creation time of a live process; undefined when it is gone or cannot be read.
function createdOf(pid: number) {
  return ProcessTree.processIdentity(pid).then(
    (live) => live?.created,
    () => undefined,
  )
}

let selfCreated: Promise<string | undefined> | undefined

function ownCreated() {
  if (process.platform !== "win32") return Promise.resolve(undefined)
  return (selfCreated ??= createdOf(process.pid))
}

// Windows reuses PIDs, so a live owner PID counts only when its creation time also matches; an owner that
// cannot be verified counts as gone. Other platforms keep the plain PID check. `owners` shares lookups.
async function ownerRunning(info: Info, owners = new Map<number, Promise<string | undefined>>()) {
  if (process.platform !== "win32") return info.owner === process.pid || processAlive(info.owner)
  if (info.owner === process.pid) return (await ownCreated()) === info.ownerCreated
  if (!info.ownerCreated) return false
  if (!owners.has(info.owner)) owners.set(info.owner, createdOf(info.owner))
  return (await owners.get(info.owner)) === info.ownerCreated
}

// Restart: a job still marked running whose owner is gone was cut off with the old process. Its PID is
// never signalled, because it may belong to another process by now. Jobs whose owner still runs are skipped:
// that process's instance scope handles them, and this runs again whenever an instance state is rebuilt.
async function recover() {
  const cutoff = Date.now() - RETENTION_MS
  const owners = new Map<number, Promise<string | undefined>>()
  const sessions = await fs.readdir(root()).catch(() => [] as string[])
  await Promise.all(
    sessions.map(async (sessionID) => {
      const ids = await fs.readdir(sessionDir(sessionID)).catch(() => [] as string[])
      await Promise.all(
        ids.map(async (id) => {
          const dir = jobDir(sessionID, id)
          const info = await readInfo(dir)
          if (!info) return
          if (info.status === "running") {
            if (await ownerRunning(info, owners)) return
            await writeInfo({ ...info, status: "interrupted", endedAt: Date.now() })
            return
          }
          if ((info.endedAt ?? 0) < cutoff) await fs.rm(dir, { recursive: true, force: true })
        }),
      )
    }),
  )
}

export async function readTail(file: string, lines: number, maxChars: number) {
  // Read only the end of the log: this runs every second per job and logs can grow without limit.
  const handle = await fs.open(file, "r").catch(() => undefined)
  if (!handle) return ""
  const size = (await handle.stat()).size
  const start = Math.max(0, size - TAIL_BYTES)
  const buf = Buffer.alloc(size - start)
  const { bytesRead } = await handle.read(buf, 0, buf.length, start)
  await handle.close()
  const bytes = buf.subarray(0, bytesRead)
  const text = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? bytes.toString("utf16le") : bytes.toString("utf8")
  const rows = stripAnsi(text).split(/\r?\n/)
  if (rows.at(-1) === "") rows.pop()
  return rows.slice(-lines).join("\n").slice(-maxChars)
}

const make = Effect.fn("ShellJobs.make")(function* () {
  const scope = yield* Scope.Scope
  const spawner = yield* ChildProcessSpawner
  const live = new Map<string, Job>()

  yield* Effect.addFinalizer(() =>
    // Spawn finalizers killed the processes already; record that for jobs the scope cut off.
    Effect.promise(() =>
      Promise.all(
        [...live.values()]
          .filter((job) => job.info.status === "running")
          .map((job) => writeInfo({ ...job.info, status: "killed", endedAt: Date.now() })),
      ),
    ),
  )
  yield* Effect.promise(() => recover())

  const persist = (info: Info) => Effect.promise(() => writeInfo(info))

  const pump = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>, sink: WriteStream) =>
    Stream.runForEach(stream, (chunk) => Effect.sync(() => void sink.write(chunk))).pipe(Effect.ignore)

  const endSinks = (job: Job) =>
    Effect.promise(() =>
      Promise.all([job.out, job.err].map((sink) => new Promise<void>((resolve) => sink.end(() => resolve())))),
    )

  const stop = Effect.fn("ShellJobs.stop")(function* (job: Job, status: "killed" | "timed_out") {
    if (job.info.status !== "running") return
    job.info = { ...job.info, status, endedAt: Date.now() }
    yield* persist(job.info)
    yield* job.handle.kill({ forceKillAfter: KILL_GRACE }).pipe(Effect.ignore)
  })

  const emit = (job: Job, watch: NonNullable<StartInput["watch"]>) =>
    Effect.gen(function* () {
      const output = yield* Effect.promise(() => outputOf(job.info))
      yield* watch({ info: job.info, output })
    })

  const watch = Effect.fn("ShellJobs.watch")(function* (job: Job, input: StartInput) {
    const pumps = yield* Effect.forkIn(
      Effect.all([pump(job.handle.stdout, job.out), pump(job.handle.stderr, job.err)], { concurrency: "unbounded" }),
      scope,
    )
    const ticker = input.watch
      ? yield* Effect.forkIn(emit(job, input.watch).pipe(Effect.repeat(Schedule.spaced("1 second"))), scope)
      : undefined
    const timer = input.timeoutMs
      ? yield* Effect.forkIn(Effect.sleep(input.timeoutMs).pipe(Effect.andThen(stop(job, "timed_out"))), scope)
      : undefined

    const exitCode = yield* job.handle.exitCode.pipe(Effect.orElseSucceed(() => null))
    // A grandchild can hold the pipes open after the shell exits; stop reading after a short flush.
    yield* Fiber.join(pumps).pipe(Effect.timeoutOption(FLUSH_GRACE))
    yield* Fiber.interrupt(pumps)
    if (timer) yield* Fiber.interrupt(timer)
    if (ticker) yield* Fiber.interrupt(ticker)
    yield* endSinks(job)

    if (job.info.status === "running") job.info = { ...job.info, status: "exited", exitCode, endedAt: Date.now() }
    else job.info = { ...job.info, exitCode }
    live.delete(job.info.id)
    yield* persist(job.info)
    if (input.watch) yield* emit(job, input.watch).pipe(Effect.ignore)
    if (input.onExit && job.info.status !== "killed" && job.info.status !== "interrupted") {
      yield* Effect.forkIn(input.onExit(job.info), scope)
    }
  })

  const start = Effect.fn("ShellJobs.start")(function* (input: StartInput) {
    const id = "bg_" + randomBytes(5).toString("hex")
    const dir = jobDir(input.sessionID, id)
    yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }))
    // Read before the spawn: output pumps start only after the job record exists, so no wait may sit between.
    const ownerCreated = yield* Effect.promise(() => ownCreated())
    const handle = yield* spawner.spawn(input.spawn).pipe(Effect.provideService(Scope.Scope, scope))
    const info: Info = {
      id,
      sessionID: input.sessionID,
      command: input.command,
      cwd: input.cwd,
      owner: process.pid,
      ownerCreated,
      status: "running",
      pid: Number(handle.pid),
      startedAt: Date.now(),
      outLog: path.join(dir, "out.log"),
      errLog: path.join(dir, "err.log"),
    }
    const job: Job = {
      info,
      handle,
      out: createWriteStream(info.outLog, { flags: "a" }).on("error", () => undefined),
      err: createWriteStream(info.errLog, { flags: "a" }).on("error", () => undefined),
    }
    yield* persist(info)
    live.set(id, job)
    yield* Effect.forkIn(watch(job, input), scope)
    return info
  })

  const list = Effect.fn("ShellJobs.list")(function* (sessionID: string) {
    const names = yield* Effect.promise(() => fs.readdir(sessionDir(sessionID)).catch(() => [] as string[]))
    const saved = yield* Effect.promise(() =>
      Promise.all(names.filter((name) => JOB_ID.test(name)).map((name) => readInfo(jobDir(sessionID, name)))),
    )
    const current = [...live.values()].map((job) => job.info).filter((info) => info.sessionID === sessionID)
    const ids = new Set(current.map((info) => info.id))
    return [...current, ...saved.filter((info): info is Info => info !== undefined && !ids.has(info.id))].toSorted(
      (a, b) => a.startedAt - b.startedAt,
    )
  })

  const get = Effect.fn("ShellJobs.get")(function* (sessionID: string, id: string) {
    const job = live.get(id)
    if (job) return job.info.sessionID === sessionID ? job.info : undefined
    // The id comes from the model: only the generated shape may reach the filesystem.
    if (!JOB_ID.test(id)) return undefined
    return yield* Effect.promise(() => readInfo(jobDir(sessionID, id)))
  })

  const kill = Effect.fn("ShellJobs.kill")(function* (sessionID: string, id: string) {
    const job = live.get(id)
    if (job?.info.sessionID === sessionID) {
      yield* stop(job, "killed")
      return job.info
    }
    const info = yield* get(sessionID, id)
    if (info?.status !== "running" || (yield* Effect.promise(() => ownerRunning(info)))) return info
    // Its oc process ended after recovery ran. Record that; the PID is never signalled.
    const interrupted: Info = { ...info, status: "interrupted", endedAt: Date.now() }
    yield* persist(interrupted)
    return interrupted
  })

  const removeSession = Effect.fn("ShellJobs.removeSession")(function* (sessionID: string) {
    const owned = [...live.values()].filter((job) => job.info.sessionID === sessionID)
    yield* Effect.forEach(owned, (job) => stop(job, "killed"), { concurrency: "unbounded", discard: true })
    owned.forEach((job) => live.delete(job.info.id))
    yield* Effect.promise(() => fs.rm(sessionDir(sessionID), { recursive: true, force: true }))
  })

  return { start, list, get, kill, removeSession }
})

export async function outputOf(info: Info) {
  const out = await readTail(info.outLog, 40, 4000)
  const err = await readTail(info.errLog, 40, 4000)
  return err ? (out ? out + "\n--- stderr ---\n" + err : "--- stderr ---\n" + err) : out
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner
    const state = yield* InstanceState.make(() => make().pipe(Effect.provideService(ChildProcessSpawner, spawner)))
    return Service.of({
      start: (input) => InstanceState.useEffect(state, (jobs) => jobs.start(input)),
      list: (sessionID) => InstanceState.useEffect(state, (jobs) => jobs.list(sessionID)),
      get: (sessionID, id) => InstanceState.useEffect(state, (jobs) => jobs.get(sessionID, id)),
      kill: (sessionID, id) => InstanceState.useEffect(state, (jobs) => jobs.kill(sessionID, id)),
      removeSession: (sessionID) => InstanceState.useEffect(state, (jobs) => jobs.removeSession(sessionID)),
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer, deps: [CrossSpawnSpawner.node] })

export * as ShellJobs from "./shellJobs"
