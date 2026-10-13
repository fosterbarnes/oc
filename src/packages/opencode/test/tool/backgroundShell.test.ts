import { SessionV1 } from "@opencode-ai/core/v1/session"
import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Effect, Exit, Layer } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { Shell } from "@opencode-ai/core/shell"
import { Global } from "@opencode-ai/core/global"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Config } from "@/config/config"
import { ShellJobs } from "@/background/shellJobs"
import { ShellTool } from "../../src/tool/shell"
import { BgKillTool, BgStatusTool } from "../../src/tool/shellJobs"
import type { TaskPromptOps } from "../../src/tool/task"
import { provideInstance, testInstanceStoreLayer, tmpdirScoped, withTmpdirInstance } from "../fixture/fixture"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "@/tool/truncate"
import { SessionID, MessageID } from "../../src/session/schema"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Plugin } from "../../src/plugin"
import { testEffect } from "../lib/effect"
import { Tool } from "@/tool/tool"
import { RuntimeFlags } from "@/effect/runtime-flags"

const layer = Layer.mergeAll(
  LayerNode.compile(
    LayerNode.group([
      CrossSpawnSpawner.node,
      FSUtil.node,
      Plugin.node,
      Truncate.node,
      Config.node,
      Agent.node,
      RuntimeFlags.node,
      ShellJobs.node,
    ]),
  ),
  testInstanceStoreLayer,
)
const it = testEffect(layer)
const projectRoot = path.join(__dirname, "../..")
const bin = `"${process.execPath.replaceAll("\\", "/")}"`
const isPowerShell = ["pwsh", "powershell"].includes(Shell.name(Shell.acceptable()))

// A node-style command that works in the default shell: runs the Bun binary with `-e`.
const script = (code: string) => {
  const text = `${bin} -e "${code}"`
  return isPowerShell ? `& ${text}` : text
}

// Each job test gets its own instance directory, so instance disposal from one test cannot end another test's jobs.
const inInstance = withTmpdirInstance()

const runIn = <A, E, R>(directory: string, self: Effect.Effect<A, E, R>) => self.pipe(provideInstance(directory))

const ctxFor = (sessionID: string, extra?: Partial<Tool.Context>): Tool.Context => ({
  sessionID: SessionID.make(sessionID),
  messageID: MessageID.ascending(),
  callID: "call_background",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
  ...extra,
})

// Captures synthetic notices. Each prompt is answered as consumed, the normal case for an idle session.
function noticeOps(notices: string[]): TaskPromptOps {
  return {
    cancel: () => Effect.void,
    resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
    prompt: (input) =>
      Effect.sync(() => {
        const text = input.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n")
        notices.push(text)
        return { info: { id: MessageID.ascending(), role: "assistant", parentID: input.messageID }, parts: [] } as unknown as SessionV1.WithParts
      }),
    loop: () => Effect.die("loop not expected"),
    available: () => Effect.void,
    cancellation: () => Effect.succeed(0),
    partMetadata: () => Effect.void,
  }
}

const jobIDOf = (output: string) => {
  const match = /jobId=(bg_[0-9a-f]+)/.exec(output)
  if (!match) throw new Error(`no jobId in output: ${output}`)
  return match[1]
}

const initShell = Effect.fn("BackgroundShellTest.init")(function* () {
  const info = yield* ShellTool
  return yield* info.init()
})

const initStatus = Effect.fn("BackgroundShellTest.initStatus")(function* () {
  const info = yield* BgStatusTool
  return yield* info.init()
})

const initKill = Effect.fn("BackgroundShellTest.initKill")(function* () {
  const info = yield* BgKillTool
  return yield* info.init()
})

