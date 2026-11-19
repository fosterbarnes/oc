import { Effect } from "effect"
import { Pty } from "@opencode-ai/core/pty"
import { SessionWork } from "@opencode-ai/core/session/work"
import { ShellJobs } from "@/background/shellJobs"

// What keeps the server busy: session runs or maintenance, background shell jobs, and live PTYs.
// An `ifIdle` shutdown and a no-window mirror revive (handlers/global.ts) refuse while any is running.
export type Report = { sessions: number; shellJobs: number; ptys: number }

export const report = Effect.fn("ServerIdle.report")(function* () {
  const work = yield* SessionWork.Service
  return { sessions: work.busy(), shellJobs: ShellJobs.runningCount(), ptys: Pty.runningCount() } satisfies Report
})

export function isBusy(value: Report) {
  return value.sessions + value.shellJobs + value.ptys > 0
}

/** "2 sessions running, 1 shell job" for logs and the 409 body. */
export function describe(value: Report) {
  const parts = [
    value.sessions ? `${value.sessions} session run(s)` : "",
    value.shellJobs ? `${value.shellJobs} shell job(s)` : "",
    value.ptys ? `${value.ptys} terminal(s)` : "",
  ].filter(Boolean)
  return parts.length ? `${parts.join(", ")} running` : "idle"
}

export * as ServerIdle from "./idle"