// Polls until the predicate holds. Used for process exit and log flushes, which have no event to await here.
const until = <A>(read: Effect.Effect<A | undefined>, done: (value: A) => boolean) =>
  Effect.gen(function* () {
    for (let attempt = 0; attempt < 400; attempt++) {
      const value = yield* read
      if (value !== undefined && done(value)) return value
      yield* Effect.sleep("50 millis")
    }
    throw new Error("timed out waiting for background job")
  })

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("background shell jobs", () => {
  it.live("returns after spawn, then logs stdout and stderr separately with the exit code", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_logs_${Date.now()}`
        const shell = yield* initShell()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("console.log('OUT-LINE'); console.error('ERR-LINE')"), background: true },
          ctxFor(sessionID),
        )
        expect(started.output).toContain("status=running")
        const id = jobIDOf(started.output)
        const info = yield* until(jobs.get(sessionID, id), (job) => job.status !== "running")
        expect(info.status).toBe("exited")
        expect(info.exitCode).toBe(0)
        expect(yield* Effect.promise(() => fs.readFile(info.outLog, "utf8"))).toContain("OUT-LINE")
        expect(yield* Effect.promise(() => fs.readFile(info.errLog, "utf8"))).toContain("ERR-LINE")
      }),
    ),
  )

  it.live("bgStatus caps the tail to the requested line count", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_tail_${Date.now()}`
        const shell = yield* initShell()
        const status = yield* initStatus()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("for (let i = 1; i <= 300; i++) console.log('L' + i)"), background: true },
          ctxFor(sessionID),
        )
        const id = jobIDOf(started.output)
        yield* until(jobs.get(sessionID, id), (job) => job.status !== "running")
        const detail = yield* status.execute({ jobId: id, tail: 5 }, ctxFor(sessionID))
        expect(detail.output).toContain("L300")
        expect(detail.output).not.toContain("L100\n")
      }),
    ),
  )

  it.live("bgStatus and bgKill refuse a job owned by another session", () =>
    inInstance(
      Effect.gen(function* () {
        const owner = `ses_bg_owner_${Date.now()}`
        const other = `ses_bg_other_${Date.now()}`
        const shell = yield* initShell()
        const status = yield* initStatus()
        const kill = yield* initKill()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("setInterval(() => {}, 1000)"), background: true },
          ctxFor(owner),
        )
        const id = jobIDOf(started.output)
        const foreign = ctxFor(other)
        expect((yield* status.execute({ jobId: id }, foreign)).output).toBe(`unknown jobId: ${id}`)
        expect((yield* kill.execute({ jobId: id }, foreign)).output).toBe(`unknown jobId: ${id}`)
        expect((yield* jobs.get(owner, id))?.status).toBe("running")
        yield* kill.execute({ jobId: id }, ctxFor(owner))
      }),
    ),
  )

  it.live("bgKill stops the job and its process", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_kill_${Date.now()}`
        const shell = yield* initShell()
        const kill = yield* initKill()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("setInterval(() => {}, 1000)"), background: true },
          ctxFor(sessionID),
        )
        const id = jobIDOf(started.output)
        const running = yield* until(jobs.get(sessionID, id), (job) => job.pid !== undefined)
        const killed = yield* kill.execute({ jobId: id }, ctxFor(sessionID))
        expect(killed.output).toContain("killed jobId=")
        const info = yield* until(jobs.get(sessionID, id), (job) => job.status !== "running")
        expect(info.status).toBe("killed")
        yield* until(Effect.succeed(alive(running.pid!) ? undefined : true), (done) => done)
      }),
    ),
  )

  it.live("timeout stops the job and sends a timed_out notice", () => {
    const notices: string[] = []
    return inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_timeout_${Date.now()}`
        const shell = yield* initShell()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("setInterval(() => {}, 1000)"), background: true, timeout: 300 },
          ctxFor(sessionID, { extra: { promptOps: noticeOps(notices) } }),
        )
        const id = jobIDOf(started.output)
        const info = yield* until(jobs.get(sessionID, id), (job) => job.status !== "running")
        expect(info.status).toBe("timed_out")
        yield* until(Effect.sync(() => (notices.length > 0 ? notices : undefined)), (items) => items.length === 1)
        expect(notices[0]).toContain(`<background_shell id="${id}" state="timed_out"`)
      }),
    )
  })

  it.live("exit notice carries the exit code and output once", () => {
    const notices: string[] = []
    return inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_notice_${Date.now()}`
        const shell = yield* initShell()
        const started = yield* shell.execute(
          { command: script("console.log('NOTICE-DONE')"), background: true },
          ctxFor(sessionID, { extra: { promptOps: noticeOps(notices) } }),
        )
        const id = jobIDOf(started.output)
        yield* until(Effect.sync(() => (notices.length > 0 ? notices : undefined)), (items) => items.length === 1)
        expect(notices[0]).toContain(`<background_shell id="${id}" state="exited" exitCode="0">`)
        expect(notices[0]).toContain("NOTICE-DONE")
        yield* Effect.sleep("200 millis")
        expect(notices).toHaveLength(1)
      }),
    )
  })

  it.live("removing a session kills its running job and deletes its logs", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_remove_${Date.now()}`
        const shell = yield* initShell()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("setInterval(() => {}, 1000)"), background: true },
          ctxFor(sessionID),
        )
        const id = jobIDOf(started.output)
        const running = yield* until(jobs.get(sessionID, id), (job) => job.pid !== undefined)
        yield* jobs.removeSession(sessionID)
        expect(yield* jobs.list(sessionID)).toEqual([])
        expect(yield* Effect.promise(() => fs.stat(running.outLog).then(() => true, () => false))).toBe(false)
        yield* until(Effect.succeed(alive(running.pid!) ? undefined : true), (done) => done)
      }),
    ),
  )

  it.live("denied bgRun permission starts no job", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_denied_${Date.now()}`
        const shell = yield* initShell()
        const jobs = yield* ShellJobs.Service
        const denied = ctxFor(sessionID, {
          ask: (request) =>
            request.permission === "bgRun" ? Effect.die(new Error("bgRun denied")) : Effect.void,
        })
        const exit = yield* shell
          .execute({ command: script("console.log('never')"), background: true }, denied)
          .pipe(Effect.exit)
        expect(Exit.isFailure(exit)).toBe(true)
        expect(yield* jobs.list(sessionID)).toEqual([])
      }),
    ),
  )

  it.live("a job left running by a dead oc process is marked interrupted, and its PID is not signalled", () =>
    Effect.gen(function* () {
      const sessionID = `ses_bg_restart_${Date.now()}`
      const survivor = Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
      })
      const dir = path.join(Global.Path.state, "shellJobs", sessionID, "bg_restart01")
      const info = {
        id: "bg_restart01",
        sessionID,
        command: "stale",
        cwd: projectRoot,
        owner: 2147483646,
        status: "running",
        pid: survivor.pid,
        startedAt: Date.now(),
        outLog: path.join(dir, "out.log"),
        errLog: path.join(dir, "err.log"),
      }
      yield* Effect.promise(() => fs.mkdir(dir, { recursive: true }))
      yield* Effect.promise(() => fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(info), "utf8"))
      const directory = yield* tmpdirScoped()
      yield* runIn(
        directory,
        Effect.gen(function* () {
          const jobs = yield* ShellJobs.Service
          expect((yield* jobs.get(sessionID, "bg_restart01"))?.status).toBe("interrupted")
        }),
      )
      expect(alive(survivor.pid)).toBe(true)
      survivor.kill()
    }),
  )

  it.live("a running job whose owner PID is live but was created later (reused PID) is marked interrupted", () =>
    Effect.gen(function* () {
      // Only Windows records the owner's creation time; elsewhere a live owner PID still counts.
      if (process.platform !== "win32") return
      const sessionID = `ses_bg_reused_${Date.now()}`
      const survivor = sleeper()
      yield* Effect.promise(() =>
        writeStaleJob(sessionID, "bg_restart02", { owner: process.pid, ownerCreated: "1", pid: survivor.pid }),
      )
      const directory = yield* tmpdirScoped()
      yield* runIn(
        directory,
        Effect.gen(function* () {
          const jobs = yield* ShellJobs.Service
          expect((yield* jobs.get(sessionID, "bg_restart02"))?.status).toBe("interrupted")
        }),
      )
      expect(alive(survivor.pid)).toBe(true)
      survivor.kill()
    }),
  )

  it.live("bgKill marks a running job from an ended oc process interrupted without signalling its PID", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_orphan_${Date.now()}`
        const kill = yield* initKill()
        const jobs = yield* ShellJobs.Service
        // Recovery runs when the instance's job state is built; the stale job appears after that.
        yield* jobs.list(sessionID)
        const survivor = sleeper()
        yield* Effect.promise(() => writeStaleJob(sessionID, "bg_restart03", { owner: 2147483646, pid: survivor.pid }))
        const result = yield* kill.execute({ jobId: "bg_restart03" }, ctxFor(sessionID))
        expect(result.output).toContain("interrupted jobId=bg_restart03")
        expect((yield* jobs.get(sessionID, "bg_restart03"))?.status).toBe("interrupted")
        expect(alive(survivor.pid)).toBe(true)
        survivor.kill()
      }),
    ),
  )
})

function sleeper() {
  return Bun.spawn([process.execPath, "-e", "setInterval(() => {}, 1000)"], {
    stdout: "ignore",
    stderr: "ignore",
    windowsHide: true,
  })
}

async function writeStaleJob(sessionID: string, id: string, extra: Partial<ShellJobs.Info>) {
  const dir = path.join(Global.Path.state, "shellJobs", sessionID, id)
  const info: ShellJobs.Info = {
    id,
    sessionID,
    command: "stale",
    cwd: projectRoot,
    owner: 2147483646,
    status: "running",
    startedAt: Date.now(),
    outLog: path.join(dir, "out.log"),
    errLog: path.join(dir, "err.log"),
    ...extra,
  }
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(info), "utf8")
}

describe("background shell metadata", () => {
  it.live("ownership keys stay on the job record", () =>
    inInstance(
      Effect.gen(function* () {
        const sessionID = `ses_bg_meta_${Date.now()}`
        const shell = yield* initShell()
        const jobs = yield* ShellJobs.Service
        const started = yield* shell.execute(
          { command: script("console.log('META')"), background: true },
          ctxFor(sessionID),
        )
        const id = jobIDOf(started.output)
        const info = yield* until(jobs.get(sessionID, id), (job) => job.status !== "running")
        expect(info.sessionID).toBe(sessionID)
        expect(info.owner).toBe(process.pid)
        expect(info.command).toContain("META")
      }),
    ),
  )
})
